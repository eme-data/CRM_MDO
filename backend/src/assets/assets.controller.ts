import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssetStatus, AssetType, Role } from '@prisma/client';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

// Lecture ouverte a tous les utilisateurs authentifies (visibilite de l'inventaire
// chez les clients). Ecritures reservees ADMIN/MANAGER : un asset cree/modifie
// declenche la surveillance certificat/domaine et impacte les alertes.
@ApiTags('Assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('companyId') companyId?: string,
    @Query('type') type?: AssetType,
    @Query('status') status?: AssetStatus,
    @Query('expiringInDays') expiringInDays?: string,
    @Query('identifier') identifier?: string,
  ) {
    return this.service.findAll(user, {
      companyId, type, status, identifier,
      expiringInDays: expiringInDays ? parseInt(expiringInDays, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post()
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, dto, user);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
