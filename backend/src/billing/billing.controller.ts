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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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
  ) {}

  @Roles('ADMIN', 'MANAGER')
  @Get('status')
  status() {
    return this.billing.status();
  }

  @Roles('ADMIN', 'MANAGER')
  @Get('cashflow')
  getCashflow() {
    return this.cashflow.overview();
  }

  @Roles('ADMIN')
  @Post('test/qonto')
  testQonto() {
    return this.qonto.ping();
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('companies/:id/push')
  pushCompany(@Param('id') id: string) {
    return this.billing.pushCompany(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('contracts/:id/push')
  pushContract(@Param('id') id: string) {
    return this.billing.pushContract(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('invoices/push')
  pushInvoice(@Body() body: PushInvoiceDto) {
    return this.billing.pushInvoiceNow(body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('qonto/sync')
  qontoSync(@Body() body: QontoSyncDto) {
    return this.qonto.syncTransactions({ sinceDays: body.sinceDays });
  }
}
