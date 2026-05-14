import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import { initSentry } from './common/observability/sentry';

// Sentry doit etre initialise AVANT toute charge applicative pour capturer les
// erreurs de bootstrap (ConfigModule, Prisma connect, etc.).
initSentry();

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // rawBody: true expose req.rawBody pour la verification de signature HMAC
  // des webhooks externes (PDP facturation, etc.). Conserve meme sans
  // webhook actif pour eviter un redeploiement le jour ou on en branche un.
  // bufferLogs: true permet a nestjs-pino (s'il est configure) de prendre la main
  // sur les logs de bootstrap.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    rawBody: true,
    bufferLogs: true,
  });
  // nestjs-pino prend la main sur les logs (JSON en prod, pretty en dev,
  // request-id propage). Si le module n'est pas resoluble (tests minimal),
  // on retombe sur le Logger Nest par defaut.
  try {
    app.useLogger(app.get(PinoLogger));
  } catch {
    // ignore : logger Nest par defaut
  }
  const logger = new Logger('Bootstrap');

  // Indispensable derriere Caddy/Traefik : sans `trust proxy`, req.ip vaut l'IP
  // du reverse-proxy → le rate-limiting devient inoperant (toutes les requetes
  // sont vues comme provenant de la meme IP).
  app.set('trust proxy', 1);

  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()) ?? [
    'http://localhost:3000',
  ];
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // CSP renforcee : on n'autorise que self pour scripts/styles.
  // 'unsafe-inline' style reste necessaire pour Tailwind compile + Next.js inline styles.
  // Le frontend Next.js n'est PAS servi par ce backend → la CSP ici ne protege
  // que les eventuelles pages d'erreur / Swagger.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'upgrade-insecure-requests': [],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
    }),
  );
  app.setGlobalPrefix('api', { exclude: ['health', 'metrics'] });
  // Versioning d'URI : tous les controleurs sont accessibles sous /api/v1/...
  // Les anciennes URLs /api/... restent fonctionnelles via VERSION_NEUTRAL.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: ['1', VERSION_NEUTRAL],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('CRM MDO Services API')
      .setDescription('API REST du CRM interne MDO Services')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = parseInt(process.env.PORT ?? '4000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`Backend demarre sur http://0.0.0.0:${port}`);
}

bootstrap();
