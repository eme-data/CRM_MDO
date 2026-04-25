import { Module } from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service';
import { TimeEntriesController } from './time-entries.controller';

@Module({
  providers: [TimeEntriesService],
  controllers: [TimeEntriesController],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
