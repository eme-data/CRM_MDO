-- Ajoute Pennylane comme provider de facturation (compta + facturation, API v2).
-- ADD VALUE IF NOT EXISTS : idempotent et rejouable. Hors transaction implicite
-- pour Postgres (ALTER TYPE ... ADD VALUE).
ALTER TYPE "BillingProviderKind" ADD VALUE IF NOT EXISTS 'PENNYLANE';
