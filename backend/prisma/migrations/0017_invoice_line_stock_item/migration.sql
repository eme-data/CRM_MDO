-- Decrement de stock a la facturation : lien optionnel ligne de facture -> article.
ALTER TABLE "InvoiceLine" ADD COLUMN "stockItemId" TEXT;
CREATE INDEX "InvoiceLine_stockItemId_idx" ON "InvoiceLine"("stockItemId");
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
