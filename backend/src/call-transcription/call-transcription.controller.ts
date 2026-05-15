import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CallTranscriptionService } from './call-transcription.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Call transcription')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('call-transcription')
export class CallTranscriptionController {
  constructor(private readonly service: CallTranscriptionService) {}

  // Trigger manuel d'une transcription (et resume) pour un appel donne
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('calls/:id/transcribe')
  transcribe(@Param('id') id: string) {
    return this.service.transcribe(id);
  }
}
