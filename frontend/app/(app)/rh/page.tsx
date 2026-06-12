'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { IdCard, Save, Paperclip, Trash2, Upload } from 'lucide-react';
import { api, authedFetch } from '@/lib/api';
import { me as fetchMe, User } from '@/lib/auth';
import { formatDate } from '@/lib/utils';

const CONTRACTS = ['CDI', 'CDD', 'STAGE', 'ALTERNANCE', 'FREELANCE', 'AUTRE'];
const DOC_TYPES: [string, string][] = [
  ['CONTRAT', 'Contrat'], ['AVENANT', 'Avenant'], ['FICHE_PAIE', 'Fiche de paie'],
  ['ATTESTATION', 'Attestation'], ['AUTRE', 'Autre'],
];

function initForm(p: any) {
  return {
    jobTitle: p?.jobTitle ?? '', department: p?.department ?? '', managerId: p?.managerId ?? '',
    contractType: p?.contractType ?? '',
    hireDate: p?.hireDate ? String(p.hireDate).slice(0, 10) : '',
    endDate: p?.endDate ? String(p.endDate).slice(0, 10) : '',
    phone: p?.phone ?? '', mobile: p?.mobile ?? '',
    address: p?.address ?? '', postalCode: p?.postalCode ?? '', city: p?.city ?? '', country: p?.country ?? '',
    birthDate: p?.birthDate ? String(p.birthDate).slice(0, 10) : '',
    emergencyContactName: p?.emergencyContactName ?? '', emergencyContactPhone: p?.emergencyContactPhone ?? '',
    iban: p?.iban ?? '', notes: p?.notes ?? '',
  };
}

