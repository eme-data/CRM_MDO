import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [NotificationsModule, MailModule, SettingsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
