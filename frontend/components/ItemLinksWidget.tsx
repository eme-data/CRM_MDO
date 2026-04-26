'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Link as LinkIcon, Plus, Trash2, ArrowRight, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';

// Widget reutilisable : affiche les liens entrants/sortants d'un item donne
// (FlexibleAsset, Network, DocPage, SecretEntry, Asset, Location, ...)
// et permet d'en creer / supprimer.

const LINKABLE_ENTITIES = [
  { v: 'Company', label: 'Societe', searchPath: '/companies', searchKey: 'search', listKey: 'items' },
  { v: 'Contact', label: 'Contact', searchPath: '/contacts', searchKey: 'search', listKey: 'items' },
  { v: 'Contract', label: 'Contrat', searchPath: '/contracts', searchKey: 'search', listKey: 'items' },
  { v: 'Asset', label: 'Asset', searchPath: '/assets', searchKey: 'search', listKey: null },
  { v: 'FlexibleAsset', label: 'Asset flexible', searchPath: null, searchKey: null, listKey: null },
  { v: 'DocPage', label: 'Page de doc', searchPath: null, searchKey: null, listKey: null },
  { v: 'SecretEntry', label: 'Secret', searchPath: null, searchKey: null, listKey: null },
  { v: 'Network', label: 'Reseau', searchPath: null, searchKey: null, listKey: null },
  { v: 'Location', label: 'Site', searchPath: null, searchKey: null, listKey: null },
  { v: 'Ticket', label: 'Ticket', searchPath: '/tickets', searchKey: 'search', listKey: 'items' },
  { v: 'Intervention', label: 'Intervention', searchPath: '/interventions', searchKey: 'search', listKey: null },
];

const ENTITY_HREF: Record<string, (id: string) => string | null> = {
  Company: (id) => '/companies/' + id,
  Contact: (id) => '/contacts/' + id,
  Contract: (id) => '/contracts/' + id,
  Ticket: (id) => '/tickets/' + id,
  Intervention: (id) => '/interventions/' + id,
};

