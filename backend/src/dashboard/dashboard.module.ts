import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { ContractsModule } from '../contracts/contracts.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [ContractsModule, TicketsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
