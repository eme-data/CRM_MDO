'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import { portalApi, setPortalSession } from '@/lib/portal-api';

// useSearchParams() doit s'executer cote client ; Next.js 14 exige soit un
// <Suspense> boundary parent, soit `dynamic = 'force-dynamic'`. On combine les
// deux : force-dynamic empeche le prerender statique, Suspense fait office de
// filet meme si la route etait servie statiquement (ex. cache CDN agressif).
export const dynamic = 'force-dynamic';

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center text-slate-400">
        <Loader2 size={32} className="animate-spin mx-auto mb-2" />
        Connexion en cours...
      </div>
    </div>
  );
}

// Le composant interne utilise useSearchParams et DOIT etre rendu sous Suspense.
function PortalVerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Lien invalide : token manquant.');
      return;
    }
    portalApi.post('/auth/verify', { token })
      .then((res) => {
        setPortalSession(res.sessionToken);
        router.replace('/portal');
      })
      .catch((err) => setError(err.message ?? 'Lien invalide ou expire.'));
  }, [params, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow border border-slate-200 dark:border-slate-800 p-8 max-w-md w-full text-center">
          <AlertCircle size={48} className="text-amber-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold mb-2">Connexion impossible</h1>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <a href="/portal/login" className="text-sm text-mdo-600 hover:underline">
            Demander un nouveau lien
          </a>
        </div>
      </div>
    );
  }

  return <LoadingFallback />;
}

export default function PortalVerifyPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalVerifyInner />
    </Suspense>
  );
}
