import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [
    AttachmentsModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    }),
  ],
  providers: [EmployeesService],
  controllers: [EmployeesController],
  exports: [EmployeesService],
})
export class EmployeesModule {}
