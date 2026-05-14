import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Mock du module Sentry AVANT l'import du filter : sinon le require() reel
// est evalue (silent no-op si SENTRY_DSN absent, mais c'est un leak).
jest.mock('../observability/sentry', () => ({
  captureException: jest.fn(),
}));

import { HttpExceptionFilter } from './http-exception.filter';
import { captureException } from '../observability/sentry';

// Helper : produit un ArgumentsHost faux qui expose req/res controllables.
// Le filter n'utilise que switchToHttp + getResponse/getRequest, donc on mocke
// strictement ces deux methodes.
function mockHost(req: any, res: any): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
    }),
  } as any;
}

function mockResponse() {
  const res: any = {};
  res.headers = {};
  res.statusCode = 200;
  res.setHeader = jest.fn((k: string, v: string) => {
    res.headers[k] = v;
    return res;
  });
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload: any) => {
    res.body = payload;
    return res;
  });
  return res;
}

function mockRequest(overrides: Partial<{ url: string; method: string; headers: any; ip: string; id: string }> = {}) {
  return {
    url: '/api/x',
    method: 'GET',
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  const ORIGINAL_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    (captureException as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  describe('HttpException pass-through', () => {
    it('returns NotFoundException message as-is (404, 4xx not captured to Sentry)', () => {
      const res = mockResponse();
      const req = mockRequest();
      filter.catch(new NotFoundException('Contrat introuvable'), mockHost(req, res));
      expect(res.statusCode).toBe(404);
      expect(res.body.statusCode).toBe(404);
      expect(res.body.message).toBe('Contrat introuvable');
      expect(captureException).not.toHaveBeenCalled();
    });

    it('preserves ValidationPipe array of messages from BadRequestException', () => {
      const res = mockResponse();
      const req = mockRequest();
      const err = new BadRequestException(['email must be an email', 'name should not be empty']);
      filter.catch(err, mockHost(req, res));
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toEqual(['email must be an email', 'name should not be empty']);
      expect(captureException).not.toHaveBeenCalled();
    });
  });

  describe('Prisma error mapping', () => {
    it('maps P2002 (unique constraint) to 409 Conflict with target', () => {
      const res = mockResponse();
      const req = mockRequest();
      const err = new Prisma.PrismaClientKnownRequestError('unique violation', {
        code: 'P2002',
        clientVersion: '5.x',
        meta: { target: ['email'] },
      });
      filter.catch(err, mockHost(req, res));
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('UNIQUE_CONSTRAINT');
      expect(res.body.message).toContain('email');
    });

    it('maps P2025 (record not found) to 404', () => {
      const res = mockResponse();
      const req = mockRequest();
      const err = new Prisma.PrismaClientKnownRequestError('record not found', {
        code: 'P2025',
        clientVersion: '5.x',
      });
      filter.catch(err, mockHost(req, res));
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('masks unexpected Prisma codes behind a generic 400 (no internal leak)', () => {
      const res = mockResponse();
      const req = mockRequest();
      const err = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: `_internal_table_xyz`',
        { code: 'P2003', clientVersion: '5.x' },
      );
      filter.catch(err, mockHost(req, res));
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('P2003');
      // Le message DOIT etre generique : on ne veut pas exposer "_internal_table_xyz".
      expect(res.body.message).toBe('Requête invalide');
      expect(JSON.stringify(res.body)).not.toContain('_internal_table_xyz');
    });
  });

  describe('5xx sanitization in production', () => {
    it('redacts internal Error message to "Internal server error" in prod', () => {
      process.env.NODE_ENV = 'production';
      const res = mockResponse();
      const req = mockRequest();
      filter.catch(new Error('Connection to database lost on host db-internal-01'), mockHost(req, res));
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Internal server error');
      expect(JSON.stringify(res.body)).not.toContain('db-internal-01');
      // detail field absent en prod
      expect(res.body.detail).toBeUndefined();
    });

    it('exposes Error detail in development for debugging', () => {
      process.env.NODE_ENV = 'development';
      const res = mockResponse();
      const req = mockRequest();
      filter.catch(new Error('boom-dev'), mockHost(req, res));
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('boom-dev');
      expect(res.body.detail).toBe('boom-dev');
    });

    it('captures 5xx to Sentry with correlationId context', () => {
      const res = mockResponse();
      const req = mockRequest({ url: '/api/contracts/42' });
      filter.catch(new Error('boom'), mockHost(req, res));
      expect(captureException).toHaveBeenCalledTimes(1);
      const [, ctx] = (captureException as jest.Mock).mock.calls[0];
      expect(ctx.path).toBe('/api/contracts/42');
      expect(ctx.method).toBe('GET');
      expect(ctx.statusCode).toBe(500);
      expect(typeof ctx.correlationId).toBe('string');
      expect(ctx.correlationId.length).toBeGreaterThan(0);
    });
  });

  describe('CorrelationId', () => {
    it('generates a correlationId when no x-request-id header is present', () => {
      const res = mockResponse();
      const req = mockRequest();
      filter.catch(new NotFoundException(), mockHost(req, res));
      expect(res.body.correlationId).toBeDefined();
      expect(res.body.correlationId).toMatch(/^[0-9a-f]+$/);
      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', res.body.correlationId);
    });

    it('reuses x-request-id from header when present (pino-http compat)', () => {
      const res = mockResponse();
      const req = mockRequest({ headers: { 'x-request-id': 'req-abc-123' } });
      filter.catch(new NotFoundException(), mockHost(req, res));
      expect(res.body.correlationId).toBe('req-abc-123');
      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'req-abc-123');
    });

    it('reuses req.id when pino-http injected it directly', () => {
      const res = mockResponse();
      const req: any = mockRequest();
      req.id = 'pino-uuid-xyz';
      filter.catch(new NotFoundException(), mockHost(req, res));
      expect(res.body.correlationId).toBe('pino-uuid-xyz');
    });
  });

  describe('non-Error exceptions', () => {
    it('handles thrown strings/objects without crashing (defaults to 500)', () => {
      const res = mockResponse();
      const req = mockRequest();
      filter.catch('plain string thrown', mockHost(req, res));
      expect(res.statusCode).toBe(500);
      expect(res.body.statusCode).toBe(500);
      // Sentry capture meme pour les non-Error (5xx)
      expect(captureException).toHaveBeenCalled();
    });
  });
});
