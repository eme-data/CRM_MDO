import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ExpenseStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { DecideExpenseDto } from './dto/decide-expense.dto';

// SIRH - Notes de frais (multi-tenant).
//   - Tout collaborateur cree/consulte SES notes ; ADMIN/MANAGER valident,
//     refusent et marquent rembourse.
//   - Justificatif : fichier stocke via AttachmentsService, servi via
//     /expenses/:id/receipt (le scope tenant de la note sert de garde d'acces).

const DEFAULT_CATEGORIES = [
  { name: 'Repas', color: '#f59e0b' },
  { name: 'Transport', color: '#0ea5e9' },
  { name: 'Hebergement', color: '#8b5cf6' },
  { name: 'Fournitures', color: '#10b981' },
  { name: 'Autre', color: '#64748b' },
];

function isManager(me: JwtUser): boolean {
  return me.isSuperAdmin || me.role === 'ADMIN' || me.role === 'MANAGER';
}

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly attachments: AttachmentsService,
  ) {}

  private async ensureCategories(tenantId: string | null): Promise<void> {
    const count = await this.prisma.expenseCategory.count({ where: { tenantId } });
    if (count > 0) return;
    await this.prisma.expenseCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, tenantId })),
    });
  }

  async listCategories(me: JwtUser) {
    await this.ensureCategories(me.tenantId);
    return this.prisma.expenseCategory.findMany({
      where: this.scope.scopedWhere(me, { active: true }),
      orderBy: { name: 'asc' },
    });
  }

  // ---------- Notes ----------
  async create(dto: CreateExpenseDto, me: JwtUser) {
    await this.ensureCategories(me.tenantId);
    const cat = await this.prisma.expenseCategory.findFirst({
      where: this.scope.scopedWhere(me, { id: dto.categoryId, active: true }),
    });
    if (!cat) throw new NotFoundException('Categorie introuvable');
    if (dto.amountTtc <= 0) throw new BadRequestException('Le montant doit etre positif');

    const claim = await this.prisma.expenseClaim.create({
      data: {
        tenantId: me.tenantId,
        userId: me.id,
        categoryId: dto.categoryId,
        date: new Date(dto.date.slice(0, 10) + 'T00:00:00.000Z'),
        description: dto.description,
        merchant: dto.merchant,
        amountTtc: dto.amountTtc,
        vatAmount: dto.vatAmount,
        currency: dto.currency || 'EUR',
        status: 'PENDING',
      },
      include: { category: true },
    });
    await this.notifyApprovers(me, claim);
    return claim;
  }

  private async notifyApprovers(me: JwtUser, claim: any) {
    const approvers = await this.prisma.user.findMany({
      where: { tenantId: me.tenantId, isActive: true, role: { in: ['ADMIN', 'MANAGER'] }, id: { not: me.id } },
      select: { id: true },
    });
    const requester = await this.prisma.user.findUnique({
      where: { id: me.id }, select: { firstName: true, lastName: true },
    });
    const who = requester ? requester.firstName + ' ' + requester.lastName : 'Un collaborateur';
    for (const a of approvers) {
      await this.notifications.push({
        userId: a.id,
        title: 'Note de frais a valider',
        body: who + ' - ' + Number(claim.amountTtc).toFixed(2) + ' ' + claim.currency + ' (' + claim.category.name + ')',
        entity: 'ExpenseClaim',
        entityId: claim.id,
        url: '/frais',
      }).catch(() => {});
    }
  }

  async listMine(me: JwtUser) {
    return this.prisma.expenseClaim.findMany({
      where: { userId: me.id },
      include: { category: true, approver: { select: { firstName: true, lastName: true } } },
      orderBy: { date: 'desc' },
      take: 200,
    });
  }

  async listPending(me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux valideurs (ADMIN/MANAGER)');
    return this.prisma.expenseClaim.findMany({
      where: this.scope.scopedWhere(me, { status: ExpenseStatus.PENDING }),
      include: { category: true, user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Notes validees a rembourser
  async listToReimburse(me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux valideurs (ADMIN/MANAGER)');
    return this.prisma.expenseClaim.findMany({
      where: this.scope.scopedWhere(me, { status: ExpenseStatus.APPROVED }),
      include: { category: true, user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { decidedAt: 'asc' },
    });
  }

  async decide(id: string, dto: DecideExpenseDto, me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux valideurs (ADMIN/MANAGER)');
    const claim = await this.prisma.expenseClaim.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { category: true, user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true, tenantId: true } } },
    });
    if (!claim) throw new NotFoundException('Note de frais introuvable');
    if (claim.status !== 'PENDING') throw new BadRequestException('Note deja traitee (' + claim.status + ')');

    const status: ExpenseStatus = dto.approve ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.expenseClaim.update({
      where: { id },
      data: { status, approverId: me.id, decidedAt: new Date(), decisionNote: dto.note },
      include: { category: true },
    });
    await this.notifyDecision(claim, status === 'APPROVED' ? 'validee' : 'refusee', dto.note);
    return updated;
  }

  async markReimbursed(id: string, me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux valideurs (ADMIN/MANAGER)');
    const claim = await this.prisma.expenseClaim.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { user: { select: { id: true, email: true, isActive: true, tenantId: true } } },
    });
    if (!claim) throw new NotFoundException('Note de frais introuvable');
    if (claim.status !== 'APPROVED') throw new BadRequestException('Seule une note validee peut etre marquee remboursee');
    const updated = await this.prisma.expenseClaim.update({
      where: { id }, data: { status: 'REIMBURSED', reimbursedAt: new Date() },
    });
    await this.notifications.push({
      userId: claim.userId,
      title: 'Note de frais remboursee',
      body: Number(claim.amountTtc).toFixed(2) + ' ' + claim.currency + ' remboursee',
      entity: 'ExpenseClaim', entityId: claim.id, url: '/frais',
    }).catch(() => {});
    return updated;
  }

  private async notifyDecision(claim: any, verb: string, note?: string) {
    await this.notifications.push({
      userId: claim.userId,
      title: 'Note de frais ' + verb,
      body: claim.category.name + ' ' + Number(claim.amountTtc).toFixed(2) + ' ' + claim.currency + (note ? ' - ' + note : ''),
      entity: 'ExpenseClaim', entityId: claim.id, url: '/frais',
    }).catch(() => {});
    if (claim.user?.email && claim.user.isActive) {
      const color = verb === 'validee' ? '#059669' : '#b91c1c';
      const html =
        '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937;">' +
        '<h2 style="color:' + color + ';">Note de frais ' + verb + '</h2>' +
        '<p>Votre note de frais <strong>' + claim.category.name + '</strong> de <strong>' + Number(claim.amountTtc).toFixed(2) + ' ' + claim.currency + '</strong> a ete <strong>' + verb + '</strong>.</p>' +
        (note ? '<p><em>Commentaire : ' + note + '</em></p>' : '') +
        '<p style="color:#666;font-size:12px;">SIRH - notification automatique.</p></body></html>';
      try {
        await this.mail.send({
          to: claim.user.email,
          subject: '[Notes de frais] ' + verb,
          html,
          relatedEntity: 'ExpenseClaim',
          relatedEntityId: claim.id,
          tenantId: claim.user.tenantId,
        });
      } catch (err: any) { this.logger.warn('Email decision frais echoue : ' + err.message); }
    }
  }

  async cancel(id: string, me: JwtUser) {
    const claim = await this.prisma.expenseClaim.findFirst({ where: this.scope.scopedWhere(me, { id }) });
    if (!claim) throw new NotFoundException('Note de frais introuvable');
    const isOwner = claim.userId === me.id;
    if (!isOwner && !isManager(me)) throw new ForbiddenException('Action non autorisee');
    if (claim.status === 'REIMBURSED') throw new BadRequestException('Note deja remboursee');
    if (claim.status === 'CANCELLED') return claim;
    return this.prisma.expenseClaim.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  // ---------- Justificatif ----------
  async attachReceipt(id: string, file: any, me: JwtUser) {
    const claim = await this.prisma.expenseClaim.findFirst({ where: this.scope.scopedWhere(me, { id }) });
    if (!claim) throw new NotFoundException('Note de frais introuvable');
    if (claim.userId !== me.id && !isManager(me)) throw new ForbiddenException('Action non autorisee');
    if (!file) throw new BadRequestException('Fichier requis');
    const att = await this.attachments.saveBuffer(
      { originalname: file.originalname, mimetype: file.mimetype, size: file.size, buffer: file.buffer },
      { uploadedById: me.id },
    );
    await this.prisma.expenseClaim.update({ where: { id }, data: { receiptAttachmentId: att.id } });
    return { ok: true, attachmentId: att.id, filename: att.filename };
  }

  async getReceipt(id: string, me: JwtUser) {
    const claim = await this.prisma.expenseClaim.findFirst({ where: this.scope.scopedWhere(me, { id }) });
    if (!claim) throw new NotFoundException('Note de frais introuvable');
    if (!claim.receiptAttachmentId) throw new NotFoundException('Aucun justificatif');
    // Acces deja garanti par le scope tenant de la note -> bypass tenant sur l'attachment.
    const att = await this.attachments.findById(claim.receiptAttachmentId, null);
    return {
      stream: this.attachments.getReadStream(att.storageKey),
      filename: att.filename,
      mimeType: att.mimeType || 'application/octet-stream',
      sizeBytes: att.sizeBytes,
    };
  }
}
