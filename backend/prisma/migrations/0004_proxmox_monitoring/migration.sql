-- Migration : ajout du monitoring Proxmox push-based.
-- 2 nouvelles tables :
--   ProxmoxCluster  : la config d'un cluster Proxmox d'un client (1 par
--                     company, tenant-scope, secret d'ingest hashe).
--   ProxmoxSnapshot : un point de mesure stocke par push de l'agent.
--                     rawPayload contient le /cluster/resources brut + agregats
--                     denormalises pour les graphs dashboard rapides.
--
-- Aucun backfill : feature nouvelle, pas de donnees pre-existantes.

BEGIN;

-- ============================================================
-- ProxmoxCluster
-- ============================================================
CREATE TABLE "ProxmoxCluster" (
  "id"                       TEXT NOT NULL PRIMARY KEY,
  "tenantId"                 TEXT,
  "companyId"                TEXT NOT NULL,
  "name"                     TEXT NOT NULL,
  "apiUrl"                   TEXT,
  "expectedPushIntervalMin"  INTEGER NOT NULL DEFAULT 15,
  "ingestSecret"             TEXT,
  "isActive"                 BOOLEAN NOT NULL DEFAULT true,
  "lastPushAt"               TIMESTAMP(3),
  "lastNodeCount"            INTEGER,
  "lastVmRunning"            INTEGER,
  "lastVmTotal"              INTEGER,
  "lastCpuPctAvg"            DOUBLE PRECISION,
  "lastMemPctAvg"            DOUBLE PRECISION,
  "lastDiskPctAvg"           DOUBLE PRECISION,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL
);

CREATE INDEX "ProxmoxCluster_tenantId_idx" ON "ProxmoxCluster"("tenantId");
CREATE INDEX "ProxmoxCluster_companyId_idx" ON "ProxmoxCluster"("companyId");
CREATE INDEX "ProxmoxCluster_isActive_lastPushAt_idx" ON "ProxmoxCluster"("isActive", "lastPushAt");

ALTER TABLE "ProxmoxCluster" ADD CONSTRAINT "ProxmoxCluster_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProxmoxCluster" ADD CONSTRAINT "ProxmoxCluster_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- ProxmoxSnapshot
-- ============================================================
CREATE TABLE "ProxmoxSnapshot" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "clusterId"   TEXT NOT NULL,
  "capturedAt"  TIMESTAMP(3) NOT NULL,
  "nodeCount"   INTEGER NOT NULL,
  "vmRunning"   INTEGER NOT NULL,
  "vmTotal"     INTEGER NOT NULL,
  "cpuPctAvg"   DOUBLE PRECISION NOT NULL,
  "memPctAvg"   DOUBLE PRECISION NOT NULL,
  "diskPctAvg"  DOUBLE PRECISION NOT NULL,
  "rawPayload"  JSONB NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ProxmoxSnapshot_clusterId_capturedAt_idx" ON "ProxmoxSnapshot"("clusterId", "capturedAt");

ALTER TABLE "ProxmoxSnapshot" ADD CONSTRAINT "ProxmoxSnapshot_clusterId_fkey"
  FOREIGN KEY ("clusterId") REFERENCES "ProxmoxCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
