'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function NewOpportunityPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<any[]>([]);
  const [data, setData] = useState<any>({ stage: 'QUALIFICATION', probability: 50 });

  useEffect(() => { api.get('/companies?pageSize=500').then((r) => setCompanies(r.items)); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const o = await api.post('/opportunities', { ...data, amountHt: Number(data.amountHt ?? 0) });
      toast.success('Opportunite creee');
      router.push('/opportunities/' + o.id);
    } catch (err: any) { toast.error(err.message); }
  }

  function set(k: string, v: any) { setData((d: any) => ({ ...d, [k]: v })); }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold">Nouvelle opportunite</h1>
      <form onSubmit={submit} className="card p-6 space-y-4">
        <div><label className="label">Titre *</label><input className="input" required onChange={(e) => set('title', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Societe *</label>
            <select className="input" required onChange={(e) => set('companyId', e.target.value)}>
              <option value="">-- Choisir --</option>
              {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Etape</label>
            <select className="input" value={data.stage} onChange={(e) => set('stage', e.target.value)}>
              <option value="QUALIFICATION">Qualification</option>
              <option value="PROPOSITION">Proposition</option>
              <option value="NEGOCIATION">Negociation</option>
              <option value="GAGNE">Gagne</option>
              <option value="PERDU">Perdu</option>
            </select>
          </div>
          <div><label className="label">Montant HT</label><input type="number" step="0.01" className="input" onChange={(e) => set('amountHt', parseFloat(e.target.value))} /></div>
          <div><label className="label">Probabilite (%)</label><input type="number" min={0} max={100} className="input" value={data.probability} onChange={(e) => set('probability', parseInt(e.target.value))} /></div>
          <div><label className="label">Cloture prevue</label><input type="date" className="input" onChange={(e) => set('expectedCloseDate', e.target.value)} /></div>
        </div>
        <div><label className="label">Description</label><textarea className="input min-h-[80px]" onChange={(e) => set('description', e.target.value)} /></div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Creer</button>
          <button type="button" onClick={() => router.back()} className="btn btn-secondary">Annuler</button>
        </div>
      </form>
    </div>
  );
}
