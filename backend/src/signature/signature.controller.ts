import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SignatureStatus } from '@prisma/client';
import { SignatureService } from './signature.service';
import { CreateSignatureDto } from './dto/create-signature.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Signature')
@Controller('signature')
export class SignatureController {
  constructor(private readonly service: SignatureService) {}

  // ---------- Webhook public (verifie via HMAC) ----------
  // /signature/webhook/docuseal ou /signature/webhook/yousign
  // Le rawBody est requis pour HMAC : configure dans main.ts via raw body parser
  // sur ce path uniquement (cf. signature.module.ts hint).
  @Public()
  @Post('webhook/:provider')
  async webhook(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Headers('x-docuseal-signature') docusealSig?: string,
    @Headers('x-yousign-signature-256') yousignSig?: string,
  ) {
    // express.raw() doit avoir mis le body brut dans req.body (Buffer).
    const raw = (req as any).rawBody ?? (req.body as Buffer);
    if (!raw || !Buffer.isBuffer(raw)) {
      return { ok: false, reason: 'missing_raw_body' };
    }
    const sigHeader =
      provider.toLowerCase() === 'yousign' ? yousignSig : docusealSig;
    return this.service.handleWebhook(provider, raw, sigHeader);
  }

  // ---------- Endpoints proteges ----------
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('entityType') entityType?: 'Quote' | 'Contract',
    @Query('entityId') entityId?: string,
    @Query('status') status?: SignatureStatus,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.findAll(user, { entityType, entityId, status, companyId });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post()
  create(@Body() dto: CreateSignatureDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.cancel(id, user);
  }
}
