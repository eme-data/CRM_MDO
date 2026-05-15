import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId?: string | null;
  isSuperAdmin?: boolean;
  mfaPending?: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
      // passReqToCallback : on a besoin du Request pour acceder a req.tenant
      // (resolu par le middleware) et verifier que le token correspond bien
      // au tenant du domaine courant.
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        tenantId: true,
        isSuperAdmin: true,
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Utilisateur invalide ou desactive');
    }
    // Validation tenant : le user du token doit appartenir au tenant du
    // domaine courant. Sinon = tentative d'utiliser un token cross-tenant
    // (ex: token vole sur tenant A pour acceder a tenant B). Exception :
    // super-admin peut acceder a n'importe quel tenant connu.
    if (req.tenant && user.tenantId !== req.tenant.id && !user.isSuperAdmin) {
      throw new UnauthorizedException('Token non valide pour ce domaine');
    }
    return { ...user, mfaPending: payload.mfaPending === true };
  }
}
