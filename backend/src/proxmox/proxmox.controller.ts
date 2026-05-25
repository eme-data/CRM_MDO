import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProxmoxService } from './proxmox.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import {
  CreateProxmoxClusterDto,
  IngestSnapshotDto,
  UpdateProxmoxClusterDto,
} from './dto/proxmox.dto';

@ApiTags('Proxmox monitoring')
@Controller('proxmox')
export class ProxmoxController {
  constructor(private readonly service: ProxmoxService) {}

  // ============================================================
  // Webhook public — auth par X-Proxmox-Token (secret en clair compare au hash)
  // ============================================================
  // POST /proxmox/ingest/:clusterId
  @Public()
  @Post('ingest/:clusterId')
  ingest(
    @Param('clusterId') clusterId: string,
    @Headers('x-proxmox-token') token: string | undefined,
    @Body() body: IngestSnapshotDto,
  ) {
    if (!token) return { ok: false, reason: 'X-Proxmox-Token header missing' };
    return this.service.ingestViaSecret(clusterId, token, body);
  }

  // ============================================================
  // CRUD super-admin / tenant admin
  // ============================================================
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('clusters')
  list(@CurrentUser() user: JwtUser, @Query('companyId') companyId?: string) {
    return this.service.list(user, { companyId });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('stats')
  stats(@CurrentUser() user: JwtUser) {
    return this.service.stats(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('clusters/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('clusters/:id/snapshot')
  latestSnapshot(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.latestSnapshot(id, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('clusters/:id/timeseries')
  timeseries(
    @Param('id') id: string,
    @Query('window') window: '24h' | '7d' | '30d' = '24h',
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.timeseries(id, window, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('clusters')
  create(@Body() body: CreateProxmoxClusterDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch('clusters/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateProxmoxClusterDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('clusters/:id/rotate-secret')
  rotateSecret(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.rotateSecret(id, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete('clusters/:id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
