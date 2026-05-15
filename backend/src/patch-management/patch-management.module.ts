import { Module } from '@nestjs/common';
import { PatchManagementService } from './patch-management.service';
import { PatchManagementController } from './patch-management.controller';
import { SettingsModule } from '../settings/settings.module';
import { M365Module } from '../m365/m365.module';

@Module({
  imports: [SettingsModule, M365Module],
  providers: [PatchManagementService],
  controllers: [PatchManagementController],
  exports: [PatchManagementService],
})
export class PatchManagementModule {}
