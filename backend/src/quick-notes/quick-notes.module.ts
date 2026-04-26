import { Module } from '@nestjs/common';
import { QuickNotesService } from './quick-notes.service';
import { QuickNotesController } from './quick-notes.controller';

@Module({
  providers: [QuickNotesService],
  controllers: [QuickNotesController],
  exports: [QuickNotesService],
})
export class QuickNotesModule {}
