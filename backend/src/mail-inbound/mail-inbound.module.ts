import { Module } from '@nestjs/common';
import { MailInboundService } from './mail-inbound.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  providers: [MailInboundService],
})
export class MailInboundModule {}
