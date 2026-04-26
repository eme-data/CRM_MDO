import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RunbookCategory } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface UpsertStepDto {
  id?: string;
  position?: number;
  title: string;
  details?: string;
  estimatedMin?: number;
  required?: boolean;
}

export interface UpsertRunbookDto {
  name: string;
  category?: RunbookCategory;
  description?: string;
  steps: UpsertStepDto[];
}

export interface UpdateRunDto {
  state: Record<string, { done?: boolean; note?: string; doneAt?: string; doneById?: string }>;
}

@Injectable()
export class RunbooksService {
  constructor(private readonly prisma: PrismaService) {}

  // ============= Runbook templates (catalogue) =============

  list() {
    return this.prisma.runbook.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        steps: { orderBy: { position: 'asc' } },
        _count: { select: { runs: true } },
      },
    });
  }

  async findOne(id: string) {
    const r = await this.prisma.runbook.findUnique({
      where: { id },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!r) throw new NotFoundException('Runbook introuvable');
    return r;
  }

  async create(dto: UpsertRunbookDto) {
    if (!dto.steps || dto.steps.length === 0) {
      throw new BadRequestException('Au moins une etape est requise');
    }
    return this.prisma.runbook.create({
      data: {
        name: dto.name,
        category: dto.category ?? 'AUTRE',
        description: dto.description,
        steps: {
          create: dto.steps.map((s, idx) => ({
            position: s.position ?? idx,
            title: s.title,
            details: s.details,
            estimatedMin: s.estimatedMin,
            required: s.required ?? true,
          })),
        },
      },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
  }

  async update(id: string, dto: UpsertRunbookDto) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.runbook.update({
        where: { id },
        data: {
          name: dto.name,
          category: dto.category ?? 'AUTRE',
          description: dto.description,
        },
      });
      // On remplace integralement la liste d'etapes (les runs existants
      // gardent leur state - si une etape disparait, sa case est juste
      // ignoree a l'affichage).
      await tx.runbookStep.deleteMany({ where: { runbookId: id } });
      await tx.runbookStep.createMany({
        data: dto.steps.map((s, idx) => ({
          runbookId: id,
          position: s.position ?? idx,
          title: s.title,
          details: s.details,
          estimatedMin: s.estimatedMin,
          required: s.required ?? true,
        })),
      });
      return tx.runbook.findUnique({
        where: { id },
        include: { steps: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async remove(id: string) {
    const usage = await this.prisma.runbookRun.count({ where: { runbookId: id } });
    if (usage > 0) {
      throw new BadRequestException(
        'Runbook deja utilise par ' + usage + ' execution(s). Impossible de le supprimer.',
      );
    }
    await this.prisma.runbook.delete({ where: { id } });
    return { success: true };
  }

  // ============= Runs (instances par client) =============

  listRuns(params: { companyId?: string; runbookId?: string }) {
    return this.prisma.runbookRun.findMany({
      where: {
        companyId: params.companyId,
        runbookId: params.runbookId,
      },
      orderBy: { startedAt: 'desc' },
      include: {
        runbook: { select: { id: true, name: true, category: true } },
        company: { select: { id: true, name: true } },
      },
    });
  }

  async findRun(id: string) {
    const r = await this.prisma.runbookRun.findUnique({
      where: { id },
      include: {
        runbook: { include: { steps: { orderBy: { position: 'asc' } } } },
        company: { select: { id: true, name: true } },
      },
    });
    if (!r) throw new NotFoundException('Execution introuvable');
    return r;
  }

  async start(runbookId: string, companyId: string, userId: string) {
    const rb = await this.findOne(runbookId);
    return this.prisma.runbookRun.create({
      data: {
        runbookId: rb.id,
        companyId,
        startedById: userId,
        state: {},
      },
      include: {
        runbook: { include: { steps: { orderBy: { position: 'asc' } } } },
      },
    });
  }

  // Met a jour l'etat des cases cochees. Marque completedAt si toutes
  // les etapes "required" sont cochees.
  async updateRun(id: string, dto: UpdateRunDto) {
    const run = await this.findRun(id);
    const merged = { ...((run.state as any) ?? {}), ...(dto.state ?? {}) };
    const requiredIds = run.runbook.steps.filter((s) => s.required).map((s) => s.id);
    const allDone = requiredIds.every((sid) => merged[sid]?.done === true);
    return this.prisma.runbookRun.update({
      where: { id },
      data: {
        state: merged,
        completedAt: allDone ? (run.completedAt ?? new Date()) : null,
      },
      include: {
        runbook: { include: { steps: { orderBy: { position: 'asc' } } } },
      },
    });
  }

  async removeRun(id: string) {
    await this.prisma.runbookRun.delete({ where: { id } });
    return { success: true };
  }

  // Templates suggeres pour bootstrap (non sauvegardes en BDD)
  suggestions() {
    return [
      {
        name: 'Onboarding nouveau client MSP',
        category: 'ONBOARDING',
        description: 'Checklist standard pour mettre en place un nouveau client',
        steps: [
          { title: 'Signature du contrat MDO', estimatedMin: 30, required: true },
          { title: 'Creation du tenant client dans le CRM', estimatedMin: 10 },
          { title: 'Audit reseau initial (topologie, FAI, VPN)', estimatedMin: 120 },
          { title: 'Inventaire materiel (postes, serveurs, imprimantes)', estimatedMin: 90 },
          { title: 'Inventaire licences (M365, antivirus, sauvegarde)', estimatedMin: 60 },
          { title: 'Mise en place de la supervision', estimatedMin: 60 },
          { title: 'Deploiement EDR / antivirus', estimatedMin: 120 },
          { title: 'Configuration sauvegarde (Veeam/Datto)', estimatedMin: 90 },
          { title: 'Documentation initiale dans le CRM (sites, reseaux, secrets)', estimatedMin: 60 },
          { title: 'Reunion de lancement avec le client', estimatedMin: 60 },
          { title: 'Email de bienvenue avec procedures support', estimatedMin: 15 },
        ],
      },
      {
        name: 'Audit trimestriel client',
        category: 'AUDIT',
        description: 'Audit periodique de l\'infrastructure et de la conformite',
        steps: [
          { title: 'Verification etat des sauvegardes (logs + test restore)', estimatedMin: 60, required: true },
          { title: 'Revue alertes EDR / SOC du trimestre', estimatedMin: 45, required: true },
          { title: 'Patch level OS et applications critiques', estimatedMin: 60 },
          { title: 'Revue licences M365 (sous-utilisation, cout)', estimatedMin: 30 },
          { title: 'Verification certificats SSL et noms de domaine', estimatedMin: 15 },
          { title: 'Test PRA / PCA selon plan client', estimatedMin: 90, required: false },
          { title: 'Revue droits d\'acces (qui a quoi)', estimatedMin: 45 },
          { title: 'Mise a jour documentation CRM si changements', estimatedMin: 30 },
          { title: 'Rapport ecrit envoye au client', estimatedMin: 60, required: true },
        ],
      },
      {
        name: 'Patch management mensuel',
        category: 'PATCHING',
        description: 'Cycle mensuel de mise a jour OS / applications',
        steps: [
          { title: 'Revue Patch Tuesday Microsoft', estimatedMin: 30, required: true },
          { title: 'Tests sur poste pilote', estimatedMin: 60 },
          { title: 'Deploiement par vagues (groupes pilotes -> prod)', estimatedMin: 90 },
          { title: 'Verification redemarrage des services critiques', estimatedMin: 30, required: true },
          { title: 'Communication client si reboot necessaire', estimatedMin: 15 },
          { title: 'Revue postes en echec et correctif manuel', estimatedMin: 60 },
        ],
      },
      {
        name: 'Offboarding utilisateur',
        category: 'OFFBOARDING',
        description: 'Procedure standard de depart d\'un utilisateur chez un client',
        steps: [
          { title: 'Recuperer la date de depart effective', estimatedMin: 5, required: true },
          { title: 'Suspendre le compte M365 / AD', estimatedMin: 10, required: true },
          { title: 'Transferer la boite mail au manager', estimatedMin: 15 },
          { title: 'Reaffecter les fichiers OneDrive / SharePoint personnels', estimatedMin: 30 },
          { title: 'Recuperer le materiel (PC, telephone, badge)', estimatedMin: 15 },
          { title: 'Reset des secrets partages (passwords admin)', estimatedMin: 30, required: true },
          { title: 'Liberer la licence M365', estimatedMin: 5 },
          { title: 'Notification ecrite au client', estimatedMin: 5 },
        ],
      },
    ];
  }
}
