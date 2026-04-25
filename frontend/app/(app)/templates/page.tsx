'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Template {
  id: string;
  name: string;
  category: string | null;
  subject: string | null;
  body: string;
  ownerId: string | null;
}

export default function TemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);

  async function load() {
    setItems(await api.get('/response-templates'));
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce template ?')) return;
    try {
      await api.delete('/response-templates/' + id);
      toast.success('Template supprime');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Templates de reponse</h1>
        <button onClick={() => setEditing('new')} className="btn btn-primary">
          <Plus size={16} className="mr-1" /> Nouveau template
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Variables disponibles : <code>{'{{ticket.reference}}'}</code>, <code>{'{{ticket.title}}'}</code>,
        {' '}<code>{'{{ticket.company.name}}'}</code>, <code>{'{{ticket.contact.firstName}}'}</code>,
        {' '}<code>{'{{user.firstName}}'}</code>, <code>{'{{user.lastName}}'}</code>.
      </p>

      {editing && (
        <TemplateForm
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Nom</th>
              <th className="p-3 font-medium">Categorie</th>
              <th className="p-3 font-medium">Visibilite</th>
              <th className="p-3 font-medium">Apercu</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-slate-400">Aucun template</td></tr>
            ) : items.map((t) => (
              <tr key={t.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium">{t.name}</td>
                <td className="p-3">{t.category ?? '-'}</td>
                <td className="p-3">
                  {t.ownerId === null ? (
                    <span className="badge bg-emerald-100 text-emerald-700">Partage</span>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-700">Personnel</span>
                  )}
                </td>
                <td className="p-3 max-w-md truncate text-slate-500">{t.body.split('\n')[0]}</td>
                <td className="p-3 flex gap-2 justify-end">
                  <button onClick={() => setEditing(t)} className="text-slate-500 hover:text-mdo-600">
                    <Edit size={14} />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="text-slate-500 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TemplateForm({
  template,
  onClose,
  onSaved,
}: {
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState({
    name: template?.name ?? '',
    category: template?.category ?? '',
    subject: template?.subject ?? '',
    body: template?.body ?? '',
    shared: template ? template.ownerId === null : false,
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: data.name,
        body: data.body,
        subject: data.subject || undefined,
        category: data.category || undefined,
        shared: data.shared,
      };
      if (template) {
        await api.patch('/response-templates/' + template.id, payload);
      } else {
        await api.post('/response-templates', payload);
      }
      toast.success('Template enregistre');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-4">
      <div className="flex justify-between">
        <h2 className="font-semibold">{template ? 'Modifier le template' : 'Nouveau template'}</h2>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Nom *</label>
          <input className="input" required value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Categorie</label>
          <input className="input" placeholder="ex: Onboarding, Resolution, Demande info..." value={data.category} onChange={(e) => setData({ ...data, category: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label">Sujet (optionnel)</label>
        <input className="input" value={data.subject} onChange={(e) => setData({ ...data, subject: e.target.value })} />
      </div>
      <div>
        <label className="label">Corps *</label>
        <textarea className="input min-h-[200px] font-mono text-sm" required value={data.body} onChange={(e) => setData({ ...data, body: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={data.shared} onChange={(e) => setData({ ...data, shared: e.target.checked })} />
        Partager avec toute l'equipe
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn btn-primary">
          <Save size={14} className="mr-1" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button type="button" onClick={onClose} className="btn btn-secondary">Annuler</button>
      </div>
    </form>
  );
}
