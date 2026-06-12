// ============================================================================
// SEED DEMO : tenant de demonstration "demo" (demo.mdoservices.fr).
// Offre : SIRH + Pilotage + Commercial + Service & Support (pas d'infogerance).
// Entreprise fictive "Demo Solutions" avec 6 collaborateurs et un jeu de
// donnees de presentation dans chaque module active.
//
// Idempotent : purge et recree le tenant 'demo' a chaque execution.
//   docker cp seed-demo.js crm_mdo_backend:/tmp/ && docker exec crm_mdo_backend node /tmp/seed-demo.js
// ============================================================================
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const SLUG = 'demo';
const DOMAIN = 'demo.mdoservices.fr';
const PASSWORD = 'DemoMDO2026!';
const YEAR = 2026;
const d = (s) => new Date(s + 'T00:00:00.000Z'); // date pure (@db.Date)
const dt = (s) => new Date(s); // datetime

const MODULES = [
  'pilotage.dashboard', 'pilotage.health', 'pilotage.reporting',
  'commercial.crm', 'commercial.opportunities', 'commercial.quotes', 'commercial.contracts', 'commercial.invoices',
  'support.tickets', 'support.interventions', 'support.calls',
  'sirh.dashboard', 'sirh.leaves', 'sirh.planning', 'sirh.timesheets', 'sirh.expenses', 'sirh.reviews', 'sirh.journeys', 'sirh.employees',
];

