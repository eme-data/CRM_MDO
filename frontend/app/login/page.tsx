'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { login } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password, needTotp ? totpCode : undefined);
      toast.success('Connexion reussie');
      router.replace('/dashboard');
    } catch (err: any) {
      const msg = err?.message ?? '';
      const isTotpRequired = Array.isArray(msg)
        ? msg.includes('TOTP_REQUIRED')
        : String(msg).includes('TOTP_REQUIRED');
      if (isTotpRequired) {
        setNeedTotp(true);
        toast.info('Entrez votre code 2FA');
      } else {
        toast.error(msg || 'Identifiants incorrects');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <form onSubmit={handleSubmit} className="w-full max-w-md card p-8 space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-mdo-600">CRM MDO Services</h1>
          <p className="text-sm text-slate-500">Connexion a votre espace</p>
        </div>
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            disabled={needTotp}
          />
        </div>
        <div>
          <label className="label">Mot de passe</label>
          <input
            type="password"
            required
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={needTotp}
          />
        </div>
        {needTotp && (
          <div>
            <label className="label">Code 2FA (6 chiffres) ou code de recuperation</label>
            <input
              type="text"
              required
              autoFocus
              className="input font-mono text-center text-lg tracking-wider"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
            />
          </div>
        )}
        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? 'Connexion...' : (needTotp ? 'Verifier' : 'Se connecter')}
        </button>
        {needTotp && (
          <button
            type="button"
            onClick={() => { setNeedTotp(false); setTotpCode(''); }}
            className="text-xs text-slate-500 hover:underline w-full text-center"
          >
            Retour
          </button>
        )}
      </form>
    </div>
  );
}
