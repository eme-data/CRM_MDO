'use client';
import { useState } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { portalApi } from '@/lib/portal-api';

export default function PortalLoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await portalApi.post('/auth/request-magic-link', { email });
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-mdo-600 tracking-tight">Espace client MDO</h1>
            <p className="text-sm text-slate-500 mt-2">
              Recevez un lien de connexion securise par email.
            </p>
          </div>

          {sent ? (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Verifiez votre boite mail</h2>
              <p className="text-sm text-slate-500">
                Si l'adresse <strong>{email}</strong> est rattachee a un client connu,
                vous recevrez sous quelques instants un email avec un lien de connexion
                valide 15 minutes.
              </p>
              <button
                type="button"
                onClick={() => { setSent(false); setEmail(''); }}
                className="mt-6 text-xs text-mdo-600 hover:underline"
              >
                Essayer avec une autre adresse
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Adresse email professionnelle
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="vous@votreentreprise.fr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm focus:border-mdo-500 focus:outline-none focus:ring-1 focus:ring-mdo-500"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Utilisez l'adresse email de votre entreprise. Nous detecterons automatiquement votre societe.
                </p>
              </div>
              {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-200">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center rounded-md bg-mdo-600 text-white px-4 py-2.5 font-medium hover:bg-mdo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Envoi...' : 'Recevoir mon lien de connexion'}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">
          Vous etes administrateur MDO ? <a href="/login" className="hover:underline text-mdo-600">Acces interne</a>
        </p>
      </div>
    </div>
  );
}
