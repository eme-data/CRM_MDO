import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FlexibleAssetTypesService, UpsertTypeDto } from './flexible-asset-types.service';
import { FlexibleAssetsService, UpsertFlexibleAssetDto } from './flexible-assets.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('FlexibleAssets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FlexibleAssetsController {
  constructor(
    private readonly types: FlexibleAssetTypesService,
    private readonly assets: FlexibleAssetsService,
  ) {}

  // ---- Types (templates) - admin only ----

  @Get('flexible-asset-types')
  listTypes() { return this.types.list(); }

  @Get('flexible-asset-types/:id')
  oneType(@Param('id') id: string) { return this.types.findOne(id); }

  @Roles('ADMIN', 'MANAGER')
  @Post('flexible-asset-types')
  createType(@Body() dto: UpsertTypeDto) { return this.types.create(dto); }

  @Roles('ADMIN', 'MANAGER')
  @Patch('flexible-asset-types/:id')
  updateType(@Param('id') id: string, @Body() dto: UpsertTypeDto) {
    return this.types.update(id, dto);
  }

  @Roles('ADMIN')
  @Delete('flexible-asset-types/:id')
  removeType(@Param('id') id: string) { return this.types.remove(id); }

  // ---- Assets (instances) ----

  @Get('flexible-assets')
  list(@Query('companyId') companyId: string) {
    return this.assets.listForCompany(companyId);
  }

  @Get('flexible-assets/:id')
  one(@Param('id') id: string) {
    return this.assets.findOne(id);
  }

  @Get('flexible-assets/:id/reveal')
  reveal(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.assets.findOne(id, { reveal: true, userId: user.id });
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('flexible-assets')
  create(@Body() dto: UpsertFlexibleAssetDto) { return this.assets.create(dto); }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch('flexible-assets/:id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertFlexibleAssetDto>) {
    return this.assets.update(id, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('flexible-assets/:id')
  remove(@Param('id') id: string) { return this.assets.remove(id); }
}
