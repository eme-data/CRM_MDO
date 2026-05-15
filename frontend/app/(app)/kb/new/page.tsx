'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function NewKbPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<any[]>([]);
  const [data, setData] = useState<any>({
    title: '',
    excerpt: '',
    scope: 'INTERNAL',
    category: '',
    tags: '',
    content: '',
    companyId: '',
    isPublished: false,
  });

  useEffect(() => { api.get('/companies?pageSize=500').then((r) => setCompanies(r.items)); }, []);

  function set(k: string, v: any) { setData((d: any) => ({ ...d, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const a = await api.post('/kb', {
        title: data.title,
        content: data.content,
        excerpt: data.excerpt || undefined,
        scope: data.scope,
        companyId: data.scope === 'CLIENT' ? data.companyId : undefined,
        category: data.category || undefined,
        tags: data.tags ? data.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [],
        isPublished: data.isPublished,
      });
      toast.success('Article cree');
      router.push('/kb/' + a.id);
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold">Nouvel article KB</h1>
      <form onSubmit={submit} className="card p-6 space-y-4">
        <div><label className="label">Titre *</label><input required value={data.title} onChange={(e) => set('title', e.target.value)} className="input" /></div>
        <div><label className="label">Resume (1-2 phrases pour la liste)</label>
          <input value={data.excerpt} onChange={(e) => set('excerpt', e.target.value)} className="input" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Portee</label>
            <select value={data.scope} onChange={(e) => set('scope', e.target.value)} className="input">
              <option value="INTERNAL">Interne MDO</option>
              <option value="CLIENT">Specifique client</option>
              <option value="GLOBAL">Public (tous clients)</option>
            </select>
          </div>
          <div><label className="label">Categorie</label>
            <input value={data.category} onChange={(e) => set('category', e.target.value)} className="input" placeholder="Email, MFA, Backup..." />
          </div>
          <div><label className="label">Tags (separes par virgules)</label>
            <input value={data.tags} onChange={(e) => set('tags', e.target.value)} className="input" placeholder="m365, mfa, urgent" />
          </div>
        </div>
        {data.scope === 'CLIENT' && (
          <div><label className="label">Societe *</label>
            <select required value={data.companyId} onChange={(e) => set('companyId', e.target.value)} className="input">
              <option value="">-- Choisir --</option>
              {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div><label className="label">Contenu (Markdown) *</label>
          <textarea required value={data.content} onChange={(e) => set('content', e.target.value)} className="input min-h-[300px] font-mono text-sm" placeholder="## Probleme&#10;...&#10;&#10;## Resolution&#10;1. ..." />
        </div>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={data.isPublished} onChange={(e) => set('isPublished', e.target.checked)} />
          Publier maintenant (sinon DRAFT)
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Creer</button>
          <button type="button" onClick={() => router.back()} className="btn btn-secondary">Annuler</button>
        </div>
      </form>
    </div>
  );
}
