'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Layers, Plus, Trash2, Edit, Save, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '@/lib/api';

const FIELD_TYPES = [
  { v: 'TEXT', label: 'Texte court' },
  { v: 'TEXTAREA', label: 'Texte long' },
  { v: 'NUMBER', label: 'Nombre' },
  { v: 'BOOLEAN', label: 'Oui / Non' },
  { v: 'DATE', label: 'Date' },
  { v: 'URL', label: 'URL' },
  { v: 'EMAIL', label: 'Email' },
  { v: 'PASSWORD', label: 'Mot de passe (chiffre AES-256-GCM)' },
  { v: 'IP_ADDRESS', label: 'Adresse IP' },
  { v: 'SELECT', label: 'Liste deroulante' },
  { v: 'MULTISELECT', label: 'Liste multi-choix' },
] as const;

const SUGGESTIONS = [
  {
    name: 'Tenant Microsoft 365',
    icon: 'Cloud',
    color: '#0078D4',
    description: 'Configuration tenant M365 (Azure AD, licences, admin)',
    fields: [
      { key: 'tenant_id', label: 'Tenant ID', fieldType: 'TEXT', required: true },
      { key: 'tenant_domain', label: 'Domaine .onmicrosoft.com', fieldType: 'TEXT' },
      { key: 'admin_email', label: 'Compte admin', fieldType: 'EMAIL' },
      { key: 'admin_password', label: 'Mot de passe admin', fieldType: 'PASSWORD' },
      { key: 'license_count', label: 'Nb licences', fieldType: 'NUMBER' },
      { key: 'mfa_enabled', label: 'MFA active', fieldType: 'BOOLEAN' },
      { key: 'notes', label: 'Notes', fieldType: 'TEXTAREA' },
    ],
  },
  {
    name: 'Firewall',
    icon: 'Shield',
    color: '#DC2626',
    description: 'Configuration pare-feu (Fortinet, Stormshield, pfSense...)',
    fields: [
      { key: 'vendor', label: 'Constructeur', fieldType: 'SELECT', options: 'Fortinet|Stormshield|pfSense|Sophos|Cisco|Autre' },
      { key: 'model', label: 'Modele', fieldType: 'TEXT' },
      { key: 'mgmt_url', label: 'URL admin', fieldType: 'URL' },
      { key: 'mgmt_user', label: 'Utilisateur admin', fieldType: 'TEXT' },
      { key: 'mgmt_password', label: 'Mot de passe admin', fieldType: 'PASSWORD' },
      { key: 'firmware', label: 'Version firmware', fieldType: 'TEXT' },
      { key: 'wan_ip', label: 'IP WAN', fieldType: 'IP_ADDRESS' },
    ],
  },
  {
    name: 'Backup Veeam',
    icon: 'HardDrive',
    color: '#10B981',
    description: 'Configuration solution de sauvegarde',
    fields: [
      { key: 'backup_server', label: 'Serveur backup', fieldType: 'TEXT' },
      { key: 'retention_days', label: 'Retention (jours)', fieldType: 'NUMBER' },
      { key: 'storage_target', label: 'Cible de stockage', fieldType: 'TEXT' },
      { key: 'last_test', label: 'Dernier test restore', fieldType: 'DATE' },
      { key: 'console_url', label: 'URL console', fieldType: 'URL' },
      { key: 'admin_password', label: 'Mot de passe admin', fieldType: 'PASSWORD' },
    ],
  },
  {
    name: 'Fournisseur Internet (ISP)',
    icon: 'Wifi',
    color: '#8B5CF6',
    description: 'Contrat acces internet client',
    fields: [
      { key: 'isp_name', label: 'Operateur', fieldType: 'TEXT', required: true },
      { key: 'contract_ref', label: 'N contrat', fieldType: 'TEXT' },
      { key: 'tech_support', label: 'Support technique 24/7', fieldType: 'TEXT' },
      { key: 'bandwidth_down', label: 'Debit descendant (Mbps)', fieldType: 'NUMBER' },
      { key: 'bandwidth_up', label: 'Debit montant (Mbps)', fieldType: 'NUMBER' },
      { key: 'public_ip', label: 'IP publique', fieldType: 'IP_ADDRESS' },
      { key: 'service_end', label: 'Fin engagement', fieldType: 'DATE' },
    ],
  },
];