export function ItemLinksWidget({
  entity,
  id,
  companyId,
}: {
  entity: string;
  id: string;
  // Quand fourni, restreint la recherche d'items aux items de cette societe
  // (ex : on lie depuis un FlexibleAsset, on ne propose que les assets/secrets/docs de la meme societe)
  companyId?: string;
}) {
  const [links, setLinks] = useState<any[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [picker, setPicker] = useState({ targetEntity: 'SecretEntry', targetId: '', label: '', search: '' });
  const [candidates, setCandidates] = useState<any[]>([]);

  async function load() {
    try {
      setLinks(await api.get('/item-links?entity=' + entity + '&id=' + id));
    } catch (err: any) {
      // silencieux si endpoint pas encore branche
    }
  }
  useEffect(() => { load(); }, [entity, id]);

  async function loadCandidates() {
    if (!picker.targetEntity) { setCandidates([]); return; }
    if (!companyId && ['FlexibleAsset', 'DocPage', 'SecretEntry', 'Network', 'Location', 'Asset'].includes(picker.targetEntity)) {
      // Sans companyId, on ne propose pas d'autocompletion sur ces types (trop large)
      setCandidates([]);
      return;
    }
    try {
      switch (picker.targetEntity) {
        case 'FlexibleAsset': setCandidates(await api.get('/flexible-assets?companyId=' + companyId)); break;
        case 'DocPage': setCandidates(await api.get('/doc-pages?companyId=' + companyId)); break;
        case 'SecretEntry': setCandidates(await api.get('/secrets?companyId=' + companyId)); break;
        case 'Network': setCandidates(await api.get('/networks?companyId=' + companyId)); break;
        case 'Location': setCandidates(await api.get('/locations?companyId=' + companyId)); break;
        case 'Asset': setCandidates(await api.get('/assets?companyId=' + companyId)); break;
        case 'Contract': {
          const res = await api.get('/contracts?companyId=' + companyId);
          setCandidates(res.items ?? res);
          break;
        }
        case 'Contact': {
          const res = await api.get('/contacts?companyId=' + companyId);
          setCandidates(res.items ?? res);
          break;
        }
        case 'Ticket': {
          const res = await api.get('/tickets?companyId=' + companyId);
          setCandidates(res.items ?? res);
          break;
        }
        case 'Intervention': {
          setCandidates(await api.get('/interventions?companyId=' + companyId));
          break;
        }
        case 'Company': {
          const res = await api.get('/companies?pageSize=50&search=' + encodeURIComponent(picker.search));
          setCandidates(res.items ?? res);
          break;
        }
        default: setCandidates([]);
      }
    } catch {
      setCandidates([]);
    }
  }
  useEffect(() => { loadCandidates(); }, [picker.targetEntity, picker.search, companyId]);

  function candidateLabel(item: any): string {
    if (item.name) return item.name;
    if (item.firstName || item.lastName) return (item.firstName ?? '') + ' ' + (item.lastName ?? '');
    if (item.title) return item.title;
    if (item.label) return item.label;
    if (item.reference) return item.reference;
    return item.id?.substring(0, 8);
  }

  async function add() {
    if (!picker.targetId) { toast.error('Choisir un item'); return; }
    try {
      await api.post('/item-links', {
        sourceEntity: entity,
        sourceId: id,
        targetEntity: picker.targetEntity,
        targetId: picker.targetId,
        label: picker.label || undefined,
      });
      toast.success('Lien cree');
      setShowPicker(false);
      setPicker({ targetEntity: picker.targetEntity, targetId: '', label: '', search: '' });
      load();
    } catch (err: any) { toast.error(err.message); }
  }
  async function remove(linkId: string) {
    if (!confirm('Supprimer ce lien ?')) return;
    await api.delete('/item-links/' + linkId);
    load();
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded p-3 bg-slate-50/50 dark:bg-slate-900/30">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold flex items-center gap-1">
          <LinkIcon size={14} /> Liens ({links.length})
        </h4>
        <button onClick={() => setShowPicker(!showPicker)} className="text-xs text-mdo-600 hover:text-mdo-700">
          <Plus size={12} className="inline mr-1" />Lier a un item
        </button>
      </div>
      {showPicker && (
        <div className="border border-slate-200 dark:border-slate-700 rounded p-2 mb-2 bg-white dark:bg-slate-900 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select className="input text-xs" value={picker.targetEntity} onChange={(e) => setPicker({ ...picker, targetEntity: e.target.value, targetId: '' })}>
              {LINKABLE_ENTITIES.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
            </select>
            <input className="input text-xs" placeholder="Libelle du lien (optionnel)" value={picker.label} onChange={(e) => setPicker({ ...picker, label: e.target.value })} />
          </div>
          {!companyId && !['Company'].includes(picker.targetEntity) && (
            <p className="text-xs text-amber-600">Sans contexte societe, recherche limitee a "Societe".</p>
          )}
          {picker.targetEntity === 'Company' && (
            <input className="input text-xs" placeholder="Recherche..." value={picker.search} onChange={(e) => setPicker({ ...picker, search: e.target.value })} />
          )}
          <select className="input text-xs" value={picker.targetId} onChange={(e) => setPicker({ ...picker, targetId: e.target.value })}>
            <option value="">-- Choisir --</option>
            {candidates.map((c: any) => (
              <option key={c.id} value={c.id}>{candidateLabel(c)}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={add} className="btn btn-primary text-xs"><Plus size={12} className="mr-1" /> Lier</button>
            <button onClick={() => setShowPicker(false)} className="btn btn-secondary text-xs">Annuler</button>
          </div>
        </div>
      )}
      <div className="space-y-1">
        {links.length === 0 && <p className="text-xs text-slate-400 text-center py-2">Aucun lien</p>}
        {links.map((l) => {
          const href = ENTITY_HREF[l.otherEntity]?.(l.otherId);
          return (
            <div key={l.id} className="flex items-center justify-between text-xs border border-slate-100 dark:border-slate-800 rounded px-2 py-1">
              <div className="flex items-center gap-2 flex-1">
                {l.direction === 'outgoing' ? <ArrowRight size={10} className="text-slate-400" /> : <ArrowLeft size={10} className="text-slate-400" />}
                <span className="badge bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px]">{l.otherEntity}</span>
                {href ? (
                  <Link href={href} className="font-medium text-mdo-600 hover:underline">{l.otherLabel}</Link>
                ) : (
                  <span className="font-medium">{l.otherLabel}</span>
                )}
                {l.otherSubtitle && <span className="text-slate-400">- {l.otherSubtitle}</span>}
                {l.label && <span className="text-slate-500 italic">"{l.label}"</span>}
              </div>
              <button onClick={() => remove(l.id)} className="text-red-500 hover:text-red-700"><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
