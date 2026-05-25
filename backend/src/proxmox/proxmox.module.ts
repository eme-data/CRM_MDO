import { Module } from '@nestjs/common';
import { ProxmoxService } from './proxmox.service';
import { ProxmoxController } from './proxmox.controller';

@Module({
  providers: [ProxmoxService],
  controllers: [ProxmoxController],
  exports: [ProxmoxService],
})
export class ProxmoxModule {}
