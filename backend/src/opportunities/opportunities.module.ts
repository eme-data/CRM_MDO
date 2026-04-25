import { Module } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesReminderService } from './opportunities-reminder.service';

@Module({
  providers: [OpportunitiesService, OpportunitiesReminderService],
  controllers: [OpportunitiesController],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
