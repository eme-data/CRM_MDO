import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { CashFlowService } from './cashflow.service';
import { SellsyProvider } from './sellsy.provider';
import { QontoProvider } from './qonto.provider';

@Module({
  imports: [SettingsModule],
  providers: [BillingService, CashFlowService, SellsyProvider, QontoProvider],
  controllers: [BillingController],
  exports: [BillingService, SellsyProvider, QontoProvider],
})
export class BillingModule {}
