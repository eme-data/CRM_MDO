import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { PurchasingService } from './purchasing.service';
import { StockController } from './stock.controller';
import { PurchasingController } from './purchasing.controller';

@Module({
  providers: [StockService, PurchasingService],
  controllers: [StockController, PurchasingController],
  exports: [StockService],
})
export class StockModule {}
