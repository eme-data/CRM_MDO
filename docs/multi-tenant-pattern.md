# Pattern multi-tenant — Guide de référence

Ce document décrit le pattern à appliquer **systématiquement** à chaque modèle Prisma quand on étend le scope tenant. Il sert de référence pour les vagues suivantes (au-delà de la vague 1).

## Pourquoi un pattern strict ?

Le bug le plus dangereux d'un système multi-tenant = **leak inter-tenant** : un user du tenant A qui voit/modifie/supprime les données du tenant B. Ces leaks se produisent parce qu'on a oublié de scoper UNE seule requête sur UN seul service. Le pattern ci-dessous garantit qu'on n'oublie pas.

## 1. Schema Prisma

Pour chaque modèle métier (Company, Contact, Ticket, Contract, etc.) :

```prisma
model XXX {
  id          String   @id @default(uuid())
  // Multi-tenant : nullable transitoire (rempli au seed retro-compat).
  // Une fois tous les modèles migrés, on pourra passer NOT NULL.
  tenantId    String?
  tenant      Tenant?  @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  // ... autres champs
  
  @@index([tenantId])
  // Ajouter aussi des index composites sur les colonnes filtrées fréquemment :
  @@index([tenantId, status])      // si on filtre souvent par status
  @@index([tenantId, createdAt])   // si on trie par date par tenant
}
```

**Si le modèle a des contraintes `@unique`** sur des champs métier (ex: `Ticket.reference`, `Invoice.number`), les passer en `@@unique([tenantId, X])` :

```prisma
// AVANT (mono-tenant)
reference  String  @unique

// APRÈS (multi-tenant)
reference  String  // pas @unique seul
@@unique([tenantId, reference])
```

Permet à 2 tenants d'avoir la même référence indépendamment (`TKT-2026-0001` peut exister chez `mdo` ET chez `seysses` sans collision).

**Et** ajouter la relation inverse dans `Tenant` :

```prisma
model Tenant {
  // ...
  xxxs    XXX[]
}
```

## 2. Service backend

Toutes les méthodes (findAll, findOne, create, update, remove, etc.) reçoivent un `tenantId: string | null` en paramètre et l'utilisent dans `where:` et `data:` :

```typescript
// AVANT
async findAll() {
  return this.prisma.xxx.findMany({ where: { ... } });
}

async findOne(id: string) {
  const x = await this.prisma.xxx.findUnique({ where: { id } });
  if (!x) throw new NotFoundException();
  return x;
}

async create(dto: CreateDto) {
  return this.prisma.xxx.create({ data: dto });
}

// APRÈS
async findAll(tenantId: string | null) {
  return this.prisma.xxx.findMany({ where: { tenantId, ... } });
}

async findOne(id: string, tenantId: string | null) {
  // findFirst (pas findUnique) car id n'est plus suffisant comme clé : il
  // faut aussi le tenantId pour empêcher le cross-tenant lookup.
  const x = await this.prisma.xxx.findFirst({ where: { id, tenantId } });
  if (!x) throw new NotFoundException();
  return x;
}

async create(dto: CreateDto, tenantId: string | null) {
  return this.prisma.xxx.create({ data: { ...dto, tenantId: tenantId ?? undefined } });
}
```

**Règle d'or** : avant **chaque** `prisma.xxx.update/delete()`, appeler d'abord `await this.findOne(id, tenantId)`. Sinon on peut update/delete une row d'un autre tenant en devinant l'UUID.

## 3. Controller

Récupérer `user.tenantId` via `@CurrentUser()` et le passer au service :

```typescript
// AVANT
@Get()
findAll() {
  return this.service.findAll();
}

@Post()
create(@Body() dto: CreateDto, @CurrentUser() user: JwtUser) {
  return this.service.create(dto);
}

// APRÈS
@Get()
findAll(@CurrentUser() user: JwtUser) {
  return this.service.findAll(user.tenantId);
}

@Post()
create(@Body() dto: CreateDto, @CurrentUser() user: JwtUser) {
  return this.service.create(dto, user.tenantId);
}
```

