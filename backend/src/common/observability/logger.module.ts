import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';

// Logger structure pino. JSON en prod (parsable par Loki/Datadog/CloudWatch),
// pretty en dev. Genre un request-id par requete pour le suivi cross-service.
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        // Pretty-print en dev pour la lisibilite, JSON en prod pour l'agregation.
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'HH:MM:ss' },
              },
        // Request-id : reutilise X-Request-Id si l'amont (Caddy) le pose, sinon en genere un.
        genReqId: (req: any) => req.headers['x-request-id'] ?? randomUUID(),
        // Censure les headers sensibles dans les logs (Authorization, Cookie, etc.)
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.body.password',
            'req.body.oldPassword',
            'req.body.newPassword',
            'req.body.totpCode',
            'req.body.refreshToken',
          ],
          censor: '[REDACTED]',
        },
        // Ne logge pas le health-check qui est appele en boucle par les LB / cron monitor.
        autoLogging: {
          ignore: (req: any) => req.url === '/health' || req.url === '/metrics',
        },
        customLogLevel: (req: any, res: any, err: Error | undefined) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class AppLoggerModule {}
