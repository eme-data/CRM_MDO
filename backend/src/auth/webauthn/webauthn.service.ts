import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { PrismaService } from '../../database/prisma.service';

// WebAuthn / Passkeys — alternative phishing-resistant au TOTP.
//
// Architecture :
//   - Le user enregistre une ou plusieurs cles (YubiKey, Touch ID, Windows
//     Hello, Passkey iCloud, etc.) depuis /settings/security
//   - Au login, apres password OK, si user a >=1 credential, on demande une
//     assertion WebAuthn (replace TOTP)
//   - Les challenges sont stockes en cache memoire ttl 5 min (request/response
//     dans la meme session navigateur)
//
// Securite :
//   - relying party = origin du frontend (RP_ID dans ENV, ex: crm.mdoservices.fr)
//   - Counter anti-rejeu verifie a chaque assertion : si counter recu <=
//     counter stocke, on refuse (suspecte cle clonee)
//   - Backup credentials (passkeys synchros iCloud/Google) signalees en BDD
//     pour visibilite admin (potentiellement moins sur si compte cloud
//     compromise — mais bcp plus convivial)

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface ChallengeEntry {
  expiresAt: number;
  // userId proprietaire du challenge (register OU authenticate). Le challenge
  // est lie au user pour eviter qu'un challenge cache par user A soit reutilise
  // pour s'authentifier user B.
  userId: string;
}

@Injectable()
export class WebAuthnService {
  private readonly logger = new Logger(WebAuthnService.name);
  // Cache challenge → entry. Cle = challenge base64url unique. TTL 5 min.
  private readonly challengeCache = new Map<string, ChallengeEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Relying Party ID = domaine racine (ex: "crm.mdoservices.fr"). DOIT
  // matcher l'origin du frontend appelant. Si different, l'authenticator
  // refuse la signature (protection anti-phishing).
  private get rpId(): string {
    return this.config.get<string>('WEBAUTHN_RP_ID') ?? 'localhost';
  }

  // RP name : affiche dans le prompt navigateur ("Sign in to <name>")
  private get rpName(): string {
    return this.config.get<string>('WEBAUTHN_RP_NAME') ?? 'CRM MDO Services';
  }

  // Origins acceptees : tableau des URLs frontend qui peuvent se connecter
  // (https://crm.mdoservices.fr en prod, http://localhost:3000 en dev).
  private get expectedOrigins(): string[] {
    const raw = this.config.get<string>('WEBAUTHN_ORIGINS');
    if (!raw) return ['https://' + this.rpId];
    return raw.split(',').map((s) => s.trim());
  }

  private cacheChallenge(challenge: string, entry: Omit<ChallengeEntry, 'expiresAt'>) {
    // GC opportuniste : on purge les challenges expires de temps en temps
    if (this.challengeCache.size > 100) {
      const now = Date.now();
      for (const [k, v] of this.challengeCache.entries()) {
        if (v.expiresAt < now) this.challengeCache.delete(k);
      }
    }
    this.challengeCache.set(challenge, {
      ...entry,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
  }

  private popChallenge(challenge: string): ChallengeEntry | null {
    const e = this.challengeCache.get(challenge);
    if (!e) return null;
    this.challengeCache.delete(challenge); // one-shot anti-rejeu
    if (e.expiresAt < Date.now()) return null;
    return e;
  }

  // ============================================================
  // ENREGISTREMENT d'une nouvelle cle (depuis /settings/security)
  // ============================================================

  async generateRegistrationOptionsFor(userId: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException('User introuvable');

    const existing = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userName: user.email,
      userDisplayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      // userID DOIT etre un Buffer stable par user, max 64 bytes. On
      // utilise l'UUID du user encode en Buffer (16 bytes).
      userID: Buffer.from(user.id.replace(/-/g, ''), 'hex'),
      attestationType: 'none', // pas besoin de tracking constructeur
      // Exclusion des cles deja enregistrees : empeche le user d'inscrire
      // la meme cle 2 fois (UX confuse).
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        // Resident key recommandee pour passkeys synchros (iCloud, Google).
        residentKey: 'preferred',
        // UV requise = l'authenticator demande PIN / biometrie en plus de
        // la presence physique. Plus sur, mais necessite hardware compatible.
        userVerification: 'preferred',
      },
    });

