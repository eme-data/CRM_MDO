import { Module } from '@nestjs/common';
import { CustomerSuccessService } from './customer-success.service';
import { CustomerSuccessController } from './customer-success.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [CustomerSuccessService],
  controllers: [CustomerSuccessController],
  exports: [CustomerSuccessService],
})
export class CustomerSuccessModule {}
