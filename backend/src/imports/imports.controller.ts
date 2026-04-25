import {
  Body, Controller, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ImportsService } from './imports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Imports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER')
@Controller('imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Post('companies')
  importCompanies(@Body() body: { csv: string }, @CurrentUser() user: JwtUser) {
    return this.service.importCompanies(body.csv, user.id);
  }

  @Post('contacts')
  importContacts(@Body() body: { csv: string }, @CurrentUser() user: JwtUser) {
    return this.service.importContacts(body.csv, user.id);
  }
}
