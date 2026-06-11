-- Migration : ajout du champ tenantId a EmailLog pour fermer le leak multi-tenant.
-- Cf. audit securite 2026-05 (project_security_hardening_2026-05) : EmailLog
-- etait la derniere table metier sans scope tenant, exposant l'historique des
-- mails entre tenants si un endpoint requetait sans filtre.
--
-- Cette migration est CUMULATIVE avec la baseline 0001_baseline qui doit avoir
-- ete generee et appliquee au prealable (cf docs/migrate.md).
--
-- Backfill : les lignes EmailLog anterieures restent tenantId=NULL (historique
-- isole, non visible par les requetes tenant-scoped). Un script de backfill
-- optionnel peut hydrater le tenantId depuis Activity (relatedEntity +
-- relatedEntityId) si besoin.

-- NB idempotence : selon l'etat du `0001_baseline` (regenere ou non depuis un
-- schema contenant deja ce champ), la colonne/index/FK peuvent deja exister.
-- On rend donc cette migration rejouable sans planter (cf incident deploy
-- 2026-06 : P3009 "column EmailLog.tenantId already exists" sur install neuve).

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailLog_tenantId_status_idx" ON "EmailLog"("tenantId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailLog_tenantId_createdAt_idx" ON "EmailLog"("tenantId", "createdAt");

-- AddForeignKey (Postgres n'a pas de ADD CONSTRAINT IF NOT EXISTS → garde via pg_constraint)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailLog_tenantId_fkey') THEN
    ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
