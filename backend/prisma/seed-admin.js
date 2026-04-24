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
    if (!password) password = (await rl.question('Mot de passe (min 8 caracteres) : ')).trim();
    rl.close();
  }

  if (!email || !password || password.length < 8) {
    console.error('Email requis et mot de passe >= 8 caracteres');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Un compte existe deja avec cet email (' + email + ') : role=' + existing.role);
    await prisma.$disconnect();
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      role: 'ADMIN',
    },
  });
  console.log('Compte admin cree : ' + user.email);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
