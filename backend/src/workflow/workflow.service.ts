import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  Prisma,
  WorkflowTrigger,
  WorkflowAction,
  TaskPriority,
  InvoiceStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  substitutePlaceholders,
  validateTriggerParams,
  validateActionParams,
} from './workflow.helpers';

// Entites cibles d'un trigger : on garde un type discriminant pour que le
// dispatcher d'action sache quels champs il peut injecter dans les placeholders.
type TargetEntity =
  | { kind: 'Contract'; id: string; companyId: string; context: Record<string, any> }
  | { kind: 'Ticket'; id: string; companyId: string; context: Record<string, any> }
  | { kind: 'Asset'; id: string; companyId: string; context: Record<string, any> }
  | { kind: 'Invoice'; id: string; companyId: string; context: Record<string, any> };

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ============================================================
  // CRUD
  // ============================================================
  list() {
    return this.prisma.workflowRule.findMany({
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { executions: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.workflowRule.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        executions: {
          orderBy: { firedAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!rule) throw new NotFoundException('Regle workflow introuvable');
    return rule;
  }

  async create(
    input: {
      name: string;
      description?: string;
      trigger: WorkflowTrigger;
      triggerParams: any;
      action: WorkflowAction;
      actionParams: any;
      assigneeId?: string;
    },
    userId: string,
  ) {
    // Validation cote service en plus du DTO (defense en profondeur).
    const tErr = validateTriggerParams(input.trigger, input.triggerParams);
    if (tErr) throw new BadRequestException('triggerParams : ' + tErr);
    const aErr = validateActionParams(input.action, input.actionParams);
    if (aErr) throw new BadRequestException('actionParams : ' + aErr);

    return this.prisma.workflowRule.create({
      data: {
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        triggerParams: input.triggerParams as Prisma.InputJsonValue,
        action: input.action,
        actionParams: input.actionParams as Prisma.InputJsonValue,
        assigneeId: input.assigneeId,
        createdById: userId,
      },
    });
  }

  async update(id: string, input: Partial<{ name: string; description: string | null; trigger: WorkflowTrigger; triggerParams: any; action: WorkflowAction; actionParams: any; assigneeId: string | null; isActive: boolean }>) {
    await this.findOne(id);
    if (input.trigger && input.triggerParams !== undefined) {
      const err = validateTriggerParams(input.trigger, input.triggerParams);
      if (err) throw new BadRequestException('triggerParams : ' + err);
    }
    if (input.action && input.actionParams !== undefined) {
      const err = validateActionParams(input.action, input.actionParams);
      if (err) throw new BadRequestException('actionParams : ' + err);
    }
    return this.prisma.workflowRule.update({
      where: { id },
      data: input as Prisma.WorkflowRuleUpdateInput,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.workflowRule.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Reset les executions d'une regle (utile pour re-tirer apres correction
   * d'un parametre ou nettoyage manuel des Tasks creees).
   */
  async resetExecutions(id: string) {
    await this.findOne(id);
    const r = await this.prisma.workflowExecution.deleteMany({ where: { ruleId: id } });
    return { deleted: r.count };
  }

  // ============================================================
  // Cron principal : evalue toutes les regles actives quotidiennement.
  // Cadence : 07:00 Europe/Paris (apres le cron recurring-tasks de 06:30,
  // ainsi les Tasks creees par les workflows arrivent juste apres).
  // ============================================================
  @Cron('0 7 * * *', { name: 'workflow-daily', timeZone: 'Europe/Paris' })
  async runDaily() {
    const rules = await this.prisma.workflowRule.findMany({ where: { isActive: true } });
    this.logger.log('Workflow cron : ' + rules.length + ' regle(s) a evaluer');
    let totalFired = 0;
    for (const rule of rules) {
      try {
        const fired = await this.evaluateRule(rule.id);
        totalFired += fired;
      } catch (err: any) {
        this.logger.warn('Regle ' + rule.id + ' (' + rule.name + ') echec : ' + err.message);
      }
    }
    this.logger.log('Workflow cron : ' + totalFired + ' execution(s) tirees');
    return { rulesEvaluated: rules.length, fired: totalFired };
  }

  /**
   * Evalue une regle : execute son trigger, dispatche l'action sur chaque
   * entite cible non-deja-tiree. Retourne le nombre d'executions creees.
   */
  async evaluateRule(ruleId: string): Promise<number> {
    const rule = await this.prisma.workflowRule.findUnique({ where: { id: ruleId } });
    if (!rule || !rule.isActive) return 0;

    const targets = await this.runTrigger(rule.trigger, rule.triggerParams as any);

    let fired = 0;
    for (const target of targets) {
      // Dedup : si une execution existe deja pour (ruleId, entityType, entityId),
      // on ne re-tire pas. L'admin peut reset via resetExecutions().
      const existing = await this.prisma.workflowExecution.findUnique({
        where: {
          ruleId_entityType_entityId: {
            ruleId: rule.id,
            entityType: target.kind,
            entityId: target.id,
          },
        },
      });
      if (existing) continue;

      try {
        const result = await this.runAction(rule, target);
        await this.prisma.workflowExecution.create({
          data: {
            ruleId: rule.id,
            entityType: target.kind,
            entityId: target.id,
            result,
          },
        });
        fired++;
      } catch (err: any) {
        this.logger.warn(
          'Action ' + rule.action + ' echec sur ' + target.kind + ' ' + target.id + ' : ' + err.message,
        );
      }
    }

    // Mise a jour des compteurs / horodatages
    await this.prisma.workflowRule.update({
      where: { id: rule.id },
      data: {
        lastEvaluatedAt: new Date(),
        ...(fired > 0
          ? { lastFiredAt: new Date(), firedCount: { increment: fired } }
          : {}),
      },
    });

    return fired;
  }

  // ============================================================
  // Triggers : retournent la liste des entites cibles a traiter
  // ============================================================
  private async runTrigger(trigger: WorkflowTrigger, params: any): Promise<TargetEntity[]> {
    const now = new Date();
    switch (trigger) {
      case 'CONTRACT_EXPIRING': {
        const days = params.daysBefore;
        const until = new Date(now.getTime() + days * 86400_000);
        const contracts = await this.prisma.contract.findMany({
          where: { status: 'ACTIVE', endDate: { gte: now, lte: until } },
          include: { company: { select: { id: true, name: true, ownerId: true } } },
        });
        return contracts.map((c) => ({
          kind: 'Contract',
          id: c.id,
          companyId: c.companyId,
          context: {
            reference: c.reference,
            title: c.title,
            endDate: c.endDate,
            daysRemaining: Math.ceil((c.endDate.getTime() - now.getTime()) / 86400_000),
            company: { name: c.company.name },
            companyOwnerId: c.company.ownerId,
          },
        }));
      }

      case 'TICKET_OVERDUE': {
        const tickets = await this.prisma.ticket.findMany({
          where: {
            status: { notIn: ['RESOLVED', 'CLOSED', 'CANCELLED'] },
            dueDate: { lt: now },
          },
          include: { company: { select: { id: true, name: true, ownerId: true } } },
        });
        return tickets.map((t) => ({
          kind: 'Ticket',
          id: t.id,
          companyId: t.companyId,
          context: {
            reference: t.reference,
            title: t.title,
            priority: t.priority,
            dueDate: t.dueDate,
            company: { name: t.company.name },
            companyOwnerId: t.company.ownerId,
          },
        }));
      }

      case 'ASSET_EXPIRING': {
        const days = params.daysBefore;
        const until = new Date(now.getTime() + days * 86400_000);
        const assets = await this.prisma.asset.findMany({
          where: { status: 'ACTIVE', expiresAt: { gte: now, lte: until } },
          include: { company: { select: { id: true, name: true, ownerId: true } } },
        });
        return assets.map((a) => ({
          kind: 'Asset',
          id: a.id,
          companyId: a.companyId,
          context: {
            name: a.name,
            type: a.type,
            expiresAt: a.expiresAt,
            daysRemaining: a.expiresAt
              ? Math.ceil((a.expiresAt.getTime() - now.getTime()) / 86400_000)
              : null,
            company: { name: a.company.name },
            companyOwnerId: a.company.ownerId,
          },
        }));
      }

      case 'INVOICE_OVERDUE': {
        const days = params.daysOverdue;
        const dueBefore = new Date(now.getTime() - days * 86400_000);
        const invoices = await this.prisma.invoice.findMany({
          where: {
            paidAt: null,
            status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
            dueDate: { lt: dueBefore },
          },
          include: { company: { select: { id: true, name: true, ownerId: true } } },
        });
        return invoices.map((inv) => ({
          kind: 'Invoice',
          id: inv.id,
          companyId: inv.companyId,
          context: {
            number: inv.number,
            dueDate: inv.dueDate,
            daysOverdue: Math.ceil((now.getTime() - inv.dueDate.getTime()) / 86400_000),
            totalTtc: Number(inv.totalTtc),
            company: { name: inv.company.name },
            companyOwnerId: inv.company.ownerId,
          },
        }));
      }

      default:
        return [];
    }
  }

  // ============================================================
  // Actions : execute l'action de la regle sur une entite cible.
  // Retourne une chaine de resultat (audit).
  // ============================================================
  private async runAction(
    rule: { id: string; action: WorkflowAction; actionParams: any; assigneeId: string | null; createdById: string },
    target: TargetEntity,
  ): Promise<string> {
    const params = rule.actionParams as any;
    switch (rule.action) {
      case 'CREATE_TASK': {
        const title = substitutePlaceholders(params.titleTemplate, target.context).slice(0, 200);
        const priority: TaskPriority = (params.priority ?? 'NORMAL') as TaskPriority;
        const offset = typeof params.dueDateOffsetDays === 'number' ? params.dueDateOffsetDays : 7;
        const dueDate = new Date(Date.now() + offset * 86400_000);
        // Resolution de l'assignee : actionParams override, sinon rule.assigneeId,
        // sinon companyOwnerId du target, sinon createdBy.
        const assigneeId =
          (typeof params.assigneeId === 'string' && params.assigneeId) ||
          rule.assigneeId ||
          target.context.companyOwnerId ||
          null;
        const task = await this.prisma.task.create({
          data: {
            title,
            description:
              'Cree automatiquement par la regle workflow. Cible : ' +
              target.kind +
              ' ' +
              target.id,
            priority,
            dueDate,
            createdById: rule.createdById,
            assigneeId,
            companyId: target.companyId,
          },
        });
        return 'TASK_CREATED:' + task.id;
      }

      case 'CREATE_NOTIFICATION': {
        const title = substitutePlaceholders(params.title, target.context).slice(0, 200);
        const body = params.body
          ? substitutePlaceholders(String(params.body), target.context).slice(0, 1000)
          : undefined;
        const targetRole: 'ADMIN' | 'MANAGER' | 'OWNER' = params.targetRole ?? 'ADMIN';
        // Resolution des destinataires
        let recipients: Array<{ id: string }> = [];
        if (targetRole === 'OWNER') {
          // Owner de la company associee
          const ownerId = target.context.companyOwnerId;
          if (ownerId) recipients = [{ id: ownerId }];
        } else {
          recipients = await this.prisma.user.findMany({
            where: { isActive: true, role: targetRole },
            select: { id: true },
          });
        }
        await Promise.all(
          recipients.map((u) =>
            this.notifications.push({
              userId: u.id,
              type: 'GENERIC',
              title,
              body,
              entity: target.kind,
              entityId: target.id,
              url: this.urlForEntity(target),
            }),
          ),
        );
        return 'NOTIFICATION_SENT:' + recipients.length;
      }

      default:
        return 'NOOP';
    }
  }

  private urlForEntity(target: TargetEntity): string {
    switch (target.kind) {
      case 'Contract': return '/contracts/' + target.id;
      case 'Ticket': return '/tickets/' + target.id;
      case 'Asset': return '/assets/' + target.id;
      case 'Invoice': return '/invoices/' + target.id;
    }
  }
}