Pour les endpoints qui n'ont pas déjà `@CurrentUser`, l'ajouter (la signature passe juste un paramètre de plus, sans casser l'appelant).

## 4. Seed retro-compat

Dans `tenants.service.ts` `onModuleInit()`, ajouter un `updateMany` pour assigner les rows existantes au tenant `mdo` :

```typescript
const xxxsUpdated = await this.prisma.xxx.updateMany({
  where: { tenantId: null },
  data: { tenantId: tenant.id },
});
if (xxxsUpdated.count > 0) {
  this.logger.log(`Retro-compat : ${xxxsUpdated.count} xxx(s) assignees`);
}
```

Garantit qu'au boot suivant l'ajout du tenantId sur ce modèle, toutes les données historiques sont rattachées au tenant mdo (pas perdues).

## 5. Cas particuliers

### Modèles avec relation parente déjà tenant-scopée

Si `XXX` a un `companyId` et que Company est déjà scopé tenant, alors techniquement on pourrait scoper XXX via `where: { company: { tenantId } }`. **Ne pas faire ça.** Toujours mettre un `tenantId` direct sur XXX :

- Plus rapide (un seul index, pas de jointure)
- Plus sûr (un bug dans Company ne peut pas faire fuir XXX)
- Plus simple à raisonner

### Crons et jobs background

Les crons (`@Cron(...)`) ne tournent pas dans un contexte HTTP, donc pas de `req.tenant`. Solutions :

- **Option A (recommandée)** : itérer sur tous les tenants actifs et faire le job par tenant :
  ```typescript
  @Cron('0 8 * * *', { timeZone: 'Europe/Paris' })
  async dailyAlerts() {
    const tenants = await this.prisma.tenant.findMany({ where: { isActive: true } });
    for (const t of tenants) {
      await this.processForTenant(t.id);
    }
  }
  ```
- **Option B** : le job est intrinsèquement global (ex: cleanup de fichiers temporaires), on garde sans tenant.

### Settings, secrets, intégrations

Ces ressources sont **par tenant** (cf décision : isolation totale). Le `Settings` model doit avoir un `tenantId`, et `SettingsService.get(key)` doit prendre le tenantId courant. À adapter quand on attaquera la vague Settings.

### Endpoints super-admin

Les endpoints `/tenants/*` (CRUD tenants) sont protégés par `SuperAdminGuard`. Le super-admin peut lire/modifier les données de n'importe quel tenant — c'est le seul cas où on bypass le scope.

Pour les autres endpoints, **un super-admin reste scopé au tenant du domaine courant** par défaut. S'il veut switcher de tenant, il change de domaine (`crm.mdoservices.fr` → `crm.mairie-seysses.fr`) et son JWT reste valide grâce au check `isSuperAdmin` dans `JwtStrategy`.

## 6. Tests d'isolation

À écrire pour chaque module qui passe au multi-tenant :

```typescript
describe('XXX multi-tenant isolation', () => {
  it('user du tenant A ne peut pas lire une row du tenant B', async () => {
    const tenantA = await createTenant('a');
    const tenantB = await createTenant('b');
    const xxxB = await prisma.xxx.create({ data: { tenantId: tenantB.id, ... } });
    
    // findOne avec tenantA ne doit pas trouver xxxB
    await expect(service.findOne(xxxB.id, tenantA.id)).rejects.toThrow(NotFoundException);
  });
  
  it('user du tenant A ne peut pas modifier/supprimer une row du tenant B', async () => {
    // ...même pattern pour update/remove
  });
});
```

Ces tests sont **non-négociables** sur les modèles sensibles (Invoice, Contract, Settings).

## 7. Roadmap des vagues

| Vague | Modèles | Statut |
|---|---|---|
| 0 | Tenant, User.tenantId, ClientPortalUser.tenantId, auth scope, branding cascade | ✅ commit `ee05a0e` |
| 1 | Company, Contact | 🔄 en cours |
| 2 | Ticket, TicketMessage, Intervention, TimeEntry, Attachment, CompanyDocument | ⏳ |
| 3 | Contract, ContractRenewalAlert, Invoice, InvoiceLine, Quote, Opportunity | ⏳ |
| 4 | Activity, Note, Task, RecurringTaskTemplate, WorkflowRule | ⏳ |
| 5 | Asset, Network, Location, FlexibleAsset, FlexibleAssetType, DocPage, Runbook, RunbookRun, SecretEntry | ⏳ |
| 6 | Settings, ApiKey, AiUsage, WebhookEndpoint, WebhookDelivery, ResponseTemplate, KbArticle, OnboardingTemplate, Subprocessor | ⏳ |
| 7 | M365Tenant, M365User, M365License, M365SecurityAlert, PhishingCampaign, PhishingTarget, DripCampaign, DripEnrollment, BackupJob, BackupRun, EmailSecurityCheck, ComplianceFramework, ComplianceAssessment | ⏳ |
| 8 | UptimeMonitor, UptimeCheck, UptimeIncident, ClientReport, CallLog, SignatureRequest, BankTransaction, AuditLog | ⏳ |
| 9 | Frontend super-admin UI : liste tenants, créer/éditer, switcher contexte | ⏳ |
| 10 | Tests d'isolation (jest/supertest) sur les modules critiques | ⏳ |

À chaque vague : 1 commit par module ou par paquet cohérent, push immédiat.
