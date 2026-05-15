import { Module } from '@nestjs/common';
import { ClientReportsService } from './client-reports.service';
import { ClientReportsController } from './client-reports.controller';
import { PdfModule } from '../pdf/pdf.module';
import { MailModule } from '../mail/mail.module';
import { CyberScoreModule } from '../cyber-score/cyber-score.module';
import { HealthScoreModule } from '../health-score/health-score.module';

@Module({
  imports: [PdfModule, MailModule, CyberScoreModule, HealthScoreModule],
  providers: [ClientReportsService],
  controllers: [ClientReportsController],
  exports: [ClientReportsService],
})
export class ClientReportsModule {}
