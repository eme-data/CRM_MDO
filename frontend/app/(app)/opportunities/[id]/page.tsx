'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatEuro, formatDate, stageLabel } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [opp, setOpp] = useState<any>(null);
  const [showWinForm, setShowWinForm] = useState(false);
  const [showLossForm, setShowLossForm] = useState(false);
  const confirm = useConfirm();

  async function load() { setOpp(await api.get('/opportunities/' + id)); }
  useEffect(() => { load(); }, [id]);

  async function updateStage(stage: string) {
    // Pour GAGNE/PERDU, on demande aussi le motif structure (si pas deja set)
    if (stage === 'GAGNE' && !opp.winReasonCode) {
      setShowWinForm(true);
      return;
    }
    if (stage === 'PERDU' && !opp.lossReasonCode) {
      setShowLossForm(true);
      return;
    }
    await api.patch('/opportunities/' + id, { stage });
    toast.success('Etape mise a jour');
    load();
  }

  async function submitWinReason(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const winReasonCode = (f.elements.namedItem('winReasonCode') as HTMLSelectElement).value;
    await api.patch('/opportunities/' + id, { stage: 'GAGNE', winReasonCode });
    toast.success('Marque comme GAGNE');
    setShowWinForm(false);
    load();
  }

  async function submitLossReason(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const lossReasonCode = (f.elements.namedItem('lossReasonCode') as HTMLSelectElement).value;
    const competitorName = (f.elements.namedItem('competitorName') as HTMLInputElement).value || undefined;
    const lostReason = (f.elements.namedItem('lostReason') as HTMLTextAreaElement).value || undefined;
    await api.patch('/opportunities/' + id, { stage: 'PERDU', lossReasonCode, competitorName, lostReason });
    toast.success('Marque comme PERDU');
    setShowLossForm(false);
    load();
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Supprimer cette opportunite ?',
      message: `« ${opp?.title ?? 'Cette opportunite'} » sera definitivement supprimee.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete('/opportunities/' + id);
      toast.success('Opportunite supprimee');
      router.replace('/opportunities');
    } catch (err: any) { toast.error(err.message); }
  }

  if (!opp) return (
    <div className="space-y-6 max-w-4xl">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-80" />
      <div className="card p-6 grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5" />)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/opportunities" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour
      </Link>
      <div className="flex justify-between">
        <div>
          <h1 className="text-3xl font-bold">{opp.title}</h1>
          <Link href={'/companies/' + opp.company.id} className="text-mdo-600 hover:underline text-sm">{opp.company.name}</Link>
        </div>
        <button onClick={handleDelete} className="btn btn-danger"><Trash2 size={16} className="mr-1" /> Supprimer</button>
      </div>
      <div className="card p-6 grid grid-cols-2 gap-4 text-sm">
        <Info label="Montant HT" value={formatEuro(opp.amountHt)} />
        <Info label="Probabilite" value={opp.probability + ' %'} />
        <Info label="Cloture prevue" value={opp.expectedCloseDate ? formatDate(opp.expectedCloseDate) : '-'} />
        <Info label="Cloturee le" value={opp.closedAt ? formatDate(opp.closedAt) : '-'} />
      </div>
      <div className="card p-6">
        <h2 className="font-semibold mb-2">Etape</h2>
        <div className="flex gap-2 flex-wrap">
          {['QUALIFICATION', 'PROPOSITION', 'NEGOCIATION', 'GAGNE', 'PERDU'].map((s) => (
            <button
              key={s}
              onClick={() => updateStage(s)}
              className={'btn ' + (opp.stage === s ? 'btn-primary' : 'btn-secondary')}
            >
              {stageLabel[s]}
            </button>
          ))}
        </div>
        {(opp.winReasonCode || opp.lossReasonCode) && (
          <div className="mt-3 text-xs text-slate-600">
            {opp.winReasonCode && <span>Motif gain : <strong>{opp.winReasonCode}</strong></span>}
            {opp.lossReasonCode && (
              <span>
                Motif perte : <strong>{opp.lossReasonCode}</strong>
                {opp.competitorName && ' - concurrent : ' + opp.competitorName}
              </span>
            )}
          </div>
        )}
      </div>

      {showWinForm && (
        <form onSubmit={submitWinReason} className="card p-6 space-y-3 border-emerald-200 bg-emerald-50">
          <h3 className="font-semibold">Pourquoi avons-nous gagne ?</h3>
          <select name="winReasonCode" required className="input">
            <option value="">-- Choisir --</option>
            <option value="PRICE_LOWEST">Prix le plus bas</option>
            <option value="REPUTATION">Notoriete MDO</option>
            <option value="RELATIONSHIP">Relation existante / confiance</option>
            <option value="FEATURE">Fonctionnalite distinctive</option>
            <option value="PROXIMITY">Proximite / disponibilite</option>
            <option value="REFERRAL">Recommandation</option>
            <option value="OTHER">Autre</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Marquer GAGNE</button>
            <button type="button" onClick={() => setShowWinForm(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      {showLossForm && (
        <form onSubmit={submitLossReason} className="card p-6 space-y-3 border-red-200 bg-red-50">
          <h3 className="font-semibold">Pourquoi avons-nous perdu ?</h3>
          <select name="lossReasonCode" required className="input">
            <option value="">-- Choisir --</option>
            <option value="PRICE">Prix trop eleve</option>
            <option value="COMPETITOR">Concurrent retenu</option>
            <option value="TIMING">Mauvais timing</option>
            <option value="FEATURE">Fonctionnalite manquante</option>
            <option value="NO_RESPONSE">Pas de reponse</option>
            <option value="BUDGET">Pas de budget</option>
            <option value="PROJECT_CANCELLED">Projet annule</option>
            <option value="OTHER">Autre</option>
          </select>
          <input name="competitorName" className="input" placeholder="Nom du concurrent (si applicable)" />
          <textarea name="lostReason" className="input min-h-[60px]" placeholder="Detail / commentaire libre" />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Marquer PERDU</button>
            <button type="button" onClick={() => setShowLossForm(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}
      {opp.description && (
        <div className="card p-6">
          <h2 className="font-semibold mb-2">Description</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{opp.description}</p>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (<div className="flex"><span className="w-32 text-slate-500">{label}</span><span className="font-medium">{value ?? '-'}</span></div>);
}
