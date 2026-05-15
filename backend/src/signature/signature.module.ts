import { Module } from '@nestjs/common';
import { SignatureService } from './signature.service';
import { SignatureController } from './signature.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [SignatureService],
  controllers: [SignatureController],
  exports: [SignatureService],
})
export class SignatureModule {}
