import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuickNotesService, UpsertQuickNoteDto } from './quick-notes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('QuickNotes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quick-notes')
export class QuickNotesController {
  constructor(private readonly service: QuickNotesService) {}

  @Get()
  list(@Query('companyId') companyId: string, @CurrentUser() user: JwtUser) {
    return this.service.listForCompany(companyId, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post()
  create(@Body() dto: UpsertQuickNoteDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertQuickNoteDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, dto, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
