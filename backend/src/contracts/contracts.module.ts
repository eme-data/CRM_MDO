import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { ContractAlertsProcessor } from './jobs/contract-alerts.processor';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'contract-alerts' }),
    MailModule,
  ],
  providers: [ContractsService, ContractAlertsProcessor],
  controllers: [ContractsController],
  exports: [ContractsService],
})
export class ContractsModule {}
