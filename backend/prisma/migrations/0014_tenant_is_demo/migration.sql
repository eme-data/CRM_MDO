-- Tenant de demonstration : MFA optionnel + reseed periodique + bandeau demo.
ALTER TABLE "Tenant" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