export default function FlexibleAssetTypesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [draft, setDraft] = useState<any>({ name: '', icon: '', color: '', description: '', fields: [] });

  async function load() { setItems(await api.get('/flexible-asset-types')); }
  useEffect(() => { load(); }, []);

  function openNew() {
    setDraft({ name: '', icon: '', color: '', description: '', fields: [{ key: '', label: '', fieldType: 'TEXT', required: false }] });
    setEditing('new');
  }
  function openEdit(t: any) {
    setDraft({ ...t, fields: t.fields.map((f: any) => ({ ...f })) });
    setEditing(t);
  }
  function applySuggestion(s: any) {
    setDraft({
      ...s,
      fields: s.fields.map((f: any) => ({ ...f, required: f.required ?? false })),
    });
    setEditing('new');
  }

  function addField() {
    setDraft({ ...draft, fields: [...draft.fields, { key: '', label: '', fieldType: 'TEXT', required: false }] });
  }
  function removeField(idx: number) {
    setDraft({ ...draft, fields: draft.fields.filter((_: any, i: number) => i !== idx) });
  }
  function moveField(idx: number, dir: -1 | 1) {
    const next = [...draft.fields];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setDraft({ ...draft, fields: next });
  }
  function updateField(idx: number, patch: any) {
    const next = [...draft.fields];
    next[idx] = { ...next[idx], ...patch };
    setDraft({ ...draft, fields: next });
  }

  async function save() {
    try {
      const payload = {
        name: draft.name,
        icon: draft.icon || undefined,
        color: draft.color || undefined,
        description: draft.description || undefined,
        fields: draft.fields.map((f: any, i: number) => ({ ...f, position: i })),
      };
      if (editing === 'new') await api.post('/flexible-asset-types', payload);
      else await api.patch('/flexible-asset-types/' + editing.id, payload);
      toast.success('Template enregistre');
      setEditing(null);
      load();
    } catch (err: any) { toast.error(err.message); }
  }
  async function remove(id: string) {
    if (!confirm('Supprimer ce template ?')) return;
    try {
      await api.delete('/flexible-asset-types/' + id);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Layers size={28} /> Templates d'assets flexibles</h1>
        <p className="text-sm text-slate-500 mt-1">
          Definissez vos propres types de documentation (a la IT Glue) reutilisables sur tous les clients :
          tenant M365, configuration firewall, backup, ISP, etc. Les champs PASSWORD sont chiffres AES-256-GCM.
        </p>
      </div>

      {!editing && (
        <div className="card p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Templates existants ({items.length})</h2>
            <button onClick={openNew} className="btn btn-primary"><Plus size={14} className="mr-1" /> Nouveau template</button>
          </div>
          {items.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-500 mb-3">Aucun template. Demarrez avec une suggestion :</p>
              <div className="grid grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s.name} onClick={() => applySuggestion(s)} className="text-left border border-slate-200 dark:border-slate-700 rounded p-3 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <div className="font-medium" style={{ color: s.color }}>{s.name}</div>
                    <div className="text-xs text-slate-500">{s.description}</div>
                    <div className="text-xs text-slate-400 mt-1">{s.fields.length} champs predefinis</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((t: any) => (
                <div key={t.id} className="border border-slate-200 dark:border-slate-700 rounded p-3 flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium" style={{ color: t.color ?? undefined }}>{t.name}</div>
                    {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                    <div className="text-xs text-slate-400 mt-1">
                      {t.fields.length} champs - {t._count.assets} instance(s)
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(t)} className="text-mdo-600 hover:text-mdo-700"><Edit size={14} /></button>
                    <button onClick={() => remove(t.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold">{editing === 'new' ? 'Nouveau template' : 'Modifier ' + draft.name}</h2>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Nom (ex: Tenant Microsoft 365)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input className="input" placeholder="Icon Lucide (ex: Cloud)" value={draft.icon ?? ''} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
            <input className="input" placeholder="Couleur hex (ex: #0078D4)" value={draft.color ?? ''} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
            <input className="input" placeholder="Description" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Champs ({draft.fields.length})</h3>
            <div className="space-y-2">
              {draft.fields.map((f: any, idx: number) => (
                <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded p-2 flex gap-2 items-center bg-slate-50 dark:bg-slate-900">
                  <GripVertical size={14} className="text-slate-400" />
                  <input className="input text-xs w-32" placeholder="cle (snake_case)" value={f.key} onChange={(e) => updateField(idx, { key: e.target.value })} />
                  <input className="input text-xs flex-1" placeholder="Libelle" value={f.label} onChange={(e) => updateField(idx, { label: e.target.value })} />
                  <select className="input text-xs w-44" value={f.fieldType} onChange={(e) => updateField(idx, { fieldType: e.target.value })}>
                    {FIELD_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </select>
                  {(f.fieldType === 'SELECT' || f.fieldType === 'MULTISELECT') && (
                    <input className="input text-xs w-44" placeholder="Options : a|b|c" value={f.options ?? ''} onChange={(e) => updateField(idx, { options: e.target.value })} />
                  )}
                  <label className="text-xs flex items-center gap-1">
                    <input type="checkbox" checked={f.required ?? false} onChange={(e) => updateField(idx, { required: e.target.checked })} /> Req.
                  </label>
                  <button onClick={() => moveField(idx, -1)} className="text-slate-500 hover:text-slate-700"><ArrowUp size={12} /></button>
                  <button onClick={() => moveField(idx, 1)} className="text-slate-500 hover:text-slate-700"><ArrowDown size={12} /></button>
                  <button onClick={() => removeField(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={addField} className="btn btn-secondary text-xs"><Plus size={12} className="mr-1" /> Ajouter un champ</button>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button onClick={save} className="btn btn-primary"><Save size={14} className="mr-1" /> Enregistrer</button>
            <button onClick={() => setEditing(null)} className="btn btn-secondary">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
