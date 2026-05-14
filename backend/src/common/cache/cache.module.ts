import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

// @Global() : CacheService devient injectable dans tout module sans avoir a
// re-importer CacheModule. Ce qui maintient app.module.ts comme unique point
// d'import (un seul singleton dans toute l'app, garantissant la coherence
// du cache).
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
