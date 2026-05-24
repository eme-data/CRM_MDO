# Escrow & rotation des secrets

## Pourquoi

Le CRM stocke 5 secrets critiques generes au bootstrap (cf
`scripts/install-ubuntu.sh`). Sans escrow externe, la perte du serveur ou
un dump corrompu rend les donnees chiffrees **irrecuperables**.

| Secret | Role | Perte = |
|---|---|---|
| `SECRETS_MASTER_KEY` | Cle AES-GCM des `SecretEntry` (coffre-fort), TOTP 2FA, credentials chiffres | **IRREVERSIBLE** — tous les secrets stockes sont perdus, aucun fallback |
| `JWT_SECRET` | Signature des access tokens (15 min) | Tous les tokens emis invalides, reconnexion globale |
| `JWT_REFRESH_SECRET` | Signature des refresh tokens (7 j) | Idem, reconnexion globale |
| `POSTGRES_PASSWORD` | Acces BDD | Regen + restart Postgres + update DATABASE_URL |
| `REDIS_PASSWORD` | Acces Redis (queues, cache) | Regen + restart Redis |

`SECRETS_MASTER_KEY` est de loin la plus critique : elle est **derivee a
partir de rien** (genere `openssl rand -hex 48` au bootstrap), il n'existe
aucune cle racine en amont qui permettrait de la regenerer.

## Procedure d'escrow

`install-ubuntu.sh` ecrit les 5 secrets dans `/root/CRM_MDO_BOOTSTRAP_SECRETS_<domain>.txt`
(mode 600, root only) au moment de la generation du `.env`. Avant ouverture
au public :

1. **Copie dans un gestionnaire externe** :
   - 1Password (vault dedie `CRM-MDO-PROD`, partage limite)
   - Vaultwarden self-hosted (collection dediee)
   - KeePassXC + base sur cle USB chiffree
2. **Copie hors-ligne** (defense en profondeur) :
   - Impression papier dans un coffre physique (notarie ou local securise)
   - Cle USB chiffree LUKS dans un lieu different du serveur
3. **Verification de relecture** : ouvrir la copie escrow et verifier que
   chaque ligne est lisible. Un secret mal copie = un secret perdu.
4. **Effacement securise** :
   ```bash
   sudo shred -u /root/CRM_MDO_BOOTSTRAP_SECRETS_<domain>.txt
   ```
5. **Test** : faire un dry-run de restauration depuis le backup vers un
   serveur de test, en re-injectant `SECRETS_MASTER_KEY` depuis l'escrow,
   et verifier qu'un `SecretEntry` decrypte correctement.

## Procedure de rotation

### JWT_SECRET / JWT_REFRESH_SECRET (rotation safe)

A faire en cas de fuite suspectee ou tous les 12 mois.

```bash
cd /opt/crm-mdo
NEW_SECRET=$(openssl rand -hex 48)
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${NEW_SECRET}/" .env
# (Optionnel : meme pour JWT_REFRESH_SECRET)
docker compose restart backend
# Effet : tous les tokens emis avant la rotation deviennent invalides.
# Les users sont rediriges vers /login a leur prochaine requete.
```

Mettre a jour l'escrow externe **avant** restart (pour ne pas oublier).

### POSTGRES_PASSWORD (rotation avec downtime court)

```bash
cd /opt/crm-mdo
NEW_PASS=$(openssl rand -hex 24)
# 1. Changer le password en BDD
docker compose exec postgres psql -U crm_mdo -d crm_mdo \
  -c "ALTER USER crm_mdo WITH PASSWORD '${NEW_PASS}';"
# 2. Mettre a jour .env (POSTGRES_PASSWORD + DATABASE_URL)
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${NEW_PASS}/" .env
sed -i "s|postgresql://crm_mdo:[^@]*@|postgresql://crm_mdo:${NEW_PASS}@|" .env
# 3. Restart backend (5-10s downtime)
docker compose restart backend
# 4. Update escrow externe.
```

### REDIS_PASSWORD (rotation avec downtime court)

```bash
cd /opt/crm-mdo
NEW_PASS=$(openssl rand -hex 24)
sed -i "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=${NEW_PASS}/" .env
docker compose up -d --force-recreate redis
docker compose restart backend
# Update escrow externe.
```

### SECRETS_MASTER_KEY (rotation NON destructive)

**ATTENTION** : changer la cle naivement = tous les `SecretEntry` deviennent
illisibles. La rotation propre necessite un re-chiffrement progressif :

1. Conserver l'ancienne cle dans `SECRETS_MASTER_KEY_PREVIOUS` (env var).
2. Genere une nouvelle cle dans `SECRETS_MASTER_KEY`.
3. Faire tourner un script de re-chiffrement (a developper) qui :
   - Decrypte chaque SecretEntry avec l'ancienne cle.
   - Re-chiffre avec la nouvelle.
   - Met a jour la ligne en BDD.
4. Une fois tout re-chiffre, retirer `SECRETS_MASTER_KEY_PREVIOUS` du `.env`.
5. Update escrow externe (en gardant trace des deux cles le temps de la
   migration).

> Ce script de rotation n'est **pas encore implemente**. En l'etat,
> `SECRETS_MASTER_KEY` est immuable apres mise en service. La rotation
> est dans la roadmap Sprint 2.

## Backup vs escrow

- **Backup** (restic offsite + dump local) contient `.env` et donc tous les
  secrets. **Le backup chiffre AES-256-CBC protege les secrets en transit
  et au repos** sur le repo restic.
- **Mais** : si l'attaquant a acces au serveur ET aux credentials restic
  (config `/etc/crm-mdo/backup.env`), il peut tout exfiltrer. C'est pour
  ca que :
  - Le backup offsite repo est en mode "append-only" (l'attaquant ne peut
    pas supprimer les snapshots).
  - Les credentials de purge (`restic forget --prune`) restent sur un
    poste de confiance hors-serveur (cf `scripts/backup-offsite.sh` et
    `docs/deploy.md`).
- **Escrow externe** = filet de secours pour les scenarios extremes :
  destruction physique du serveur + datacenter offsite injoignable.

## Multi-instance DSI

Chaque instance DSI (Mairie de SEYSSES, etc.) a ses propres secrets
**independants** generes au moment de `install-ubuntu.sh`. L'escrow doit
etre fait **par instance** dans un vault dedie (ex : 1Password vaults
`CRM-MDO-Seysses`, `CRM-MDO-MDO`, ...).

Ne JAMAIS reutiliser une `SECRETS_MASTER_KEY` entre deux instances : c'est
ce qui isole cryptographiquement les coffres-forts entre clients.
