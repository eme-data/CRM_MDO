import { Module } from '@nestjs/common';
import { MailInboundService } from './mail-inbound.service';
import { MailModule } from '../mail/mail.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { TicketsModule } from '../tickets/tickets.module';

// NotificationsModule est @Global

@Module({
  imports: [MailModule, AttachmentsModule, TicketsModule],
  providers: [MailInboundService],
})
export class MailInboundModule {}
