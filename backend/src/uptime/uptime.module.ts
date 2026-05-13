import { Module } from '@nestjs/common';
import { UptimeService } from './uptime.service';
import { UptimeController } from './uptime.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  providers: [UptimeService],
  controllers: [UptimeController],
  exports: [UptimeService],
})
export class UptimeModule {}
