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

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "EmailLog_tenantId_status_idx" ON "EmailLog"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EmailLog_tenantId_createdAt_idx" ON "EmailLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
