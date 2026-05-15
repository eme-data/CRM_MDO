import { Module } from '@nestjs/common';
import { SubprocessorsService } from './subprocessors.service';
import { SubprocessorsController } from './subprocessors.controller';

@Module({
  providers: [SubprocessorsService],
  controllers: [SubprocessorsController],
  exports: [SubprocessorsService],
})
export class SubprocessorsModule {}
