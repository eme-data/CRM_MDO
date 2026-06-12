import { Module } from '@nestjs/common';
import { DemoSeederService } from './demo-seeder.service';
import { DemoController } from './demo.controller';

@Module({
  providers: [DemoSeederService],
  controllers: [DemoController],
})
export class DemoModule {}
