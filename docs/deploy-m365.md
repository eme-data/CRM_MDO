# Intégration Microsoft 365 / Graph API — Procédure de déploiement

Cette intégration permet à MDO Services de **lire les données M365 de chaque client** : utilisateurs Entra ID, licences attribuées, statut MFA, alertes de sécurité Defender. L'app est **multi-tenant** : tu enregistres **une seule** application sur ton tenant Entra ID MDO, et chaque client signe un admin-consent depuis son propre tenant.

---

## 1. Enregistrer l'application sur ton tenant Entra ID MDO

1. Va sur [https://entra.microsoft.com](https://entra.microsoft.com) → **Applications** → **Inscriptions d'applications** → **Nouvelle inscription**
2. **Nom** : `CRM MDO Services`
3. **Types de comptes pris en charge** : ⚠️ **« Comptes dans n'importe quel répertoire organisationnel (multi-tenant) »**
4. **URI de redirection** : type `Web`, valeur :
   ```
   https://crm.mdoservices.fr/api/m365/consent/callback
   ```
5. Clique **Inscrire**.

À la fin, note le **Application (client) ID** affiché.

## 2. Créer un client secret

1. Dans ton app inscrite → **Certificats et secrets** → **Nouveau secret client**
2. Description : `CRM-MDO-prod-<année>`, expiration **24 mois** (max recommandé)
3. Clique **Ajouter**.

⚠️ **Copie immédiatement la valeur** du secret — elle n'est plus affichée après. C'est ce que tu mettras dans `M365_CLIENT_SECRET`.

## 3. Configurer les permissions API

1. Dans ton app → **Autorisations API** → **Ajouter une autorisation** → **Microsoft Graph** → **Autorisations d'application** (pas déléguées)
2. Coche les permissions suivantes :

| Permission | Pour quoi faire |
|---|---|
| `User.Read.All` | Liste des utilisateurs Entra ID du client |
| `Directory.Read.All` | Métadonnées du tenant (domaines, etc.) |
| `Organization.Read.All` | Licences (subscribedSkus) |
| `AuditLog.Read.All` | Détection du statut MFA via le rapport `userRegistrationDetails` |
| `SecurityEvents.Read.All` | Alertes Defender (legacy v1, optionnel) |
| `SecurityAlert.Read.All` | **Alertes Defender via Security API v2 (recommandé)** |

3. Une fois ajoutées, **ne clique PAS encore "Accorder le consentement admin pour MDO"** — ces permissions seront acceptées par chaque client lors de son admin-consent (étape 5).

## 4. Configurer le CRM

Dans **Admin → API, SMTP, IMAP** (ou directement dans `.env`) :

```bash
M365_CLIENT_ID=<le client ID copié à l'étape 1>
M365_CLIENT_SECRET=<le secret copié à l'étape 2>
```

Redémarre le backend après modification du `.env`.

## 5. Connecter un client (admin-consent)

1. Sur la fiche d'une société dans le CRM, va dans la section **Microsoft 365** → clique **Connecter M365**.
2. Une nouvelle fenêtre s'ouvre. Envoie le **lien** à un **administrateur global Entra ID du client**.
3. L'admin client se connecte avec son compte Entra ID, voit la liste des permissions demandées, et clique **Accepter**.
4. Azure redirige vers `https://crm.mdoservices.fr/api/m365/consent/callback?tenant=<guid>&admin_consent=True&state=<companyId>`
5. Le CRM enregistre le tenant et lance une première sync automatique.

## 6. Synchronisation

- **Cron quotidien** : à 06h00 (Europe/Paris), tous les tenants actifs sont resync.
- **À la demande** : bouton **Synchroniser** dans la section M365 de la fiche société.

Données synchronisées :
- Utilisateurs (UPN, displayName, jobTitle, accountEnabled, lastSignIn, licences)
- Licences (sku, total/consommé)
- Statut MFA (si `userRegistrationDetails` disponible — nécessite Entra ID Premium côté client, sinon `mfaEnabled = null`)
- Alertes de sécurité des 30 derniers jours

## 7. Sécurité

- **Multi-tenant** : ton app peut lire les données de *n'importe quel tenant ayant consenti*. Tu ne peux PAS lire les données d'un tenant sans son admin-consent explicite.
- **Secret en BDD** : le `client_secret` est dans `Settings` (chiffré si `SECRETS_MASTER_KEY` est défini) et/ou dans le `.env`. Ne le commit jamais.
- **Tenant disconnect** : la fonction **Déconnecter** côté CRM supprime les données locales. ⚠️ Cela ne révoque PAS le consent côté Azure — l'admin client doit explicitement révoquer depuis [Mes applications](https://myapplications.microsoft.com) → ton app → **Supprimer**.
- **Rotation du secret** : tous les 24 mois max. Crée un nouveau secret dans Entra ID, mets à jour `M365_CLIENT_SECRET`, supprime l'ancien. Pas d'impact sur les tenants connectés.

## 8. Troubleshooting

| Symptôme | Cause probable | Fix |
|---|---|---|
| `Consent refuse : ...` au callback | L'admin client a annulé ou les permissions n'ont pas été accordées | Renvoyer le lien `/m365/companies/:id/consent-url` |
| `mfa: ...` dans `lastSyncError` | Tenant client sans Entra ID Premium | Normal, `mfaEnabled` restera `null`. Les autres données sont OK |
| `alerts: ...` dans `lastSyncError` | Permission `SecurityAlert.Read.All` non accordée ou licence Defender absente côté client | Fonctionnalité dégradée mais reste OK |
| Token error `invalid_client` | `M365_CLIENT_SECRET` expiré ou mal copié | Régénérer un secret dans Entra ID, mettre à jour le `.env` |
| Sync 0 user | App enregistrée en single-tenant au lieu de multi-tenant | Refaire l'inscription en **multi-tenant** (étape 1.3) |
