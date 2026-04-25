'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Shield, Copy } from 'lucide-react';
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
    } catch (err: any) { toast.error(err.message); }
  }

  async function submitSignature(e: React.FormEvent) {
    e.preventDefault();
    setSavingSig(true);
    try {
      const updated = await api.patch('/users/me/profile', { signature: signature.trim() || null });
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

      <MfaSection />

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
          <input type="password" required className="input" value={pwd.oldPassword} onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })} />
        </div>
        <div>
          <label className="label">Nouveau mot de passe</label>
          <input type="password" required minLength={8} className="input" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
        </div>
        <button type="submit" className="btn btn-primary">Changer</button>
      </form>
    </div>
  );
}

function MfaSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ qr: string; recoveryCodes: string[] } | null>(null);
  const [code, setCode] = useState('');

  async function load() {
    const s = await api.get('/mfa/status');
    setEnabled(s.enabled);
  }
  useEffect(() => { load(); }, []);

  async function startSetup() {
    const r = await api.post('/mfa/setup');
    setSetup(r);
  }

  async function confirmEnable() {
    try {
      await api.post('/mfa/enable', { code });
      toast.success('2FA activee');
      setSetup(null);
      setCode('');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function disable() {
    const c = prompt('Entrez votre code TOTP pour desactiver la 2FA');
    if (!c) return;
    try {
      await api.post('/mfa/disable', { code: c });
      toast.success('2FA desactivee');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          {enabled ? <ShieldCheck size={18} className="text-emerald-600" /> : <Shield size={18} className="text-slate-400" />}
          Authentification a deux facteurs (2FA)
        </h2>
        {enabled === false && !setup && (
          <button onClick={startSetup} className="btn btn-primary">Activer la 2FA</button>
        )}
        {enabled === true && (
          <button onClick={disable} className="btn btn-danger">Desactiver</button>
        )}
      </div>
      <p className="text-sm text-slate-500">
        Recommandee, surtout pour les comptes administrateurs. Compatible Google Authenticator, 1Password, Authy, etc.
      </p>

      {setup && (
        <div className="border border-mdo-200 dark:border-mdo-700 bg-mdo-50 dark:bg-mdo-900/20 rounded p-4 space-y-3">
          <p className="text-sm">
            1. Scannez ce QR code avec votre application authentificateur :
          </p>
          <img src={setup.qr} alt="QR 2FA" className="bg-white p-2 rounded inline-block" />
          <p className="text-sm">
            2. Entrez le code a 6 chiffres affiche par l'app :
          </p>
          <div className="flex gap-2 max-w-xs">
            <input
              className="input font-mono text-center text-lg tracking-wider"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
            />
            <button onClick={confirmEnable} className="btn btn-primary">Activer</button>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-3 text-xs">
            <p className="font-semibold mb-2">Codes de recuperation (a noter quelque part de sur)</p>
            <p className="text-amber-800 dark:text-amber-200 mb-2">
              Si vous perdez votre telephone, ces codes vous permettent de vous reconnecter (chacun n'est utilisable qu'une fois).
            </p>
            <ul className="grid grid-cols-2 gap-1 font-mono">
              {setup.recoveryCodes.map((c, i) => (
                <li key={i} className="bg-white dark:bg-slate-800 p-1 rounded text-center">{c}</li>
              ))}
            </ul>
            <button
              onClick={() => { navigator.clipboard.writeText(setup.recoveryCodes.join('\n')); toast.success('Copie'); }}
              className="mt-2 text-xs text-mdo-600 hover:underline inline-flex items-center gap-1"
            >
              <Copy size={12} /> Copier les codes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
