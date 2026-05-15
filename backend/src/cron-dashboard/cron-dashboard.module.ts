import { Module } from '@nestjs/common';
import { CronDashboardService } from './cron-dashboard.service';
import { CronDashboardController } from './cron-dashboard.controller';

@Module({
  providers: [CronDashboardService],
  controllers: [CronDashboardController],
  exports: [CronDashboardService],
})
export class CronDashboardModule {}
