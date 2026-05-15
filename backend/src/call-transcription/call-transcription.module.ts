import { Module } from '@nestjs/common';
import { CallTranscriptionService } from './call-transcription.service';
import { CallTranscriptionController } from './call-transcription.controller';
import { SettingsModule } from '../settings/settings.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [SettingsModule, AiModule],
  providers: [CallTranscriptionService],
  controllers: [CallTranscriptionController],
  exports: [CallTranscriptionService],
})
export class CallTranscriptionModule {}
