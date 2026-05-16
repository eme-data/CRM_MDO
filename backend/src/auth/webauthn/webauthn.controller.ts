import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WebAuthnService } from './webauthn.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

// Endpoints WebAuthn proteges : l'enrollement et la gestion exigent
// d'etre deja authentifie (le flow d'authentification a un endpoint
// separe utilise pendant le login, cf AuthController).

@ApiTags('Auth — WebAuthn / Passkeys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('auth/webauthn')
export class WebAuthnController {
  constructor(private readonly webauthn: WebAuthnService) {}

  // 1. Liste les cles enregistrees par l'utilisateur courant
  @Get('credentials')
  list(@CurrentUser() user: JwtUser) {
    return this.webauthn.listForUser(user.id);
  }

  // 2. Supprime une cle (l'utilisateur ne peut supprimer que les siennes)
  @Delete('credentials/:id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.webauthn.remove(user.id, id);
  }

  // 3. Demande les options d'enregistrement d'une nouvelle cle.
  //    Frontend → @simplewebauthn/browser : startRegistration(options)
  @Post('register/options')
  @HttpCode(200)
  registerOptions(@CurrentUser() user: JwtUser) {
    return this.webauthn.generateRegistrationOptionsFor(user.id);
  }

  // 4. Verifie l'attestation et stocke la cle en BDD.
  //    Body : { response, name } ou response est ce que startRegistration renvoie.
  @Post('register/verify')
  @HttpCode(200)
  registerVerify(
    @Body() body: { response: any; name?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.webauthn.verifyRegistration(user.id, body.response, body.name);
  }
}
