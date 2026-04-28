import { Module } from '@nestjs/common';
import { InterventionsService } from './interventions.service';
import { InterventionsController } from './interventions.controller';
import { IcalService } from './ical.service';
import { CalendarController } from './calendar.controller';

@Module({
  providers: [InterventionsService, IcalService],
  controllers: [InterventionsController, CalendarController],
})
export class InterventionsModule {}
