'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function NewTicketPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [data, setData] = useState<any>({
    companyId: sp.get('companyId') ?? '',
    priority: 'NORMAL',
    category: 'INCIDENT',
    channel: 'INTERNAL',
  });

  useEffect(() => {
    api.get('/companies?pageSize=500').then((r) => setCompanies(r.items));
    api.get('/users').then(setUsers);
  }, []);

  useEffect(() => {
    if (data.companyId) {
      api.get('/contacts?companyId=' + data.companyId + '&pageSize=200')
        .then((r) => setContacts(r.items));
    } else {
      setContacts([]);
    }
  }, [data.companyId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const t = await api.post('/tickets', data);
      toast.success('Ticket cree : ' + t.reference);
      router.push('/tickets/' + t.id);
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur');
    }
  }

  function set(k: string, v: any) {
    setData((d: any) => ({ ...d, [k]: v }));
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold">Nouveau ticket de support</h1>
      <form onSubmit={submit} className="card p-6 space-y-4">
        <div>
          <label className="label">Titre *</label>
          <input className="input" required onChange={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <label className="label">Description *</label>
          <textarea className="input min-h-[120px]" required onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Societe cliente *</label>
            <select className="input" required value={data.companyId} onChange={(e) => set('companyId', e.target.value)}>
              <option value="">-- Choisir --</option>
              {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Contact</label>
            <select className="input" value={data.contactId ?? ''} onChange={(e) => set('contactId', e.target.value || undefined)}>
              <option value="">-- Aucun --</option>
              {contacts.map((c) => (<option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Categorie</label>
            <select className="input" value={data.category} onChange={(e) => set('category', e.target.value)}>
              <option value="INCIDENT">Incident</option>
              <option value="REQUEST">Demande de service</option>
              <option value="QUESTION">Question</option>
              <option value="BUG">Bug</option>
              <option value="OTHER">Autre</option>
            </select>
          </div>
          <div>
            <label className="label">Priorite</label>
            <select className="input" value={data.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="LOW">Basse</option>
              <option value="NORMAL">Normale</option>
              <option value="HIGH">Haute</option>
              <option value="URGENT">Urgente</option>
            </select>
          </div>
          <div>
            <label className="label">Canal</label>
            <select className="input" value={data.channel} onChange={(e) => set('channel', e.target.value)}>
              <option value="INTERNAL">Interne</option>
              <option value="PORTAL">Portail</option>
              <option value="EMAIL">Email</option>
              <option value="PHONE">Telephone</option>
              <option value="ONSITE">Sur site</option>
            </select>
          </div>
          <div>
            <label className="label">Echeance SLA</label>
            <input type="date" className="input" onChange={(e) => set('dueDate', e.target.value || undefined)} />
          </div>
          <div className="col-span-2">
            <label className="label">Technicien assigne</label>
            <select className="input" value={data.assigneeId ?? ''} onChange={(e) => set('assigneeId', e.target.value || undefined)}>
              <option value="">-- Non assigne --</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Creer le ticket</button>
          <button type="button" onClick={() => router.back()} className="btn btn-secondary">Annuler</button>
        </div>
      </form>
    </div>
  );
}
