import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { DocumentCategory } from '@prisma/client';
import { DocumentsService } from './documents.service';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  // Liste les documents d'une societe (filtre obligatoire — on ne liste pas
  // tous les documents de tous les clients en un seul appel).
  @Get()
  list(@Query('companyId') companyId: string) {
    if (!companyId) throw new BadRequestException('companyId requis');
    return this.service.listForCompany(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  // Telecharge le fichier physique. Body content-disposition = attachment
  // pour forcer le telechargement (eviter qu'un PDF s'ouvre dans le navigateur
  // — le user telecharge pour signer ou archiver).
  @Get(':id/download')
  async download(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const d = await this.service.findById(id);
    const stream = this.service.getReadStream(d.storageKey);
    res.set({
      'Content-Type': d.mimeType,
      'Content-Disposition': 'attachment; filename="' + d.filename.replace(/"/g, '') + '"',
      'Content-Length': String(d.sizeBytes),
    });
    return new StreamableFile(stream);
  }

  // Upload : multipart/form-data, file + champs metadata. SALES n'a pas le
  // droit (donnees sensibles type KBIS, contrats). ADMIN/MANAGER uniquement.
  @Roles('ADMIN', 'MANAGER')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: any,
    @Body() body: {
      companyId: string;
      category?: DocumentCategory;
      title?: string;
      description?: string;
      expiresAt?: string;
      visibleToClient?: string | boolean;
    },
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    if (!body.companyId) throw new BadRequestException('companyId requis');
    return this.service.upload({
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      companyId: body.companyId,
      category: body.category,
      title: body.title?.trim() || undefined,
      description: body.description?.trim() || undefined,
      expiresAt: body.expiresAt || undefined,
      // multipart/form-data envoie les booleens en string ('true'/'false')
      visibleToClient: body.visibleToClient === true || body.visibleToClient === 'true',
      uploadedById: user.id,
    });
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.service.update(id, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
