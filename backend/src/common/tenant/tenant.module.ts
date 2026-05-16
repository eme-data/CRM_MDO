import { Global, Module } from '@nestjs/common';
import { TenantScope } from './tenant-scope.helper';

// Module global : expose TenantScope partout sans import explicite. Comme
// PrismaService est deja exporte globalement, on suit la meme convention.
@Global()
@Module({
  providers: [TenantScope],
  exports: [TenantScope],
})
export class TenantScopeModule {}
