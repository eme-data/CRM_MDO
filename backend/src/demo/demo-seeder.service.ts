import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { CaddyProvisioningService } from '../tenants/caddy-provisioning.service';

// Tenant de demonstration "demo" (Demo Solutions). Reinitialise un jeu de
// donnees de presentation (collaborateurs + SIRH + commercial + support) :
//   - chaque jour a 04:00 si DEMO_RESET_ENABLED=true ;
//   - a la demande via POST /demo/reset (super-admin).
// Le tenant lui-meme (domaine, offre, route Caddy) est conserve ; seules ses
// donnees sont remises a zero. Mot de passe commun via DEMO_PASSWORD.

const SLUG = 'demo';
const DOMAIN = 'demo.mdoservices.fr';
const YEAR = 2026;
const MODULES = [
  'pilotage.dashboard', 'pilotage.health', 'pilotage.reporting',
  'commercial.crm', 'commercial.opportunities', 'commercial.quotes', 'commercial.contracts', 'commercial.invoices',
  'support.tickets', 'support.interventions', 'support.calls',
  'sirh.dashboard', 'sirh.leaves', 'sirh.planning', 'sirh.timesheets', 'sirh.expenses', 'sirh.reviews', 'sirh.journeys', 'sirh.employees',
];

@Injectable()
export class DemoSeederService {
  private readonly logger = new Logger(DemoSeederService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly caddy: CaddyProvisioningService,
  ) {}

  private get password(): string {
    // `|| ` (pas `?? `) : DEMO_PASSWORD peut arriver comme chaine vide via
    // docker-compose (${DEMO_PASSWORD:-}) -> on retombe sur le defaut.
    const p = this.config.get<string>('DEMO_PASSWORD');
    return p && p.trim() ? p : 'DemoMDO2026!';
  }
  private get enabled(): boolean {
    return this.config.get<string>('DEMO_RESET_ENABLED') === 'true';
  }
  private d(s: string) { return new Date(s + 'T00:00:00.000Z'); }
  private dt(s: string) { return new Date(s); }

  @Cron('0 4 * * *', { name: 'demo-reset', timeZone: 'Europe/Paris' })
  async scheduledReset() {
    if (!this.enabled) return;
    try {
      await this.reseed();
      this.logger.log('Tenant demo reinitialise (cron quotidien)');
    } catch (err: any) {
      this.logger.error(`Reset demo echoue : ${err.message}`);
    }
  }

