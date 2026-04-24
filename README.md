# CRM MDO Services

CRM interne pour [MDO Services](https://www.mdoservices.fr) - prestataire IT / MSP / cybersecurite en Occitanie.

Le besoin specifique : gerer finement les **contrats** (abonnements mensuels Essentiel / Pro / Souverain), leurs **dates de debut et de fin**, et les **alertes de renouvellement** automatiques.

## Stack technique

| Couche          | Choix                                               |
|-----------------|-----------------------------------------------------|
| Backend API     | NestJS 10 + Prisma 5 + PostgreSQL 16                |
| Frontend        | Next.js 14 (App Router) + Tailwind + shadcn-style   |
| Auth            | JWT + refresh tokens + bcrypt + RBAC (4 roles)      |
| Jobs planifies  | @nestjs/schedule (cron) + BullMQ/Redis              |
| Emails          | Nodemailer (SMTP)                                   |
| Reverse proxy   | Caddy 2 (HTTPS Let's Encrypt auto)                  |
| Orchestration   | Docker Compose                                      |

## Fonctionnalites

- **Societes** : CRUD, secteur (PME/TPE/Collectivite/Sante/Industrie), statut (Lead/Prospect/Client)
- **Contacts** : rattaches aux societes, contact principal
- **Opportunites** : pipeline kanban (Qualification -> Proposition -> Negociation -> Gagne/Perdu)
- **Contrats** : offres MDO Essentiel/Pro/Souverain, engagement, tacite reconduction, renouvellement en 1 clic, resiliation, chainage du contrat precedent vers le suivant
- **Alertes de renouvellement** : emails automatiques 90/60/30/7 jours avant expiration (configurable)
- **Dashboard** : MRR, pipeline, contrats qui expirent, activites recentes
- **Interventions** : on-site / remote / phone, lies a contrat et technicien
- **Taches** : kanban TODO/DOING/DONE, assignable, lie a n'importe quelle entite
- **Notes** : polymorphe sur toute entite
- **Journal d'activite** : qui a fait quoi et quand
- **Multi-utilisateurs** : roles ADMIN / MANAGER / SALES / READONLY
- **Emails** : historises en base (EmailLog)

## Demarrage local (dev)

```bash
cp .env.example .env
# editer .env (mots de passe, SMTP optionnel)

docker compose up -d
# Backend  : http://localhost:4000   (Swagger : /api/docs)
# Frontend : http://localhost:3000

# Creer le compte admin
docker compose exec backend npm run seed:admin
```

## Deploiement production (Ubuntu 24.04)

Installation entierement automatisee via [scripts/install-ubuntu.sh](scripts/install-ubuntu.sh).

```bash
# Sur un Ubuntu 24.04 fraichement installe :
REPO_URL=https://github.com/VOTRE_ORG/CRM_MDO.git sudo bash scripts/install-ubuntu.sh
```

Le script :
- Met a jour le systeme, installe Docker + Compose
- Configure UFW + fail2ban
- Genere un `.env` avec mots de passe aleatoires
- Verifie que `crm.mdoservices.fr` pointe bien vers le serveur
- Deploie la stack avec Caddy + HTTPS Let's Encrypt automatique
- Cree le 1er compte admin (interactif)
- Configure un backup quotidien cron

Voir [docs/deploy.md](docs/deploy.md) pour les details.

## Structure du repo

```
backend/        API NestJS + Prisma
frontend/       Next.js 14 (App Router)
docker/         Init Postgres
scripts/        install-ubuntu.sh, backup.sh, restore.sh
docs/           deploy.md, data-model.md, architecture.md
docker-compose.yml         Stack de dev
docker-compose.prod.yml    Override prod (Caddy + HTTPS)
.env.example               Variables d'environnement
```

## Documentation

- [Architecture](docs/architecture.md)
- [Modele de donnees](docs/data-model.md)
- [Deploiement](docs/deploy.md)

## Scripts npm utiles

### Backend

```bash
cd backend
npm run start:dev              # dev watch mode
npm run build                  # build production
npm run prisma:migrate:dev     # nouvelle migration
npm run prisma:studio          # GUI base de donnees
npm run seed:admin             # creer un admin
```

### Frontend

```bash
cd frontend
npm run dev                    # dev sur :3000
npm run build                  # build production
```

## Licence

Usage interne MDO Services.
