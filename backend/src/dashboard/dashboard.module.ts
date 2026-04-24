import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { ContractsModule } from '../contracts/contracts.module';

@Module({
  imports: [ContractsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
