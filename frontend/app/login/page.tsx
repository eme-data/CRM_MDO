'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldCheck, KeyRound, Mail, ArrowLeft, LogIn } from 'lucide-react';
import { login } from '@/lib/auth';
import { useBranding } from '@/components/BrandingProvider';
import { getSsoStatus, ssoStartUrl, SsoStatus } from '@/lib/sso';

function extractMessages(err: any): string[] {
  // NestJS peut retourner message comme string OU array (validation).
  // Le filtre HTTP custom renvoie aussi `code`. On agrege le tout pour matching.
  const out: string[] = [];
  const push = (v: any) => {
    if (Array.isArray(v)) v.forEach((x) => out.push(String(x)));
    else if (v != null) out.push(String(v));
  };
  push(err?.message);
  push(err?.body?.message);
  push(err?.body?.code);
  return out;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branding = useBranding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sso, setSso] = useState<SsoStatus>({ enabled: false, tenantSlug: null });

  // Charge le statut SSO du tenant courant (resolu par backend via Host).
  // Si SSO est actif, on affiche le bouton "Sign in with SSO".
  useEffect(() => {
    getSsoStatus().then(setSso).catch(() => {});
  }, []);

  // Si redirige ici apres echec SSO via /login?sso_error=...
  useEffect(() => {
    const ssoError = searchParams?.get('sso_error');
    if (ssoError) {
      toast.error('Echec de la connexion SSO : ' + ssoError);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const code = needTotp ? totpCode.trim().replace(/\s/g, '') : undefined;
      const data = await login(email, password, code);
      toast.success('Connexion reussie');
      // Si le compte exige la 2FA (role dans auth.mfaRequiredRoles) mais qu'elle
      // n'est pas encore activee, on redirige vers /settings ou l'utilisateur
      // pourra finaliser l'activation. Sinon tous les autres endpoints du CRM
      // renverraient 403 MFA_REQUIRED sans message clair.
      if (data?.mfaPending) {
        toast.info('Activation de la 2FA requise pour acceder au CRM');
        router.replace('/settings?mfaSetup=1');
      } else {
        router.replace('/dashboard');
      }
    } catch (err: any) {
      const msgs = extractMessages(err);
      const isTotpRequired = msgs.some((m) => m === 'TOTP_REQUIRED' || m.includes('TOTP_REQUIRED'));
      if (isTotpRequired) {
        setNeedTotp(true);
        toast.info('Entrez votre code 2FA');
      } else if (needTotp) {
        toast.error('Code 2FA invalide');
        setTotpCode('');
      } else {
        toast.error(msgs[0] || 'Identifiants incorrects');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md card p-8 space-y-5 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-mdo-600 tracking-tight">CRM {branding.shortName}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {needTotp ? 'Verification a deux facteurs' : 'Connexion a votre espace'}
          </p>
        </div>

        {/* Bouton SSO : visible si le tenant a active sso.enabled. On le
            propose AVANT le formulaire email/password pour pousser les users
            vers leur IdP (Entra ID / Keycloak) qui gere deja la 2FA cote
            entreprise. */}
        {!needTotp && sso.enabled && sso.tenantSlug && (
          <div className="space-y-3">
            <a
              href={ssoStartUrl(sso.tenantSlug, '/dashboard')}
              className="btn w-full inline-flex items-center justify-center gap-2 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              <LogIn size={16} />
              Se connecter avec votre compte entreprise (SSO)
            </a>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <span>ou</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        )}

        {!needTotp && (
          <>
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  className="input pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  className="input pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
          </>
        )}

        {needTotp && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md bg-mdo-50 dark:bg-mdo-900/30 border border-mdo-200 dark:border-mdo-800 p-3 text-sm">
              <ShieldCheck size={18} className="text-mdo-600 shrink-0" />
              <div>
                <p className="font-medium">Compte protege par 2FA</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Ouvrez votre application authentificateur ({email})
                </p>
              </div>
            </div>
            <div>
              <label className="label">Code a 6 chiffres ou code de recuperation</label>
              <input
                type="text"
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                className="input font-mono text-center text-lg tracking-[0.5em] py-3"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="000000"
              />
            </div>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? 'Connexion...' : (needTotp ? 'Verifier le code' : 'Se connecter')}
        </button>

        {needTotp && (
          <button
            type="button"
            onClick={() => { setNeedTotp(false); setTotpCode(''); }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 w-full inline-flex items-center justify-center gap-1"
          >
            <ArrowLeft size={12} /> Retour
          </button>
        )}
      </form>
    </div>
  );
}
