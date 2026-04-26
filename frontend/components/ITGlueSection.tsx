'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  MapPin, Network as NetworkIcon, Layers, StickyNote, Plus, Trash2, Edit, Save, Eye, EyeOff, Pin,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { ItemLinksWidget } from './ItemLinksWidget';

type Tab = 'locations' | 'networks' | 'flexible' | 'notes';

export function ITGlueSection({ companyId }: { companyId: string }) {
  const [tab, setTab] = useState<Tab>('locations');

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2 border-b border-slate-200 dark:border-slate-700 flex-wrap">
        <TabButton active={tab === 'locations'} onClick={() => setTab('locations')} icon={MapPin}>Sites</TabButton>
        <TabButton active={tab === 'networks'} onClick={() => setTab('networks')} icon={NetworkIcon}>Reseaux</TabButton>
        <TabButton active={tab === 'flexible'} onClick={() => setTab('flexible')} icon={Layers}>Assets flexibles</TabButton>
        <TabButton active={tab === 'notes'} onClick={() => setTab('notes')} icon={StickyNote}>Quick notes</TabButton>
      </div>
      {tab === 'locations' && <LocationsTab companyId={companyId} />}
      {tab === 'networks' && <NetworksTab companyId={companyId} />}
      {tab === 'flexible' && <FlexibleAssetsTab companyId={companyId} />}
      {tab === 'notes' && <QuickNotesTab companyId={companyId} />}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }: any) {
  return (
    <button
      onClick={onClick}
      className={'px-3 py-2 text-sm font-medium border-b-2 -mb-px ' +
        (active ? 'border-mdo-500 text-mdo-600' : 'border-transparent text-slate-500')}
    >
      <Icon size={14} className="inline mr-1" /> {children}
    </button>
  );
}

// ============== LOCATIONS ==============

