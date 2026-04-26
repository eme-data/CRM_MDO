import { Module } from '@nestjs/common';
import { EmergencyPdfService } from './emergency-pdf.service';
import { EmergencyPdfController } from './emergency-pdf.controller';

@Module({
  providers: [EmergencyPdfService],
  controllers: [EmergencyPdfController],
})
export class EmergencyPdfModule {}
