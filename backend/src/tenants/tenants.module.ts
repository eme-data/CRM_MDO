import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { TenantResolverMiddleware } from './middleware/tenant-resolver.middleware';

// @Global() : TenantsService et SuperAdminGuard sont injectables partout
// sans avoir a re-importer TenantsModule.
@Global()
@Module({
  providers: [TenantsService, SuperAdminGuard, TenantResolverMiddleware],
  controllers: [TenantsController],
  exports: [TenantsService, SuperAdminGuard],
})
export class TenantsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Resolution tenant globale : sur TOUTES les routes (y compris /health,
    // /api/branding, /api/auth/*). Le middleware n'echoue jamais ; il attache
    // juste req.tenant si trouve. Ce sont les guards/services qui decident
    // si un tenant est requis pour leur endpoint.
    consumer.apply(TenantResolverMiddleware).forRoutes('*');
  }
}
