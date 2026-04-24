'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const ROLE_COLOR: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700',
  MANAGER: 'bg-purple-100 text-purple-700',
  SALES: 'bg-blue-100 text-blue-700',
  READONLY: 'bg-slate-100 text-slate-700',
};

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState<any>({ role: 'SALES' });

  async function load() { setUsers(await api.get('/users')); }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/users', newUser);
      toast.success('Utilisateur cree');
      setShowForm(false);
      setNewUser({ role: 'SALES' });
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function toggleActive(u: any) {
    await api.patch('/users/' + u.id, { isActive: !u.isActive });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Utilisateurs</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary"><Plus size={16} className="mr-1" /> Inviter</button>
      </div>
      {showForm && (
        <form onSubmit={create} className="card p-6 space-y-4">
          <h2 className="font-semibold">Nouvel utilisateur</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Prenom *</label><input className="input" required onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })} /></div>
            <div><label className="label">Nom *</label><input className="input" required onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })} /></div>
            <div><label className="label">Email *</label><input type="email" className="input" required onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></div>
            <div><label className="label">Mot de passe initial *</label><input type="password" className="input" required minLength={8} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></div>
            <div><label className="label">Role</label>
              <select className="input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="SALES">Commercial</option>
                <option value="READONLY">Lecture seule</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Creer</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Nom</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Derniere connexion</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3 font-medium">{u.firstName} {u.lastName}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3"><span className={'badge ' + ROLE_COLOR[u.role]}>{u.role}</span></td>
                <td className="p-3">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Jamais'}</td>
                <td className="p-3">{u.isActive ? <span className="badge bg-emerald-100 text-emerald-700">Actif</span> : <span className="badge bg-slate-100 text-slate-700">Desactive</span>}</td>
                <td className="p-3">
                  <button onClick={() => toggleActive(u)} className="text-xs text-mdo-600 hover:underline">
                    {u.isActive ? 'Desactiver' : 'Activer'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
