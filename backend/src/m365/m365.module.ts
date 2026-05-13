import { Module } from '@nestjs/common';
import { M365Service } from './m365.service';
import { M365GraphClient } from './m365-graph.client';
import { M365Controller } from './m365.controller';

@Module({
  providers: [M365Service, M365GraphClient],
  controllers: [M365Controller],
  exports: [M365Service],
})
export class M365Module {}
