import { Module } from '@nestjs/common';
import { PortalAuthService } from './portal-auth.service';
import { PortalDataService } from './portal-data.service';
import { PortalAuthGuard } from './guards/portal-auth.guard';
import { PortalController } from './portal.controller';
import { MailModule } from '../mail/mail.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [MailModule, TicketsModule],
  providers: [PortalAuthService, PortalDataService, PortalAuthGuard],
  controllers: [PortalController],
  exports: [PortalAuthService],
})
export class ClientPortalModule {}
