'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Clock,
  Download,
  CheckCircle2,
  RotateCcw,
  ChevronRight,
  Search,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatEuro, formatDate } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface CompanyBucket {
  companyId: string | null;
  companyName: string;
  totalMin: number;
  billedMin: number;
  unbilledMin: number;
  estimatedHt: number;
  entries: number;
}

interface DetailEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
  description: string | null;
  hourlyRateHt: string | number | null;
  invoicedAt: string | null;
  invoiceReference: string | null;
  user: { firstName: string; lastName: string };
  ticket: { reference: string; title: string } | null;
  intervention: { title: string } | null;
  contract: { reference: string } | null;
}

function fmtHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function defaultPeriod() {
  // Mois precedent (cas le plus frequent : "je facture le mois ecoule")
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-indexed, donc m-1
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0); // dernier jour du mois precedent
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

export default function TimeBillingPage() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [onlyUnbilled, setOnlyUnbilled] = useState(true);
  const [buckets, setBuckets] = useState<CompanyBucket[] | null>(null);
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invoiceRef, setInvoiceRef] = useState('');
  const confirm = useConfirm();

  async function load() {
    const qs = new URLSearchParams({
      from: period.from,
      to: period.to,
      onlyUnbilled: onlyUnbilled ? 'true' : 'false',
    });
    setBuckets(await api.get('/time-entries/billing/by-company?' + qs));
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period.from, period.to, onlyUnbilled]);

  async function openDetail(companyId: string | null) {
    if (!companyId) return;
    if (openCompany === companyId) {
      setOpenCompany(null);
      setDetail([]);
      setSelected(new Set());
      return;
    }
    const qs = new URLSearchParams({
      from: period.from,
      to: period.to,
      onlyUnbilled: onlyUnbilled ? 'true' : 'false',
    });
    const items = await api.get(`/time-entries/billing/companies/${companyId}?${qs}`);
    setDetail(items);
    setOpenCompany(companyId);
    setSelected(new Set());
  }

  function toggleEntry(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === detail.filter((e) => !e.invoicedAt).length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(detail.filter((e) => !e.invoicedAt).map((e) => e.id)));
    }
  }

  async function markInvoiced() {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: `Marquer ${selected.size} saisie(s) comme facturees ?`,
      message: 'Cette action est utile une fois la facture creee dans Sellsy/Qonto. Les saisies disparaissent du filtre "non facturees" mais restent visibles globalement.',
      confirmLabel: 'Marquer',
      tone: 'info',
    });
    if (!ok) return;
    try {
      const r = await api.post('/time-entries/billing/mark-invoiced', {
        ids: Array.from(selected),
        invoiceReference: invoiceRef.trim() || undefined,
      });
      toast.success(`${r.updated} saisie(s) marquees comme facturees`);
      setSelected(new Set());
      setInvoiceRef('');
      if (openCompany) await openDetail(openCompany);
      else await load();
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function unmarkInvoiced(id: string) {
    const ok = await confirm({
      title: 'Annuler le marquage facture ?',
      message: 'La saisie redeviendra "non facturee" et pourra etre re-incluse dans un futur export.',
      confirmLabel: 'Annuler le marquage',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await api.post('/time-entries/billing/unmark-invoiced', { ids: [id] });
      toast.success('Marquage annule');
      if (openCompany) openDetail(openCompany);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  function downloadCsv(companyId: string) {
    const token = localStorage.getItem('crm_mdo_access_token');
    const qs = new URLSearchParams({
      from: period.from,
      to: period.to,
      onlyUnbilled: onlyUnbilled ? 'true' : 'false',
    });
    fetch(`/api/time-entries/billing/companies/${companyId}/export.csv?${qs}`, {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `time-${period.from}-${period.to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  const totals = buckets?.reduce(
    (acc, b) => ({
      totalMin: acc.totalMin + b.totalMin,
      unbilledMin: acc.unbilledMin + b.unbilledMin,
      estimatedHt: acc.estimatedHt + b.estimatedHt,
    }),
    { totalMin: 0, unbilledMin: 0, estimatedHt: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Facturation du temps</h1>
        <p className="text-sm text-slate-500 mt-1">
          Agregat par client des heures facturables sur la periode. Export CSV pour copier-coller dans Sellsy / Qonto.
        </p>
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Du</label>
          <input type="date" className="input" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} />
        </div>
        <div>
          <label className="label">Au</label>
          <input type="date" className="input" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={onlyUnbilled}
            onChange={(e) => setOnlyUnbilled(e.target.checked)}
          />
          Uniquement les non-facturees
        </label>
        <div className="ml-auto flex items-end gap-2">
          {totals && (
            <div className="text-sm text-right">
              <div>Total : <strong>{fmtHm(totals.totalMin)}</strong></div>
              <div className="text-slate-500">Non facture : {fmtHm(totals.unbilledMin)} · estime {formatEuro(totals.estimatedHt)}</div>
            </div>
          )}
        </div>
      </div>

      {buckets === null ? (
        <div className="card p-6">Chargement...</div>
      ) : buckets.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Aucune saisie facturable sur la periode"
          description="Pointez votre temps sur les tickets et interventions pour alimenter ce tableau."
        />
      ) : (
        <div className="card divide-y divide-slate-200 dark:divide-slate-700">
          {buckets.map((b, idx) => {
            const isOpen = b.companyId !== null && openCompany === b.companyId;
            return (
              <div key={idx}>
                <button
                  onClick={() => openDetail(b.companyId)}
                  disabled={!b.companyId}
                  className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/30 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {b.companyId && (
                      <ChevronRight size={16} className={'shrink-0 transition-transform ' + (isOpen ? 'rotate-90' : '')} />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{b.companyName}</p>
                      <p className="text-xs text-slate-500">{b.entries} saisie(s) · {fmtHm(b.totalMin)} total</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm shrink-0">
                    {b.unbilledMin > 0 && (
                      <span className="text-amber-600 font-medium">{fmtHm(b.unbilledMin)} a facturer</span>
                    )}
                    {b.estimatedHt > 0 && (
                      <span className="text-slate-500">{formatEuro(b.estimatedHt)}</span>
                    )}
                    {b.companyId && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); downloadCsv(b.companyId!); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); downloadCsv(b.companyId!); } }}
                        className="inline-flex items-center gap-1 text-mdo-600 hover:text-mdo-700 cursor-pointer"
                        aria-label={`Exporter CSV pour ${b.companyName}`}
                      >
                        <Download size={14} /> CSV
                      </span>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
                    {selected.size > 0 && (
                      <div className="card p-3 flex flex-wrap items-center gap-2 bg-mdo-50 dark:bg-mdo-900/20 border-mdo-200">
                        <span className="text-sm font-medium">{selected.size} selectionnee(s)</span>
                        <input
                          type="text"
                          placeholder="Reference facture (optionnel)"
                          value={invoiceRef}
                          onChange={(e) => setInvoiceRef(e.target.value)}
                          className="input text-xs py-1 max-w-[220px]"
                        />
                        <button onClick={markInvoiced} className="btn btn-primary text-xs py-1">
                          <CheckCircle2 size={12} className="mr-1" /> Marquer comme facture(es)
                        </button>
                        <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:underline">Annuler</button>
                      </div>
                    )}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-slate-500">
                          <th className="p-2 w-8">
                            <input
                              type="checkbox"
                              checked={detail.length > 0 && selected.size === detail.filter((e) => !e.invoicedAt).length}
                              onChange={toggleAll}
                              aria-label="Tout selectionner"
                            />
                          </th>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-left">Description</th>
                          <th className="p-2 text-left">Technicien</th>
                          <th className="p-2 text-right">Duree</th>
                          <th className="p-2 text-right">Taux HT</th>
                          <th className="p-2 text-right">Montant HT</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.map((e) => {
                          const rate = e.hourlyRateHt ? Number(e.hourlyRateHt) : 0;
                          const amount = rate * ((e.durationMin ?? 0) / 60);
                          const desc = e.description ?? e.ticket?.title ?? e.intervention?.title ?? '-';
                          const ref = e.ticket?.reference ?? e.contract?.reference;
                          return (
                            <tr key={e.id} className={'border-t border-slate-200 dark:border-slate-700 ' + (e.invoicedAt ? 'opacity-60' : '')}>
                              <td className="p-2">
                                {!e.invoicedAt && (
                                  <input
                                    type="checkbox"
                                    checked={selected.has(e.id)}
                                    onChange={() => toggleEntry(e.id)}
                                    aria-label="Selectionner"
                                  />
                                )}
                              </td>
                              <td className="p-2 whitespace-nowrap">{formatDate(e.startedAt)}</td>
                              <td className="p-2">
                                {desc}
                                {ref && <span className="ml-2 text-xs text-slate-400 font-mono">{ref}</span>}
                                {e.invoiceReference && (
                                  <span className="ml-2 badge bg-emerald-100 text-emerald-700 text-[10px]">Fact. {e.invoiceReference}</span>
                                )}
                              </td>
                              <td className="p-2 text-slate-500">{e.user.firstName} {e.user.lastName[0]}.</td>
                              <td className="p-2 text-right tabular-nums">{fmtHm(e.durationMin ?? 0)}</td>
                              <td className="p-2 text-right tabular-nums">{rate ? rate.toFixed(2) + ' EUR' : '-'}</td>
                              <td className="p-2 text-right tabular-nums font-medium">{amount ? formatEuro(amount) : '-'}</td>
                              <td className="p-2 text-right">
                                {e.invoicedAt && (
                                  <button onClick={() => unmarkInvoiced(e.id)} aria-label="Annuler le marquage facture" className="text-slate-400 hover:text-amber-600" title="Annuler le marquage facture">
                                    <RotateCcw size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
