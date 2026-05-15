'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Edit, Trash2, ThumbsUp, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/utils';

const SCOPE_COLOR: Record<string, string> = {
  INTERNAL: 'bg-slate-100 text-slate-700',
  CLIENT: 'bg-amber-100 text-amber-700',
  GLOBAL: 'bg-emerald-100 text-emerald-700',
};

export default function KbArticlePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [a, setA] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<any>({});
  const confirm = useConfirm();

  async function load() {
    const x = await api.get('/kb/' + id + '?view=true');
    setA(x);
    setEdit({
      title: x.title,
      excerpt: x.excerpt ?? '',
      content: x.content,
      category: x.category ?? '',
      tags: x.tags.join(', '),
      isPublished: x.isPublished,
    });
  }

  useEffect(() => { load(); }, [id]);

  async function save() {
    try {
      await api.patch('/kb/' + id, {
        title: edit.title,
        excerpt: edit.excerpt || null,
        content: edit.content,
        category: edit.category || null,
        tags: edit.tags ? edit.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [],
        isPublished: edit.isPublished,
        markReviewed: true,
      });
      toast.success('Article mis a jour');
      setEditing(false);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function remove() {
    const ok = await confirm({ title: 'Supprimer cet article ?', confirmLabel: 'Supprimer', tone: 'danger' });
    if (!ok) return;
    try { await api.delete('/kb/' + id); toast.success('Supprime'); router.replace('/kb'); }
    catch (err: any) { toast.error(err.message); }
  }

  async function helpful() {
    try { await api.post('/kb/' + id + '/helpful'); toast.success('Merci !'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  if (!a) return <div>Chargement...</div>;

  const obsolete = a.lastReviewedAt && (Date.now() - new Date(a.lastReviewedAt).getTime()) > 365 * 86400000;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/kb" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour KB
      </Link>

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold">{a.title}</h1>
            <span className={'badge ' + SCOPE_COLOR[a.scope]}>{a.scope}</span>
            {!a.isPublished && <span className="badge bg-slate-200 text-slate-600">DRAFT</span>}
            {obsolete && <span className="badge bg-amber-100 text-amber-700" title="Pas relu depuis > 12 mois">A reviser</span>}
          </div>
          {a.excerpt && <p className="text-slate-600 mt-1">{a.excerpt}</p>}
          <div className="text-xs text-slate-500 mt-2 flex items-center gap-3 flex-wrap">
            <span>Par {a.author.firstName} {a.author.lastName}</span>
            <span>· {formatDate(a.createdAt)}</span>
            {a.publishedAt && <span>· Publie {formatDate(a.publishedAt)}</span>}
            {a.lastReviewedAt && <span>· Revu {formatDate(a.lastReviewedAt)}</span>}
            <span className="flex items-center gap-1"><Eye size={11} /> {a.viewCount}</span>
            <span className="flex items-center gap-1"><ThumbsUp size={11} /> {a.helpfulCount}</span>
            {a.category && <span>· {a.category}</span>}
            {a.company && <Link href={'/companies/' + a.company.id} className="text-mdo-600 hover:underline">· {a.company.name}</Link>}
          </div>
          {a.tags.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {a.tags.map((t: string) => <span key={t} className="text-xs bg-slate-100 px-2 py-0.5 rounded">#{t}</span>)}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={helpful} className="btn btn-secondary"><ThumbsUp size={14} className="mr-1" /> Utile</button>
          <button onClick={() => setEditing(!editing)} className="btn btn-secondary"><Edit size={14} className="mr-1" /> {editing ? 'Annuler' : 'Modifier'}</button>
          <button onClick={remove} className="btn btn-danger"><Trash2 size={14} className="mr-1" /> Supprimer</button>
        </div>
      </div>

      {editing ? (
        <div className="card p-6 space-y-4">
          <input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <input className="input" placeholder="Resume" value={edit.excerpt} onChange={(e) => setEdit({ ...edit, excerpt: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Categorie" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
            <input className="input" placeholder="Tags (virgules)" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} />
          </div>
          <textarea className="input min-h-[400px] font-mono text-sm" value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={edit.isPublished} onChange={(e) => setEdit({ ...edit, isPublished: e.target.checked })} />
            Publie
          </label>
          <button onClick={save} className="btn btn-primary">Enregistrer (marque comme revu)</button>
        </div>
      ) : (
        <div className="card p-6 prose prose-slate max-w-none whitespace-pre-wrap text-sm">
          {a.content}
        </div>
      )}
    </div>
  );
}
