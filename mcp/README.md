# MDO CRM — Serveur MCP

Serveur [Model Context Protocol](https://modelcontextprotocol.io/) qui expose le CRM MDO aux clients MCP (Claude desktop, etc.).

## Pourquoi

Permet d'interroger le CRM directement depuis Claude sans changer de fenêtre :

> *"Liste les tickets ouverts P1 pour Mairie de Seysses"*
> *"Quels certificats SSL expirent dans les 30 prochains jours ?"*
> *"Montre-moi le contrat actif pour la société X"*

Claude appelle l'API REST du CRM en utilisant une clé API tenant-scopée.

## Installation

```bash
cd mcp
npm install
npm run build
```

## Configuration de la clé API

Génère une clé API dans le CRM via l'UI super-admin :

1. Connecte-toi avec un compte ADMIN ou MANAGER
2. Va dans `/super-admin/api-keys`
3. Crée une clé avec scope `GLOBAL_READ` (lecture seule, tous clients du tenant) ou `CLIENT_READ` (lecture limitée à une société)
4. **Copie la clé tout de suite** (`mdo_live_...`) — elle n'est plus jamais affichée ensuite

La clé est automatiquement scopée au tenant qui l'a créée. Une clé MDO ne voit que les données MDO, une clé Mairie ne voit que les données Mairie (cf vague 11D).

## Configuration cliente

### Claude Desktop (macOS)

Édite `~/Library/Application Support/Claude/claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "mdo-crm": {
      "command": "node",
      "args": ["/chemin/absolu/vers/CRM_MDO/mcp/dist/index.js"],
      "env": {
        "MDO_CRM_API_URL": "https://crm.mdoservices.fr",
        "MDO_CRM_API_KEY": "mdo_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### Claude Desktop (Windows)

Édite `%APPDATA%\Claude\claude_desktop_config.json` (même format).

### Claude Code

Identique, dans `~/.claude/config.json` ou via `claude mcp add`.

Relance Claude après modification de la config.

## Outils exposés

| Outil | Description |
|---|---|
| `who_am_i` | Infos sur la clé API utilisée (nom, scope, tenant, company) |
| `list_contracts` | Contrats actifs (trie par échéance) |
| `list_tickets` | Tickets de support (filtre par statut optionnel) |
| `list_invoices` | Factures (trie par date d'émission décroissante) |
| `list_assets` | Inventaire IT (domaines, certs SSL, postes, etc.) |
| `get_company` | Détails d'une société par UUID |

Les routes correspondantes dans le backend : `backend/src/public-api/public-api.controller.ts`.

## Sécurité

- La clé API est **tenant-scopée** depuis la vague 11D : impossible de lire les données d'un autre tenant même avec une clé GLOBAL_READ.
- La clé est tracée à chaque utilisation (`lastUsedAt`, `lastUsedIp`, `usageCount`).
- Révocation immédiate via `/super-admin/api-keys` ; les calls suivants reçoivent 403.
- Les clés CLIENT_READ ne peuvent lire que les données de leur company associée — utile pour donner un accès limité à un client ou à un script automation.

## Dev

```bash
npm run dev   # tsx watch mode
```

Les logs du serveur sortent sur `stderr` (stdout est réservé au canal MCP).
