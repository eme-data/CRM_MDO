import { Module } from '@nestjs/common';
import { QuoteTemplatesService } from './quote-templates.service';
import { QuoteTemplatesController } from './quote-templates.controller';

@Module({
  providers: [QuoteTemplatesService],
  controllers: [QuoteTemplatesController],
  exports: [QuoteTemplatesService],
})
export class QuoteTemplatesModule {}
