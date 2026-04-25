'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Company {
  id?: string;
  name?: string;
  siret?: string;
  siren?: string;
  apeCode?: string;
  apeLabel?: string;
  legalForm?: string;
  capitalSocial?: number | string | null;
  sector?: string;
  status?: string;
  employees?: number;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  notes?: string;
}

interface LookupItem {
  source: 'pappers' | 'sirene';
  name: string;
  siren: string;
  siret?: string | null;
  apeCode?: string | null;
  apeLabel?: string | null;
  legalForm?: string | null;
  creationDate?: string | null;
  capitalSocial?: number | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  employees?: number | null;
}

export function CompanyForm({ company }: { company?: Company }) {
  const router = useRouter();
  const [data, setData] = useState<Company>(company ?? { sector: 'PME', status: 'LEAD', country: 'France' });
  const [loading, setLoading] = useState(false);

  // Etat de la recherche annuaire
  const [showLookup, setShowLookup] = useState(!company?.id);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<LookupItem[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [providersAvailable, setProvidersAvailable] = useState(true);
  const debounceRef = useRef<any>(null);

  // Debounced lookup
  useEffect(() => {
    if (!showLookup) return;
    if (lookupQuery.trim().length < 3) {
      setLookupResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLookupLoading(true);
      try {
        const res = await api.get('/companies/lookup?q=' + encodeURIComponent(lookupQuery.trim()));
        setLookupResults(res.items ?? []);
        setProvidersAvailable(res.providersAvailable !== false);
      } catch (err: any) {
        if (err.status === 503) {
          setProvidersAvailable(false);
        } else {
          toast.error(err.message);
        }
      } finally {
        setLookupLoading(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [lookupQuery, showLookup]);

  function applyLookup(item: LookupItem) {
    setData((d) => ({
      ...d,
      name: item.name,
      siren: item.siren,
      siret: item.siret ?? d.siret,
      apeCode: item.apeCode ?? undefined,
      apeLabel: item.apeLabel ?? undefined,
      legalForm: item.legalForm ?? undefined,
      capitalSocial: item.capitalSocial ?? undefined,
      address: item.address ?? d.address,
      postalCode: item.postalCode ?? d.postalCode,
      city: item.city ?? d.city,
      employees: item.employees ?? d.employees,
    }));
    setLookupResults([]);
    setLookupQuery('');
    toast.success('Informations importees depuis ' + item.source);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...data };
      if (payload.capitalSocial != null && payload.capitalSocial !== '') {
        payload.capitalSocial = Number(payload.capitalSocial);
      }
      if (company?.id) {
        await api.patch('/companies/' + company.id, payload);
        toast.success('Societe mise a jour');
      } else {
        const c = await api.post('/companies', payload);
        toast.success('Societe creee');
        router.push('/companies/' + c.id);
        return;
      }
      router.refresh();
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof Company>(key: K, value: Company[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      {showLookup && (
        <div className="border border-mdo-200 bg-mdo-50 rounded-md p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Search size={14} /> Rechercher dans l'annuaire (Pappers / INSEE Sirene)
            </h3>
            <button
              type="button"
              onClick={() => setShowLookup(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Saisie manuelle <X size={12} className="inline" />
            </button>
          </div>
          <input
            className="input"
            placeholder="Nom de societe, SIREN ou SIRET..."
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
          />
          {!providersAvailable && (
            <p className="text-xs text-amber-700">
              Pas de provider configure (PAPPERS_API_KEY / SIRENE_API_KEY). Saisie manuelle uniquement.
            </p>
          )}
          {lookupLoading && <p className="text-xs text-slate-500">Recherche...</p>}
          {lookupResults.length > 0 && (
            <ul className="border border-slate-200 rounded-md max-h-72 overflow-y-auto bg-white">
              {lookupResults.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => applyLookup(r)}
                    className="w-full text-left px-3 py-2 hover:bg-mdo-50 border-b last:border-b-0 border-slate-100"
                  >
                    <div className="font-medium text-sm">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      SIREN {r.siren}{r.apeLabel ? ' - ' + r.apeLabel : ''}
                      {r.city ? ' - ' + r.city : ''}
                      {r.legalForm ? ' - ' + r.legalForm : ''}
                      <span className="ml-2 text-mdo-500">[{r.source}]</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!showLookup && !company?.id && (
        <button
          type="button"
          onClick={() => setShowLookup(true)}
          className="text-xs text-mdo-600 hover:underline self-start"
        >
          <Search size={12} className="inline mr-1" />
          Rechercher dans l'annuaire (Pappers / INSEE)
        </button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Nom *</label>
          <input className="input" required value={data.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label">SIREN</label>
          <input className="input" value={data.siren ?? ''} onChange={(e) => set('siren', e.target.value)} />
        </div>
        <div>
          <label className="label">SIRET</label>
          <input className="input" value={data.siret ?? ''} onChange={(e) => set('siret', e.target.value)} />
        </div>
        <div>
          <label className="label">Forme juridique</label>
          <input className="input" value={data.legalForm ?? ''} onChange={(e) => set('legalForm', e.target.value)} />
        </div>
        <div>
          <label className="label">Code APE / NAF</label>
          <input className="input" value={data.apeCode ?? ''} onChange={(e) => set('apeCode', e.target.value)} />
        </div>
        <div>
          <label className="label">Libelle APE</label>
          <input className="input" value={data.apeLabel ?? ''} onChange={(e) => set('apeLabel', e.target.value)} />
        </div>
        <div>
          <label className="label">Capital social (EUR)</label>
          <input
            type="number"
            className="input"
            value={data.capitalSocial ?? ''}
            onChange={(e) => set('capitalSocial', e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div>
          <label className="label">Secteur</label>
          <select className="input" value={data.sector ?? 'PME'} onChange={(e) => set('sector', e.target.value)}>
            <option value="PME">PME</option>
            <option value="TPE">TPE</option>
            <option value="COLLECTIVITE">Collectivite</option>
            <option value="SANTE">Sante</option>
            <option value="INDUSTRIE">Industrie</option>
            <option value="EDUCATION">Education</option>
            <option value="ASSOCIATION">Association</option>
            <option value="AUTRE">Autre</option>
          </select>
        </div>
        <div>
          <label className="label">Statut</label>
          <select className="input" value={data.status ?? 'LEAD'} onChange={(e) => set('status', e.target.value)}>
            <option value="LEAD">Lead</option>
            <option value="PROSPECT">Prospect</option>
            <option value="CUSTOMER">Client</option>
            <option value="INACTIVE">Inactif</option>
          </select>
        </div>
        <div>
          <label className="label">Nb employes</label>
          <input type="number" className="input" value={data.employees ?? ''} onChange={(e) => set('employees', e.target.value ? parseInt(e.target.value) : undefined)} />
        </div>
        <div>
          <label className="label">Site web</label>
          <input className="input" value={data.website ?? ''} onChange={(e) => set('website', e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={data.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label className="label">Telephone</label>
          <input className="input" value={data.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Adresse</label>
          <input className="input" value={data.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div>
          <label className="label">Code postal</label>
          <input className="input" value={data.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} />
        </div>
        <div>
          <label className="label">Ville</label>
          <input className="input" value={data.city ?? ''} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Notes</label>
          <textarea className="input min-h-[80px]" value={data.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? 'Enregistrement...' : (company?.id ? 'Mettre a jour' : 'Creer')}
        </button>
        <button type="button" onClick={() => router.back()} className="btn btn-secondary">Annuler</button>
      </div>
    </form>
  );
}
