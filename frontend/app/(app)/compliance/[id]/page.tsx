'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'A demarrer', color: 'bg-slate-100 text-slate-700' },
  { value: 'IN_PROGRESS', label: 'En cours', color: 'bg-blue-100 text-blue-700' },
  { value: 'COMPLIANT', label: 'Conforme', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'NON_COMPLIANT', label: 'Ecart', color: 'bg-red-100 text-red-700' },
  { value: 'NOT_APPLICABLE', label: 'Non applicable', color: 'bg-slate-100 text-slate-500' },
];

const CRIT_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-amber-100 text-amber-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  LOW: 'bg-slate-100 text-slate-700',
};

function scoreColor(pct: number) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

export default function ComplianceAssessmentPage() {
  const params = useParams();
  const id = params.id as string;
  const [a, setA] = useState<any>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function load() { setA(await api.get('/compliance/assessments/' + id)); }
  useEffect(() => { load(); }, [id]);

  async function updateControl(caId: string, payload: any) {
    try {
      await api.patch('/compliance/control-assessments/' + caId, payload);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  if (!a) return <div>Chargement...</div>;

  // Group par categorie
  const grouped = new Map<string, any[]>();
  for (const ca of a.controlAssessments) {
    const cat = ca.control.category ?? 'Autre';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(ca);
  }

  return (
    <div className="space-y-6">
      <Link href={'/companies/' + a.company.id} className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour a {a.company.name}
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck size={28} className="text-mdo-600" />
            <h1 className="text-3xl font-bold">{a.framework.name}</h1>
          </div>
          <p className="text-slate-600 mt-1">Client : {a.company.name}</p>
        </div>
        <div className="text-right">
          <div className={'text-5xl font-bold ' + scoreColor(a.scorePct)}>{a.scorePct}%</div>
          <div className="text-xs text-slate-500">{a.compliantCount} conformes / {a.totalControls - a.notApplicableCount} applicables</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <div className="card p-3 text-center"><div className="text-emerald-600 text-2xl font-bold">{a.compliantCount}</div><div className="text-slate-500">Conformes</div></div>
        <div className="card p-3 text-center"><div className="text-red-600 text-2xl font-bold">{a.nonCompliantCount}</div><div className="text-slate-500">Ecarts</div></div>
        <div className="card p-3 text-center"><div className="text-blue-600 text-2xl font-bold">{a.inProgressCount}</div><div className="text-slate-500">En cours</div></div>
        <div className="card p-3 text-center"><div className="text-slate-600 text-2xl font-bold">{a.notStartedCount}</div><div className="text-slate-500">A demarrer</div></div>
        <div className="card p-3 text-center"><div className="text-slate-400 text-2xl font-bold">{a.notApplicableCount}</div><div className="text-slate-500">Non applicables</div></div>
      </div>

      {Array.from(grouped.entries()).map(([cat, items]) => (
        <div key={cat} className="card p-4 space-y-2">
          <h2 className="font-semibold text-sm text-slate-700">{cat}</h2>
          <ul className="space-y-2">
            {items.map((ca: any) => (
              <li key={ca.id} className="border rounded-md p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-slate-500">{ca.control.code}</code>
                      <span className={'badge ' + (CRIT_COLOR[ca.control.criticality] ?? '')}>{ca.control.criticality}</span>
                    </div>
                    <div className="font-medium text-sm mt-1">{ca.control.title}</div>
                    {ca.control.description && (
                      <p className="text-xs text-slate-500 mt-1">{ca.control.description}</p>
                    )}
                    {ca.lastReviewedAt && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Dernier examen : {formatDate(ca.lastReviewedAt)}
                        {ca.reviewedBy && ' par ' + ca.reviewedBy.firstName + ' ' + ca.reviewedBy.lastName}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <select
                      className="input text-xs py-1"
                      value={ca.status}
                      onChange={(e) => updateControl(ca.id, { status: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button
                      onClick={() => setEditing(editing === ca.id ? null : ca.id)}
                      className="text-xs text-mdo-600 hover:underline"
                    >
                      {editing === ca.id ? 'Fermer' : 'Preuves & notes'}
                    </button>
                  </div>
                </div>
                {editing === ca.id && (
                  <EditPanel ca={ca} onSave={(payload) => { updateControl(ca.id, payload); setEditing(null); }} />
                )}
                {(ca.evidence || ca.notes) && editing !== ca.id && (
                  <div className="mt-2 text-xs text-slate-600 space-y-1">
                    {ca.evidence && <div><strong>Preuve :</strong> {ca.evidence}{ca.evidenceUrl && <> · <a href={ca.evidenceUrl} target="_blank" rel="noreferrer" className="text-mdo-600 hover:underline">Lien</a></>}</div>}
                    {ca.notes && <div className="italic">{ca.notes}</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EditPanel({ ca, onSave }: { ca: any; onSave: (p: any) => void }) {
  const [evidence, setEvidence] = useState<string>(ca.evidence ?? '');
  const [evidenceUrl, setEvidenceUrl] = useState<string>(ca.evidenceUrl ?? '');
  const [notes, setNotes] = useState<string>(ca.notes ?? '');
  const [dueDate, setDueDate] = useState<string>(ca.dueDate ? ca.dueDate.slice(0, 10) : '');

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label text-xs">Preuve / reference document</label>
          <input className="input" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Ex: Politique securite v2.3, page 12" />
        </div>
        <div><label className="label text-xs">URL preuve (optionnel)</label>
          <input className="input" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://sharepoint..." />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label text-xs">Notes</label>
          <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div><label className="label text-xs">Echeance prochaine action</label>
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <button
        onClick={() => onSave({ evidence: evidence || null, evidenceUrl: evidenceUrl || null, notes: notes || null, dueDate: dueDate || null })}
        className="btn btn-primary text-xs py-1"
      >
        Enregistrer
      </button>
    </div>
  );
}
