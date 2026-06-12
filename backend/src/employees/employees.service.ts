import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeDocType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { AttachmentsService } from '../attachments/attachments.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

// SIRH - Dossier collaborateur. Donnees RH sensibles :
//   - un collaborateur voit/edite SA fiche (coordonnees uniquement) + voit SES docs ;
//   - ADMIN/MANAGER (RH) voient/editent toutes les fiches du tenant + gerent les docs.

const DATE_FIELDS = new Set(['hireDate', 'endDate', 'birthDate']);
// Champs qu'un collaborateur peut editer lui-meme (le reste = RH only).
const SELF_EDITABLE = new Set([
  'phone', 'mobile', 'address', 'postalCode', 'city', 'country',
  'emergencyContactName', 'emergencyContactPhone', 'iban', 'birthDate',
]);

function isManager(me: JwtUser): boolean {
  return me.isSuperAdmin || me.role === 'ADMIN' || me.role === 'MANAGER';
}
function ymdToDate(s?: string | null): Date | null {
  return s ? new Date(s.slice(0, 10) + 'T00:00:00.000Z') : null;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly attachments: AttachmentsService,
  ) {}

  private async assertUserInTenant(userId: string, me: JwtUser) {
    const u = await this.prisma.user.findFirst({
      where: this.scope.scopedWhere(me, { id: userId }),
      select: { id: true },
    });
    if (!u) throw new NotFoundException('Collaborateur introuvable');
  }

  // Annuaire RH (managers) : tous les collaborateurs du tenant + leur fiche.
  async list(me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux RH (ADMIN/MANAGER)');
    return this.prisma.user.findMany({
      where: this.scope.scopedWhere(me, { isActive: true }),
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true,
        employeeProfile: {
          include: { manager: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async getProfile(userId: string, me: JwtUser) {
    if (me.id !== userId && !isManager(me)) throw new ForbiddenException('Acces refuse');
    await this.assertUserInTenant(userId, me);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true,
        employeeProfile: {
          include: { manager: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('Collaborateur introuvable');
    return user;
  }

  getMe(me: JwtUser) {
    return this.getProfile(me.id, me);
  }

  async upsertProfile(userId: string, dto: UpdateProfileDto, me: JwtUser) {
    const self = me.id === userId;
    if (!self && !isManager(me)) throw new ForbiddenException('Acces refuse');
    await this.assertUserInTenant(userId, me);

    const data: any = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue;
      // Un collaborateur ne touche qu'a ses coordonnees ; le reste = RH only.
      if (!isManager(me) && !SELF_EDITABLE.has(k)) continue;
      if (DATE_FIELDS.has(k)) data[k] = ymdToDate(v as string);
      else if (k === 'managerId') data[k] = v === '' ? null : v;
      else data[k] = v;
    }

    return this.prisma.employeeProfile.upsert({
      where: { userId },
      create: { tenantId: me.tenantId, userId, ...data },
      update: data,
      include: { manager: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  // ---------- Documents RH ----------
  async listDocuments(userId: string, me: JwtUser) {
    if (me.id !== userId && !isManager(me)) throw new ForbiddenException('Acces refuse');
    await this.assertUserInTenant(userId, me);
    return this.prisma.employeeDocument.findMany({
      where: { userId },
      include: { uploadedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDocument(userId: string, file: any, body: { type?: EmployeeDocType; name?: string }, me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux RH (ADMIN/MANAGER)');
    await this.assertUserInTenant(userId, me);
    if (!file) throw new BadRequestException('Fichier requis');
    const att = await this.attachments.saveBuffer(
      { originalname: file.originalname, mimetype: file.mimetype, size: file.size, buffer: file.buffer },
      { uploadedById: me.id },
    );
    return this.prisma.employeeDocument.create({
      data: {
        tenantId: me.tenantId,
        userId,
        type: (body.type as EmployeeDocType) ?? 'AUTRE',
        name: body.name || att.filename,
        attachmentId: att.id,
        uploadedById: me.id,
      },
    });
  }

  async downloadDocument(docId: string, me: JwtUser) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: this.scope.scopedWhere(me, { id: docId }),
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    if (doc.userId !== me.id && !isManager(me)) throw new ForbiddenException('Acces refuse');
    const att = await this.attachments.findById(doc.attachmentId, null);
    return {
      stream: this.attachments.getReadStream(att.storageKey),
      filename: att.filename,
      mimeType: att.mimeType || 'application/octet-stream',
      sizeBytes: att.sizeBytes,
    };
  }

  async removeDocument(docId: string, me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux RH (ADMIN/MANAGER)');
    const doc = await this.prisma.employeeDocument.findFirst({
      where: this.scope.scopedWhere(me, { id: docId }),
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    await this.prisma.employeeDocument.delete({ where: { id: docId } });
    await this.attachments.remove(doc.attachmentId).catch(() => {});
    return { ok: true };
  }
}
