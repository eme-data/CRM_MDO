'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BookOpen, KeyRound, Plus, Trash2, Edit, Eye, EyeOff, Save, Smartphone, History, Copy, RotateCcw } from 'lucide-react';
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
  const [draft, setDraft] = useState<any>({ title: '', body: '', category: '', reason: '' });
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [previewVersion, setPreviewVersion] = useState<any | null>(null);

  async function load() {
    setItems(await api.get('/doc-pages?companyId=' + companyId));
  }
  useEffect(() => { load(); }, [companyId]);

  function openNew() {
    setDraft({ title: '', body: '', category: '', reason: '' });
    setEditing('new');
  }
  function openEdit(p: any) {
    setDraft({ title: p.title, body: p.body, category: p.category ?? '', reason: '' });
    setEditing(p);
  }
  async function save() {
    try {
      if (editing === 'new') {
        const { reason, ...rest } = draft;
        await api.post('/doc-pages', { ...rest, companyId });
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
  async function showHistory(pageId: string) {
    if (historyOpen === pageId) { setHistoryOpen(null); setVersions([]); return; }
    setHistoryOpen(pageId);
    setVersions(await api.get('/doc-pages/' + pageId + '/versions'));
  }
  async function preview(versionId: string) {
    const v = await api.get('/doc-pages/versions/' + versionId);
    setPreviewVersion(v);
  }
  async function restore(versionId: string) {
    if (!confirm('Restaurer cette version ? Le contenu actuel sera sauvegarde dans une nouvelle version.')) return;
    try {
      await api.post('/doc-pages/versions/' + versionId + '/restore');
      toast.success('Version restauree');
      setPreviewVersion(null);
      load();
      if (historyOpen) {
        setVersions(await api.get('/doc-pages/' + historyOpen + '/versions'));
      }
    } catch (err: any) { toast.error(err.message); }
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
          {editing !== 'new' && (
            <input className="input text-xs" placeholder="Motif de la modification (optionnel - figure dans l'historique)" value={draft.reason ?? ''} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
          )}
          <div className="flex gap-2">
            <button onClick={save} className="btn btn-primary text-xs"><Save size={12} className="mr-1" /> Enregistrer</button>
            <button onClick={() => setEditing(null)} className="btn btn-secondary text-xs">Annuler</button>
          </div>
        </div>
      )}
      {previewVersion && (
        <div className="border border-amber-200 bg-amber-50 dark:bg-amber-900/10 rounded p-3 space-y-2">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-sm">Apercu version du {formatDateTime(previewVersion.createdAt)}</h4>
            <div className="flex gap-2">
              <button onClick={() => restore(previewVersion.id)} className="btn btn-primary text-xs">
                <RotateCcw size={12} className="mr-1" /> Restaurer
              </button>
              <button onClick={() => setPreviewVersion(null)} className="btn btn-secondary text-xs">Fermer</button>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Titre : <strong>{previewVersion.title}</strong>{previewVersion.category && <> - Categorie : {previewVersion.category}</>}
            {previewVersion.reason && <> - Motif : <em>{previewVersion.reason}</em></>}
          </div>
          <pre className="whitespace-pre-wrap text-sm font-sans bg-white dark:bg-slate-800 p-2 rounded border border-amber-200 max-h-80 overflow-y-auto">{previewVersion.body}</pre>
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
                <button onClick={() => showHistory(p.id)} className="text-slate-500 hover:text-slate-700 text-xs"><History size={12} className="inline mr-1" /> Historique</button>
                <button onClick={() => remove(p.id)} className="text-red-600 hover:text-red-700 text-xs"><Trash2 size={12} className="inline mr-1" /> Supprimer</button>
              </div>
              {historyOpen === p.id && (
                <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-2">
                  <p className="text-xs font-semibold mb-2">Versions ({versions.length})</p>
                  {versions.length === 0 ? (
                    <p className="text-xs text-slate-400">Aucune version anterieure (page jamais modifiee)</p>
                  ) : (
                    <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                      {versions.map((v) => (
                        <li key={v.id} className="flex justify-between items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700/30 px-1 py-0.5 rounded">
                          <span className="text-slate-500">{formatDateTime(v.createdAt)}</span>
                          {v.reason && <span className="text-slate-400 italic flex-1 truncate">"{v.reason}"</span>}
                          <button onClick={() => preview(v.id)} className="text-mdo-600 hover:text-mdo-700">Apercu</button>
                          <button onClick={() => restore(v.id)} className="text-amber-600 hover:text-amber-700"><RotateCcw size={10} className="inline" /> Restaurer</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
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
  const [totps, setTotps] = useState<Record<string, { code: string; secondsRemaining: number }>>({});
  const [auditOpen, setAuditOpen] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({ label: '', value: '', username: '', url: '', totpSecret: '' });

  async function load() {
    setItems(await api.get('/secrets?companyId=' + companyId));
  }
  useEffect(() => { load(); }, [companyId]);

  // Auto-refresh des codes TOTP toutes les secondes
  useEffect(() => {
    const ids = Object.keys(totps);
    if (ids.length === 0) return;
    const tick = setInterval(async () => {
      for (const id of ids) {
        const cur = totps[id];
        if (!cur) continue;
        if (cur.secondsRemaining <= 1) {
          try {
            const fresh = await api.get('/secrets/' + id + '/totp');
            setTotps((prev) => ({ ...prev, [id]: fresh }));
          } catch {}
        } else {
          setTotps((prev) => ({ ...prev, [id]: { ...cur, secondsRemaining: cur.secondsRemaining - 1 } }));
        }
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [totps]);

  async function reveal(id: string) {
    if (revealed[id]) {
      setRevealed((r) => { const n = { ...r }; delete n[id]; return n; });
      return;
    }
    const r = await api.get('/secrets/' + id + '/reveal');
    setRevealed((prev) => ({ ...prev, [id]: r.value }));
    if (r.totp) setTotps((prev) => ({ ...prev, [id]: r.totp }));
  }
  async function showTotp(id: string) {
    if (totps[id]) {
      setTotps((prev) => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    const r = await api.get('/secrets/' + id + '/totp');
    if (r.code) setTotps((prev) => ({ ...prev, [id]: r }));
  }
  async function copy(id: string, what: 'value' | 'totp' = 'value') {
    if (what === 'totp') {
      const t = totps[id] ?? (await api.get('/secrets/' + id + '/totp'));
      if (!t.code) return;
      await navigator.clipboard.writeText(t.code);
      toast.success('Code TOTP copie');
      return;
    }
    const r = revealed[id] ?? (await api.get('/secrets/' + id + '/reveal')).value;
    await navigator.clipboard.writeText(r);
    toast.success('Copie dans le presse-papier');
  }
  async function showAudit(id: string) {
    if (auditOpen === id) { setAuditOpen(null); return; }
    setAuditOpen(id);
    try {
      const log = await api.get('/secrets/' + id + '/access-log');
      setAuditLog(log);
    } catch (err: any) {
      toast.error(err.message ?? 'Acces audit reserve aux managers');
      setAuditOpen(null);
    }
  }
  function openNew() {
    setEditingId(null);
    setDraft({ label: '', value: '', username: '', url: '', totpSecret: '' });
    setShowForm(true);
  }
  function openEdit(s: any) {
    setEditingId(s.id);
    setDraft({ label: s.label, value: '', username: s.username ?? '', url: s.url ?? '', totpSecret: '' });
    setShowForm(true);
  }
  async function save() {
    try {
      const payload: any = {
        label: draft.label,
        username: draft.username,
        url: draft.url,
        totpSecret: draft.totpSecret || undefined,
      };
      if (draft.value) payload.value = draft.value;
      if (editingId) {
        await api.patch('/secrets/' + editingId, payload);
      } else {
        if (!draft.value) { toast.error('La valeur est requise'); return; }
        await api.post('/secrets', { ...payload, value: draft.value, companyId });
      }
      toast.success('Secret enregistre');
      setShowForm(false);
      setEditingId(null);
      setDraft({ label: '', value: '', username: '', url: '', totpSecret: '' });
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
        <button onClick={openNew} className="btn btn-primary text-xs">
          <Plus size={12} className="mr-1" /> Nouveau secret
        </button>
      </div>
      {showForm && (
        <div className="border border-slate-200 dark:border-slate-700 rounded p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Libelle (ex: Admin firewall)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <input className="input" placeholder="Identifiant (optionnel)" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
            <input type="password" className="input" placeholder={editingId ? 'Valeur (vide = inchange)' : 'Valeur'} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
            <input className="input" placeholder="URL (optionnel)" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            <input className="input col-span-2" placeholder="Secret TOTP base32 ou otpauth:// (optionnel - 2FA partagee)" value={draft.totpSecret} onChange={(e) => setDraft({ ...draft, totpSecret: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="btn btn-primary text-xs">Enregistrer</button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn btn-secondary text-xs">Annuler</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {items.map((s) => (
          <div key={s.id} className="border border-slate-200 dark:border-slate-700 rounded p-3">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  {s.label}
                  {s.hasTotp && <span className="badge bg-purple-100 text-purple-700 text-xs">2FA</span>}
                </div>
                {s.username && <div className="text-xs text-slate-500">Identifiant : {s.username}</div>}
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-mdo-600 hover:underline">{s.url}</a>}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {revealed[s.id] ? (
                    <code className="text-sm bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded">{revealed[s.id]}</code>
                  ) : (
                    <code className="text-sm text-slate-400">******</code>
                  )}
                  <button onClick={() => reveal(s.id)} className="text-mdo-600 hover:text-mdo-700">
                    {revealed[s.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => copy(s.id)} className="text-slate-500 hover:text-slate-700 text-xs inline-flex items-center gap-1">
                    <Copy size={12} /> Copier
                  </button>
                  {s.hasTotp && (
                    <button onClick={() => showTotp(s.id)} className="text-purple-600 hover:text-purple-700 text-xs inline-flex items-center gap-1">
                      <Smartphone size={12} /> {totps[s.id] ? 'Masquer 2FA' : 'Code 2FA'}
                    </button>
                  )}
                  {totps[s.id] && (
                    <span className="inline-flex items-center gap-2 bg-purple-50 border border-purple-200 rounded px-2 py-1">
                      <code className="font-mono text-base text-purple-700 tracking-wider">{totps[s.id].code}</code>
                      <span className="text-xs text-purple-500">{totps[s.id].secondsRemaining}s</span>
                      <button onClick={() => copy(s.id, 'totp')} className="text-purple-600 hover:text-purple-800"><Copy size={12} /></button>
                    </span>
                  )}
                </div>
                {s.lastAccessedAt && <div className="text-xs text-slate-400 mt-2">Derniere lecture : {formatDateTime(s.lastAccessedAt)}</div>}
                {auditOpen === s.id && (
                  <div className="mt-2 border-t border-slate-200 dark:border-slate-700 pt-2">
                    <p className="text-xs font-semibold text-slate-600 mb-1">Historique d'acces ({auditLog.length})</p>
                    <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                      {auditLog.length === 0 && <li className="text-slate-400">Aucun acces enregistre</li>}
                      {auditLog.map((a) => (
                        <li key={a.id} className="flex justify-between gap-2">
                          <span className="text-slate-500">{a.user ? a.user.firstName + ' ' + a.user.lastName : '(systeme)'}</span>
                          <span className="text-slate-400">{a.action}</span>
                          <span className="text-slate-400">{formatDateTime(a.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => showAudit(s.id)} className="text-slate-500 hover:text-slate-700" title="Historique d'acces"><History size={14} /></button>
                <button onClick={() => openEdit(s)} className="text-mdo-600 hover:text-mdo-700"><Edit size={14} /></button>
                <button onClick={() => remove(s.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucun secret</p>}
      </div>
    </div>
  );
}
