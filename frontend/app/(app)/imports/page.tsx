'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Upload, FileText } from 'lucide-react';
import { api } from '@/lib/api';

const COMPANY_TEMPLATE = `name,siret,siren,email,phone,address,postalCode,city,sector,status,website
Acme SARL,12345678901234,123456789,contact@acme.fr,01 23 45 67 89,12 rue de la Paix,75002,Paris,PME,CUSTOMER,acme.fr
Beta SAS,,987654321,info@beta.fr,,,,Lyon,TPE,LEAD,
`;

const CONTACT_TEMPLATE = `firstName,lastName,email,phone,mobile,position,companyName
Jean,Dupont,jean.dupont@acme.fr,01 23 45 67 89,06 12 34 56 78,Directeur,Acme SARL
Marie,Martin,marie.martin@beta.fr,,,RH,Beta SAS
`;

export default function ImportsPage() {
  const [type, setType] = useState<'companies' | 'contacts'>('companies');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  function loadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(f);
  }

  function loadTemplate() {
    setCsv(type === 'companies' ? COMPANY_TEMPLATE : CONTACT_TEMPLATE);
  }

  async function submit() {
    if (!csv.trim()) { toast.error('CSV vide'); return; }
    setLoading(true);
    try {
      const r = await api.post('/imports/' + type, { csv });
      setResult(r);
      toast.success(r.created + ' creees, ' + r.updated + ' mises a jour');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold">Import CSV</h1>

      <div className="card p-6 space-y-4">
        <div className="flex gap-2">
          <button onClick={() => setType('companies')} className={'btn ' + (type === 'companies' ? 'btn-primary' : 'btn-secondary')}>
            Societes
          </button>
          <button onClick={() => setType('contacts')} className={'btn ' + (type === 'contacts' ? 'btn-primary' : 'btn-secondary')}>
            Contacts
          </button>
        </div>

        <div className="text-sm text-slate-500 dark:text-slate-400">
          {type === 'companies' ? (
            <>Colonnes : <code>name</code> (requis), <code>siret</code>, <code>siren</code>, <code>email</code>, <code>phone</code>, <code>address</code>, <code>postalCode</code>, <code>city</code>, <code>sector</code> (PME/TPE/COLLECTIVITE/SANTE/INDUSTRIE/EDUCATION/ASSOCIATION), <code>status</code> (LEAD/PROSPECT/CUSTOMER/INACTIVE), <code>website</code>. Dedup : SIRET &gt; SIREN &gt; nom.</>
          ) : (
            <>Colonnes : <code>firstName</code>, <code>lastName</code> (requis), <code>email</code>, <code>phone</code>, <code>mobile</code>, <code>position</code>, <code>companyName</code> (matching par nom de societe). Dedup : email.</>
          )}
        </div>

        <div className="flex gap-2">
          <label className="btn btn-secondary cursor-pointer">
            <Upload size={14} className="mr-1" /> Charger un fichier
            <input type="file" accept=".csv" className="hidden" onChange={loadFile} />
          </label>
          <button onClick={loadTemplate} className="btn btn-secondary">
            <FileText size={14} className="mr-1" /> Charger un template
          </button>
        </div>

        <textarea
          className="input min-h-[200px] font-mono text-xs"
          placeholder="Collez votre CSV ici..."
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />

        <button onClick={submit} disabled={loading || !csv.trim()} className="btn btn-primary">
          {loading ? 'Import en cours...' : 'Importer'}
        </button>
      </div>

      {result && (
        <div className="card p-6 space-y-2">
          <h2 className="font-semibold">Resultat</h2>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div><div className="text-2xl font-bold">{result.total}</div><div className="text-xs text-slate-500">Total</div></div>
            <div><div className="text-2xl font-bold text-emerald-600">{result.created}</div><div className="text-xs text-slate-500">Crees</div></div>
            <div><div className="text-2xl font-bold text-blue-600">{result.updated}</div><div className="text-xs text-slate-500">Mis a jour</div></div>
            <div><div className="text-2xl font-bold text-red-600">{result.errors.length}</div><div className="text-xs text-slate-500">Erreurs</div></div>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold text-sm mb-2">Erreurs</h3>
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                {result.errors.map((e: any, i: number) => (
                  <li key={i} className="text-red-600">Ligne {e.row} : {e.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
