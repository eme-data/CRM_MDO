import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs, createReadStream, ReadStream } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { DocumentCategory, Prisma } from '@prisma/client';
import { addDays, differenceInDays } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

interface IncomingFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Liste blanche MIME types acceptes pour la GED. On accepte un peu plus large
// que les attachments tickets (ex. autorise zip pour les remises de documents
// signes en lot).
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/tiff',
  'text/plain',
  'text/csv',
]);

const STORAGE_PREFIX = 'documents/';

@Injectable()
export class DocumentsService implements OnModuleInit {
  private readonly logger = new Logger(DocumentsService.name);
  private uploadsDir!: string;
  private maxBytes!: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly scope: TenantScope,
  ) {}

  async onModuleInit() {
    this.uploadsDir = this.configService.get<string>('uploads.dir') ?? '/app/uploads';
    // GED : on autorise plus gros que les attachments (par defaut 50 Mo) car
    // un PDF avec scan en couleur peut depasser 25 Mo. Configurable.
    this.maxBytes =
      parseInt(this.configService.get<string>('uploads.documentsMaxMb') ?? '50', 10)
      * 1024 * 1024;
    await fs.mkdir(path.join(this.uploadsDir, 'documents'), { recursive: true });
  }

  get maxFileBytes(): number {
    return this.maxBytes;
  }

  // ============================================================
  // Upload + creation
  // ============================================================
  async upload(params: {
    file: IncomingFile;
    companyId: string;
    uploadedById: string;
    category?: DocumentCategory;
    title?: string;
    description?: string;
    expiresAt?: string;
    visibleToClient?: boolean;
  }, me: JwtUser) {
    if (params.file.size > this.maxBytes) {
      throw new BadRequestException(
        'Fichier trop volumineux (max ' + Math.round(this.maxBytes / 1024 / 1024) + ' Mo)',
      );
    }
    if (!ALLOWED_MIME.has(params.file.mimetype)) {
      throw new BadRequestException('Type de fichier refuse : ' + params.file.mimetype);
    }
    // Verifie que la societe existe ET appartient au tenant courant (sinon
    // un user du tenant A pouvait uploader un document dans une company du
    // tenant B en devinant l'UUID).
    await this.scope.assertCompanyInTenant(params.companyId, me);
    const company = await this.prisma.company.findUnique({
      where: { id: params.companyId },
      select: { id: true, tenantId: true },
    });
    if (!company) throw new NotFoundException('Societe introuvable');

    const safeName = this.sanitizeFilename(params.file.originalname);
    const id = randomUUID();
    const storageKey = STORAGE_PREFIX + id + path.extname(safeName);
    const fullPath = path.join(this.uploadsDir, storageKey);
    await fs.writeFile(fullPath, params.file.buffer);

    return this.prisma.companyDocument.create({
      data: {
        id,
        // Heriter du tenantId de la company (sinon CompanyDocument.tenantId
        // serait null et tout le filtrage scope tombe a l'eau).
        tenantId: company.tenantId,
        companyId: params.companyId,
        filename: safeName,
        storageKey,
        mimeType: params.file.mimetype,
        sizeBytes: params.file.size,
        category: params.category ?? 'OTHER',
        title: params.title,
        description: params.description,
        expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
        visibleToClient: params.visibleToClient ?? false,
        uploadedById: params.uploadedById,
      },
    });
  }

  // ============================================================
  // Lecture
  // ============================================================
  // Scope tenant : on filtre par companyId ET par tenantId pour empecher
  // l'enumeration cross-tenant. Le scope.assertCompanyInTenant gere aussi
  // le cas ou companyId n'existe pas / pas dans le tenant -> 403.
  // Le portail client passe `me=null` car les portalUsers ont leur propre
  // mechanism d'authorization (visibleToClientOnly + verif company ownership
  // dans le caller).
  async listForCompany(
    companyId: string,
    opts: { visibleToClientOnly?: boolean } = {},
    me: JwtUser | null = null,
  ) {
    if (me) await this.scope.assertCompanyInTenant(companyId, me);
    const where: Prisma.CompanyDocumentWhereInput = { companyId };
    if (opts.visibleToClientOnly) where.visibleToClient = true;
    return this.prisma.companyDocument.findMany({
      where,
      orderBy: [{ category: 'asc' }, { uploadedAt: 'desc' }],
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findById(id: string, me: JwtUser | null = null) {
    const d = await this.prisma.companyDocument.findFirst({
      where: me ? this.scope.scopedWhere(me, { id }) : { id },
      include: {
        company: { select: { id: true, name: true, tenantId: true } },
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!d) throw new NotFoundException('Document introuvable');
    return d;
  }

  getReadStream(storageKey: string): ReadStream {
    const fullPath = path.join(this.uploadsDir, storageKey);
    return createReadStream(fullPath);
  }

  // Lecture en buffer pour les usages programmatiques (ex. extraction OCR
  // qui doit base64-encoder le fichier avant envoi a Claude Vision).
  async readBuffer(storageKey: string): Promise<Buffer> {
    const fullPath = path.join(this.uploadsDir, storageKey);
    return fs.readFile(fullPath);
  }

  // ============================================================
  // Update metadata + delete
  // ============================================================
  async update(id: string, dto: UpdateDocumentDto, me: JwtUser) {
    await this.findById(id, me); // assert tenant ownership
    const data: Prisma.CompanyDocumentUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.visibleToClient !== undefined) data.visibleToClient = dto.visibleToClient;
    return this.prisma.companyDocument.update({ where: { id }, data });
  }

  async remove(id: string, me: JwtUser) {
    const d = await this.findById(id, me); // assert tenant ownership
    const fullPath = path.join(this.uploadsDir, d.storageKey);
    // Best-effort : si le fichier est deja absent ou inaccessible, on log et on
    // continue la suppression BDD (sinon on garde une row orpheline).
    await fs.unlink(fullPath).catch((err) => {
      this.logger.warn('Suppression fichier ' + fullPath + ' echoue : ' + err.message);
    });
    await this.prisma.companyDocument.delete({ where: { id } });
    return { ok: true };
  }

  // ============================================================
  // Cron : alerte 30j avant expiration des documents
  // ============================================================
  // Quotidien 7h Paris : trouve les documents qui expirent dans <=30j et
  // envoie une notification au owner de la societe (ou ADMIN par defaut).
  // Evite les KBIS perimes le jour J en regardant l'audit RGPD.
  @Cron('0 7 * * *', { name: 'documents-expiration-alert', timeZone: 'Europe/Paris' })
  async runExpirationAlert() {
    const horizon = addDays(new Date(), 30);
    const expiring = await this.prisma.companyDocument.findMany({
      where: {
        expiresAt: { gte: new Date(), lte: horizon },
      },
      include: {
        company: { select: { id: true, name: true, ownerId: true } },
      },
    });
    if (expiring.length === 0) return { notified: 0 };

    // Fallback : si pas d'owner, on prend le 1er ADMIN actif.
    const fallbackAdmin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });

    let notified = 0;
    for (const d of expiring) {
      const userId = d.company.ownerId ?? fallbackAdmin?.id;
      if (!userId) continue;
      const days = differenceInDays(d.expiresAt!, new Date());
      await this.notifications.push({
        userId,
        type: 'GENERIC',
        title: 'Document expire dans ' + days + 'j : ' + (d.title ?? d.filename),
        body: 'Societe ' + d.company.name + ' — categorie ' + d.category
          + (days <= 7 ? ' (URGENT)' : ''),
        entity: 'CompanyDocument',
        entityId: d.id,
        url: '/companies/' + d.company.id + '#documents',
      }).catch((err) => this.logger.warn('Notif expiration doc echouee : ' + err.message));
      notified++;
    }
    this.logger.log('Documents expirent <=30j : ' + notified + ' notifications envoyees');
    return { notified };
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 200) || 'document';
  }
}
