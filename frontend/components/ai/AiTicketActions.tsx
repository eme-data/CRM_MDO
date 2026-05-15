'use client';
import { useEffect, useState } from 'react';
import { Sparkles, Wand2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Props {
  ticketId: string;
  ticketCategory: string;
  ticketPriority: string;
  onApplyTriage: () => void;
  onDraftReady: (draft: string) => void;
}

interface TriageResult {
  suggested: { category: string; priority: string; summary: string; reasoning: string };
  current: { category: string; priority: string };
  raw?: string;
  error?: string;
}

export function AiTicketActions({ ticketId, ticketCategory, ticketPriority, onApplyTriage, onDraftReady }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [busy, setBusy] = useState<'triage' | 'draft' | 'apply' | null>(null);

  useEffect(() => {
    api.get('/ai/status').then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false));
  }, []);

  if (enabled === null) return null;
  if (!enabled) return null;

  async function handleTriage() {
    setBusy('triage');
    try {
      const r = await api.post('/ai/triage/ticket/' + ticketId);
      setTriage(r);
      if (r.error) toast.error('IA : ' + r.error);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    if (!triage?.suggested) return;
    setBusy('apply');
    try {
      await api.post('/ai/triage/ticket/' + ticketId + '/apply', {
        category: triage.suggested.category,
        priority: triage.suggested.priority,
      });
      toast.success('Categorie/priorite appliquees');
      setTriage(null);
      onApplyTriage();
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(null); }
  }

  async function handleDraft() {
    setBusy('draft');
    try {
      const r = await api.post('/ai/draft/ticket/' + ticketId);
      onDraftReady(r.draft ?? '');
      toast.success('Brouillon insere');
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(null); }
  }

  const triageDiff =
    triage?.suggested &&
    (triage.suggested.category !== ticketCategory || triage.suggested.priority !== ticketPriority);

  return (
    <div className="card p-3 bg-purple-50/50 border-purple-200 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
          <Sparkles size={14} /> Assistant IA
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleTriage}
            disabled={busy !== null}
            className="btn btn-secondary text-xs py-1"
          >
            {busy === 'triage' ? 'Analyse...' : 'Suggerer triage'}
          </button>
          <button
            type="button"
            onClick={handleDraft}
            disabled={busy !== null}
            className="btn btn-secondary text-xs py-1"
          >
            <Wand2 size={12} className="mr-1" /> {busy === 'draft' ? 'Redaction...' : 'Brouillon reponse'}
          </button>
        </div>
      </div>
      {triage?.suggested && (
        <div className="text-xs space-y-1 bg-white p-2 rounded border border-purple-200">
          <div>
            <strong>Suggestion :</strong> categorie <code>{triage.suggested.category}</code>, priorite <code>{triage.suggested.priority}</code>
          </div>
          {triage.suggested.summary && <div className="text-slate-600">{triage.suggested.summary}</div>}
          {triage.suggested.reasoning && <div className="text-slate-500 italic">{triage.suggested.reasoning}</div>}
          {triageDiff && (
            <button
              type="button"
              onClick={handleApply}
              disabled={busy !== null}
              className="btn btn-primary text-xs py-1 mt-1"
            >
              <Check size={12} className="mr-1" /> Appliquer
            </button>
          )}
          {!triageDiff && <div className="text-emerald-700 text-xs">Pas de changement suggere — le triage actuel est OK.</div>}
        </div>
      )}
    </div>
  );
}
