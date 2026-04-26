import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RunbooksService, UpdateRunDto, UpsertRunbookDto } from './runbooks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Runbooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class RunbooksController {
  constructor(private readonly service: RunbooksService) {}

  // ----- Catalogue -----

  @Get('runbooks')
  list() { return this.service.list(); }

  @Get('runbooks/suggestions')
  suggestions() { return this.service.suggestions(); }

  @Get('runbooks/:id')
  one(@Param('id') id: string) { return this.service.findOne(id); }

  @Roles('ADMIN', 'MANAGER')
  @Post('runbooks')
  create(@Body() dto: UpsertRunbookDto) { return this.service.create(dto); }

  @Roles('ADMIN', 'MANAGER')
  @Patch('runbooks/:id')
  update(@Param('id') id: string, @Body() dto: UpsertRunbookDto) {
    return this.service.update(id, dto);
  }

  @Roles('ADMIN')
  @Delete('runbooks/:id')
  remove(@Param('id') id: string) { return this.service.remove(id); }

  // ----- Runs -----

  @Get('runbook-runs')
  listRuns(@Query('companyId') companyId?: string, @Query('runbookId') runbookId?: string) {
    return this.service.listRuns({ companyId, runbookId });
  }

  @Get('runbook-runs/:id')
  oneRun(@Param('id') id: string) { return this.service.findRun(id); }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('runbook-runs')
  start(@Body() body: { runbookId: string; companyId: string }, @CurrentUser() user: JwtUser) {
    return this.service.start(body.runbookId, body.companyId, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch('runbook-runs/:id')
  updateRun(@Param('id') id: string, @Body() dto: UpdateRunDto) {
    return this.service.updateRun(id, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('runbook-runs/:id')
  removeRun(@Param('id') id: string) { return this.service.removeRun(id); }
}
