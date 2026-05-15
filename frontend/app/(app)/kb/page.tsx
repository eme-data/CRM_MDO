'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Plus, Search, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  scope: string;
  category: string | null;
  tags: string[];
  isPublished: boolean;
  publishedAt: string | null;
  lastReviewedAt: string | null;
  viewCount: number;
  company: { id: string; name: string } | null;
  author: { id: string; firstName: string; lastName: string };
}

const SCOPE_COLOR: Record<string, string> = {
  INTERNAL: 'bg-slate-100 text-slate-700',
  CLIENT: 'bg-amber-100 text-amber-700',
  GLOBAL: 'bg-emerald-100 text-emerald-700',
};

export default function KbPage() {
  const [items, setItems] = useState<Article[]>([]);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  async function load() {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (scope) p.set('scope', scope);
    if (category) p.set('category', category);
    setItems(await api.get('/kb' + (p.toString() ? '?' + p.toString() : '')));
  }

  useEffect(() => {
    load();
    api.get('/kb/categories').then(setCategories).catch(() => setCategories([]));
  }, [q, scope, category]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BookOpen size={28} className="text-mdo-600" /> Knowledge base
        </h1>
        <Link href="/kb/new" className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouvel article</Link>
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Rechercher dans titre, contenu, tags..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input max-w-xs" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">Toutes portees</option>
          <option value="INTERNAL">Interne MDO</option>
          <option value="CLIENT">Specifique client</option>
          <option value="GLOBAL">Public clients</option>
        </select>
        <select className="input max-w-xs" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Toutes categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          Aucun article. Creez votre premier article pour commencer a documenter
          les resolutions recurrentes.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((a) => (
            <Link key={a.id} href={'/kb/' + a.id} className="card p-4 hover:border-mdo-500 transition-colors block">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm flex-1">{a.title}</h3>
                <span className={'badge ' + SCOPE_COLOR[a.scope]}>{a.scope}</span>
              </div>
              {a.excerpt && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.excerpt}</p>}
              <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  {a.category && <span className="text-mdo-600">{a.category}</span>}
                  {a.tags.length > 0 && <span>· {a.tags.slice(0, 3).map((t) => '#' + t).join(' ')}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Eye size={11} /> {a.viewCount}
                  {!a.isPublished && <span className="badge bg-slate-200 text-slate-600 text-[10px]">DRAFT</span>}
                </div>
              </div>
              {a.company && (
                <div className="text-xs text-amber-700 mt-1">Client : {a.company.name}</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
