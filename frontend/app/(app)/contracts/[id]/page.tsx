'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Edit, Trash2, RefreshCw, XCircle, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { ContractForm } from '@/components/ContractForm';
import {
  formatEuro,
  formatDate,
  daysUntil,
  contractOfferLabel,
  contractStatusLabel,
  contractStatusColor,
} from '@/lib/utils';

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [contract, setContract] = useState<any>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [editing, setEditing] = useState(false);
  const [renewing, setRenewing] = useState(false);

  async function load() {
    const c = await api.get('/contracts/' + id);
    setContract(c);
  }

  useEffect(() => {
    load();
    api.get('/companies?pageSize=500').then((res) => setCompanies(res.items));
  }, [id]);

  async function handleDelete() {
    if (!confirm('Supprimer ce contrat ?')) return;
    await api.delete('/contracts/' + id);
    toast.success('Contrat supprime');
    router.replace('/contracts');
  }

  async function handleTerminate() {
    const reason = prompt('Motif de resiliation ?');
    if (!reason) return;
    await api.post('/contracts/' + id + '/terminate', { reason });
    toast.success('Contrat resilie');
    load();
  }

  async function handleRenew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const startDate = (form.elements.namedItem('startDate') as HTMLInputElement).value;
    const endDate = (form.elements.namedItem('endDate') as HTMLInputElement).value;
    const unitPriceHt = parseFloat((form.elements.namedItem('unitPriceHt') as HTMLInputElement).value);
    const quantity = parseInt((form.elements.namedItem('quantity') as HTMLInputElement).value);
    const n = await api.post('/contracts/' + id + '/renew', { startDate, endDate, unitPriceHt, quantity });
    toast.success('Contrat renouvele : ' + n.reference);
    router.push('/contracts/' + n.id);
  }

  if (!contract) return <div>Chargement...</div>;

  const days = daysUntil(contract.endDate);
  const warning = contract.status === 'ACTIVE' && days <= 90;

  return (
    <div className="space-y-6">
      <Link href="/contracts" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour aux contrats
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold font-mono">{contract.reference}</h1>
            <span className={'badge ' + contractStatusColor[contract.status]}>
              {contractStatusLabel[contract.status]}
            </span>
          </div>
          <p className="text-slate-600 mt-1">{contract.title}</p>
          <Link href={'/companies/' + contract.company.id} className="text-mdo-600 hover:underline text-sm">
            {contract.company.name}
          </Link>
        </div>
        <div className="flex gap-2">
          {!editing && contract.status === 'ACTIVE' && (
            <>
              <button onClick={() => setRenewing(!renewing)} className="btn btn-secondary">
                <RefreshCw size={16} className="mr-1" /> Renouveler
              </button>
              <button onClick={handleTerminate} className="btn btn-secondary">
                <XCircle size={16} className="mr-1" /> Resilier
              </button>
            </>
          )}
          <button onClick={() => setEditing(!editing)} className="btn btn-secondary">
            <Edit size={16} className="mr-1" /> {editing ? 'Annuler' : 'Modifier'}
          </button>
          <button onClick={handleDelete} className="btn btn-danger">
            <Trash2 size={16} className="mr-1" /> Supprimer
          </button>
        </div>
      </div>

      {warning && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-500" />
          <p className="text-sm">
            Ce contrat arrive a echeance dans <strong>{days} jours</strong> ({formatDate(contract.endDate)}).
          </p>
        </div>
      )}

      {renewing && (
        <form onSubmit={handleRenew} className="card p-6 space-y-4 border-mdo-200 bg-mdo-50">
          <h2 className="font-semibold">Renouveler ce contrat</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="label">Debut</label><input name="startDate" type="date" required className="input" defaultValue={contract.endDate.split('T')[0]} /></div>
            <div><label className="label">Fin</label><input name="endDate" type="date" required className="input" /></div>
            <div><label className="label">Prix unit. HT</label><input name="unitPriceHt" type="number" step="0.01" className="input" defaultValue={contract.unitPriceHt} /></div>
            <div><label className="label">Quantite</label><input name="quantity" type="number" className="input" defaultValue={contract.quantity} /></div>
          </div>
          <button type="submit" className="btn btn-primary">Creer le renouvellement</button>
        </form>
      )}

      {editing ? (
        <ContractForm contract={contract} companies={companies} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-6 space-y-2">
            <h2 className="font-semibold mb-2">Contrat</h2>
            <Info label="Offre" value={contractOfferLabel[contract.offer]} />
            <Info label="Debut" value={formatDate(contract.startDate)} />
            <Info label="Fin" value={formatDate(contract.endDate)} />
            <Info label="Signe le" value={contract.signedAt ? formatDate(contract.signedAt) : '-'} />
            <Info label="Duree engagement" value={contract.engagementMonths + ' mois'} />
            <Info label="Preavis" value={contract.noticePeriodMonths + ' mois'} />
            <Info label="Tacite reconduction" value={contract.autoRenew ? 'Oui' : 'Non'} />
          </div>
          <div className="card p-6 space-y-2">
            <h2 className="font-semibold mb-2">Financier</h2>
            <Info label="Prix unitaire HT" value={formatEuro(contract.unitPriceHt)} />
            <Info label="Quantite" value={contract.quantity} />
            <Info label="Mensuel HT" value={formatEuro(contract.monthlyAmountHt)} />
            <Info label="Frais de mise en service" value={contract.setupFeeHt ? formatEuro(contract.setupFeeHt) : '-'} />
            <Info label="TVA" value={contract.vatRate + ' %'} />
            <Info label="Mensuel TTC estime" value={formatEuro(Number(contract.monthlyAmountHt) * (1 + Number(contract.vatRate) / 100))} />
          </div>
          <div className="card p-6 md:col-span-2">
            <h2 className="font-semibold mb-2">Description</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{contract.description || 'Aucune description'}</p>
          </div>
          {contract.alerts && contract.alerts.length > 0 && (
            <div className="card p-6 md:col-span-2">
              <h2 className="font-semibold mb-2">Alertes de renouvellement</h2>
              <ul className="text-sm space-y-1">
                {contract.alerts.map((a: any) => (
                  <li key={a.id} className="flex justify-between">
                    <span>{a.daysBefore} jours avant - prevu le {formatDate(a.alertDate)}</span>
                    <span className="text-slate-500">
                      {a.sentAt ? 'Envoye le ' + formatDate(a.sentAt) : 'En attente'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex text-sm">
      <span className="w-40 text-slate-500">{label}</span>
      <span className="font-medium">{value ?? '-'}</span>
    </div>
  );
}
