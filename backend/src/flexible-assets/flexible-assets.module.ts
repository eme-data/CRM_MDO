import { Module } from '@nestjs/common';
import { FlexibleAssetTypesService } from './flexible-asset-types.service';
import { FlexibleAssetsService } from './flexible-assets.service';
import { FlexibleAssetsController } from './flexible-assets.controller';
import { ClientDocsModule } from '../client-docs/client-docs.module';

@Module({
  imports: [ClientDocsModule],
  providers: [FlexibleAssetTypesService, FlexibleAssetsService],
  controllers: [FlexibleAssetsController],
  exports: [FlexibleAssetsService],
})
export class FlexibleAssetsModule {}
