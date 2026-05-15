import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from './guards/super-admin.guard';

// Endpoints reserves au super-admin (Mathieu). Permettent de creer/lister/
// editer/desactiver les tenants depuis l'UI super-admin.

@ApiTags('Tenants (super-admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: {
    slug: string;
    customDomain: string;
    brandName: string;
    brandShortName: string;
    brandTagline?: string;
    brandLogoUrl?: string;
    brandPrimaryColor?: string;
    brandSupportEmail?: string;
    brandDpoEmail?: string;
    brandWebsiteUrl?: string;
    brandFooterText?: string;
  }) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
