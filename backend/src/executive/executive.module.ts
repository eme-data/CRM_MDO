import { Module } from '@nestjs/common';
import { ExecutiveService } from './executive.service';
import { ExecutiveController } from './executive.controller';

@Module({
  providers: [ExecutiveService],
  controllers: [ExecutiveController],
  exports: [ExecutiveService],
})
export class ExecutiveModule {}
