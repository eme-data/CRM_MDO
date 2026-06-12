import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CashFlowService } from './cashflow.service';
import { QontoProvider } from './qonto.provider';
import { PennylaneProvider } from './pennylane.provider';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { PushInvoiceDto } from './dto/push-invoice.dto';
import { QontoSyncDto } from './dto/qonto-sync.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly cashflow: CashFlowService,
    private readonly qonto: QontoProvider,
    private readonly pennylane: PennylaneProvider,
  ) {}

  @Roles('ADMIN', 'MANAGER')
  @Get('status')
  status(@CurrentUser() user: JwtUser) {
    return this.billing.status(user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Get('cashflow')
  getCashflow(@CurrentUser() user: JwtUser) {
    return this.cashflow.overview(user);
  }

  @Roles('ADMIN')
  @Post('test/qonto')
  testQonto(@CurrentUser() user: JwtUser) {
    return this.qonto.ping(user.tenantId);
  }

  @Roles('ADMIN')
  @Post('test/pennylane')
  testPennylane(@CurrentUser() user: JwtUser) {
    return this.pennylane.ping(user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('companies/:id/push')
  pushCompany(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.billing.pushCompany(id, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('contracts/:id/push')
  pushContract(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.billing.pushContract(id, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('invoices/push')
  pushInvoice(@Body() body: PushInvoiceDto, @CurrentUser() user: JwtUser) {
    return this.billing.pushInvoiceNow(body, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('qonto/sync')
  qontoSync(@Body() body: QontoSyncDto, @CurrentUser() user: JwtUser) {
    return this.qonto.syncTransactions(user.tenantId, { sinceDays: body.sinceDays });
  }
}
