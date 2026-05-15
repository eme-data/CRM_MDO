import { Module } from '@nestjs/common';
import { SocService } from './soc.service';
import { SocController } from './soc.controller';

@Module({
  providers: [SocService],
  controllers: [SocController],
  exports: [SocService],
})
export class SocModule {}
