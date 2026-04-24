// Script interactif de creation du 1er compte admin.
// Usage :
//   npm run seed:admin
// ou non interactif (variables env) :
//   ADMIN_EMAIL=x@y.fr ADMIN_PASSWORD=secret ADMIN_FIRST=Jean ADMIN_LAST=Dupont npm run seed:admin

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const prisma = new PrismaClient();

async function main() {
  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;
  let firstName = process.env.ADMIN_FIRST;
  let lastName = process.env.ADMIN_LAST;

  if (!email || !password || !firstName || !lastName) {
    const rl = readline.createInterface({ input, output });
    console.log('=== Creation du compte administrateur ===');
    email = email || (await rl.question('Email : ')).toLowerCase().trim();
    firstName = firstName || (await rl.question('Prenom : ')).trim();
    lastName = lastName || (await rl.question('Nom : ')).trim();
    password = password || (await rl.question('Mot de passe (min 8 caracteres) : ')).trim();
    rl.close();
  }

  if (!email || !password || password.length < 8) {
    console.error('Email requis et mot de passe >= 8 caracteres');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Un compte existe deja avec cet email (' + email + ') : ' + existing.role);
    await prisma.$disconnect();
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: firstName!,
      lastName: lastName!,
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
