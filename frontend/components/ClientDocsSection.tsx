'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BookOpen, KeyRound, Plus, Trash2, Edit, Eye, EyeOff, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

export function ClientDocsSection({ companyId }: { companyId: string }) {
  const [tab, setTab] = useState<'docs' | 'secrets'>('docs');

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2 border-b border-slate-200 dark:border-slate-700">
        <button onClick={() => setTab('docs')} className={'px-3 py-2 text-sm font-medium border-b-2 -mb-px ' + (tab === 'docs' ? 'border-mdo-500 text-mdo-600' : 'border-transparent text-slate-500')}>
          <BookOpen size={14} className="inline mr-1" /> Documentation
        </button>
        <button onClick={() => setTab('secrets')} className={'px-3 py-2 text-sm font-medium border-b-2 -mb-px ' + (tab === 'secrets' ? 'border-mdo-500 text-mdo-600' : 'border-transparent text-slate-500')}>
          <KeyRound size={14} className="inline mr-1" /> Coffre a secrets
        </button>
      </div>
      {tab === 'docs' ? <DocsTab companyId={companyId} /> : <SecretsTab companyId={companyId} />}
    </div>
  );
}

function DocsTab({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [draft, setDraft] = useState<any>({ title: '', body: '', category: '' });

  async function load() {
    setItems(await api.get('/doc-pages?companyId=' + companyId));
  }
  useEffect(() => { load(); }, [companyId]);

  function openNew() {
    setDraft({ title: '', body: '', category: '' });
    setEditing('new');
  }
  function openEdit(p: any) {
    setDraft({ title: p.title, body: p.body, category: p.category ?? '' });
    setEditing(p);
  }
  async function save() {
    try {
      if (editing === 'new') {
        await api.post('/doc-pages', { ...draft, companyId });
      } else if (editing && typeof editing === 'object') {
        await api.patch('/doc-pages/' + editing.id, draft);
      }
      toast.success('Page enregistree');
      setEditing(null);
      load();
    } catch (err: any) { toast.error(err.message); }
  }
  async function remove(id: string) {
    if (!confirm('Supprimer cette page ?')) return;
    await api.delete('/doc-pages/' + id);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <h3 className="font-semibold">Pages de documentation ({items.length})</h3>
        <button onClick={openNew} className="btn btn-primary text-xs">
          <Plus size={12} className="mr-1" /> Nouvelle page
        </button>
      </div>
      {editing && (
        <div className="border border-slate-200 dark:border-slate-700 rounded p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Titre" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <input className="input" placeholder="Categorie (Reseau, Acces, ...)" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
          </div>
          <textarea className="input min-h-[200px] font-mono text-sm" placeholder="Contenu en markdown..." value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div className="flex gap-2">
            <button onClick={save} className="btn btn-primary text-xs"><Save size={12} className="mr-1" /> Enregistrer</button>
            <button onClick={() => setEditing(null)} className="btn btn-secondary text-xs">Annuler</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {items.map((p) => (
          <details key={p.id} className="border border-slate-200 dark:border-slate-700 rounded">
            <summary className="cursor-pointer p-2 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-700/30">
              <span><strong>{p.title}</strong> {p.category && <span className="text-xs text-slate-500">({p.category})</span>}</span>
              <span className="text-xs text-slate-400">{formatDateTime(p.updatedAt)}</span>
            </summary>
            <div className="p-3 border-t border-slate-200 dark:border-slate-700">
              <pre className="whitespace-pre-wrap text-sm font-sans">{p.body}</pre>
              <div className="flex gap-2 mt-3">
                <button onClick={() => openEdit(p)} className="text-mdo-600 hover:text-mdo-700 text-xs"><Edit size={12} className="inline mr-1" /> Modifier</button>
                <button onClick={() => remove(p.id)} className="text-red-600 hover:text-red-700 text-xs"><Trash2 size={12} className="inline mr-1" /> Supprimer</button>
              </div>
            </div>
          </details>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucune page de documentation</p>}
      </div>
    </div>
  );
}

function SecretsTab({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<any>({ label: '', value: '', username: '', url: '' });

  async function load() {
    setItems(await api.get('/secrets?companyId=' + companyId));
  }
  useEffect(() => { load(); }, [companyId]);

  async function reveal(id: string) {
    if (revealed[id]) {
      setRevealed((r) => { const n = { ...r }; delete n[id]; return n; });
      return;
    }
    const r = await api.get('/secrets/' + id + '/reveal');
    setRevealed((prev) => ({ ...prev, [id]: r.value }));
  }
  async function copy(id: string) {
    const r = revealed[id] ?? (await api.get('/secrets/' + id + '/reveal')).value;
    await navigator.clipboard.writeText(r);
    toast.success('Copie dans le presse-papier');
  }
  async function save() {
    try {
      await api.post('/secrets', { ...draft, companyId });
      toast.success('Secret enregistre');
      setShowForm(false);
      setDraft({ label: '', value: '', username: '', url: '' });
      load();
    } catch (err: any) { toast.error(err.message); }
  }
  async function remove(id: string) {
    if (!confirm('Supprimer ce secret ?')) return;
    await api.delete('/secrets/' + id);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <h3 className="font-semibold">Secrets ({items.length})</h3>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary text-xs">
          <Plus size={12} className="mr-1" /> Nouveau secret
        </button>
      </div>
      {showForm && (
        <div className="border border-slate-200 dark:border-slate-700 rounded p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Libelle (ex: Admin firewall)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <input className="input" placeholder="Identifiant (optionnel)" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
            <input type="password" className="input" placeholder="Valeur" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
            <input className="input" placeholder="URL (optionnel)" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="btn btn-primary text-xs">Enregistrer</button>
            <button onClick={() => setShowForm(false)} className="btn btn-secondary text-xs">Annuler</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {items.map((s) => (
          <div key={s.id} className="border border-slate-200 dark:border-slate-700 rounded p-3">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-medium">{s.label}</div>
                {s.username && <div className="text-xs text-slate-500">Identifiant : {s.username}</div>}
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-mdo-600 hover:underline">{s.url}</a>}
                <div className="mt-2 flex items-center gap-2">
                  {revealed[s.id] ? (
                    <code className="text-sm bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded">{revealed[s.id]}</code>
                  ) : (
                    <code className="text-sm text-slate-400">******</code>
                  )}
                  <button onClick={() => reveal(s.id)} className="text-mdo-600 hover:text-mdo-700">
                    {revealed[s.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => copy(s.id)} className="text-slate-500 hover:text-slate-700 text-xs">Copier</button>
                </div>
              </div>
              <button onClick={() => remove(s.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucun secret</p>}
      </div>
    </div>
  );
}
