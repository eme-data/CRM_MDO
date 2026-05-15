import { Module } from '@nestjs/common';
import { DripService } from './drip.service';
import { DripController } from './drip.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  providers: [DripService],
  controllers: [DripController],
  exports: [DripService],
})
export class DripModule {}
