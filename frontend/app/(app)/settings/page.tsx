'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '' });
  const [profile, setProfile] = useState<any>(null);
  const [signature, setSignature] = useState('');
  const [savingSig, setSavingSig] = useState(false);

  useEffect(() => {
    api.get('/users/me/profile').then((p) => {
      setProfile(p);
      setSignature(p.signature ?? '');
    });
  }, []);

  async function submitPwd(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/auth/change-password', pwd);
      toast.success('Mot de passe change');
      setPwd({ oldPassword: '', newPassword: '' });
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function submitSignature(e: React.FormEvent) {
    e.preventDefault();
    setSavingSig(true);
    try {
      const updated = await api.patch('/users/me/profile', {
        signature: signature.trim() || null,
      });
      setProfile(updated);
      toast.success('Signature enregistree');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingSig(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">Parametres</h1>

      <form onSubmit={submitSignature} className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold">Signature email</h2>
          <p className="text-sm text-slate-500 mt-1">
            Apparait au bas de vos reponses sortantes aux tickets de support.
          </p>
        </div>
        <textarea
          className="input min-h-[140px] font-mono text-sm"
          placeholder={profile ? `${profile.firstName} ${profile.lastName}\nMDO Services\n+33 X XX XX XX XX\nhttps://www.mdoservices.fr` : 'Chargement...'}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
        />
        <button type="submit" disabled={savingSig} className="btn btn-primary">
          {savingSig ? 'Enregistrement...' : 'Enregistrer la signature'}
        </button>
      </form>

      <form onSubmit={submitPwd} className="card p-6 space-y-4">
        <h2 className="font-semibold">Changer mon mot de passe</h2>
        <div>
          <label className="label">Ancien mot de passe</label>
          <input
            type="password"
            required
            className="input"
            value={pwd.oldPassword}
            onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Nouveau mot de passe</label>
          <input
            type="password"
            required
            minLength={8}
            className="input"
            value={pwd.newPassword}
            onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Changer
        </button>
      </form>
    </div>
  );
}
