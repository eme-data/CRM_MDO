'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function NewContactPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [companies, setCompanies] = useState<any[]>([]);
  const [data, setData] = useState<any>({ companyId: sp.get('companyId') ?? '' });

  useEffect(() => {
    api.get('/companies?pageSize=500').then((res) => setCompanies(res.items));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const c = await api.post('/contacts', data);
      toast.success('Contact cree');
      router.push('/contacts/' + c.id);
    } catch (err: any) { toast.error(err.message); }
  }

  function set(k: string, v: any) { setData((d: any) => ({ ...d, [k]: v })); }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold">Nouveau contact</h1>
      <form onSubmit={submit} className="card p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="label">Prenom *</label><input className="input" required onChange={(e) => set('firstName', e.target.value)} /></div>
          <div><label className="label">Nom *</label><input className="input" required onChange={(e) => set('lastName', e.target.value)} /></div>
          <div><label className="label">Societe</label>
            <select className="input" value={data.companyId} onChange={(e) => set('companyId', e.target.value)}>
              <option value="">-- Aucune --</option>
              {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Poste</label><input className="input" onChange={(e) => set('position', e.target.value)} /></div>
          <div><label className="label">Email</label><input type="email" className="input" onChange={(e) => set('email', e.target.value)} /></div>
          <div><label className="label">Telephone</label><input className="input" onChange={(e) => set('phone', e.target.value)} /></div>
          <div><label className="label">Mobile</label><input className="input" onChange={(e) => set('mobile', e.target.value)} /></div>
          <div className="flex items-center gap-2 mt-6">
            <input type="checkbox" id="prim" onChange={(e) => set('isPrimary', e.target.checked)} />
            <label htmlFor="prim" className="text-sm">Contact principal</label>
          </div>
          <div className="md:col-span-2"><label className="label">Notes</label><textarea className="input min-h-[80px]" onChange={(e) => set('notes', e.target.value)} /></div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Creer</button>
          <button type="button" onClick={() => router.back()} className="btn btn-secondary">Annuler</button>
        </div>
      </form>
    </div>
  );
}
