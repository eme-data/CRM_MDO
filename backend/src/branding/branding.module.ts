import { Global, Module } from '@nestjs/common';
import { BrandingService } from './branding.service';
import { BrandingController } from './branding.controller';

// @Global() : BrandingService est injectable dans tout module (mail templates,
// pdf footers, leads forms...) sans avoir a re-importer BrandingModule.
@Global()
@Module({
  providers: [BrandingService],
  controllers: [BrandingController],
  exports: [BrandingService],
})
export class BrandingModule {}
