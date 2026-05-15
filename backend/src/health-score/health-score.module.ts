import { Module } from '@nestjs/common';
import { HealthScoreService } from './health-score.service';
import { HealthScoreController } from './health-score.controller';
import { CyberScoreModule } from '../cyber-score/cyber-score.module';

@Module({
  imports: [CyberScoreModule],
  providers: [HealthScoreService],
  controllers: [HealthScoreController],
  exports: [HealthScoreService],
})
export class HealthScoreModule {}
