-- Envoi mail delegue Microsoft 365 : stockage du refresh token OAuth2 (chiffre)
-- capture au login SSO Entra, pour envoyer les replies tickets « au nom » de
-- l'agent. Cf mail.delegatedEnabled et backend/src/common/crypto/secret-cipher.ts.

-- AlterTable (idempotent : robuste a un re-run apres echec partiel)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "m365RefreshTokenEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "m365TokenUpdatedAt" TIMESTAMP(3);