async function purge(tid) {
  const del = [
    () => prisma.timeEntry.deleteMany({ where: { tenantId: tid } }),
    () => prisma.timesheet.deleteMany({ where: { tenantId: tid } }),
    () => prisma.objective.deleteMany({ where: { tenantId: tid } }),
    () => prisma.review.deleteMany({ where: { tenantId: tid } }),
    () => prisma.journey.deleteMany({ where: { tenantId: tid } }),
    () => prisma.journeyTemplate.deleteMany({ where: { tenantId: tid } }),
    () => prisma.leaveRequest.deleteMany({ where: { tenantId: tid } }),
    () => prisma.leaveBalance.deleteMany({ where: { tenantId: tid } }),
    () => prisma.leaveType.deleteMany({ where: { tenantId: tid } }),
    () => prisma.expenseClaim.deleteMany({ where: { tenantId: tid } }),
    () => prisma.expenseCategory.deleteMany({ where: { tenantId: tid } }),
    () => prisma.employeeProfile.deleteMany({ where: { tenantId: tid } }),
    () => prisma.intervention.deleteMany({ where: { tenantId: tid } }),
    () => prisma.ticket.deleteMany({ where: { tenantId: tid } }),
    () => prisma.opportunity.deleteMany({ where: { tenantId: tid } }),
    () => prisma.contact.deleteMany({ where: { tenantId: tid } }),
    () => prisma.company.deleteMany({ where: { tenantId: tid } }),
    () => prisma.notification.deleteMany({ where: { tenantId: tid } }),
    () => prisma.setting.deleteMany({ where: { tenantId: tid } }),
    () => prisma.user.deleteMany({ where: { tenantId: tid } }),
  ];
  for (const fn of del) { try { await fn(); } catch (e) { console.warn('purge skip: ' + e.message); } }
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);

  // ---- Tenant ----
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) { await purge(existing.id); await prisma.tenant.delete({ where: { id: existing.id } }); }
  const tenant = await prisma.tenant.create({
    data: {
      slug: SLUG, customDomain: DOMAIN, isActive: true,
      brandName: 'Demo Solutions', brandShortName: 'Demo',
      brandTagline: 'Environnement de demonstration',
      brandPrimaryColor: '#2563eb',
      brandSupportEmail: 'support@demo.mdoservices.fr',
      enabledModules: MODULES,
    },
  });
  const tid = tenant.id;
  const TID = { tenantId: tid };

  // ---- Collaborateurs ----
  async function mkUser(email, firstName, lastName, role, isSuper = false) {
    return prisma.user.create({ data: { ...TID, email, passwordHash: hash, firstName, lastName, role, isActive: true, isSuperAdmin: isSuper } });
  }
  const sophie = await mkUser('admin@demo.mdoservices.fr', 'Sophie', 'Martin', 'ADMIN');
  const karim = await mkUser('manager@demo.mdoservices.fr', 'Karim', 'Benali', 'MANAGER');
  const julie = await mkUser('julie@demo.mdoservices.fr', 'Julie', 'Dubois', 'SALES');
  const thomas = await mkUser('thomas@demo.mdoservices.fr', 'Thomas', 'Leroy', 'SALES');
  const emma = await mkUser('emma@demo.mdoservices.fr', 'Emma', 'Petit', 'READONLY');
  const lucas = await mkUser('lucas@demo.mdoservices.fr', 'Lucas', 'Moreau', 'READONLY');
  const team = [sophie, karim, julie, thomas, emma, lucas];

  // ---- Fiches RH ----
  const profiles = [
    [sophie, 'Directrice generale', 'Direction', null, 'CDI', '2018-01-08'],
    [karim, 'Responsable technique', 'Technique', sophie.id, 'CDI', '2019-09-02'],
    [julie, 'Charge de clientele', 'Commercial', sophie.id, 'CDI', '2021-03-15'],
    [thomas, 'Technicien support', 'Technique', karim.id, 'CDI', '2022-06-01'],
    [emma, 'Technicienne support', 'Technique', karim.id, 'CDD', '2023-11-06'],
    [lucas, 'Technicien junior', 'Technique', karim.id, 'ALTERNANCE', '2026-06-15'],
  ];
  for (const [u, jobTitle, department, managerId, contractType, hire] of profiles) {
    await prisma.employeeProfile.create({ data: { ...TID, userId: u.id, jobTitle, department, managerId, contractType, hireDate: d(hire), city: 'Toulouse', country: 'France' } });
  }

  // ---- Conges ----
  const cp = await prisma.leaveType.create({ data: { ...TID, name: 'Conges payes', color: '#3b82f6', paid: true } });
  const rtt = await prisma.leaveType.create({ data: { ...TID, name: 'RTT', color: '#10b981', paid: true } });
  const maladie = await prisma.leaveType.create({ data: { ...TID, name: 'Maladie', color: '#f59e0b', paid: true } });
  await prisma.leaveType.create({ data: { ...TID, name: 'Sans solde', color: '#94a3b8', paid: false } });
  for (const u of team) {
    await prisma.leaveBalance.create({ data: { ...TID, userId: u.id, typeId: cp.id, year: YEAR, allocated: 25 } });
    await prisma.leaveBalance.create({ data: { ...TID, userId: u.id, typeId: rtt.id, year: YEAR, allocated: 11 } });
  }
  const lr = (userId, typeId, start, end, status, workingDays, approverId, reason) =>
    prisma.leaveRequest.create({ data: { ...TID, userId, typeId, startDate: d(start), endDate: d(end), status, workingDays, approverId: approverId ?? null, decidedAt: approverId ? dt('2026-06-01T10:00:00Z') : null, reason: reason ?? null } });
  // Emma absente AUJOURD'HUI (10->13 juin) -> apparait dans planning + dashboard
  await lr(emma.id, cp.id, '2026-06-10', '2026-06-13', 'APPROVED', 4, karim.id, 'Conges');
  await lr(julie.id, rtt.id, '2026-06-12', '2026-06-12', 'APPROVED', 1, sophie.id, null);
  // A venir (valides)
  await lr(karim.id, cp.id, '2026-06-22', '2026-06-26', 'APPROVED', 5, sophie.id, 'Vacances');
  // En attente de validation -> dashboard "a valider"
  await lr(thomas.id, cp.id, '2026-07-07', '2026-07-11', 'PENDING', 5, null, 'Conges ete');
  await lr(emma.id, rtt.id, '2026-07-21', '2026-07-21', 'PENDING', 1, null, null);

  // ---- Notes de frais ----
  const catResto = await prisma.expenseCategory.create({ data: { ...TID, name: 'Restaurant', color: '#0ea5e9' } });
  const catTransport = await prisma.expenseCategory.create({ data: { ...TID, name: 'Transport', color: '#6366f1' } });
  const catHebergement = await prisma.expenseCategory.create({ data: { ...TID, name: 'Hebergement', color: '#ec4899' } });
  await prisma.expenseClaim.create({ data: { ...TID, userId: julie.id, categoryId: catResto.id, date: d('2026-06-05'), description: 'Dejeuner client Cabinet Medical', merchant: 'Le Bistrot', amountTtc: 48.5, vatAmount: 4.41, status: 'PENDING' } });
  await prisma.expenseClaim.create({ data: { ...TID, userId: thomas.id, categoryId: catTransport.id, date: d('2026-06-09'), description: 'Peage + carburant intervention Castelnau', merchant: 'Total', amountTtc: 23.0, status: 'PENDING' } });
  await prisma.expenseClaim.create({ data: { ...TID, userId: karim.id, categoryId: catHebergement.id, date: d('2026-05-20'), description: 'Hotel formation Microsoft', merchant: 'Ibis', amountTtc: 119.0, vatAmount: 10.82, status: 'REIMBURSED', approverId: sophie.id, decidedAt: dt('2026-05-25T09:00:00Z'), reimbursedAt: dt('2026-05-31T00:00:00Z') } });

  // ---- Temps & feuilles de temps ----
  async function week(userId, mins) {
    const days = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'];
    let total = 0;
    for (let i = 0; i < days.length; i++) {
      const m = mins[i] ?? 0; if (!m) continue; total += m;
      await prisma.timeEntry.create({ data: { ...TID, userId, startedAt: dt(days[i] + 'T08:00:00Z'), durationMin: m, description: 'Activite support / interventions', billable: true } });
    }
    await prisma.timesheet.create({ data: { ...TID, userId, periodStart: d('2026-06-08'), periodEnd: d('2026-06-14'), status: 'SUBMITTED', totalMinutes: total, submittedAt: dt('2026-06-12T17:00:00Z') } });
  }
  await week(thomas.id, [480, 480, 450, 480, 420]);
  await week(emma.id, [420, 0, 0, 480, 480]);

  // ---- Entretiens & objectifs ----
  const revJulie = await prisma.review.create({ data: { ...TID, employeeId: julie.id, managerId: sophie.id, type: 'ANNUAL', status: 'SCHEDULED', scheduledAt: dt('2026-06-20T14:00:00Z') } });
  await prisma.review.create({ data: { ...TID, employeeId: thomas.id, managerId: karim.id, type: 'ONE_ON_ONE', status: 'COMPLETED', scheduledAt: dt('2026-06-03T11:00:00Z'), completedAt: dt('2026-06-03T11:45:00Z'), summary: 'Point trimestriel positif. Montee en competence sur la virtualisation.', rating: 4 } });
  await prisma.objective.create({ data: { ...TID, userId: julie.id, reviewId: revJulie.id, title: 'Atteindre 50 000 EUR de CA signe au T3', status: 'IN_PROGRESS', progress: 40, dueDate: d('2026-09-30') } });
  await prisma.objective.create({ data: { ...TID, userId: thomas.id, title: 'Obtenir la certification Microsoft AZ-104', status: 'IN_PROGRESS', progress: 60, dueDate: d('2026-10-31') } });
  await prisma.objective.create({ data: { ...TID, userId: emma.id, title: 'Reduire le delai moyen de resolution des tickets', status: 'TODO', progress: 0, dueDate: d('2026-12-15') } });

  // ---- Parcours (onboarding) ----
  const tpl = await prisma.journeyTemplate.create({
    data: {
      ...TID, name: 'Arrivee technicien', kind: 'ONBOARDING',
      tasks: { create: [
        { label: 'Preparer le poste de travail et les acces', responsible: 'IT', offsetDays: -7, order: 0 },
        { label: 'Accueil RH et remise du livret', responsible: 'RH', offsetDays: 0, order: 1 },
        { label: 'Creation des comptes (M365, CRM, telephonie)', responsible: 'IT', offsetDays: 0, order: 2 },
        { label: 'Presentation equipe et parrainage', responsible: 'Manager', offsetDays: 1, order: 3 },
        { label: 'Point d\'etape fin de periode d\'essai', responsible: 'Manager', offsetDays: 30, order: 4 },
      ] },
    },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });
  const start = '2026-06-15';
  const jtasks = tpl.tasks.map((t) => ({
    label: t.label, responsible: t.responsible, order: t.order,
    dueDate: t.offsetDays != null ? new Date(d(start).getTime() + t.offsetDays * 86400000) : null,
    done: t.offsetDays != null && t.offsetDays < 0, // taches J-x deja faites
    doneAt: t.offsetDays != null && t.offsetDays < 0 ? dt('2026-06-09T09:00:00Z') : null,
  }));
  await prisma.journey.create({ data: { ...TID, employeeId: lucas.id, templateId: tpl.id, kind: 'ONBOARDING', title: 'Arrivee de Lucas Moreau', startDate: d(start), status: 'IN_PROGRESS', tasks: { create: jtasks } } });

  // ---- Commercial : clients, contacts, opportunites ----
  async function company(name, sector, status, city, ownerId) {
    return prisma.company.create({ data: { ...TID, name, sector, status, city, country: 'France', ownerId } });
  }
  const c1 = await company('Boulangerie Saint-Michel', 'TPE', 'CUSTOMER', 'Toulouse', julie.id);
  const c2 = await company('Cabinet Medical des Tilleuls', 'SANTE', 'CUSTOMER', 'Blagnac', julie.id);
  const c3 = await company('Garage Auto Pro 31', 'PME', 'PROSPECT', 'Colomiers', julie.id);
  const c4 = await company('Mairie de Castelnau', 'COLLECTIVITE', 'CUSTOMER', 'Castelnau-d\'Estretefonds', sophie.id);
  const mkContact = (companyId, firstName, lastName, position, email) =>
    prisma.contact.create({ data: { ...TID, companyId, firstName, lastName, position, email, isPrimary: true, ownerId: julie.id } });
  await mkContact(c1.id, 'Paul', 'Bernard', 'Gerant', 'paul@boulangerie-st-michel.fr');
  await mkContact(c2.id, 'Claire', 'Rousseau', 'Secretaire medicale', 'contact@cabinet-tilleuls.fr');
  await mkContact(c3.id, 'David', 'Garnier', 'Directeur', 'd.garnier@garageautopro31.fr');
  await mkContact(c4.id, 'Nathalie', 'Faure', 'DGS', 'dgs@mairie-castelnau.fr');
  await prisma.opportunity.create({ data: { ...TID, title: 'Renouvellement parc informatique (8 postes)', companyId: c3.id, ownerId: julie.id, stage: 'PROPOSITION', amountHt: 12000, probability: 60, expectedCloseDate: dt('2026-07-15T00:00:00Z') } });
  await prisma.opportunity.create({ data: { ...TID, title: 'Contrat infogerance annuel', companyId: c2.id, ownerId: julie.id, stage: 'NEGOCIATION', amountHt: 8400, probability: 75, expectedCloseDate: dt('2026-06-30T00:00:00Z') } });
  await prisma.opportunity.create({ data: { ...TID, title: 'Migration Microsoft 365', companyId: c1.id, ownerId: julie.id, stage: 'GAGNE', amountHt: 3500, probability: 100, closedAt: dt('2026-05-28T00:00:00Z') } });
  await prisma.opportunity.create({ data: { ...TID, title: 'Sauvegarde externalisee mairie', companyId: c4.id, ownerId: sophie.id, stage: 'QUALIFICATION', amountHt: 4200, probability: 40 } });

  // ---- Support : tickets, interventions ----
  const tk = async (ref, title, description, status, priority, category, companyId, assigneeId) =>
    prisma.ticket.create({ data: { ...TID, reference: ref, title, description, status, priority, category, channel: 'PHONE', companyId, assigneeId, createdById: sophie.id } });
  const t1 = await tk('TKT-2026-0001', 'PC lent au secretariat', 'Le poste de la secretaire met plusieurs minutes a demarrer.', 'OPEN', 'HIGH', 'INCIDENT', c2.id, thomas.id);
  const t2 = await tk('TKT-2026-0002', 'Imprimante hors ligne', 'Imprimante du fournil non detectee sur le reseau.', 'IN_PROGRESS', 'NORMAL', 'INCIDENT', c1.id, emma.id);
  await tk('TKT-2026-0003', 'Demande de nouveau poste', 'Creation d\'un poste pour un nouvel agent a l\'accueil.', 'OPEN', 'LOW', 'REQUEST', c4.id, karim.id);
  await prisma.intervention.create({ data: { ...TID, title: 'Diagnostic poste secretariat', type: 'ONSITE', status: 'PLANNED', scheduledAt: dt('2026-06-16T09:00:00Z'), companyId: c2.id, ticketId: t1.id, technicianId: thomas.id } });
  await prisma.intervention.create({ data: { ...TID, title: 'Reconfiguration imprimante reseau', type: 'REMOTE', status: 'DONE', scheduledAt: dt('2026-06-11T14:00:00Z'), startedAt: dt('2026-06-11T14:05:00Z'), endedAt: dt('2026-06-11T14:50:00Z'), durationMin: 45, companyId: c1.id, ticketId: t2.id, technicianId: emma.id, report: 'Pilote reinstalle, IP fixe attribuee.' } });

  console.log('OK tenant demo cree : ' + tid);
  console.log('Login    : admin@demo.mdoservices.fr / ' + PASSWORD + ' (Sophie, ADMIN)');
  console.log('Manager  : manager@demo.mdoservices.fr / ' + PASSWORD + ' (Karim)');
  console.log('Salarie  : emma@demo.mdoservices.fr / ' + PASSWORD + ' (Emma, vue collaborateur)');
  console.log('Modules  : ' + MODULES.length + ' (SIRH + Pilotage + Commercial + Support)');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