function LocationsTab({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [draft, setDraft] = useState<any>({ name: '', address: '', city: '', postalCode: '', isPrimary: false });

  async function load() {
    setItems(await api.get('/locations?companyId=' + companyId));
  }
  useEffect(() => { load(); }, [companyId]);

  function openNew() {
    setDraft({ name: '', address: '', city: '', postalCode: '', isPrimary: items.length === 0 });
    setEditing('new');
  }
  function openEdit(l: any) {
    setDraft({ ...l });
    setEditing(l);
  }
  async function save() {
    try {
      const payload = { ...draft, companyId };
      if (editing === 'new') await api.post('/locations', payload);
      else await api.patch('/locations/' + editing.id, payload);
      toast.success('Site enregistre');
      setEditing(null);
      load();
    } catch (err: any) { toast.error(err.message); }
  }
  async function remove(id: string) {
    if (!confirm('Supprimer ce site ?')) return;
    await api.delete('/locations/' + id);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <h3 className="font-semibold">Sites ({items.length})</h3>
        <button onClick={openNew} className="btn btn-primary text-xs"><Plus size={12} className="mr-1" /> Nouveau site</button>
      </div>
      {editing && (
        <div className="border border-slate-200 dark:border-slate-700 rounded p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Nom du site (ex: Siege Toulouse)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <label className="inline-flex items-center text-sm gap-2">
              <input type="checkbox" checked={draft.isPrimary ?? false} onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })} />
              Site principal
            </label>
            <input className="input col-span-2" placeholder="Adresse" value={draft.address ?? ''} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            <input className="input" placeholder="Code postal" value={draft.postalCode ?? ''} onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })} />
            <input className="input" placeholder="Ville" value={draft.city ?? ''} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
            <input className="input" placeholder="Telephone" value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            <input className="input" placeholder="Pays" value={draft.country ?? 'France'} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
            <textarea className="input col-span-2" placeholder="Notes" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="btn btn-primary text-xs"><Save size={12} className="mr-1" /> Enregistrer</button>
            <button onClick={() => setEditing(null)} className="btn btn-secondary text-xs">Annuler</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {items.map((l) => (
          <div key={l.id} className="border border-slate-200 dark:border-slate-700 rounded p-3 flex justify-between items-start">
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">
                <MapPin size={14} /> {l.name}
                {l.isPrimary && <span className="badge bg-amber-100 text-amber-700 text-xs">Principal</span>}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {[l.address, l.postalCode, l.city, l.country].filter(Boolean).join(' ')}
              </div>
              {l.phone && <div className="text-xs text-slate-500">Tel : {l.phone}</div>}
              <div className="text-xs text-slate-400 mt-1">
                {l._count.networks} reseau(x) - {l._count.flexibleAssets} asset(s) flexible(s)
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(l)} className="text-mdo-600 hover:text-mdo-700"><Edit size={14} /></button>
              <button onClick={() => remove(l.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucun site</p>}
      </div>
    </div>
  );
}

// ============== NETWORKS ==============

const NETWORK_KINDS = ['LAN', 'WAN', 'WIFI', 'VPN', 'DMZ', 'GUEST', 'OTHER'] as const;

function NetworksTab({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [draft, setDraft] = useState<any>({ name: '', kind: 'LAN', cidr: '', vlanId: '', gateway: '', dnsServers: '' });

  async function load() {
    const [n, loc] = await Promise.all([
      api.get('/networks?companyId=' + companyId),
      api.get('/locations?companyId=' + companyId),
    ]);
    setItems(n); setLocations(loc);
  }
  useEffect(() => { load(); }, [companyId]);

  function openNew() {
    setDraft({ name: '', kind: 'LAN', cidr: '', vlanId: '', gateway: '', dnsServers: '', locationId: '' });
    setEditing('new');
  }
  function openEdit(n: any) { setDraft({ ...n, locationId: n.locationId ?? '' }); setEditing(n); }
  async function save() {
    try {
      const payload: any = { ...draft, companyId };
      if (payload.vlanId === '' || payload.vlanId === null) delete payload.vlanId;
      else payload.vlanId = parseInt(payload.vlanId);
      if (!payload.locationId) payload.locationId = null;
      if (editing === 'new') await api.post('/networks', payload);
      else await api.patch('/networks/' + editing.id, payload);
      toast.success('Reseau enregistre');
      setEditing(null);
      load();
    } catch (err: any) { toast.error(err.message); }
  }
  async function remove(id: string) {
    if (!confirm('Supprimer ce reseau ?')) return;
    await api.delete('/networks/' + id);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <h3 className="font-semibold">Reseaux ({items.length})</h3>
        <button onClick={openNew} className="btn btn-primary text-xs"><Plus size={12} className="mr-1" /> Nouveau reseau</button>
      </div>
      {editing && (
        <div className="border border-slate-200 dark:border-slate-700 rounded p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Nom (ex: LAN bureaux)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              {NETWORK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input className="input" placeholder="CIDR (ex: 10.0.0.0/24)" value={draft.cidr ?? ''} onChange={(e) => setDraft({ ...draft, cidr: e.target.value })} />
            <input className="input" placeholder="VLAN ID" value={draft.vlanId ?? ''} onChange={(e) => setDraft({ ...draft, vlanId: e.target.value })} />
            <input className="input" placeholder="Gateway" value={draft.gateway ?? ''} onChange={(e) => setDraft({ ...draft, gateway: e.target.value })} />
            <input className="input" placeholder="DNS (separes par virgule)" value={draft.dnsServers ?? ''} onChange={(e) => setDraft({ ...draft, dnsServers: e.target.value })} />
            <input className="input" placeholder="DHCP debut" value={draft.dhcpStart ?? ''} onChange={(e) => setDraft({ ...draft, dhcpStart: e.target.value })} />
            <input className="input" placeholder="DHCP fin" value={draft.dhcpEnd ?? ''} onChange={(e) => setDraft({ ...draft, dhcpEnd: e.target.value })} />
            <select className="input col-span-2" value={draft.locationId ?? ''} onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}>
              <option value="">Site associe (aucun)</option>
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <textarea className="input col-span-2" placeholder="Description" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="btn btn-primary text-xs"><Save size={12} className="mr-1" /> Enregistrer</button>
            <button onClick={() => setEditing(null)} className="btn btn-secondary text-xs">Annuler</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {items.map((n) => (
          <div key={n.id} className="border border-slate-200 dark:border-slate-700 rounded p-3 flex justify-between items-start">
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">
                <span className="badge bg-blue-100 text-blue-700 text-xs">{n.kind}</span>
                {n.name}
                {n.cidr && <code className="text-xs text-slate-500">{n.cidr}</code>}
                {n.vlanId !== null && n.vlanId !== undefined && <span className="text-xs text-slate-500">VLAN {n.vlanId}</span>}
              </div>
              <div className="text-xs text-slate-500 mt-1 space-x-3">
                {n.gateway && <span>GW : <code>{n.gateway}</code></span>}
                {n.dnsServers && <span>DNS : <code>{n.dnsServers}</code></span>}
                {n.dhcpStart && <span>DHCP : {n.dhcpStart} -&gt; {n.dhcpEnd}</span>}
              </div>
              {n.location && <div className="text-xs text-slate-400 mt-1">Site : {n.location.name}</div>}
              {n.description && <div className="text-xs text-slate-500 mt-1 italic">{n.description}</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(n)} className="text-mdo-600 hover:text-mdo-700"><Edit size={14} /></button>
              <button onClick={() => remove(n.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucun reseau documente</p>}
      </div>
    </div>
  );
}

// ============== FLEXIBLE ASSETS ==============

function FlexibleAssetsTab({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [draft, setDraft] = useState<any>({ typeId: '', name: '', values: {}, locationId: '' });
  const [revealed, setRevealed] = useState<Record<string, Record<string, string>>>({});

  async function load() {
    const [a, t, loc] = await Promise.all([
      api.get('/flexible-assets?companyId=' + companyId),
      api.get('/flexible-asset-types'),
      api.get('/locations?companyId=' + companyId),
    ]);
    setItems(a); setTypes(t); setLocations(loc);
  }
  useEffect(() => { load(); }, [companyId]);

  function openNew() {
    setDraft({ typeId: types[0]?.id ?? '', name: '', values: {}, locationId: '' });
    setEditing('new');
  }
  function openEdit(a: any) {
    setDraft({ typeId: a.typeId, name: a.name, values: { ...a.values }, locationId: a.locationId ?? '' });
    setEditing(a);
  }

  async function save() {
    try {
      if (!draft.typeId) { toast.error('Choisir un type'); return; }
      const payload: any = {
        typeId: draft.typeId,
        companyId,
        name: draft.name,
        values: draft.values ?? {},
        locationId: draft.locationId || null,
      };
      if (editing === 'new') await api.post('/flexible-assets', payload);
      else await api.patch('/flexible-assets/' + editing.id, payload);
      toast.success('Asset enregistre');
      setEditing(null);
      load();
    } catch (err: any) { toast.error(err.message); }
  }
  async function remove(id: string) {
    if (!confirm('Supprimer cet asset ?')) return;
    await api.delete('/flexible-assets/' + id);
    load();
  }
  async function revealSecrets(asset: any) {
    if (revealed[asset.id]) {
      setRevealed((r) => { const n = { ...r }; delete n[asset.id]; return n; });
      return;
    }
    const r = await api.get('/flexible-assets/' + asset.id + '/reveal');
    setRevealed((prev) => ({ ...prev, [asset.id]: r.secretValuesRevealed ?? {} }));
  }

  const selectedType = types.find((t) => t.id === draft.typeId);

  if (types.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-slate-500 mb-2">Aucun type d'asset flexible defini.</p>
        <a href="/admin/flexible-asset-types" className="text-mdo-600 hover:underline text-sm">
          Creer un premier template (ex: Tenant M365, Firewall, Backup)
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <h3 className="font-semibold">Assets flexibles ({items.length})</h3>
        <button onClick={openNew} className="btn btn-primary text-xs"><Plus size={12} className="mr-1" /> Nouvel asset</button>
      </div>
      {editing && (
        <div className="border border-slate-200 dark:border-slate-700 rounded p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={draft.typeId} onChange={(e) => setDraft({ ...draft, typeId: e.target.value, values: {} })} disabled={editing !== 'new'}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input className="input" placeholder="Nom de l'instance" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <select className="input col-span-2" value={draft.locationId ?? ''} onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}>
              <option value="">Site (aucun)</option>
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {selectedType?.fields?.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 uppercase">Champs du template</p>
              {selectedType.fields.map((f: any) => (
                <FieldEditor
                  key={f.id}
                  field={f}
                  value={draft.values?.[f.key] ?? ''}
                  onChange={(v) => setDraft({ ...draft, values: { ...draft.values, [f.key]: v } })}
                />
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={save} className="btn btn-primary text-xs"><Save size={12} className="mr-1" /> Enregistrer</button>
            <button onClick={() => setEditing(null)} className="btn btn-secondary text-xs">Annuler</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {items.map((a) => (
          <details key={a.id} className="border border-slate-200 dark:border-slate-700 rounded">
            <summary className="cursor-pointer p-2 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-700/30">
              <span>
                <span className="badge bg-slate-100 text-slate-700 text-xs mr-2">{a.type.name}</span>
                <strong>{a.name}</strong>
                {a.location && <span className="text-xs text-slate-500 ml-2">@ {a.location.name}</span>}
              </span>
              <span className="text-xs text-slate-400">{formatDateTime(a.updatedAt)}</span>
            </summary>
            <div className="p-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
              {a.type.fields.map((f: any) => {
                const isPwd = f.fieldType === 'PASSWORD';
                const clearVal = a.values?.[f.key];
                const revealedVal = revealed[a.id]?.[f.key];
                return (
                  <div key={f.id} className="text-sm flex">
                    <span className="w-40 text-slate-500">{f.label}</span>
                    <span className="flex-1 font-mono text-xs">
                      {isPwd
                        ? (revealedVal !== undefined ? revealedVal : '••••••••')
                        : (clearVal !== undefined && clearVal !== null && clearVal !== '' ? String(clearVal) : <span className="text-slate-400">-</span>)}
                    </span>
                  </div>
                );
              })}
              <div className="flex gap-2 mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                {a.hasSecrets && (
                  <button onClick={() => revealSecrets(a)} className="text-mdo-600 hover:text-mdo-700 text-xs">
                    {revealed[a.id] ? <EyeOff size={12} className="inline mr-1" /> : <Eye size={12} className="inline mr-1" />}
                    {revealed[a.id] ? 'Masquer' : 'Reveler les secrets'}
                  </button>
                )}
                <button onClick={() => openEdit(a)} className="text-mdo-600 hover:text-mdo-700 text-xs"><Edit size={12} className="inline mr-1" /> Modifier</button>
                <button onClick={() => remove(a.id)} className="text-red-600 hover:text-red-700 text-xs"><Trash2 size={12} className="inline mr-1" /> Supprimer</button>
              </div>
              <div className="mt-3">
                <ItemLinksWidget entity="FlexibleAsset" id={a.id} companyId={companyId} />
              </div>
            </div>
          </details>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucun asset flexible</p>}
      </div>
    </div>
  );
}

function FieldEditor({ field, value, onChange }: { field: any; value: any; onChange: (v: any) => void }) {
  const common = { className: 'input', placeholder: field.helpText ?? field.label, value: value ?? '', onChange: (e: any) => onChange(e.target.value) };
  let input: any;
  switch (field.fieldType) {
    case 'TEXTAREA':
      input = <textarea {...common} />;
      break;
    case 'NUMBER':
      input = <input type="number" {...common} />;
      break;
    case 'DATE':
      input = <input type="date" {...common} />;
      break;
    case 'URL':
      input = <input type="url" {...common} />;
      break;
    case 'EMAIL':
      input = <input type="email" {...common} />;
      break;
    case 'PASSWORD':
      input = <input type="password" {...common} placeholder={field.helpText ?? '(chiffre AES-256-GCM)'} />;
      break;
    case 'BOOLEAN':
      input = (
        <label className="inline-flex items-center text-sm gap-2">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> Oui
        </label>
      );
      break;
    case 'SELECT': {
      const options = (field.options ?? '').split('|').filter(Boolean);
      input = (
        <select {...common}>
          <option value="">-</option>
          {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    }
    default:
      input = <input type="text" {...common} />;
  }
  return (
    <div className="grid grid-cols-3 items-center gap-2">
      <label className="text-sm text-slate-600">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="col-span-2">{input}</div>
    </div>
  );
}

// ============== QUICK NOTES ==============

const NOTE_COLORS = [
  { key: 'yellow', bg: 'bg-amber-50 border-amber-200', label: 'Jaune' },
  { key: 'red', bg: 'bg-red-50 border-red-200', label: 'Rouge' },
  { key: 'green', bg: 'bg-emerald-50 border-emerald-200', label: 'Vert' },
  { key: 'blue', bg: 'bg-blue-50 border-blue-200', label: 'Bleu' },
];

function noteBg(color?: string) {
  return NOTE_COLORS.find((c) => c.key === color)?.bg ?? 'bg-amber-50 border-amber-200';
}

function QuickNotesTab({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [draft, setDraft] = useState({ content: '', color: 'yellow' });

  async function load() { setItems(await api.get('/quick-notes?companyId=' + companyId)); }
  useEffect(() => { load(); }, [companyId]);

  async function add() {
    if (!draft.content.trim()) return;
    await api.post('/quick-notes', { companyId, content: draft.content, color: draft.color });
    setDraft({ content: '', color: draft.color });
    load();
  }
  async function togglePin(n: any) {
    await api.patch('/quick-notes/' + n.id, { pinned: !n.pinned });
    load();
  }
  async function remove(id: string) {
    if (!confirm('Supprimer ce post-it ?')) return;
    await api.delete('/quick-notes/' + id);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="border border-slate-200 dark:border-slate-700 rounded p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
        <textarea
          className="input"
          rows={2}
          placeholder="Nouveau post-it (info critique, contact urgence, exception VPN...)"
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
        />
        <div className="flex gap-2 items-center">
          <select className="input max-w-[120px] text-xs" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}>
            {NOTE_COLORS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button onClick={add} className="btn btn-primary text-xs"><Plus size={12} className="mr-1" /> Epingler</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map((n) => (
          <div key={n.id} className={'border rounded p-3 ' + noteBg(n.color)}>
            <div className="flex justify-between items-start gap-2">
              <p className="text-sm whitespace-pre-wrap flex-1 text-slate-800">{n.content}</p>
              <div className="flex gap-1">
                <button onClick={() => togglePin(n)} className={n.pinned ? 'text-amber-600' : 'text-slate-400'} title={n.pinned ? 'Detacher' : 'Epingler'}>
                  <Pin size={14} />
                </button>
                <button onClick={() => remove(n.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">{formatDateTime(n.updatedAt)}</p>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4 col-span-2">Aucun post-it</p>}
      </div>
    </div>
  );
}
