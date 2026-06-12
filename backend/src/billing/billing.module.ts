import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { CashFlowService } from './cashflow.service';
import { QontoProvider } from './qonto.provider';
import { PennylaneProvider } from './pennylane.provider';

@Module({
  imports: [SettingsModule],
  providers: [BillingService, CashFlowService, QontoProvider, PennylaneProvider],
  controllers: [BillingController],
  exports: [BillingService, QontoProvider],
})
export class BillingModule {}
