import { Global, Module } from '@nestjs/common';
import { NpsService } from './nps.service';
import { NpsController } from './nps.controller';
import { MailModule } from '../mail/mail.module';

// Global pour pouvoir etre injecte dans TicketsService (auto-trigger sur RESOLVED)
// sans creer de dependance circulaire entre les modules.
@Global()
@Module({
  imports: [MailModule],
  providers: [NpsService],
  controllers: [NpsController],
  exports: [NpsService],
})
export class NpsModule {}
