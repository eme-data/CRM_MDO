-- Remise globale (%) sur les devis, appliquee apres les remises par ligne.
ALTER TABLE "Quote" ADD COLUMN "globalDiscountPct" DECIMAL(5,2) NOT NULL DEFAULT 0;
