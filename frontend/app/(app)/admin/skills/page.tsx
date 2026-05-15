'use client';
import { useEffect, useState } from 'react';
import { Award, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/utils';

const LEVEL_LABEL: Record<string, string> = { BEGINNER: 'Junior', INTERMEDIATE: 'Inter.', EXPERT: 'Expert' };
const LEVEL_COLOR: Record<string, string> = {
  BEGINNER: 'bg-slate-100 text-slate-700',
  INTERMEDIATE: 'bg-blue-100 text-blue-700',
  EXPERT: 'bg-emerald-100 text-emerald-700',
};

export default function SkillsPage() {
  const [matrix, setMatrix] = useState<any>(null);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [creatingSkill, setCreatingSkill] = useState(false);
  const [editingCell, setEditingCell] = useState<{ userId: string; skillId: string } | null>(null);
  const confirm = useConfirm();

  async function load() {
    const [m, e, s] = await Promise.all([
      api.get('/skills/matrix'),
      api.get('/skills/expiring-soon?days=90'),
      api.get('/skills?includeInactive=true'),
    ]);
    setMatrix(m); setExpiring(e); setSkills(s);
  }
  useEffect(() => { load(); }, []);

  async function createSkill(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const payload = {
      code: (f.elements.namedItem('code') as HTMLInputElement).value,
      name: (f.elements.namedItem('name') as HTMLInputElement).value,
      category: (f.elements.namedItem('category') as HTMLInputElement).value || undefined,
      provider: (f.elements.namedItem('provider') as HTMLInputElement).value || undefined,
      validityMonths: (f.elements.namedItem('validityMonths') as HTMLInputElement).value
        ? parseInt((f.elements.namedItem('validityMonths') as HTMLInputElement).value) : undefined,
    };
    try { await api.post('/skills', payload); toast.success('Cree'); setCreatingSkill(false); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  async function removeSkill(s: any) {
    const ok = await confirm({ title: 'Supprimer "' + s.name + '" ?', confirmLabel: 'Supprimer', tone: 'danger' });
    if (!ok) return;
    try { await api.delete('/skills/' + s.id); toast.success('Supprime'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  async function setUserSkill(form: HTMLFormElement, userId: string, skillId: string) {
    const f = new FormData(form);
    const payload = {
      userId, skillId,
      level: f.get('level'),
      certifiedAt: f.get('certifiedAt') || undefined,
      expiresAt: f.get('expiresAt') || undefined,
      certificateUrl: f.get('certificateUrl') || undefined,
      notes: f.get('notes') || undefined,
    };
    try { await api.post('/skills/user-skills', payload); toast.success('OK'); setEditingCell(null); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  if (!matrix) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Award size={28} className="text-mdo-600" /> Skills matrix equipe
        </h1>
        <button onClick={() => setCreatingSkill(true)} className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouvelle competence</button>
      </div>

      {expiring.length > 0 && (
        <div className="card p-4 border-amber-200 bg-amber-50">
          <h2 className="font-semibold flex items-center gap-2 text-amber-800"><AlertTriangle size={16} /> Certifs qui expirent dans 90 jours</h2>
          <ul className="mt-2 text-sm space-y-1">
            {expiring.map((u) => (
              <li key={u.id}>
                <strong>{u.user.firstName} {u.user.lastName}</strong> — {u.skill.name}{u.skill.provider && ' (' + u.skill.provider + ')'} — expire {formatDate(u.expiresAt)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {creatingSkill && (
        <form onSubmit={createSkill} className="card p-4 space-y-3 border-mdo-200 bg-mdo-50">
          <h3 className="font-semibold">Nouvelle competence</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Code *</label><input name="code" required className="input" placeholder="MS_AZ104, ANSSI_SECNUM..." /></div>
            <div><label className="label">Nom *</label><input name="name" required className="input" /></div>
            <div><label className="label">Categorie</label><input name="category" className="input" placeholder="Microsoft, Cyber, Backup..." /></div>
            <div><label className="label">Provider</label><input name="provider" className="input" placeholder="Microsoft, ANSSI..." /></div>
            <div><label className="label">Validite (mois)</label><input name="validityMonths" type="number" min={1} className="input" placeholder="24, 36..." /></div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Creer</button>
            <button type="button" onClick={() => setCreatingSkill(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      <div className="card overflow-auto">
        <table className="text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 sticky left-0 bg-slate-50 text-left">Competence</th>
              {matrix.users.map((u: any) => (
                <th key={u.id} className="p-2 font-medium text-center min-w-[110px]">
                  {u.firstName}<br />{u.lastName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.skills.map((s: any) => (
              <tr key={s.id} className="border-t">
                <td className="p-2 sticky left-0 bg-white border-r">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-slate-400">{s.code}{s.provider && ' · ' + s.provider}</div>
                  <button onClick={() => removeSkill(s)} className="text-red-400 hover:text-red-600 text-[10px]">supprimer</button>
                </td>
                {matrix.users.map((u: any) => {
                  const cell = matrix.pivot[u.id]?.[s.id];
                  const isEditing = editingCell?.userId === u.id && editingCell?.skillId === s.id;
                  const expiringSoon = cell?.expiresAt && new Date(cell.expiresAt).getTime() - Date.now() < 90 * 86400000;
                  return (
                    <td key={u.id} className={'p-1 text-center align-top border-l ' + (expiringSoon ? 'bg-amber-50' : '')}>
                      {isEditing ? (
                        <form onSubmit={(e) => { e.preventDefault(); setUserSkill(e.currentTarget, u.id, s.id); }} className="space-y-1 text-left">
                          <select name="level" defaultValue={cell?.level ?? 'INTERMEDIATE'} className="input text-xs py-0.5">
                            <option value="BEGINNER">Junior</option>
                            <option value="INTERMEDIATE">Inter.</option>
                            <option value="EXPERT">Expert</option>
                          </select>
                          <input name="certifiedAt" type="date" defaultValue={cell?.certifiedAt?.slice(0, 10) ?? ''} className="input text-xs py-0.5" />
                          <input name="expiresAt" type="date" defaultValue={cell?.expiresAt?.slice(0, 10) ?? ''} className="input text-xs py-0.5" />
                          <input name="certificateUrl" placeholder="URL PDF" defaultValue={cell?.certificateUrl ?? ''} className="input text-xs py-0.5" />
                          <button type="submit" className="btn btn-primary text-[10px] py-0.5">OK</button>
                          <button type="button" onClick={() => setEditingCell(null)} className="btn btn-secondary text-[10px] py-0.5">X</button>
                        </form>
                      ) : (
                        <button onClick={() => setEditingCell({ userId: u.id, skillId: s.id })} className="w-full block">
                          {cell ? (
                            <>
                              <span className={'badge ' + LEVEL_COLOR[cell.level]}>{LEVEL_LABEL[cell.level]}</span>
                              {cell.expiresAt && (
                                <div className="text-[9px] text-slate-500 mt-0.5">exp {formatDate(cell.expiresAt)}</div>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-300">·</span>
                          )}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
