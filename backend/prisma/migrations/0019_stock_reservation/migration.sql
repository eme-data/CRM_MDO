-- Reservation de stock liee aux devis : "hold" temporaire qui reduit le stock
-- DISPONIBLE (= physique - reserve actif) sans toucher au physique. Cree a
-- l'acceptation d'un devis, libere si refus/expiration/conversion en contrat.

-- 1. Lien optionnel ligne de devis -> article de stock
ALTER TABLE "QuoteLine" ADD COLUMN "stockItemId" TEXT;
CREATE INDEX "QuoteLine_stockItemId_idx" ON "QuoteLine"("stockItemId");
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Statut de reservation
CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- 3. Table des reservations
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "itemId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockReservation_tenantId_idx" ON "StockReservation"("tenantId");
CREATE INDEX "StockReservation_itemId_status_idx" ON "StockReservation"("itemId", "status");
CREATE INDEX "StockReservation_quoteId_idx" ON "StockReservation"("quoteId");

ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
