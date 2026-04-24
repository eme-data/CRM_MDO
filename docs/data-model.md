# Modele de donnees

## Entites cles

### Contract (coeur du besoin)

- `reference` : ex MDO-2026-0042 (auto-genere, unique)
- `offer` : MDO_ESSENTIEL (69 EUR) | MDO_PRO (99 EUR) | MDO_SOUVERAIN (139 EUR) | CUSTOM
- `startDate`, `endDate` : dates pivots
- `engagementMonths` : duree d'engagement (12 par defaut)
- `noticePeriodMonths` : preavis (3 par defaut)
- `autoRenew` : tacite reconduction (true par defaut)
- `unitPriceHt` x `quantity` = `monthlyAmountHt`
- `status` : DRAFT, ACTIVE, SUSPENDED, EXPIRED, TERMINATED, RENEWED
- `previousContractId` : chainage pour les renouvellements

### ContractRenewalAlert

Genere automatiquement selon `CONTRACT_ALERT_DAYS` (defaut 90,60,30,7).
Un cron NestJS tourne chaque matin a 8h et envoie un email au owner du contrat.

### Users et Roles

- ADMIN : toutes permissions
- MANAGER : CRUD sauf admin/users
- SALES : CRUD contacts/opportunites/contrats (pas delete)
- READONLY : lecture seule

## Migrations Prisma

```bash
cd backend
npx prisma migrate dev --name init
npx prisma studio
```

Le Dockerfile production execute `npx prisma migrate deploy` avant le demarrage.
