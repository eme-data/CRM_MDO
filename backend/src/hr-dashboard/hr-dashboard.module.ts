import { Module } from '@nestjs/common';
import { HrDashboardService } from './hr-dashboard.service';
import { HrDashboardController } from './hr-dashboard.controller';

@Module({
  providers: [HrDashboardService],
  controllers: [HrDashboardController],
})
export class HrDashboardModule {}
