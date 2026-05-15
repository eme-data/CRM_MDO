import { Module } from '@nestjs/common';
import { SystemHealthService } from './system-health.service';
import { SystemHealthController } from './system-health.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [SystemHealthService],
  controllers: [SystemHealthController],
  exports: [SystemHealthService],
})
export class SystemHealthModule {}
