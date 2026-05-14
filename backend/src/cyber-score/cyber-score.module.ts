import { Module } from '@nestjs/common';
import { CyberScoreController } from './cyber-score.controller';
import { CyberScoreService } from './cyber-score.service';

// CacheService est fourni par CacheModule en @Global (cf common/cache/),
// donc pas besoin de l'importer ici explicitement. PrismaService idem
// (PrismaModule est importe globalement par AppModule).
@Module({
  controllers: [CyberScoreController],
  providers: [CyberScoreService],
  exports: [CyberScoreService],
})
export class CyberScoreModule {}
