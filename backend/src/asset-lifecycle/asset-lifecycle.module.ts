import { Module } from '@nestjs/common';
import { AssetLifecycleService } from './asset-lifecycle.service';
import { AssetLifecycleController } from './asset-lifecycle.controller';

@Module({
  providers: [AssetLifecycleService],
  controllers: [AssetLifecycleController],
  exports: [AssetLifecycleService],
})
export class AssetLifecycleModule {}
