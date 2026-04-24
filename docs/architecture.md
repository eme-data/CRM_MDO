# Architecture

## Composants

```
Internet --443/80--> Caddy (reverse proxy + HTTPS Let's Encrypt)
  |
  +-- / ------> Frontend Next.js (3000)
  +-- /api/* -> Backend NestJS (4000) --> Postgres 16
                                       --> Redis 7 (BullMQ)
                                       --> SMTP externe
```

## Stack

- Backend NestJS + Prisma
- Frontend Next.js 14 (App Router) + Tailwind
- PostgreSQL 16, Redis 7, Caddy 2
- Cron NestJS pour les alertes contrats (8h00) et marquage expiration (horaire)

## Flux alerte de renouvellement

1. Creation contrat avec endDate=2027-01-15
2. Generation de 4 alertes (90j, 60j, 30j, 7j avant)
3. Chaque matin a 8h, scan des alertes du jour
4. Envoi email au owner du contrat
5. Marquage sentAt de l'alerte
6. Dashboard affiche en continu les contrats qui expirent sous 30/60/90j
