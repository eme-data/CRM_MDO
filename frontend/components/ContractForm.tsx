'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const OFFER_PRICES: Record<string, number> = {
  MDO_ESSENTIEL: 69,
  MDO_PRO: 99,
  MDO_SOUVERAIN: 139,
  CUSTOM: 0,
};

interface Contract {
  id?: string;
  title?: string;
  offer?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  signedAt?: string;
  engagementMonths?: number;
  billingPeriod?: string;
  unitPriceHt?: number | string;
  quantity?: number;
  setupFeeHt?: number | string | null;
  vatRate?: number | string;
  autoRenew?: boolean;
  noticePeriodMonths?: number;
  companyId?: string;
  description?: string;
}

export function ContractForm({
  contract,
  defaultCompanyId,
  companies,
}: {
  contract?: Contract;
  defaultCompanyId?: string;
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const todayIso = new Date().toISOString().split('T')[0];
  const inOneYear = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];

  const [data, setData] = useState<Contract>(
    contract ?? {
      offer: 'MDO_ESSENTIEL',
      status: 'DRAFT',
      startDate: todayIso,
      endDate: inOneYear,
      engagementMonths: 12,
      billingPeriod: 'MONTHLY',
      unitPriceHt: 69,
      quantity: 1,
      vatRate: 20,
      autoRenew: true,
      noticePeriodMonths: 3,
      companyId: defaultCompanyId,
    },
  );
  const [loading, setLoading] = useState(false);

  function set<K extends keyof Contract>(key: K, value: Contract[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function setOffer(offer: string) {
    setData((d) => ({
      ...d,
      offer,
      unitPriceHt: OFFER_PRICES[offer] ?? d.unitPriceHt ?? 0,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...data,
        unitPriceHt: Number(data.unitPriceHt ?? 0),
        quantity: Number(data.quantity ?? 1),
        engagementMonths: Number(data.engagementMonths ?? 12),
        noticePeriodMonths: Number(data.noticePeriodMonths ?? 3),
        vatRate: Number(data.vatRate ?? 20),
        setupFeeHt: data.setupFeeHt ? Number(data.setupFeeHt) : undefined,
      };
      if (contract?.id) {
        await api.patch('/contracts/' + contract.id, payload);
        toast.success('Contrat mis a jour');
        router.refresh();
      } else {
        const c = await api.post('/contracts', payload);
        toast.success('Contrat cree : ' + c.reference);
        router.push('/contracts/' + c.id);
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const monthly = Number(data.unitPriceHt ?? 0) * Number(data.quantity ?? 1);

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="label">Titre *</label>
          <input className="input" required value={data.title ?? ''} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <label className="label">Societe cliente *</label>
          <select
            className="input"
            required
            value={data.companyId ?? ''}
            onChange={(e) => set('companyId', e.target.value)}
          >
            <option value="">-- Choisir --</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Offre</label>
          <select className="input" value={data.offer ?? 'MDO_ESSENTIEL'} onChange={(e) => setOffer(e.target.value)}>
            <option value="MDO_ESSENTIEL">MDO Essentiel (69 EUR/user/mois)</option>
            <option value="MDO_PRO">MDO Pro (99 EUR/user/mois)</option>
            <option value="MDO_SOUVERAIN">MDO Souverain (139 EUR/user/mois)</option>
            <option value="CUSTOM">Sur mesure</option>
          </select>
        </div>
        <div>
          <label className="label">Statut</label>
          <select className="input" value={data.status ?? 'DRAFT'} onChange={(e) => set('status', e.target.value)}>
            <option value="DRAFT">Brouillon</option>
            <option value="ACTIVE">Actif</option>
            <option value="SUSPENDED">Suspendu</option>
          </select>
        </div>
        <div>
          <label className="label">Periodicite</label>
          <select className="input" value={data.billingPeriod ?? 'MONTHLY'} onChange={(e) => set('billingPeriod', e.target.value)}>
            <option value="MONTHLY">Mensuelle</option>
            <option value="QUARTERLY">Trimestrielle</option>
            <option value="YEARLY">Annuelle</option>
          </select>
        </div>
        <div>
          <label className="label">Date de debut *</label>
          <input type="date" required className="input" value={(data.startDate ?? '').toString().split('T')[0]} onChange={(e) => set('startDate', e.target.value)} />
        </div>
        <div>
          <label className="label">Date de fin *</label>
          <input type="date" required className="input" value={(data.endDate ?? '').toString().split('T')[0]} onChange={(e) => set('endDate', e.target.value)} />
        </div>
        <div>
          <label className="label">Date de signature</label>
          <input type="date" className="input" value={(data.signedAt ?? '').toString().split('T')[0]} onChange={(e) => set('signedAt', e.target.value)} />
        </div>
        <div>
          <label className="label">Duree engagement (mois)</label>
          <input type="number" min={1} className="input" value={data.engagementMonths ?? 12} onChange={(e) => set('engagementMonths', parseInt(e.target.value))} />
        </div>
        <div>
          <label className="label">Preavis (mois)</label>
          <input type="number" min={0} className="input" value={data.noticePeriodMonths ?? 3} onChange={(e) => set('noticePeriodMonths', parseInt(e.target.value))} />
        </div>
        <div>
          <label className="label">Prix unitaire HT (EUR/user/mois)</label>
          <input type="number" min={0} step="0.01" className="input" value={data.unitPriceHt ?? 0} onChange={(e) => set('unitPriceHt', parseFloat(e.target.value))} />
        </div>
        <div>
          <label className="label">Quantite (utilisateurs)</label>
          <input type="number" min={1} className="input" value={data.quantity ?? 1} onChange={(e) => set('quantity', parseInt(e.target.value))} />
        </div>
        <div>
          <label className="label">Frais de mise en service HT</label>
          <input type="number" min={0} step="0.01" className="input" value={data.setupFeeHt ?? ''} onChange={(e) => set('setupFeeHt', e.target.value ? parseFloat(e.target.value) : null)} />
        </div>
        <div>
          <label className="label">TVA (%)</label>
          <input type="number" step="0.1" className="input" value={data.vatRate ?? 20} onChange={(e) => set('vatRate', parseFloat(e.target.value))} />
        </div>
        <div className="md:col-span-2 flex items-center gap-2">
          <input type="checkbox" id="autoRenew" checked={data.autoRenew ?? true} onChange={(e) => set('autoRenew', e.target.checked)} />
          <label htmlFor="autoRenew" className="text-sm">Tacite reconduction</label>
        </div>
        <div className="md:col-span-2">
          <label className="label">Description / clauses</label>
          <textarea className="input min-h-[80px]" value={data.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>
      <div className="card bg-slate-50 p-3 text-sm">
        <strong>Montant mensuel HT calcule : </strong> {monthly.toFixed(2)} EUR
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? 'Enregistrement...' : (contract?.id ? 'Mettre a jour' : 'Creer le contrat')}
        </button>
        <button type="button" onClick={() => router.back()} className="btn btn-secondary">Annuler</button>
      </div>
    </form>
  );
}
