import { Module } from '@nestjs/common';
import { ClientReportsService } from './client-reports.service';
import { ClientReportsController } from './client-reports.controller';
import { PdfModule } from '../pdf/pdf.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PdfModule, MailModule],
  providers: [ClientReportsService],
  controllers: [ClientReportsController],
  exports: [ClientReportsService],
})
export class ClientReportsModule {}
