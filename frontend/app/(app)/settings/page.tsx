'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/auth/change-password', pwd);
      toast.success('Mot de passe change');
      setPwd({ oldPassword: '', newPassword: '' });
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">Parametres</h1>
      <form onSubmit={submit} className="card p-6 space-y-4">
        <h2 className="font-semibold">Changer mon mot de passe</h2>
        <div><label className="label">Ancien mot de passe</label><input type="password" required className="input" value={pwd.oldPassword} onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })} /></div>
        <div><label className="label">Nouveau mot de passe</label><input type="password" required minLength={8} className="input" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} /></div>
        <button type="submit" className="btn btn-primary">Changer</button>
      </form>
    </div>
  );
}
