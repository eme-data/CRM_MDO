import {
  Body, Controller, Delete, Get, Param, Patch, Post, Res, StreamableFile,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { EmployeeDocType } from '@prisma/client';
import { EmployeesService } from './employees.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Dossier collaborateur (SIRH)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  // Annuaire RH (managers)
  @Roles('ADMIN', 'MANAGER')
  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user);
  }

  // Ma fiche (declare AVANT :userId pour ne pas etre capture)
  @Get('me')
  getMe(@CurrentUser() user: JwtUser) {
    return this.service.getMe(user);
  }

  // ----- Documents (routes statiques AVANT :userId/...) -----
  @Get('documents/:docId/download')
  async download(@Param('docId') docId: string, @CurrentUser() user: JwtUser, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.downloadDocument(docId, user);
    res.set({
      'Content-Type': r.mimeType,
      'Content-Disposition': 'attachment; filename="' + r.filename.replace(/"/g, '') + '"',
      'Content-Length': String(r.sizeBytes),
    });
    return new StreamableFile(r.stream);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('documents/:docId')
  removeDoc(@Param('docId') docId: string, @CurrentUser() user: JwtUser) {
    return this.service.removeDocument(docId, user);
  }

  // ----- Fiche d'un collaborateur -----
  @Get(':userId')
  getProfile(@Param('userId') userId: string, @CurrentUser() user: JwtUser) {
    return this.service.getProfile(userId, user);
  }

  @Patch(':userId')
  update(@Param('userId') userId: string, @Body() dto: UpdateProfileDto, @CurrentUser() user: JwtUser) {
    return this.service.upsertProfile(userId, dto, user);
  }

  @Get(':userId/documents')
  listDocuments(@Param('userId') userId: string, @CurrentUser() user: JwtUser) {
    return this.service.listDocuments(userId, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post(':userId/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('userId') userId: string,
    @UploadedFile() file: any,
    @Body() body: { type?: EmployeeDocType; name?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.uploadDocument(userId, file, body, user);
  }
}
