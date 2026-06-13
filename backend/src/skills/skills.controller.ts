import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkillsService } from './skills.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Skills matrix')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('skills')
export class SkillsController {
  constructor(private readonly service: SkillsService) {}

  // ----- Catalogue Skills -----
  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.service.listSkills(includeInactive === 'true');
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() body: any) {
    return this.service.createSkill(body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.updateSkill(id, body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.removeSkill(id);
  }

  // ----- UserSkills -----
  @Get('matrix')
  matrix(@CurrentUser() user: JwtUser) {
    return this.service.matrix(user.tenantId);
  }

  @Get('expiring-soon')
  expiringSoon(@CurrentUser() user: JwtUser, @Query('days') days?: string) {
    return this.service.expiringSoon(user.tenantId, days ? parseInt(days, 10) : 90);
  }

  @Get('users/:userId')
  forUser(@Param('userId') userId: string, @CurrentUser() user: JwtUser) {
    return this.service.listForUser(userId, user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('user-skills')
  upsert(@Body() body: any) {
    return this.service.upsertUserSkill(body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('user-skills/:id')
  removeUser(@Param('id') id: string) {
    return this.service.removeUserSkill(id);
  }
}
