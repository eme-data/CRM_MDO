import { Module } from '@nestjs/common';
import { ClientDocsService } from './client-docs.service';
import { SecretsService } from './secrets.service';
import { ClientDocsController } from './client-docs.controller';

@Module({
  providers: [ClientDocsService, SecretsService],
  controllers: [ClientDocsController],
  exports: [SecretsService],
})
export class ClientDocsModule {}
