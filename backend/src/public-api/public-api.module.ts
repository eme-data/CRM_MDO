import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { ApiKeyGuard } from './api-key.guard';
import { PublicApiController } from './public-api.controller';
import { ApiKeysAdminController } from './api-keys-admin.controller';

@Module({
  providers: [ApiKeyService, ApiKeyGuard],
  controllers: [PublicApiController, ApiKeysAdminController],
  exports: [ApiKeyService],
})
export class PublicApiModule {}
