import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { TicketTriageService } from './use-cases/ticket-triage.service';
import { TicketDraftService } from './use-cases/ticket-draft.service';
import { TicketSummaryService } from './use-cases/ticket-summary.service';
import { ClientSummaryService } from './use-cases/client-summary.service';
import { DocumentExtractService } from './use-cases/document-extract.service';
import { QuoteAssistService } from './use-cases/quote-assist.service';
import { ClientQbrService } from './use-cases/client-qbr.service';
import { AssistantService } from './use-cases/assistant.service';
import { SettingsModule } from '../settings/settings.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [SettingsModule, DocumentsModule],
  providers: [
    AiService,
    TicketTriageService,
    TicketDraftService,
    TicketSummaryService,
    ClientSummaryService,
    DocumentExtractService,
    QuoteAssistService,
    ClientQbrService,
    AssistantService,
  ],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
