import { Module } from '@nestjs/common';
import { RunbooksService } from './runbooks.service';
import { RunbooksController } from './runbooks.controller';

@Module({
  providers: [RunbooksService],
  controllers: [RunbooksController],
  exports: [RunbooksService],
})
export class RunbooksModule {}
