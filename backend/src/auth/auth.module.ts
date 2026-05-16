import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SsoService } from './sso/sso.service';
import { SsoController } from './sso/sso.controller';
import { WebAuthnService } from './webauthn/webauthn.service';
import { WebAuthnController } from './webauthn/webauthn.controller';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    PassportModule,
    TenantsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn') },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, SsoService, WebAuthnService],
  controllers: [AuthController, SsoController, WebAuthnController],
  exports: [AuthService, SsoService, WebAuthnService],
})
export class AuthModule {}
