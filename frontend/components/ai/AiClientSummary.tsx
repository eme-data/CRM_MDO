'use client';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export function AiClientSummary({ companyId }: { companyId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    api.get('/ai/status').then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false));
  }, []);

  if (enabled === null) return null;
  if (!enabled) return null;

  async function run() {
    setBusy(true);
    setSummary(null);
    try {
      const r = await api.post('/ai/summary/company/' + companyId + '?days=' + days);
      setSummary(r.summary ?? '');
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  async function runQbr() {
    setBusy(true);
    setSummary(null);
    try {
      const d = Math.max(30, days); // le QBR couvre au moins 30 jours
      const r = await api.post('/ai/qbr/company/' + companyId + '?days=' + d);
      setSummary(r.qbr ?? '');
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card p-4 bg-purple-50/50 border-purple-200 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2 text-purple-700">
          <Sparkles size={14} /> Synthese IA
        </h3>
        <div className="flex items-center gap-2">
          <select className="input py-1 text-xs" value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
            <option value={7}>7 jours</option>
            <option value={30}>30 jours</option>
            <option value={90}>90 jours</option>
          </select>
          <button onClick={run} disabled={busy} className="btn btn-secondary text-xs py-1">
            {busy ? '...' : 'Synthèse'}
          </button>
          <button onClick={runQbr} disabled={busy} className="btn btn-primary text-xs py-1" title="Compte-rendu trimestriel présentable">
            {busy ? '...' : 'QBR'}
          </button>
        </div>
      </div>
      {summary && (
        <div className="text-sm whitespace-pre-wrap bg-white p-3 rounded border border-purple-200">
          {summary}
        </div>
      )}
    </div>
  );
}
