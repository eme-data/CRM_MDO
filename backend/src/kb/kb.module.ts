import { Module } from '@nestjs/common';
import { KbService } from './kb.service';
import { KbController } from './kb.controller';

@Module({
  providers: [KbService],
  controllers: [KbController],
  exports: [KbService],
})
export class KbModule {}
