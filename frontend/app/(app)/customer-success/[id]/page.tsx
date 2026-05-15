'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, formatEuro } from '@/lib/utils';

export default function ReviewDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [r, setR] = useState<any>(null);

  async function load() { setR(await api.get('/customer-success/' + id)); }
  useEffect(() => { load(); }, [id]);

  async function update(payload: any) {
    try { await api.patch('/customer-success/' + id, payload); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  async function refreshAgenda() {
    try { await api.post('/customer-success/' + id + '/refresh-agenda'); toast.success('Agenda regenere'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  if (!r) return <div>Chargement...</div>;

  const a = r.agendaItems ?? {};

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/customer-success" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour QBR
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Calendar size={28} className="text-mdo-600" /> QBR — {r.company.name}
          </h1>
          <p className="text-slate-600 mt-1">
            Prevue le <strong>{formatDate(r.scheduledAt)}</strong>
            {r.heldAt && ' · tenue le ' + formatDate(r.heldAt)}
            {r.owner && ' · ' + r.owner.firstName + ' ' + r.owner.lastName}
          </p>
        </div>
        <div className="flex gap-2">
          {r.status === 'SCHEDULED' && (
            <>
              <button onClick={() => update({ status: 'COMPLETED' })} className="btn btn-primary">
                <CheckCircle2 size={14} className="mr-1" /> Marquer tenue
              </button>
              <button onClick={() => update({ status: 'CANCELLED' })} className="btn btn-secondary">
                <XCircle size={14} className="mr-1" /> Annuler
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Agenda pre-genere</h2>
          <button onClick={refreshAgenda} className="btn btn-secondary text-xs"><RefreshCw size={12} className="mr-1" /> Regenerer</button>
        </div>

        {a.expiringContracts && a.expiringContracts.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-amber-700">Contrats expirant dans 90 jours</h3>
            <ul className="text-sm mt-1 space-y-0.5">
              {a.expiringContracts.map((c: any, i: number) => (
                <li key={i}>{c.reference} — fin {formatDate(c.endDate)} ({formatEuro(c.monthlyAmount)} HT/mois)</li>
              ))}
            </ul>
          </div>
        )}

        {a.openOpportunities && a.openOpportunities.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-mdo-700">Opportunites en cours</h3>
            <ul className="text-sm mt-1 space-y-0.5">
              {a.openOpportunities.map((o: any, i: number) => (
                <li key={i}>{o.title} — {o.stage} — {formatEuro(o.amount)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 text-sm pt-2 border-t">
          <div><span className="text-slate-500">Factures impayees :</span> <strong>{a.unpaidInvoicesCount ?? 0}</strong></div>
          <div><span className="text-slate-500">Tickets 90j :</span> <strong>{a.ticketsLast90d ?? 0}</strong></div>
          <div><span className="text-slate-500">Derniere intervention :</span> <strong>{a.lastInterventionAt ? formatDate(a.lastInterventionAt) : 'jamais'}</strong></div>
        </div>
      </div>

      {r.status === 'COMPLETED' || r.notes !== null || r.satisfactionScore !== null ? (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold">Compte-rendu</h2>
          <textarea
            className="input min-h-[160px]"
            placeholder="Notes de la reunion (decisions, prochaines actions, ressentis client...)"
            defaultValue={r.notes ?? ''}
            onBlur={(e) => update({ notes: e.target.value })}
          />
          <div className="flex items-center gap-3">
            <label className="text-sm">Satisfaction client (0-10) :</label>
            <input
              type="number" min={0} max={10}
              className="input max-w-[80px]"
              defaultValue={r.satisfactionScore ?? ''}
              onBlur={(e) => update({ satisfactionScore: e.target.value === '' ? null : parseInt(e.target.value) })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
