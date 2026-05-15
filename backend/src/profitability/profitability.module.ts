import { Module } from '@nestjs/common';
import { ProfitabilityService } from './profitability.service';
import { ProfitabilityController } from './profitability.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [ProfitabilityService],
  controllers: [ProfitabilityController],
  exports: [ProfitabilityService],
})
export class ProfitabilityModule {}
