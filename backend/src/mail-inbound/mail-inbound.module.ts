import { Module } from '@nestjs/common';
import { MailInboundService } from './mail-inbound.service';

@Module({
  providers: [MailInboundService],
})
export class MailInboundModule {}
