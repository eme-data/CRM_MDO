import { Module } from '@nestjs/common';
import { SystemBackupService } from './system-backup.service';
import { SystemBackupController } from './system-backup.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [SystemBackupService],
  controllers: [SystemBackupController],
  exports: [SystemBackupService],
})
export class SystemBackupModule {}
