'use client';
import { useEffect, useState } from 'react';
import { Coins, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';

// Petite bulle d'info sur la consommation IA (30 derniers jours) : nombre
// d'appels, cout estime (USD, tarifs Anthropic) et tokens, avec un detail
// depliable par cas d'usage. Reservee aux ADMIN/MANAGER (endpoint /ai/usage) :
// pour un autre role, l'appel echoue silencieusement et la bulle ne s'affiche pas.

const CAP_LABELS: Record<string, string> = {
  TICKET_TRIAGE: 'Triage ticket',
  TICKET_DRAFT: 'Brouillon réponse',
  TICKET_SUMMARY: 'Résumé ticket',
  CLIENT_SUMMARY: 'Synthèse client',
  DOCUMENT_EXTRACT: 'Extraction document',
  QUOTE_ASSIST: 'Devis assisté',
  CLIENT_QBR: 'QBR client',
  GENERIC: 'Assistant',
};
const usd = (n: number) => (n >= 0.01 ? '$' + n.toFixed(2) : '< $0.01');

export function AiUsageBadge() {
  const [u, setU] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { api.get('/ai/usage').then(setU).catch(() => {}); }, []);
  if (!u) return null;

  const d = u.last30Days;
  const tokens = (d.inputTokens ?? 0) + (d.outputTokens ?? 0);

  return (
    <div className="card p-3 bg-purple-50/40 border-purple-200 text-xs">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 text-purple-700">
        <span className="flex items-center gap-1.5"><Coins size={13} /> Usage IA — 30 derniers jours</span>
        <span className="flex items-center gap-2 font-medium">
          {d.invocations} appels · {usd(Number(d.costUsd ?? 0))} · {Math.round(tokens / 1000)} k tokens
          <ChevronDown size={13} className={'transition-transform ' + (open ? 'rotate-180' : '')} />
        </span>
      </button>
      {open && (
        <div className="mt-2 pt-2 border-t border-purple-200 space-y-1">
          {(u.byCapability ?? []).length === 0 && <div className="text-slate-400">Aucun usage sur la période.</div>}
          {(u.byCapability ?? []).map((c: any) => (
            <div key={c.capability} className="flex items-center justify-between">
              <span className="text-slate-600">{CAP_LABELS[c.capability] ?? c.capability}</span>
              <span className="text-slate-500">{c.invocations} appels · {usd(Number(c.costUsd ?? 0))}</span>
            </div>
          ))}
          <div className="text-[10px] text-slate-400 pt-1">
            Coûts estimés en USD (tarifs Anthropic), facturés sur la clé API du tenant.
          </div>
        </div>
      )}
    </div>
  );
}
