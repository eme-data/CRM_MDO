import { Module } from '@nestjs/common';
import { MailInboundService } from './mail-inbound.service';
import { MailModule } from '../mail/mail.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [MailModule, AttachmentsModule],
  providers: [MailInboundService],
})
export class MailInboundModule {}
