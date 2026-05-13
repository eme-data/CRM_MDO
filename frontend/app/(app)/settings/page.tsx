'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldCheck, Shield, Copy, Download, X, AlertTriangle } from 'lucide-react';
import { api, setTokens } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';

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
  const [busy, setBusy] = useState(false);
  const [disablePromptOpen, setDisablePromptOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  // Si l'utilisateur arrive depuis le login avec ?mfaSetup=1 (compte sans 2FA active
  // mais role exigeant la 2FA), on declenche automatiquement le flow d'activation.
  const requireSetup = searchParams.get('mfaSetup') === '1';

  async function load() {
    try {
      const s = await api.get('/mfa/status');
      setEnabled(s.enabled);
      // Auto-trigger du flow si exige et pas encore active
      if (requireSetup && !s.enabled) {
        void startSetup();
      }
    } catch {
      setEnabled(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function startSetup() {
    setBusy(true);
    try {
      const r = await api.post('/mfa/setup');
      setSetup(r);
    } catch (err: any) {
      toast.error('Impossible de demarrer la 2FA : ' + (err?.message ?? 'erreur inconnue'));
    } finally {
      setBusy(false);
    }
  }

  function cancelSetup() {
    setSetup(null);
    setCode('');
  }

  async function confirmEnable() {
    const clean = code.trim().replace(/\s/g, '');
    if (clean.length !== 6) {
      toast.error('Le code doit faire 6 chiffres');
      return;
    }
    setBusy(true);
    try {
      await api.post('/mfa/enable', { code: clean });
      toast.success('2FA activee — pensez a conserver vos codes de recuperation');
      setSetup(null);
      setCode('');
      // Le JWT courant contient encore mfaPending=true. Sans refresh, le
      // MfaRequiredGuard bloquerait tous les endpoints du CRM. On force un
      // refresh pour obtenir un nouveau JWT avec mfaPending=false, puis on
      // redirige vers le dashboard.
      try {
        const refreshToken = typeof window !== 'undefined'
          ? localStorage.getItem('crm_mdo_refresh_token')
          : null;
        if (refreshToken) {
          const data = await api.post('/auth/refresh', { refreshToken });
          setTokens(data.accessToken, data.refreshToken);
        }
      } catch {
        // Si le refresh echoue (rare), on continue : l'utilisateur n'aura
        // qu'a se reconnecter une fois pour que mfaPending soit recalcule.
      }
      load();
      // Redirection nette vers le dashboard : on est libere du mode MFA-pending.
      if (typeof window !== 'undefined' && window.location.search.includes('mfaSetup=1')) {
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Code invalide');
    } finally {
      setBusy(false);
    }
  }

  async function askDisable() {
    const ok = await confirm({
      title: 'Desactiver la 2FA ?',
      message: 'Votre compte sera moins protege. Vous devrez ensuite saisir un code valide pour confirmer.',
      confirmLabel: 'Continuer',
      tone: 'warning',
    });
    if (!ok) return;
    setDisableCode('');
    setDisablePromptOpen(true);
  }

  async function submitDisable() {
    const clean = disableCode.trim().replace(/\s/g, '');
    if (!clean) {
      toast.error('Code requis');
      return;
    }
    setBusy(true);
    try {
      await api.post('/mfa/disable', { code: clean });
      toast.success('2FA desactivee');
      setDisablePromptOpen(false);
      setDisableCode('');
      load();
    } catch (err: any) {
      toast.error(err?.message ?? 'Code invalide');
    } finally {
      setBusy(false);
    }
  }

  function copyRecoveryCodes() {
    if (!setup) return;
    navigator.clipboard.writeText(setup.recoveryCodes.join('\n'));
    toast.success('Codes copies');
  }

  function downloadRecoveryCodes() {
    if (!setup) return;
    const blob = new Blob(
      [`Codes de recuperation 2FA — CRM MDO Services\nGenere le ${new Date().toLocaleString('fr-FR')}\n\n${setup.recoveryCodes.join('\n')}\n\nChacun n'est utilisable qu'une seule fois. Conservez-les en lieu sur.\n`],
      { type: 'text/plain;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crm-mdo-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold flex items-center gap-2">
          {enabled
            ? <ShieldCheck size={18} className="text-emerald-600" />
            : <Shield size={18} className="text-slate-400" />}
          Authentification a deux facteurs (2FA)
          {enabled && <span className="badge bg-emerald-100 text-emerald-700">Active</span>}
        </h2>
        {enabled === false && !setup && (
          <button onClick={startSetup} disabled={busy} className="btn btn-primary">
            {busy ? 'Preparation...' : 'Activer la 2FA'}
          </button>
        )}
        {enabled === true && (
          <button onClick={askDisable} className="btn btn-danger">Desactiver</button>
        )}
      </div>
      <p className="text-sm text-slate-500">
        Recommandee, surtout pour les comptes administrateurs. Compatible Google Authenticator, Microsoft Authenticator, 1Password, Authy, Bitwarden, etc.
      </p>

      {requireSetup && !enabled && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2 text-sm">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">Activation de la 2FA obligatoire</p>
            <p className="text-amber-700 dark:text-amber-300 mt-0.5">
              Votre role (administrateur) exige l'activation de la 2FA. Tant qu'elle n'est pas configuree, vous ne pouvez pas acceder aux autres pages du CRM.
            </p>
          </div>
        </div>
      )}

      {setup && (
        <div className="border border-mdo-200 dark:border-mdo-700 bg-mdo-50 dark:bg-mdo-900/20 rounded-md p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">1. Scannez ce QR code avec votre application authentificateur</p>
              <p className="text-xs text-slate-500 mt-0.5">Ne fermez pas cette fenetre avant d'avoir confirme le code.</p>
            </div>
            <button onClick={cancelSetup} className="text-slate-400 hover:text-slate-600" title="Annuler"><X size={18} /></button>
          </div>
          <img src={setup.qr} alt="QR 2FA" className="bg-white p-2 rounded-md inline-block border border-slate-200" />
          <div>
            <p className="text-sm font-medium mb-2">2. Entrez le code a 6 chiffres affiche par l'app</p>
            <div className="flex gap-2 max-w-xs">
              <input
                className="input font-mono text-center text-lg tracking-[0.4em]"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmEnable(); } }}
              />
              <button onClick={confirmEnable} disabled={busy} className="btn btn-primary">
                {busy ? '...' : 'Activer'}
              </button>
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-md p-3 text-xs">
            <p className="font-semibold mb-1">3. Codes de recuperation (a noter quelque part de sur)</p>
            <p className="text-amber-800 dark:text-amber-200 mb-2">
              Si vous perdez votre telephone, ces codes vous permettent de vous reconnecter — chacun n'est utilisable qu'une seule fois.
            </p>
            <ul className="grid grid-cols-2 gap-1 font-mono mb-2">
              {setup.recoveryCodes.map((c, i) => (
                <li key={i} className="bg-white dark:bg-slate-800 p-1 rounded text-center">{c}</li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button onClick={copyRecoveryCodes} className="text-mdo-600 hover:underline inline-flex items-center gap-1">
                <Copy size={12} /> Copier
              </button>
              <button onClick={downloadRecoveryCodes} className="text-mdo-600 hover:underline inline-flex items-center gap-1">
                <Download size={12} /> Telecharger .txt
              </button>
            </div>
          </div>
        </div>
      )}

      {disablePromptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setDisablePromptOpen(false)}
        >
          <div className="card max-w-sm w-full p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Confirmer la desactivation</h3>
            <p className="text-sm text-slate-500">Entrez un code TOTP valide (ou un code de recuperation) pour desactiver la 2FA.</p>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input font-mono text-center text-lg tracking-[0.4em]"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="000000"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitDisable(); } }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setDisablePromptOpen(false)} className="btn btn-secondary">Annuler</button>
              <button onClick={submitDisable} disabled={busy} className="btn btn-danger">
                {busy ? '...' : 'Desactiver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