  // Efface les donnees du tenant demo et recree le jeu de presentation.
  // Conserve la ligne Tenant (domaine/offre/route Caddy).
  async reseed(): Promise<{ tenantId: string }> {
    const hash = await bcrypt.hash(this.password, 12);

    // 1. Tenant (cree si absent).
    let tenant = await this.prisma.tenant.findUnique({ where: { slug: SLUG } });
    let created = false;
    if (!tenant) {
      tenant = await this.prisma.tenant.create({
        data: {
          slug: SLUG, customDomain: DOMAIN, isActive: true, isDemo: true,
          brandName: 'Demo Solutions', brandShortName: 'Demo',
          brandTagline: 'Environnement de demonstration', brandPrimaryColor: '#2563eb',
          brandSupportEmail: 'support@demo.mdoservices.fr', enabledModules: MODULES,
        },
      });
      created = true;
    } else if (!tenant.isDemo || tenant.enabledModules.length === 0) {
      tenant = await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { isDemo: true, enabledModules: MODULES },
      });
    }
    const tid = tenant.id;
    const TID = { tenantId: tid };

    // 2. Purge des donnees scopees (enfants -> parents).
    await this.wipe(tid);

    // 3. Seed.
    const mkUser = (email: string, firstName: string, lastName: string, role: any) =>
      this.prisma.user.create({ data: { ...TID, email, passwordHash: hash, firstName, lastName, role, isActive: true, isSuperAdmin: false } });
    const sophie = await mkUser('admin@demo.mdoservices.fr', 'Sophie', 'Martin', 'ADMIN');
    const karim = await mkUser('manager@demo.mdoservices.fr', 'Karim', 'Benali', 'MANAGER');
    const julie = await mkUser('julie@demo.mdoservices.fr', 'Julie', 'Dubois', 'SALES');
    const thomas = await mkUser('thomas@demo.mdoservices.fr', 'Thomas', 'Leroy', 'SALES');
    const emma = await mkUser('emma@demo.mdoservices.fr', 'Emma', 'Petit', 'READONLY');
    const lucas = await mkUser('lucas@demo.mdoservices.fr', 'Lucas', 'Moreau', 'READONLY');
    const team = [sophie, karim, julie, thomas, emma, lucas];

    const profiles: [any, string, string, string | null, any, string][] = [
      [sophie, 'Directrice generale', 'Direction', null, 'CDI', '2018-01-08'],
      [karim, 'Responsable technique', 'Technique', sophie.id, 'CDI', '2019-09-02'],
      [julie, 'Charge de clientele', 'Commercial', sophie.id, 'CDI', '2021-03-15'],
      [thomas, 'Technicien support', 'Technique', karim.id, 'CDI', '2022-06-01'],
      [emma, 'Technicienne support', 'Technique', karim.id, 'CDD', '2023-11-06'],
      [lucas, 'Technicien junior', 'Technique', karim.id, 'ALTERNANCE', '2026-06-15'],
    ];
    for (const [u, jobTitle, department, managerId, contractType, hire] of profiles) {
      await this.prisma.employeeProfile.create({ data: { ...TID, userId: u.id, jobTitle, department, managerId, contractType, hireDate: this.d(hire), city: 'Toulouse', country: 'France' } });
    }

    // Conges
    const cp = await this.prisma.leaveType.create({ data: { ...TID, name: 'Conges payes', color: '#3b82f6', paid: true } });
    const rtt = await this.prisma.leaveType.create({ data: { ...TID, name: 'RTT', color: '#10b981', paid: true } });
    await this.prisma.leaveType.create({ data: { ...TID, name: 'Maladie', color: '#f59e0b', paid: true } });
    await this.prisma.leaveType.create({ data: { ...TID, name: 'Sans solde', color: '#94a3b8', paid: false } });
    for (const u of team) {
      await this.prisma.leaveBalance.create({ data: { ...TID, userId: u.id, typeId: cp.id, year: YEAR, allocated: 25 } });
      await this.prisma.leaveBalance.create({ data: { ...TID, userId: u.id, typeId: rtt.id, year: YEAR, allocated: 11 } });
    }
    const lr = (userId: string, typeId: string, start: string, end: string, status: any, workingDays: number, approverId: string | null, reason: string | null) =>
      this.prisma.leaveRequest.create({ data: { ...TID, userId, typeId, startDate: this.d(start), endDate: this.d(end), status, workingDays, approverId, decidedAt: approverId ? this.dt('2026-06-01T10:00:00Z') : null, reason } });
    await lr(emma.id, cp.id, '2026-06-10', '2026-06-13', 'APPROVED', 4, karim.id, 'Conges');
    await lr(julie.id, rtt.id, '2026-06-12', '2026-06-12', 'APPROVED', 1, sophie.id, null);
    await lr(karim.id, cp.id, '2026-06-22', '2026-06-26', 'APPROVED', 5, sophie.id, 'Vacances');
    await lr(thomas.id, cp.id, '2026-07-07', '2026-07-11', 'PENDING', 5, null, 'Conges ete');
    await lr(emma.id, rtt.id, '2026-07-21', '2026-07-21', 'PENDING', 1, null, null);

    // Notes de frais
    const catResto = await this.prisma.expenseCategory.create({ data: { ...TID, name: 'Restaurant', color: '#0ea5e9' } });
    const catTransport = await this.prisma.expenseCategory.create({ data: { ...TID, name: 'Transport', color: '#6366f1' } });
    const catHeb = await this.prisma.expenseCategory.create({ data: { ...TID, name: 'Hebergement', color: '#ec4899' } });
    await this.prisma.expenseClaim.create({ data: { ...TID, userId: julie.id, categoryId: catResto.id, date: this.d('2026-06-05'), description: 'Dejeuner client Cabinet Medical', merchant: 'Le Bistrot', amountTtc: 48.5, vatAmount: 4.41, status: 'PENDING' } });
    await this.prisma.expenseClaim.create({ data: { ...TID, userId: thomas.id, categoryId: catTransport.id, date: this.d('2026-06-09'), description: 'Peage + carburant intervention Castelnau', merchant: 'Total', amountTtc: 23.0, status: 'PENDING' } });
    await this.prisma.expenseClaim.create({ data: { ...TID, userId: karim.id, categoryId: catHeb.id, date: this.d('2026-05-20'), description: 'Hotel formation Microsoft', merchant: 'Ibis', amountTtc: 119.0, vatAmount: 10.82, status: 'REIMBURSED', approverId: sophie.id, decidedAt: this.dt('2026-05-25T09:00:00Z'), reimbursedAt: this.dt('2026-05-31T00:00:00Z') } });

    // Temps & feuilles
    const week = async (userId: string, mins: number[]) => {
      const days = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'];
      let total = 0;
      for (let i = 0; i < days.length; i++) {
        const m = mins[i] ?? 0; if (!m) continue; total += m;
        await this.prisma.timeEntry.create({ data: { ...TID, userId, startedAt: this.dt(days[i] + 'T08:00:00Z'), durationMin: m, description: 'Activite support / interventions', billable: true } });
      }
      await this.prisma.timesheet.create({ data: { ...TID, userId, periodStart: this.d('2026-06-08'), periodEnd: this.d('2026-06-14'), status: 'SUBMITTED', totalMinutes: total, submittedAt: this.dt('2026-06-12T17:00:00Z') } });
    };
    await week(thomas.id, [480, 480, 450, 480, 420]);
    await week(emma.id, [420, 0, 0, 480, 480]);

    // Entretiens & objectifs
    const revJulie = await this.prisma.review.create({ data: { ...TID, employeeId: julie.id, managerId: sophie.id, type: 'ANNUAL', status: 'SCHEDULED', scheduledAt: this.dt('2026-06-20T14:00:00Z') } });
    await this.prisma.review.create({ data: { ...TID, employeeId: thomas.id, managerId: karim.id, type: 'ONE_ON_ONE', status: 'COMPLETED', scheduledAt: this.dt('2026-06-03T11:00:00Z'), completedAt: this.dt('2026-06-03T11:45:00Z'), summary: 'Point trimestriel positif. Montee en competence sur la virtualisation.', rating: 4 } });
    await this.prisma.objective.create({ data: { ...TID, userId: julie.id, reviewId: revJulie.id, title: 'Atteindre 50 000 EUR de CA signe au T3', status: 'IN_PROGRESS', progress: 40, dueDate: this.d('2026-09-30') } });
    await this.prisma.objective.create({ data: { ...TID, userId: thomas.id, title: 'Obtenir la certification Microsoft AZ-104', status: 'IN_PROGRESS', progress: 60, dueDate: this.d('2026-10-31') } });
    await this.prisma.objective.create({ data: { ...TID, userId: emma.id, title: 'Reduire le delai moyen de resolution des tickets', status: 'TODO', progress: 0, dueDate: this.d('2026-12-15') } });

    // Parcours onboarding
    const tpl = await this.prisma.journeyTemplate.create({
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
      dueDate: t.offsetDays != null ? new Date(this.d(start).getTime() + t.offsetDays * 86400000) : null,
      done: t.offsetDays != null && t.offsetDays < 0,
      doneAt: t.offsetDays != null && t.offsetDays < 0 ? this.dt('2026-06-09T09:00:00Z') : null,
    }));
    await this.prisma.journey.create({ data: { ...TID, employeeId: lucas.id, templateId: tpl.id, kind: 'ONBOARDING', title: 'Arrivee de Lucas Moreau', startDate: this.d(start), status: 'IN_PROGRESS', tasks: { create: jtasks } } });

    // Commercial
    const company = (name: string, sector: any, status: any, city: string, ownerId: string) =>
      this.prisma.company.create({ data: { ...TID, name, sector, status, city, country: 'France', ownerId } });
    const c1 = await company('Boulangerie Saint-Michel', 'TPE', 'CUSTOMER', 'Toulouse', julie.id);
    const c2 = await company('Cabinet Medical des Tilleuls', 'SANTE', 'CUSTOMER', 'Blagnac', julie.id);
    const c3 = await company('Garage Auto Pro 31', 'PME', 'PROSPECT', 'Colomiers', julie.id);
    const c4 = await company('Mairie de Castelnau', 'COLLECTIVITE', 'CUSTOMER', 'Castelnau', sophie.id);
    const mkContact = (companyId: string, firstName: string, lastName: string, position: string, email: string) =>
      this.prisma.contact.create({ data: { ...TID, companyId, firstName, lastName, position, email, isPrimary: true, ownerId: julie.id } });
    await mkContact(c1.id, 'Paul', 'Bernard', 'Gerant', 'paul@boulangerie-st-michel.fr');
    await mkContact(c2.id, 'Claire', 'Rousseau', 'Secretaire medicale', 'contact@cabinet-tilleuls.fr');
    await mkContact(c3.id, 'David', 'Garnier', 'Directeur', 'd.garnier@garageautopro31.fr');
    await mkContact(c4.id, 'Nathalie', 'Faure', 'DGS', 'dgs@mairie-castelnau.fr');
    await this.prisma.opportunity.create({ data: { ...TID, title: 'Renouvellement parc informatique (8 postes)', companyId: c3.id, ownerId: julie.id, stage: 'PROPOSITION', amountHt: 12000, probability: 60, expectedCloseDate: this.dt('2026-07-15T00:00:00Z') } });
    await this.prisma.opportunity.create({ data: { ...TID, title: 'Contrat infogerance annuel', companyId: c2.id, ownerId: julie.id, stage: 'NEGOCIATION', amountHt: 8400, probability: 75, expectedCloseDate: this.dt('2026-06-30T00:00:00Z') } });
    await this.prisma.opportunity.create({ data: { ...TID, title: 'Migration Microsoft 365', companyId: c1.id, ownerId: julie.id, stage: 'GAGNE', amountHt: 3500, probability: 100, closedAt: this.dt('2026-05-28T00:00:00Z') } });
    await this.prisma.opportunity.create({ data: { ...TID, title: 'Sauvegarde externalisee mairie', companyId: c4.id, ownerId: sophie.id, stage: 'QUALIFICATION', amountHt: 4200, probability: 40 } });

    // Support
    const tk = (ref: string, title: string, description: string, status: any, priority: any, category: any, companyId: string, assigneeId: string) =>
      this.prisma.ticket.create({ data: { ...TID, reference: ref, title, description, status, priority, category, channel: 'PHONE', companyId, assigneeId, createdById: sophie.id } });
    const t1 = await tk('TKT-2026-0001', 'PC lent au secretariat', 'Le poste de la secretaire met plusieurs minutes a demarrer.', 'OPEN', 'HIGH', 'INCIDENT', c2.id, thomas.id);
    const t2 = await tk('TKT-2026-0002', 'Imprimante hors ligne', 'Imprimante du fournil non detectee sur le reseau.', 'IN_PROGRESS', 'NORMAL', 'INCIDENT', c1.id, emma.id);
    await tk('TKT-2026-0003', 'Demande de nouveau poste', 'Creation d\'un poste pour un nouvel agent a l\'accueil.', 'OPEN', 'LOW', 'REQUEST', c4.id, karim.id);
    await this.prisma.intervention.create({ data: { ...TID, title: 'Diagnostic poste secretariat', type: 'ONSITE', status: 'PLANNED', scheduledAt: this.dt('2026-06-16T09:00:00Z'), companyId: c2.id, ticketId: t1.id, technicianId: thomas.id } });
    await this.prisma.intervention.create({ data: { ...TID, title: 'Reconfiguration imprimante reseau', type: 'REMOTE', status: 'DONE', scheduledAt: this.dt('2026-06-11T14:00:00Z'), startedAt: this.dt('2026-06-11T14:05:00Z'), endedAt: this.dt('2026-06-11T14:50:00Z'), durationMin: 45, companyId: c1.id, ticketId: t2.id, technicianId: emma.id, report: 'Pilote reinstalle, IP fixe attribuee.' } });

    // Si le tenant vient d'etre cree, (re)genere la route Caddy.
    if (created) await this.caddy.triggerSilent('demo.reseed create');
    return { tenantId: tid };
  }

  private async wipe(tid: string) {
    const where = { tenantId: tid };
    const steps: Array<() => Promise<unknown>> = [
      () => this.prisma.timeEntry.deleteMany({ where }),
      () => this.prisma.timesheet.deleteMany({ where }),
      () => this.prisma.objective.deleteMany({ where }),
      () => this.prisma.review.deleteMany({ where }),
      () => this.prisma.journey.deleteMany({ where }),
      () => this.prisma.journeyTemplate.deleteMany({ where }),
      () => this.prisma.leaveRequest.deleteMany({ where }),
      () => this.prisma.leaveBalance.deleteMany({ where }),
      () => this.prisma.leaveType.deleteMany({ where }),
      () => this.prisma.expenseClaim.deleteMany({ where }),
      () => this.prisma.expenseCategory.deleteMany({ where }),
      () => this.prisma.employeeProfile.deleteMany({ where }),
      () => this.prisma.intervention.deleteMany({ where }),
      () => this.prisma.ticket.deleteMany({ where }),
      () => this.prisma.opportunity.deleteMany({ where }),
      () => this.prisma.contact.deleteMany({ where }),
      () => this.prisma.company.deleteMany({ where }),
      () => this.prisma.notification.deleteMany({ where }),
      () => this.prisma.user.deleteMany({ where }),
    ];
    for (const step of steps) await step();
  }
}