export default function RhPage() {
  const [user, setUser] = useState<User | null>(null);
  const [list, setList] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [profile, setProfile] = useState<any | null>(null);
  const [form, setForm] = useState<any>(initForm(null));
  const [docs, setDocs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [docType, setDocType] = useState('CONTRAT');
  const [docName, setDocName] = useState('');
  const docFileRef = useRef<HTMLInputElement>(null);

  const isManager = !!user && (user.isSuperAdmin || user.role === 'ADMIN' || user.role === 'MANAGER');
  const editable = isManager; // RH = tous champs ; collaborateur = coordonnees seules

  useEffect(() => { fetchMe().then((u) => { setUser(u); setSelectedId(u.id); }).catch(() => {}); }, []);
  useEffect(() => { if (isManager) api.get<any[]>('/employees').then(setList).catch(() => {}); }, [isManager]);

  async function loadProfile(id: string) {
    try {
      const p = await api.get<any>('/employees/' + id);
      setProfile(p);
      setForm(initForm(p.employeeProfile));
      setDocs(await api.get<any[]>('/employees/' + id + '/documents'));
    } catch (err: any) { toast.error('Chargement fiche echoue : ' + (err?.message ?? 'erreur')); }
  }
  useEffect(() => { if (selectedId) loadProfile(selectedId); }, [selectedId]);

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      const payload: any = {};
      for (const [k, v] of Object.entries(form)) {
        // enum/dates : on omet quand vide (la validation refuse "" pour ces types)
        if (['contractType', 'hireDate', 'endDate', 'birthDate'].includes(k)) { if (v) payload[k] = v; }
        else payload[k] = v;
      }
      await api.patch('/employees/' + selectedId, payload);
      toast.success('Fiche enregistree');
      loadProfile(selectedId);
      if (isManager) api.get<any[]>('/employees').then(setList).catch(() => {});
    } catch (err: any) { toast.error(err.message ?? 'Erreur'); }
    finally { setSaving(false); }
  }

  async function uploadDoc() {
    const file = docFileRef.current?.files?.[0];
    if (!file) { toast.error('Selectionnez un fichier'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', docType);
    if (docName) fd.append('name', docName);
    try {
      const r = await authedFetch('/api/employees/' + selectedId + '/documents', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      toast.success('Document ajoute');
      setDocName(''); if (docFileRef.current) docFileRef.current.value = '';
      setDocs(await api.get<any[]>('/employees/' + selectedId + '/documents'));
    } catch (err: any) { toast.error('Upload echoue : ' + err.message); }
  }

  function downloadDoc(id: string) {
    authedFetch('/api/employees/documents/' + id + '/download')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((blob) => { const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 30000); })
      .catch((err) => toast.error('Document indisponible : ' + err.message));
  }

  async function removeDoc(id: string) {
    try { await api.delete('/employees/documents/' + id); toast.success('Document supprime'); setDocs(await api.get<any[]>('/employees/' + selectedId + '/documents')); }
    catch (err: any) { toast.error(err.message); }
  }

  const fullName = profile ? profile.firstName + ' ' + profile.lastName : '';

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold flex items-center gap-3"><IdCard size={28} className="text-mdo-600" /> Dossier collaborateur</h1>

      {isManager && (
        <div className="card p-4 flex items-center gap-3">
          <label className="label mb-0">Collaborateur</label>
          <select className="input max-w-sm" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {list.map((u) => <option key={u.id} value={u.id}>{u.lastName} {u.firstName} {u.id === user?.id ? '(moi)' : ''}</option>)}
          </select>
        </div>
      )}

      {profile && (
        <>
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">{fullName}</h2>
                <p className="text-sm text-slate-500">{profile.email} · {profile.role}</p>
              </div>
              <button onClick={save} disabled={saving} className="btn btn-primary"><Save size={14} className="mr-1" />{saving ? '...' : 'Enregistrer'}</button>
            </div>

            {/* Infos RH (editable RH uniquement) */}
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400 mb-2">Poste & contrat {!editable && '(lecture seule)'}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><label className="label">Poste</label><input className="input" disabled={!editable} value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></div>
                <div><label className="label">Service</label><input className="input" disabled={!editable} value={form.department} onChange={(e) => set('department', e.target.value)} /></div>
                <div><label className="label">Manager</label>
                  {editable ? (
                    <select className="input" value={form.managerId} onChange={(e) => set('managerId', e.target.value)}>
                      <option value="">--</option>
                      {list.filter((u) => u.id !== selectedId).map((u) => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
                    </select>
                  ) : (
                    <input className="input" disabled value={profile.employeeProfile?.manager ? profile.employeeProfile.manager.firstName + ' ' + profile.employeeProfile.manager.lastName : '--'} />
                  )}
                </div>
                <div><label className="label">Type de contrat</label>
                  <select className="input" disabled={!editable} value={form.contractType} onChange={(e) => set('contractType', e.target.value)}>
                    <option value="">--</option>
                    {CONTRACTS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="label">Date d'entree</label><input type="date" className="input" disabled={!editable} value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} /></div>
                <div><label className="label">Date de sortie</label><input type="date" className="input" disabled={!editable} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></div>
              </div>
            </div>

            {/* Coordonnees (editable par le collaborateur) */}
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400 mb-2">Coordonnees</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><label className="label">Telephone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
                <div><label className="label">Mobile</label><input className="input" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} /></div>
                <div><label className="label">Date de naissance</label><input type="date" className="input" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} /></div>
                <div className="md:col-span-2"><label className="label">Adresse</label><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
                <div><label className="label">Code postal</label><input className="input" value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} /></div>
                <div><label className="label">Ville</label><input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
                <div><label className="label">Pays</label><input className="input" value={form.country} onChange={(e) => set('country', e.target.value)} /></div>
                <div><label className="label">IBAN</label><input className="input" value={form.iban} onChange={(e) => set('iban', e.target.value)} /></div>
                <div><label className="label">Contact urgence (nom)</label><input className="input" value={form.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} /></div>
                <div><label className="label">Contact urgence (tel)</label><input className="input" value={form.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} /></div>
              </div>
            </div>

            {editable && (
              <div><label className="label">Notes RH</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
            )}
          </div>

          {/* Documents RH */}
          <div className="card overflow-hidden">
            <div className="p-3 border-b font-semibold flex items-center gap-2"><Paperclip size={16} className="text-mdo-600" /> Documents RH</div>
            {isManager && (
              <div className="p-3 border-b bg-slate-50 flex flex-wrap items-end gap-2">
                <div><label className="label">Type</label>
                  <select className="input py-1 text-sm" value={docType} onChange={(e) => setDocType(e.target.value)}>
                    {DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[160px]"><label className="label">Libelle (optionnel)</label><input className="input py-1 text-sm" value={docName} onChange={(e) => setDocName(e.target.value)} /></div>
                <div><label className="label">Fichier</label><input ref={docFileRef} type="file" className="input py-1 text-xs" accept="image/*,application/pdf" /></div>
                <button onClick={uploadDoc} className="btn btn-secondary text-sm"><Upload size={14} className="mr-1" />Ajouter</button>
              </div>
            )}
            <table className="w-full text-sm">
              <tbody>
                {docs.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-slate-400">Aucun document.</td></tr>
                ) : docs.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-3"><span className="badge bg-slate-100 text-slate-700">{(DOC_TYPES.find((t) => t[0] === d.type) ?? ['', d.type])[1]}</span></td>
                    <td className="p-3 font-medium">{d.name}</td>
                    <td className="p-3 text-xs text-slate-400">{formatDate(d.createdAt)}{d.uploadedBy ? ' · ' + d.uploadedBy.firstName + ' ' + d.uploadedBy.lastName : ''}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button onClick={() => downloadDoc(d.id)} className="text-mdo-600 hover:underline text-xs mr-3">Telecharger</button>
                      {isManager && <button onClick={() => removeDoc(d.id)} className="text-red-500 hover:text-red-700" title="Supprimer"><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
