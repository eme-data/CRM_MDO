import { Module } from '@nestjs/common';
import { ResponseTemplatesService } from './response-templates.service';
import { ResponseTemplatesController } from './response-templates.controller';

@Module({
  providers: [ResponseTemplatesService],
  controllers: [ResponseTemplatesController],
  exports: [ResponseTemplatesService],
})
export class ResponseTemplatesModule {}
