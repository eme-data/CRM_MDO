import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhooksService, WEBHOOKS_QUEUE } from './webhooks.service';

@Processor(WEBHOOKS_QUEUE)
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(private readonly webhooks: WebhooksService) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { deliveryId, url, payload, secret } = job.data;
    return this.webhooks.processDelivery(deliveryId, url, payload, secret);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 5)) {
      // Toutes les retries epuisees — marque permanently failed
      await this.webhooks.markPermanentlyFailed(job.data.deliveryId, error.message);
      this.logger.warn('Webhook delivery ' + job.data.deliveryId + ' permanent fail : ' + error.message);
    }
  }
}
