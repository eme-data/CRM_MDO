import { Module } from '@nestjs/common';
import { ModulesController } from './modules.controller';

@Module({
  controllers: [ModulesController],
})
export class ModulesModule {}
