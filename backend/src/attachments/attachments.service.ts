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
import { PrismaService } from '../database/prisma.service';

interface IncomingFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class AttachmentsService implements OnModuleInit {
  private readonly logger = new Logger(AttachmentsService.name);
  private uploadsDir!: string;
  private maxBytes!: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.uploadsDir = this.configService.get<string>('uploads.dir') ?? '/app/uploads';
    this.maxBytes =
      parseInt(this.configService.get<string>('uploads.maxMb') ?? '25', 10) * 1024 * 1024;
    await fs.mkdir(this.uploadsDir, { recursive: true });
    this.logger.log(
      'Attachments dir : ' + this.uploadsDir + ' - max size : ' + Math.round(this.maxBytes / 1024 / 1024) + ' Mo',
    );
  }

  get maxFileBytes(): number {
    return this.maxBytes;
  }

  async saveBuffer(
    file: IncomingFile,
    opts: {
      uploadedById?: string | null;
      ticketId?: string | null;
      ticketMessageId?: string | null;
    },
  ) {
    if (file.size > this.maxBytes) {
      throw new BadRequestException(
        'Fichier trop volumineux (max ' + Math.round(this.maxBytes / 1024 / 1024) + ' Mo)',
      );
    }
    const safeName = this.sanitizeFilename(file.originalname);
    const id = randomUUID();
    const storageKey = id + path.extname(safeName);
    const fullPath = path.join(this.uploadsDir, storageKey);

    await fs.writeFile(fullPath, file.buffer);

    return this.prisma.attachment.create({
      data: {
        id,
        filename: safeName,
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById: opts.uploadedById ?? null,
        ticketId: opts.ticketId ?? null,
        ticketMessageId: opts.ticketMessageId ?? null,
      },
    });
  }

  async findById(id: string) {
    const att = await this.prisma.attachment.findUnique({ where: { id } });
    if (!att) throw new NotFoundException('Piece jointe introuvable');
    return att;
  }

  getReadStream(storageKey: string): ReadStream {
    const fullPath = path.join(this.uploadsDir, storageKey);
    return createReadStream(fullPath);
  }

  async listForTicket(ticketId: string) {
    return this.prisma.attachment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    });
  }

  async remove(id: string) {
    const att = await this.findById(id);
    const fullPath = path.join(this.uploadsDir, att.storageKey);
    await fs.unlink(fullPath).catch((err) => {
      this.logger.warn('Echec suppression fichier ' + fullPath + ' : ' + err.message);
    });
    await this.prisma.attachment.delete({ where: { id } });
  }

  async readToBuffer(storageKey: string): Promise<Buffer> {
    const fullPath = path.join(this.uploadsDir, storageKey);
    return fs.readFile(fullPath);
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 200) || 'file';
  }
}
