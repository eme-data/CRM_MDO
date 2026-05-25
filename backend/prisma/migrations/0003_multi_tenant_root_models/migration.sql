-- Migration : passage en FULL MULTI-TENANT logique (cf project_revente_dsi_strategy.md).
-- Ajout du champ tenantId aux 5 derniers modeles racine qui restaient globaux :
--   Team, Product, QuoteTemplate, Runbook, FlexibleAssetType
--
-- Avant cette migration : ces tables etaient partagees entre tous les tenants
-- (legacy mode 1 install = 1 tenant). Apres : chaque tenant a son propre jeu.
-- Backfill : toutes les rows existantes sont rattachees au tenant 'mdo' (le seul
-- tenant en prod actuellement). Si plusieurs tenants existent deja en BDD, faire
-- un dry-run avant.
--
-- Contraintes d'unicite modifiees :
--   - Product.code : @unique global -> @@unique([tenantId, code])
--   - FlexibleAssetType.name : @unique global -> @@unique([tenantId, name])

BEGIN;

-- ============================================================
-- 1. Team : ajout tenantId + backfill
-- ============================================================
ALTER TABLE "Team" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Team_tenantId_idx" ON "Team"("tenantId");
ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Backfill : toutes les rows existantes -> tenant 'mdo'
UPDATE "Team" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'mdo' LIMIT 1)
  WHERE "tenantId" IS NULL;

-- ============================================================
-- 2. Product : ajout tenantId + transformation unique constraint
-- ============================================================
ALTER TABLE "Product" ADD COLUMN "tenantId" TEXT;
-- Backfill avant de modifier l'unique constraint (sinon NULL/NULL collide pas)
UPDATE "Product" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'mdo' LIMIT 1)
  WHERE "tenantId" IS NULL;
-- Drop l'ancien unique global sur code
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_code_key";
DROP INDEX IF EXISTS "Product_code_key";
-- Nouveau unique composite (tenantId, code)
CREATE UNIQUE INDEX "Product_tenantId_code_key" ON "Product"("tenantId", "code");
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- 3. QuoteTemplate : ajout tenantId + backfill
-- ============================================================
ALTER TABLE "QuoteTemplate" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "QuoteTemplate_tenantId_idx" ON "QuoteTemplate"("tenantId");
ALTER TABLE "QuoteTemplate" ADD CONSTRAINT "QuoteTemplate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE "QuoteTemplate" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'mdo' LIMIT 1)
  WHERE "tenantId" IS NULL;

-- ============================================================
-- 4. Runbook : ajout tenantId + backfill
-- ============================================================
ALTER TABLE "Runbook" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Runbook_tenantId_idx" ON "Runbook"("tenantId");
ALTER TABLE "Runbook" ADD CONSTRAINT "Runbook_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE "Runbook" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'mdo' LIMIT 1)
  WHERE "tenantId" IS NULL;

-- ============================================================
-- 5. FlexibleAssetType : ajout tenantId + transformation unique constraint
-- ============================================================
ALTER TABLE "FlexibleAssetType" ADD COLUMN "tenantId" TEXT;
UPDATE "FlexibleAssetType" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'mdo' LIMIT 1)
  WHERE "tenantId" IS NULL;
ALTER TABLE "FlexibleAssetType" DROP CONSTRAINT IF EXISTS "FlexibleAssetType_name_key";
DROP INDEX IF EXISTS "FlexibleAssetType_name_key";
CREATE UNIQUE INDEX "FlexibleAssetType_tenantId_name_key" ON "FlexibleAssetType"("tenantId", "name");
CREATE INDEX "FlexibleAssetType_tenantId_idx" ON "FlexibleAssetType"("tenantId");
ALTER TABLE "FlexibleAssetType" ADD CONSTRAINT "FlexibleAssetType_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
