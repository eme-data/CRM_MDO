'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatEuro, formatDate, stageLabel } from '@/lib/utils';

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [opp, setOpp] = useState<any>(null);

  async function load() { setOpp(await api.get('/opportunities/' + id)); }
  useEffect(() => { load(); }, [id]);

  async function updateStage(stage: string) {
    await api.patch('/opportunities/' + id, { stage });
    toast.success('Etape mise a jour');
    load();
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette opportunite ?')) return;
    await api.delete('/opportunities/' + id);
    toast.success('Opportunite supprimee');
    router.replace('/opportunities');
  }

  if (!opp) return <div>Chargement...</div>;

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
      </div>
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
