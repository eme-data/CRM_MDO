import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { SellsyProvider } from './sellsy.provider';
import { QontoProvider } from './qonto.provider';
import { SettingsService } from '../settings/settings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly sellsy: SellsyProvider,
    private readonly qonto: QontoProvider,
    private readonly settings: SettingsService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('status')
  status() {
    return this.billing.status();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('test/sellsy')
  testSellsy() {
    return this.sellsy.ping();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('test/qonto')
  testQonto() {
    return this.qonto.ping();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('companies/:id/push')
  pushCompany(@Param('id') id: string) {
    return this.billing.pushCompany(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('contracts/:id/push')
  pushContract(@Param('id') id: string) {
    return this.billing.pushContract(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('invoices/push')
  pushInvoice(@Body() body: any) {
    return this.billing.pushInvoiceNow(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('qonto/sync')
  qontoSync(@Body() body: { sinceDays?: number }) {
    return this.qonto.syncTransactions({ sinceDays: body?.sinceDays });
  }

  // ---------- Webhook Sellsy (public, signature HMAC) ----------
  // Sellsy POST l'event en JSON. On verifie X-Sellsy-Signature.
  @Public()
  @HttpCode(200)
  @Post('webhooks/sellsy')
  async sellsyWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-sellsy-signature') signature: string,
    @Body() body: any,
  ) {
    const secret = await this.settings.get('billing.sellsy.webhookSecret');
    if (!secret) throw new HttpException('Webhook secret non configure', HttpStatus.SERVICE_UNAVAILABLE);

    // Body brut indispensable pour la signature HMAC. Active via
    // NestFactory.create(..., { rawBody: true }) dans main.ts
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body);
    const ok = this.billing.verifySellsySignature(raw, signature, secret);
    if (!ok) throw new HttpException('Signature invalide', HttpStatus.UNAUTHORIZED);

    return this.billing.handleSellsyEvent(body);
  }
}
