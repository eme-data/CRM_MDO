import { Module } from '@nestjs/common';
import { EmailSecurityService } from './email-security.service';
import { EmailSecurityController } from './email-security.controller';

@Module({
  providers: [EmailSecurityService],
  controllers: [EmailSecurityController],
  exports: [EmailSecurityService],
})
export class EmailSecurityModule {}
