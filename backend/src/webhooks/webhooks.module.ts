import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksService, WEBHOOKS_QUEUE } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksProcessor } from './webhooks.processor';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: WEBHOOKS_QUEUE })],
  providers: [WebhooksService, WebhooksProcessor],
  controllers: [WebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule {}
