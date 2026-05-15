import { Module } from '@nestjs/common';
import { AuditChainService } from './audit-chain.service';
import { AuditChainController } from './audit-chain.controller';

@Module({
  providers: [AuditChainService],
  controllers: [AuditChainController],
  exports: [AuditChainService],
})
export class AuditChainModule {}
