'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Wand2, Check, FileText, BookOpen, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Props {
  ticketId: string;
  ticketCategory: string;
  ticketPriority: string;
  messageCount: number;
  onApplyTriage: () => void;
  onDraftReady: (draft: string) => void;
}

interface TriageResult {
  suggested: { category: string; priority: string; summary: string; reasoning: string };
  current: { category: string; priority: string };
  raw?: string;
  error?: string;
}

interface DraftSources {
  kb: Array<{ id: string; title: string; slug: string }>;
  similarTickets: Array<{ id: string; reference: string; title: string }>;
  keywords: string[];
}

// Seuil au-dela duquel le bouton "Resumer le fil" devient pertinent. En-dessous,
// le tech relit le fil plus vite que l'IA ne genere le resume.
const SUMMARY_THRESHOLD = 4;

export function AiTicketActions({
  ticketId,
  ticketCategory,
  ticketPriority,
  messageCount,
  onApplyTriage,
  onDraftReady,
}: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [draftSources, setDraftSources] = useState<DraftSources | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState<'triage' | 'draft' | 'apply' | 'summary' | null>(null);

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
    setDraftSources(null);
    try {
      const r = await api.post('/ai/draft/ticket/' + ticketId);
      onDraftReady(r.draft ?? '');
      setDraftSources(r.sources ?? null);
      toast.success('Brouillon insere');
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(null); }
  }

  async function handleSummary() {
    setBusy('summary');
    try {
      const r = await api.post('/ai/summary/ticket/' + ticketId);
      setSummary(r.summary ?? '');
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(null); }
  }

  const triageDiff =
    triage?.suggested &&
    (triage.suggested.category !== ticketCategory || triage.suggested.priority !== ticketPriority);

  const showSummaryButton = messageCount >= SUMMARY_THRESHOLD;
  const hasDraftContext =
    draftSources && (draftSources.kb.length > 0 || draftSources.similarTickets.length > 0);

  return (
    <div className="card p-3 bg-purple-50/50 border-purple-200 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
          <Sparkles size={14} /> Assistant IA
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleTriage}
            disabled={busy !== null}
            className="btn btn-secondary text-xs py-1"
          >
            {busy === 'triage' ? 'Analyse...' : 'Suggerer triage'}
          </button>
          {showSummaryButton && (
            <button
              type="button"
              onClick={handleSummary}
              disabled={busy !== null}
              className="btn btn-secondary text-xs py-1"
              title={`Resumer les ${messageCount} messages du fil`}
            >
              <FileText size={12} className="mr-1" /> {busy === 'summary' ? 'Resume...' : 'Resumer le fil'}
            </button>
          )}
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

      {summary && (
        <div className="text-xs bg-white p-3 rounded border border-purple-200 space-y-1">
          <div className="flex justify-between items-center">
            <strong className="text-purple-700">Resume du fil</strong>
            <button
              type="button"
              onClick={() => setSummary(null)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              fermer
            </button>
          </div>
          <div className="text-slate-700 whitespace-pre-wrap">{summary}</div>
        </div>
      )}

      {hasDraftContext && (
        <div className="text-xs bg-white p-2 rounded border border-purple-200 space-y-1">
          <div className="text-purple-700 font-medium">Brouillon genere a partir de :</div>
          {draftSources!.kb.length > 0 && (
            <div className="flex items-start gap-1">
              <BookOpen size={12} className="mt-0.5 text-slate-400 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {draftSources!.kb.map((k) => (
                  <Link
                    key={k.id}
                    href={'/kb/' + k.slug}
                    className="text-mdo-600 hover:underline"
                    title="Voir l'article KB"
                  >
                    {k.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {draftSources!.similarTickets.length > 0 && (
            <div className="flex items-start gap-1">
              <Hash size={12} className="mt-0.5 text-slate-400 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {draftSources!.similarTickets.map((t) => (
                  <Link
                    key={t.id}
                    href={'/tickets/' + t.id}
                    className="text-mdo-600 hover:underline font-mono"
                    title={t.title}
                  >
                    {t.reference}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
