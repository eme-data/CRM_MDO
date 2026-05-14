import { BadRequestException, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { isAttachmentTypeAllowed, describeAllowed } from './mime-allowlist';

@Module({
  imports: [
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: memoryStorage(),
        limits: {
          fileSize:
            parseInt(config.get<string>('uploads.maxMb') ?? '25', 10) * 1024 * 1024,
          // Le service refuse aussi >10 fichiers par requete via FilesInterceptor('files', 10),
          // mais on borne ici aussi pour eviter qu'un upload exotique sature la memoire avant
          // le interceptor.
          files: 10,
        },
        fileFilter: (_req, file, cb) => {
          if (!isAttachmentTypeAllowed(file.mimetype, file.originalname)) {
            cb(
              new BadRequestException(
                'Type de fichier refuse. Formats autorises : ' + describeAllowed(),
              ),
              false,
            );
            return;
          }
          cb(null, true);
        },
      }),
    }),
  ],
  providers: [AttachmentsService],
  controllers: [AttachmentsController],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
