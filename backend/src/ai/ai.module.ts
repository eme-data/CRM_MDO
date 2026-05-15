import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { TicketTriageService } from './use-cases/ticket-triage.service';
import { TicketDraftService } from './use-cases/ticket-draft.service';
import { ClientSummaryService } from './use-cases/client-summary.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [AiService, TicketTriageService, TicketDraftService, ClientSummaryService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
