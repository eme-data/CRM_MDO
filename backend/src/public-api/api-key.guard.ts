import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ApiKey } from '@prisma/client';
import { ApiKeyService } from './api-key.service';

// Authentification par cle API : Bearer mdo_live_<32chars>.
// On l'ajoute au request en req.apiKey pour que les controllers puissent
// filtrer par companyId quand le scope est CLIENT_*.

declare module 'express' {
  interface Request {
    apiKey?: ApiKey & { company?: { id: string; name: string } | null };
  }
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly service: ApiKeyService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer mdo_live_... requis');
    }
    const token = auth.slice(7);
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip;
    const key = await this.service.verify(token, ip);
    if (!key) throw new UnauthorizedException('Cle API invalide');
    req.apiKey = key as any;
    return true;
  }
}
