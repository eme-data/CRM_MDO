'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Company {
  id?: string;
  name?: string;
  siret?: string;
  sector?: string;
  status?: string;
  employees?: number;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  notes?: string;
}

export function CompanyForm({ company }: { company?: Company }) {
  const router = useRouter();
  const [data, setData] = useState<Company>(company ?? { sector: 'PME', status: 'LEAD', country: 'France' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (company?.id) {
        await api.patch('/companies/' + company.id, data);
        toast.success('Societe mise a jour');
      } else {
        const c = await api.post('/companies', data);
        toast.success('Societe creee');
        router.push('/companies/' + c.id);
        return;
      }
      router.refresh();
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof Company>(key: K, value: Company[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Nom *</label>
          <input className="input" required value={data.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label">SIRET</label>
          <input className="input" value={data.siret ?? ''} onChange={(e) => set('siret', e.target.value)} />
        </div>
        <div>
          <label className="label">Secteur</label>
          <select className="input" value={data.sector ?? 'PME'} onChange={(e) => set('sector', e.target.value)}>
            <option value="PME">PME</option>
            <option value="TPE">TPE</option>
            <option value="COLLECTIVITE">Collectivite</option>
            <option value="SANTE">Sante</option>
            <option value="INDUSTRIE">Industrie</option>
            <option value="EDUCATION">Education</option>
            <option value="ASSOCIATION">Association</option>
            <option value="AUTRE">Autre</option>
          </select>
        </div>
        <div>
          <label className="label">Statut</label>
          <select className="input" value={data.status ?? 'LEAD'} onChange={(e) => set('status', e.target.value)}>
            <option value="LEAD">Lead</option>
            <option value="PROSPECT">Prospect</option>
            <option value="CUSTOMER">Client</option>
            <option value="INACTIVE">Inactif</option>
          </select>
        </div>
        <div>
          <label className="label">Nb employes</label>
          <input type="number" className="input" value={data.employees ?? ''} onChange={(e) => set('employees', e.target.value ? parseInt(e.target.value) : undefined)} />
        </div>
        <div>
          <label className="label">Site web</label>
          <input className="input" value={data.website ?? ''} onChange={(e) => set('website', e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={data.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label className="label">Telephone</label>
          <input className="input" value={data.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Adresse</label>
          <input className="input" value={data.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div>
          <label className="label">Code postal</label>
          <input className="input" value={data.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} />
        </div>
        <div>
          <label className="label">Ville</label>
          <input className="input" value={data.city ?? ''} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Notes</label>
          <textarea className="input min-h-[80px]" value={data.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? 'Enregistrement...' : (company?.id ? 'Mettre a jour' : 'Creer')}
        </button>
        <button type="button" onClick={() => router.back()} className="btn btn-secondary">Annuler</button>
      </div>
    </form>
  );
}
