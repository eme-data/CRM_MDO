import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { MailModule } from '../mail/mail.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [
    MailModule,
    AttachmentsModule,
    // memoryStorage : FileInterceptor remplit file.buffer (passe a saveBuffer).
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    }),
  ],
  providers: [ExpensesService],
  controllers: [ExpensesController],
  exports: [ExpensesService],
})
export class ExpensesModule {}
