import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { SellsyProvider } from './sellsy.provider';
import { QontoProvider } from './qonto.provider';

@Module({
  providers: [BillingService, SellsyProvider, QontoProvider],
  controllers: [BillingController],
  exports: [BillingService, SellsyProvider, QontoProvider],
})
export class BillingModule {}
