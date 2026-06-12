'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldCheck, KeyRound, Mail, ArrowLeft, Loader2, Sparkles, ShieldAlert } from 'lucide-react';
import { login } from '@/lib/auth';
import { useBranding } from '@/components/BrandingProvider';
import { getSsoStatus, ssoStartUrl, SsoStatus } from '@/lib/sso';

// useSearchParams() requiert un parent <Suspense> sous Next.js 14, sinon le
// prerender statique echoue (cf. /portal/verify pour le meme pattern).
export const dynamic = 'force-dynamic';

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

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branding = useBranding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sso, setSso] = useState<SsoStatus>({ enabled: false, tenantSlug: null });

  useEffect(() => {
    getSsoStatus().then(setSso).catch(() => {});
  }, []);

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
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Halos colores en fond — visuel premium sans surcharge */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-mdo-600/30 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-40 h-[480px] w-[480px] rounded-full bg-indigo-600/20 blur-[120px]"
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header logo + nom complet */}
          <div className="mb-8 flex flex-col items-center text-center">
            {branding.logoUrl && (
              // <img> natif plutot que <Image> de Next.js : next/image refuse
              // de servir des SVG sans dangerouslyAllowSVG=true. Pour un logo
              // local trusted (pas d'user input), <img> est plus simple.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.name}
                width={64}
                height={64}
                className="mb-4 h-16 w-16 drop-shadow-[0_0_20px_rgba(59,130,246,0.4)]"
              />
            )}
            <h1 className="text-3xl font-bold tracking-tight text-white">
              {branding.name}
            </h1>
            {branding.tagline && (
              <p className="mt-1 text-sm text-slate-400">{branding.tagline}</p>
            )}
          </div>

          {/* Card glassmorphism */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl"
          >
            <div className="text-center">
              <p className="text-sm font-medium text-slate-300">
                {needTotp ? 'Verification a deux facteurs' : 'Connexion a votre espace'}
              </p>
            </div>

            {/* Bandeau demo : visible uniquement sur un tenant de demonstration. */}
            {!needTotp && branding.isDemo && (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <p className="flex items-center gap-1.5 font-semibold text-amber-100">
                  <Sparkles size={14} /> Environnement de demonstration
                </p>
                <p className="text-amber-200/80">
                  Donnees fictives, reinitialisees chaque jour.
                </p>
                <p className="flex items-start gap-1.5 text-amber-200/80">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                  MFA optionnel ici ; en production il est obligatoire pour les roles Admin et Manager.
                </p>
              </div>
            )}

            {!needTotp && sso.enabled && sso.tenantSlug && (
              <div className="space-y-3">
                <a
                  href={ssoStartUrl(sso.tenantSlug, '/dashboard')}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
                    <path fill="#f25022" d="M1 1h10v10H1z" />
                    <path fill="#7fba00" d="M12 1h10v10H12z" />
                    <path fill="#00a4ef" d="M1 12h10v10H1z" />
                    <path fill="#ffb900" d="M12 12h10v10H12z" />
                  </svg>
                  Se connecter avec Microsoft 365
                </a>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <div className="h-px flex-1 bg-slate-800" />
                  <span>ou</span>
                  <div className="h-px flex-1 bg-slate-800" />
                </div>
              </div>
            )}

            {!needTotp && (
              <>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                    Email
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="email"
                      type="email"
                      required
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2.5 pl-10 pr-3 text-white placeholder-slate-500 transition focus:border-mdo-500 focus:outline-none focus:ring-2 focus:ring-mdo-500/30"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus
                      autoComplete="email"
                      placeholder="vous@exemple.fr"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="password"
                      type="password"
                      required
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2.5 pl-10 pr-3 text-white placeholder-slate-500 transition focus:border-mdo-500 focus:outline-none focus:ring-2 focus:ring-mdo-500/30"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </>
            )}

            {needTotp && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg border border-mdo-800/60 bg-mdo-950/40 p-3 text-sm">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-mdo-400" />
                  <div>
                    <p className="font-medium text-white">Compte protege par 2FA</p>
                    <p className="text-xs text-slate-400">
                      Ouvrez votre application authentificateur ({email})
                    </p>
                  </div>
                </div>
                <div>
                  <label htmlFor="totp" className="mb-1.5 block text-sm font-medium text-slate-300">
                    Code a 6 chiffres ou code de recuperation
                  </label>
                  <input
                    id="totp"
                    type="text"
                    required
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-3 text-center font-mono text-lg tracking-[0.5em] text-white placeholder-slate-600 focus:border-mdo-500 focus:outline-none focus:ring-2 focus:ring-mdo-500/30"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="000000"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-mdo-600 to-mdo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-mdo-900/40 transition hover:from-mdo-500 hover:to-mdo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Connexion...
                </>
              ) : (
                <>{needTotp ? 'Verifier le code' : 'Se connecter'}</>
              )}
            </button>

            {needTotp && (
              <button
                type="button"
                onClick={() => { setNeedTotp(false); setTotpCode(''); }}
                className="inline-flex w-full items-center justify-center gap-1 text-xs text-slate-400 transition hover:text-slate-200"
              >
                <ArrowLeft size={12} /> Retour
              </button>
            )}
          </form>

          {branding.footerText && (
            <p className="mt-6 text-center text-xs text-slate-500">
              {branding.footerText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
