import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushModule } from '../push/push.module';

@Global()
@Module({
  // PushModule importe pour pouvoir injecter PushService de facon optionnelle.
  // Si PushModule etait absent (degraded mode), @Optional() permet a
  // NotificationsService de continuer sans push.
  imports: [PushModule],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
