'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ShieldAlert } from 'lucide-react';
import { exchangeSsoTokens } from '@/lib/sso';

// Page intermediaire post-callback SSO : appelle /auth/sso/exchange pour
// transferer les tokens du cookie one-shot vers localStorage, puis redirige
// vers la destination finale.
//
// Le user voit juste un spinner ~1s. En cas d'echec (cookie expire, refus
// IdP, etc.), affiche une erreur explicite avec un retour vers /login.

export default function SsoCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { returnPath } = await exchangeSsoTokens();
        toast.success('Connexion SSO reussie');
        router.replace(returnPath || '/dashboard');
      } catch (err: any) {
        setError(err.message || 'Echange SSO echec');
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
      <div className="card p-8 max-w-md w-full text-center space-y-4">
        {!error && (
          <>
            <Loader2 className="mx-auto text-mdo-600 animate-spin" size={40} />
            <h1 className="text-lg font-semibold">Connexion en cours...</h1>
            <p className="text-sm text-slate-500">Recuperation de votre session SSO.</p>
          </>
        )}
        {error && (
          <>
            <ShieldAlert className="mx-auto text-rose-600" size={40} />
            <h1 className="text-lg font-semibold">Echec de la connexion SSO</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 break-words">{error}</p>
            <a href="/login" className="btn btn-secondary inline-block">Retour a la page de connexion</a>
          </>
        )}
      </div>
    </div>
  );
}
