// Script de creation du 1er compte admin (JS pur pour tourner en prod sans ts-node).
// Usage :
//   docker compose exec backend npm run seed:admin
// ou non interactif :
//   docker compose exec -e ADMIN_EMAIL=x@y.fr -e ADMIN_PASSWORD=... -e ADMIN_FIRST=... -e ADMIN_LAST=... backend npm run seed:admin

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');

const prisma = new PrismaClient();

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'azertyuiop',
  'qwertyuiop',
  '123456789',
  '123456789012',
  'motdepasse',
  'mdoservices',
  'changeme',
  'admin1234',
  'administrator',
]);

function checkPasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < 12) {
    return 'Mot de passe trop court (minimum 12 caracteres)';
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) {
    return 'Mot de passe trop faible : doit contenir au moins 3 classes (minuscules, majuscules, chiffres, symboles)';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'Mot de passe trop commun';
  }
  return null;
}

async function main() {
  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;
  let firstName = process.env.ADMIN_FIRST;
  let lastName = process.env.ADMIN_LAST;

  if (!email || !password || !firstName || !lastName) {
    const rl = readline.createInterface({ input, output });
    console.log('=== Creation du compte administrateur ===');
    if (!email) email = (await rl.question('Email : ')).trim().toLowerCase();
    if (!firstName) firstName = (await rl.question('Prenom : ')).trim();
    if (!lastName) lastName = (await rl.question('Nom : ')).trim();
    if (!password) password = (await rl.question('Mot de passe (min 12 caracteres, 3 classes minimum) : ')).trim();
    rl.close();
  }

  // Politique de mot de passe alignee sur backend/src/common/validators/password.validator.ts
  const passwordError = checkPasswordPolicy(password);
  if (!email || passwordError) {
    console.error(passwordError ?? 'Email requis');
    process.exit(1);
  }

  // Recupere le tenant 'mdo' (cree par TenantsService.onModuleInit au boot
  // du backend). Si absent, c'est que le backend n'a pas encore boote — on
  // refuse plutot que de creer un user orphelin (tenantId=null) qui ne
  // pourrait pas se connecter (AuthService exige un tenant valide).
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'mdo' } });
  if (!tenant) {
    console.error('Tenant "mdo" introuvable. Lance d\'abord le backend une fois pour qu\'il l\'initialise via onModuleInit, puis relance ce seed.');
    await prisma.$disconnect();
    process.exit(1);
  }

  // Recherche dans le tenant 'mdo' (cle composite @@unique([tenantId, email]))
  const existing = await prisma.user.findFirst({ where: { email, tenantId: tenant.id } });
  if (existing) {
    console.log('Un compte existe deja : ' + email + ' (role=' + existing.role + ', tenant=' + tenant.slug + ')');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Promotion super-admin : si c'est le 1er ADMIN actif sur le tenant 'mdo',
  // on le promeut directement (sinon AuthService.login pour la 1ere session
  // exigerait un autre user super-admin pour creer ce compte via l'UI).
  const adminCount = await prisma.user.count({
    where: { role: 'ADMIN', isActive: true, tenantId: tenant.id },
  });
  const isSuperAdmin = adminCount === 0;

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      role: 'ADMIN',
      tenantId: tenant.id,
      isSuperAdmin,
    },
  });
  console.log(
    'Compte admin cree : ' + user.email +
    ' (tenant=' + tenant.slug +
    (isSuperAdmin ? ', SUPER-ADMIN' : '') + ')'
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
