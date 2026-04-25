import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Body,
  ForbiddenException,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 10))
  async upload(
    @UploadedFiles() files: Array<any>,
    @Body() body: { ticketId?: string; ticketMessageId?: string },
    @CurrentUser() user: JwtUser,
  ) {
    if (!files || files.length === 0) {
      return { items: [] };
    }
    const items = await Promise.all(
      files.map((f) =>
        this.service.saveBuffer(
          {
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size,
            buffer: f.buffer,
          },
          {
            uploadedById: user.id,
            ticketId: body.ticketId ?? null,
            ticketMessageId: body.ticketMessageId ?? null,
          },
        ),
      ),
    );
    return { items };
  }

  @Get(':id')
  async download(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const att = await this.service.findById(id);
    const stream = this.service.getReadStream(att.storageKey);
    res.set({
      'Content-Type': att.mimeType || 'application/octet-stream',
      'Content-Disposition':
        'attachment; filename="' + att.filename.replace(/"/g, '') + '"',
      'Content-Length': String(att.sizeBytes),
    });
    return new StreamableFile(stream);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    const att = await this.service.findById(id);
    const isOwner = att.uploadedById === user.id;
    const isPriv = user.role === 'ADMIN' || user.role === 'MANAGER';
    if (!isOwner && !isPriv) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres pieces jointes');
    }
    await this.service.remove(id);
    return { success: true };
  }
}
