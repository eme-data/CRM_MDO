-- Entitlements modulaires par tenant (offres). Liste de codes de features.
-- VIDE = acces complet (tenant MDO interne + retro-compat). NON VIDE = offre
-- restreinte (cf backend/src/modules/module-catalog.ts + ModuleGuard).
ALTER TABLE "Tenant" ADD COLUMN "enabledModules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
