import { Module } from '@nestjs/common';
import { CompanyLookupService } from './company-lookup.service';
import { CompanyLookupController } from './company-lookup.controller';
import { PappersProvider } from './pappers.provider';
import { SireneProvider } from './sirene.provider';

@Module({
  providers: [CompanyLookupService, PappersProvider, SireneProvider],
  controllers: [CompanyLookupController],
  exports: [CompanyLookupService],
})
export class CompanyLookupModule {}
