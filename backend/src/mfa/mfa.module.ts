import { Global, Module } from '@nestjs/common';
import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';
import { ClientDocsModule } from '../client-docs/client-docs.module';

@Global()
@Module({
  imports: [ClientDocsModule],
  providers: [MfaService],
  controllers: [MfaController],
  exports: [MfaService],
})
export class MfaModule {}
