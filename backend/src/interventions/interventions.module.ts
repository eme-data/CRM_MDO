import { Module } from '@nestjs/common';
import { InterventionsService } from './interventions.service';
import { InterventionsController } from './interventions.controller';

@Module({
  providers: [InterventionsService],
  controllers: [InterventionsController],
})
export class InterventionsModule {}
