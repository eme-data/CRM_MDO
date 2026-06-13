-- Nouvelles capacites IA : devis assiste (QUOTE_ASSIST) et bilan client / QBR
-- (CLIENT_QBR), pour ventiler la consommation IA par cas d'usage.
ALTER TYPE "AiCapability" ADD VALUE IF NOT EXISTS 'QUOTE_ASSIST';
ALTER TYPE "AiCapability" ADD VALUE IF NOT EXISTS 'CLIENT_QBR';
