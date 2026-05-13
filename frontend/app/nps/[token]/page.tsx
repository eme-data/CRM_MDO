'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

// Page publique de notation NPS. Pas d'auth.
// Le token est cryptosecure 32 bytes hex.

interface NpsInfo {
  reference: string;
  title: string;
  alreadySubmitted: boolean;
  score: number | null;
  comment: string | null;
}

export default function NpsPage() {
  const params = useParams();
  const token = params.token as string;
  const [info, setInfo] = useState<NpsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch('/api/nps/' + encodeURIComponent(token))
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.message ?? 'Lien invalide');
        return body;
      })
      .then(setInfo)
      .catch((err) => setError(err.message));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (score === null) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/nps/' + encodeURIComponent(token) + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, comment: comment.trim() || undefined }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.message ?? 'Echec de soumission');
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <Wrapper>
        <div className="text-center py-10">
          <AlertCircle size={48} className="text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Lien indisponible</h1>
          <p className="text-slate-500">{error}</p>
        </div>
      </Wrapper>
    );
  }

  if (!info) {
    return (
      <Wrapper>
        <div className="text-center py-10 text-slate-400">
          <Loader2 size={32} className="animate-spin mx-auto mb-2" />
          Chargement...
        </div>
      </Wrapper>
    );
  }

  if (submitted || info.alreadySubmitted) {
    return (
      <Wrapper>
        <div className="text-center py-10">
          <CheckCircle2 size={56} className="text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold mb-2">Merci pour votre retour !</h1>
          <p className="text-slate-500">
            Votre evaluation a bien ete enregistree. Elle nous aide a ameliorer notre service.
          </p>
          {info.alreadySubmitted && info.score !== null && (
            <p className="text-sm text-slate-400 mt-4">
              Note enregistree : <strong>{info.score}/10</strong>
            </p>
          )}
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <header className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Comment evaluez-vous votre experience ?</h1>
        <p className="text-sm text-slate-500 mt-2">
          Ticket <code className="font-mono">{info.reference}</code> · {info.title}
        </p>
      </header>

      <form onSubmit={submit} className="space-y-6">
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 text-center">
            Sur une echelle de 0 a 10, recommanderiez-vous MDO Services ?
          </p>
          <div className="grid grid-cols-11 gap-1.5 sm:gap-2 max-w-2xl mx-auto">
            {Array.from({ length: 11 }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setScore(i)}
                aria-label={`Note ${i} sur 10`}
                className={
                  'aspect-square rounded-md font-semibold text-sm sm:text-base transition-all ' +
                  (score === i
                    ? 'bg-mdo-600 text-white shadow-lg scale-110'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-mdo-400 hover:bg-mdo-50 dark:hover:bg-mdo-900/30 text-slate-700 dark:text-slate-200')
                }
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2 max-w-2xl mx-auto px-1">
            <span>Pas du tout</span>
            <span>Tout a fait</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Commentaire (optionnel)
          </label>
          <textarea
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-mdo-500 focus:outline-none focus:ring-1 focus:ring-mdo-500 min-h-[100px]"
            placeholder="Ce qui a bien fonctionne, ce qu'on pourrait ameliorer..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
          />
        </div>

        <button
          type="submit"
          disabled={score === null || submitting}
          className="w-full inline-flex items-center justify-center rounded-md bg-mdo-600 text-white px-6 py-3 font-medium hover:bg-mdo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Envoi...' : 'Envoyer mon evaluation'}
        </button>
      </form>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 sm:p-10">
          {children}
        </div>
        <footer className="mt-6 text-center text-xs text-slate-400">
          <a href="https://www.mdoservices.fr" className="hover:underline">MDO Services</a>
          {' - Prestataire IT et Cybersecurite'}
        </footer>
      </div>
    </div>
  );
}
