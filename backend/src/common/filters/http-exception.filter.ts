import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { captureException } from '../observability/sentry';

const IS_PROD = process.env.NODE_ENV === 'production';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code: string | undefined;
    let internalDetail: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        code = body.error as string | undefined;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        const target = (exception.meta?.target as string[] | undefined)?.join(', ');
        message = target ? `Valeur déjà utilisée : ${target}` : 'Conflit unique';
        code = 'UNIQUE_CONSTRAINT';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Ressource introuvable';
        code = 'NOT_FOUND';
      } else {
        // Codes Prisma inattendus : on log le detail mais on ne le revele pas
        // au client (ex. P2003 foreign key violation peut laisser fuir des noms
        // de tables internes).
        status = HttpStatus.BAD_REQUEST;
        message = 'Requête invalide';
        code = exception.code;
        internalDetail = exception.message;
      }
    } else if (exception instanceof Error) {
      internalDetail = exception.message;
      if (!IS_PROD) {
        // Dev/test : on garde le message brut pour faciliter le debug
        message = exception.message;
      }
    }

    // Correlation ID pour relier la reponse client au log/Sentry. On reutilise
    // l'id de requete propage par pino-http si dispo, sinon on en genere un.
    const correlationId =
      (request.headers['x-request-id'] as string | undefined) ??
      ((request as any).id as string | undefined) ??
      randomBytes(8).toString('hex');

    // Sentry + log : on capture toutes les 5xx (vraies erreurs serveur). Les
    // 4xx restent silencieuses cote alerting pour eviter le bruit (validation,
    // auth, not found, conflit ... = erreurs utilisateur attendues).
    if (status >= 500) {
      this.logger.error(
        {
          correlationId,
          path: request.url,
          method: request.method,
          statusCode: status,
          userAgent: request.headers['user-agent'],
          ip: request.ip,
          err: exception instanceof Error
            ? { name: exception.name, message: exception.message, stack: exception.stack }
            : { value: String(exception) },
        },
        'Unhandled exception caught by global filter',
      );
      captureException(exception, {
        correlationId,
        path: request.url,
        method: request.method,
        statusCode: status,
      });
    }

    const payload: Record<string, unknown> = {
      statusCode: status,
      code,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    // Dev/test uniquement : on expose le detail interne pour faciliter le debug.
    // En prod, le detail va dans les logs/Sentry (via correlationId) — JAMAIS au client.
    if (!IS_PROD && internalDetail && status >= 500) {
      payload.detail = internalDetail;
    }

    // Header utile pour les outils support (curl, navigateur) : on retrouve la
    // requete dans les logs en cherchant ce correlationId.
    response.setHeader('X-Correlation-Id', correlationId);
    response.status(status).json(payload);
  }
}
