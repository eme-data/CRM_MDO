-- Integrations stock : consommation sur intervention (decrement auto) +
-- lien numero de serie -> Asset client.

-- StockSerial.assetId
ALTER TABLE "StockSerial" ADD COLUMN "assetId" TEXT;
CREATE INDEX "StockSerial_assetId_idx" ON "StockSerial"("assetId");
ALTER TABLE "StockSerial" ADD CONSTRAINT "StockSerial_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- StockConsumption
CREATE TABLE "StockConsumption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "interventionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitCostHt" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockConsumption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StockConsumption_tenantId_idx" ON "StockConsumption"("tenantId");
CREATE INDEX "StockConsumption_interventionId_idx" ON "StockConsumption"("interventionId");
CREATE INDEX "StockConsumption_itemId_idx" ON "StockConsumption"("itemId");

ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
