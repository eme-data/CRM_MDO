import { Module } from '@nestjs/common';
import { ItemLinksService } from './item-links.service';
import { ItemLinksController } from './item-links.controller';

@Module({
  providers: [ItemLinksService],
  controllers: [ItemLinksController],
  exports: [ItemLinksService],
})
export class ItemLinksModule {}
