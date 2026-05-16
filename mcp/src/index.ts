#!/usr/bin/env node
/**
 * MDO CRM — Serveur MCP (Model Context Protocol)
 *
 * Permet a Claude desktop (et tout client MCP) d'interroger le CRM MDO :
 * lister les tickets ouverts, chercher une societe, voir les assets qui
 * expirent, recuperer le cyber-score d'un client, etc.
 *
 * Authentification : utilise une cle API MDO (mdo_live_...) creee via
 * l'UI super-admin (/super-admin/api-keys). Scope minimum GLOBAL_READ.
 * Comme la cle est tenant-scopee depuis la vague 11D, les requetes ne
 * touchent que les donnees du tenant proprietaire de la cle.
 *
 * Configuration cote Claude desktop (~/Library/Application Support/
 * Claude/claude_desktop_config.json sur macOS, %APPDATA%\Claude\... sur
 * Windows) :
 *
 * {
 *   "mcpServers": {
 *     "mdo-crm": {
 *       "command": "node",
 *       "args": ["/chemin/absolu/vers/mcp/dist/index.js"],
 *       "env": {
 *         "MDO_CRM_API_URL": "https://crm.mdoservices.fr",
 *         "MDO_CRM_API_KEY": "mdo_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *       }
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const API_URL = (process.env.MDO_CRM_API_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.MDO_CRM_API_KEY || '';

if (!API_URL) {
  console.error('[mdo-crm-mcp] MDO_CRM_API_URL non defini');
  process.exit(1);
}
if (!API_KEY) {
  console.error('[mdo-crm-mcp] MDO_CRM_API_KEY non defini');
  process.exit(1);
}

// Helper : appelle l'API publique v1 du CRM (cf src/public-api/*).
// Toutes les routes sont en /api/public/v1/* et utilisent le scope de la
// cle API (le filtre tenantId est applique cote backend).
async function apiGet<T = any>(path: string, query?: Record<string, string>): Promise<T> {
  const qs = query
    ? '?' + Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';
  const url = `${API_URL}/api/public/v1${path}${qs}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`CRM API ${r.status} sur ${path} : ${txt.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

// Definition des outils exposes. Chaque tool a un nom, une description
// (que Claude lit pour decider quand l'appeler), et un schema d'inputs.

const TOOLS: Tool[] = [
  {
    name: 'who_am_i',
    description:
      'Renvoie les informations sur la cle API utilisee (nom, scope, tenant, company associee). Utile pour verifier le contexte avant d\'appeler d\'autres outils.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_contracts',
    description:
      'Liste les contrats du tenant (ou de la company si la cle est CLIENT_*). Renvoie reference, titre, offre, statut, dates de debut/fin, montant mensuel HT, societe associee. Tri par date de fin croissante (les expirations imminentes en premier).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_tickets',
    description:
      'Liste les tickets de support. Tri par date de creation decroissante (les plus recents en premier). Filtre par statut optionnel (OPEN, IN_PROGRESS, WAITING_CUSTOMER, RESOLVED, CLOSED, CANCELLED).',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED', 'CANCELLED'],
          description: 'Filtre optionnel sur le statut du ticket.',
        },
      },
    },
  },
  {
    name: 'list_invoices',
    description:
      'Liste les factures du tenant. Renvoie numero, statut, date d\'emission, date d\'echeance, total TTC, date de paiement, societe. Tri par date d\'emission decroissante.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_assets',
    description:
      'Liste les assets IT inventories (DOMAIN, SSL_CERT, SERVER, WORKSTATION, etc.). Renvoie nom, type, statut, identifiant (FQDN/serie), vendor, garantie, fin de support, date d\'expiration. Utile pour identifier les renouvellements a planifier.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_company',
    description:
      'Recupere les details d\'une societe par son ID. CLIENT_*: limite a la company de la cle. GLOBAL_*: toutes les societes du tenant. Renvoie nom, SIRET, secteur, statut, adresse.',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'UUID de la societe' },
      },
      required: ['companyId'],
    },
  },
];

const server = new Server(
  {
    name: 'mdo-crm-mcp',
    version: '0.1.0',
  },
  {
    capabilities: { tools: {} },
  },
);

// Liste des outils disponibles : le client MCP (Claude) appelle ce
// handler au demarrage pour decouvrir ce qu'il peut faire.
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// Dispatch des appels d'outils. Schema validation cote Zod (paranoia
// car le MCP SDK valide deja contre inputSchema, mais re-check ici).
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    switch (name) {
      case 'who_am_i': {
        const data = await apiGet('/me');
        return formatJsonResult(data);
      }

      case 'list_contracts': {
        const data = await apiGet('/contracts');
        return formatJsonResult(data);
      }

      case 'list_tickets': {
        const schema = z.object({ status: z.string().optional() });
        const parsed = schema.parse(args ?? {});
        const data = await apiGet('/tickets', parsed.status ? { status: parsed.status } : undefined);
        return formatJsonResult(data);
      }

      case 'list_invoices': {
        const data = await apiGet('/invoices');
        return formatJsonResult(data);
      }

      case 'list_assets': {
        const data = await apiGet('/assets');
        return formatJsonResult(data);
      }

      case 'get_company': {
        const schema = z.object({ companyId: z.string().uuid() });
        const { companyId } = schema.parse(args);
        const data = await apiGet(`/companies/${encodeURIComponent(companyId)}`);
        return formatJsonResult(data);
      }

      default:
        return {
          content: [{ type: 'text', text: `Outil inconnu : ${name}` }],
          isError: true,
        };
    }
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Erreur : ${err.message}` }],
      isError: true,
    };
  }
});

function formatJsonResult(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('[mdo-crm-mcp] connexion echec :', err);
  process.exit(1);
});

// Log de demarrage cote stderr (stdout = canal MCP, doit rester propre)
console.error(`[mdo-crm-mcp] connecte a ${API_URL} (${TOOLS.length} outils exposes)`);