    this.cacheChallenge(options.challenge, { userId });
    return options;
  }

  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    credentialName?: string,
  ) {
    // Le challenge est l'attestation reponse → on l'extrait du clientDataJSON
    const clientData = JSON.parse(
      Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf-8'),
    );
    const cached = this.popChallenge(clientData.challenge);
    if (!cached || cached.userId !== userId) {
      throw new UnauthorizedException('Challenge invalide ou expire');
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: clientData.challenge,
      expectedOrigin: this.expectedOrigins,
      expectedRPID: this.rpId,
      requireUserVerification: false,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new UnauthorizedException('Verification WebAuthn echec');
    }

    const { credential, aaguid, credentialBackedUp, credentialDeviceType } =
      verification.registrationInfo;

    const created = await this.prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: BigInt(credential.counter),
        transports: (response.response.transports as string[] | undefined) ?? [],
        aaguid: aaguid ?? null,
        name: credentialName ?? null,
        isBackupEligible: credentialDeviceType === 'multiDevice',
        isBackedUp: credentialBackedUp,
      },
    });

    // Trace audit : on log les erreurs (avant on silenciait avec .catch(()=>{}))
    // — masquer une erreur d'ecriture en audit cache des incidents en prod.
    // L'audit reste best-effort : on ne fait pas echouer l'enregistrement
    // WebAuthn si l'audit echoue, mais on doit savoir que c'est arrive.
    await this.prisma.activity.create({
      data: {
        userId,
        action: 'WEBAUTHN_REGISTER',
        entity: 'WebAuthnCredential',
        entityId: created.id,
        metadata: { name: credentialName, aaguid },
      },
    }).catch((err: any) => {
      this.logger.warn('Audit WEBAUTHN_REGISTER echoue (non bloquant) : ' + (err?.message ?? err));
    });

    return { ok: true, id: created.id };
  }

  // ============================================================
  // AUTHENTIFICATION (apres password OK, en remplacement du TOTP)
  // ============================================================

  async generateAuthenticationOptionsFor(userId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const credentials = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });
    if (credentials.length === 0) {
      throw new BadRequestException('Aucune cle WebAuthn enregistree pour cet utilisateur');
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      userVerification: 'preferred',
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
    });

    this.cacheChallenge(options.challenge, { userId });
    return options;
  }

  async verifyAuthentication(userId: string, response: AuthenticationResponseJSON): Promise<boolean> {
    const clientData = JSON.parse(
      Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf-8'),
    );
    const cached = this.popChallenge(clientData.challenge);
    if (!cached || cached.userId !== userId) {
      throw new UnauthorizedException('Challenge invalide ou expire');
    }

    const cred = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!cred || cred.userId !== userId) {
      throw new UnauthorizedException('Credential WebAuthn inconnu');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: clientData.challenge,
      expectedOrigin: this.expectedOrigins,
      expectedRPID: this.rpId,
      credential: {
        id: cred.credentialId,
        publicKey: Buffer.from(cred.publicKey, 'base64url'),
        counter: Number(cred.counter),
        transports: cred.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      throw new UnauthorizedException('Signature WebAuthn invalide');
    }

    // Mise a jour counter (anti-rejeu) + lastUsedAt
    await this.prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });

    return true;
  }

  // ============================================================
  // GESTION : liste / suppression d'une cle
  // ============================================================

  listForUser(userId: string) {
    return this.prisma.webAuthnCredential.findMany({
      where: { userId },
      select: {
        id: true, name: true, aaguid: true, transports: true,
        isBackupEligible: true, isBackedUp: true,
        createdAt: true, lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(userId: string, credentialId: string) {
    const c = await this.prisma.webAuthnCredential.findUnique({ where: { id: credentialId } });
    if (!c || c.userId !== userId) throw new NotFoundException('Credential introuvable');
    await this.prisma.webAuthnCredential.delete({ where: { id: credentialId } });
    await this.prisma.activity.create({
      data: {
        userId,
        action: 'WEBAUTHN_REMOVE',
        entity: 'WebAuthnCredential',
        entityId: credentialId,
        metadata: { name: c.name },
      },
    }).catch(() => {});
    return { ok: true };
  }

  async hasCredentials(userId: string): Promise<boolean> {
    const c = await this.prisma.webAuthnCredential.count({ where: { userId } });
    return c > 0;
  }
}
