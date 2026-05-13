'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { portalApi } from '@/lib/portal-api';

export default function NewPortalTicketPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [category, setCategory] = useState('REQUEST');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const t = await portalApi.post('/tickets', { title, description, priority, category });
      router.replace('/portal/tickets/' + t.id);
    } catch (err: any) {
      setError(err.message ?? 'Erreur');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/portal/tickets" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour aux tickets
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nouveau ticket</h1>
        <p className="text-sm text-slate-500 mt-1">
          Decrivez votre demande aussi precisement que possible.
          Notre equipe vous repondra dans les meilleurs delais selon votre contrat.
        </p>
      </div>

      <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Titre *</label>
          <input
            type="text"
            required
            minLength={3}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Acces VPN ne fonctionne plus"
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-mdo-500 focus:outline-none focus:ring-1 focus:ring-mdo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Priorite</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            >
              <option value="LOW">Basse</option>
              <option value="NORMAL">Normale</option>
              <option value="HIGH">Haute</option>
              <option value="URGENT">Urgente (panne bloquante)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Type</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            >
              <option value="INCIDENT">Incident</option>
              <option value="REQUEST">Demande</option>
              <option value="QUESTION">Question</option>
              <option value="BUG">Bug</option>
              <option value="OTHER">Autre</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Description *</label>
          <textarea
            required
            minLength={5}
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Que se passe-t-il ? Depuis quand ? Que faisiez-vous au moment du probleme ? Messages d'erreur eventuels..."
            className="w-full min-h-[200px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-mdo-500 focus:outline-none focus:ring-1 focus:ring-mdo-500"
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link href="/portal/tickets" className="px-4 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-mdo-600 text-white px-5 py-2 text-sm font-medium hover:bg-mdo-700 disabled:opacity-50"
          >
            <Send size={14} /> {submitting ? 'Envoi...' : 'Envoyer le ticket'}
          </button>
        </div>
      </form>
    </div>
  );
}
