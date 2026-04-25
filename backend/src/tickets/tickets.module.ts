import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { SlaService } from './sla.service';
import { MailModule } from '../mail/mail.module';
import { AttachmentsModule } from '../attachments/attachments.module';

// NotificationsModule est @Global donc pas besoin de l'importer

@Module({
  imports: [MailModule, AttachmentsModule],
  providers: [TicketsService, SlaService],
  controllers: [TicketsController],
  exports: [TicketsService, SlaService],
})
export class TicketsModule {}
