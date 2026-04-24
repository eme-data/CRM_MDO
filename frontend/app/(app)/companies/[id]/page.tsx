'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Edit, Trash2, ArrowLeft, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { CompanyForm } from '@/components/CompanyForm';
import {
  formatEuro,
  formatDate,
  sectorLabel,
  companyStatusLabel,
  contractOfferLabel,
  contractStatusLabel,
  contractStatusColor,
  stageLabel,
} from '@/lib/utils';

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [company, setCompany] = useState<any>(null);
  const [editing, setEditing] = useState(false);

  async function load() {
    const c = await api.get('/companies/' + id);
    setCompany(c);
  }
  useEffect(() => { load(); }, [id]);

  async function handleDelete() {
    if (!confirm('Supprimer definitivement cette societe ?')) return;
    try {
      await api.delete('/companies/' + id);
      toast.success('Societe supprimee');
      router.replace('/companies');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  if (!company) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <Link href="/companies" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour aux societes
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{company.name}</h1>
          <div className="mt-2 flex gap-2 text-sm">
            <span className="badge bg-slate-100 text-slate-700">{sectorLabel[company.sector]}</span>
            <span className="badge bg-blue-100 text-blue-700">{companyStatusLabel[company.status]}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(!editing)} className="btn btn-secondary">
            <Edit size={16} className="mr-1" /> {editing ? 'Annuler' : 'Modifier'}
          </button>
          <button onClick={handleDelete} className="btn btn-danger">
            <Trash2 size={16} className="mr-1" /> Supprimer
          </button>
        </div>
      </div>

      {editing ? (
        <CompanyForm company={company} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-6 space-y-2">
            <h2 className="font-semibold mb-2">Informations</h2>
            <Info label="SIRET" value={company.siret} />
            <Info label="Nb employes" value={company.employees} />
            <Info label="Site web" value={company.website} />
            <Info label="Email" value={company.email} />
            <Info label="Telephone" value={company.phone} />
            <Info label="Adresse" value={[company.address, company.postalCode, company.city].filter(Boolean).join(' ')} />
            <Info label="Owner" value={company.owner ? company.owner.firstName + ' ' + company.owner.lastName : null} />
          </div>
          <div className="card p-6">
            <h2 className="font-semibold mb-2">Notes</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{company.notes || 'Aucune note'}</p>
          </div>
        </div>
      )}

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Contrats ({company.contracts.length})</h2>
          <Link href={'/contracts/new?companyId=' + id} className="btn btn-secondary">
            <Plus size={14} className="mr-1" /> Nouveau contrat
          </Link>
        </div>
        {company.contracts.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun contrat</p>
        ) : (
          <div className="space-y-2">
            {company.contracts.map((c: any) => (
              <Link
                key={c.id}
                href={'/contracts/' + c.id}
                className="block rounded-md border border-slate-200 p-3 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{c.reference} - {c.title}</p>
                    <p className="text-sm text-slate-500">
                      {contractOfferLabel[c.offer]} - {formatEuro(c.monthlyAmountHt)}/mois HT
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={'badge ' + contractStatusColor[c.status]}>
                      {contractStatusLabel[c.status]}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDate(c.startDate)} -&gt; {formatDate(c.endDate)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Contacts ({company.contacts.length})</h2>
          <Link href={'/contacts/new?companyId=' + id} className="btn btn-secondary">
            <Plus size={14} className="mr-1" /> Nouveau contact
          </Link>
        </div>
        {company.contacts.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun contact</p>
        ) : (
          <div className="space-y-2">
            {company.contacts.map((c: any) => (
              <Link
                key={c.id}
                href={'/contacts/' + c.id}
                className="block rounded-md border border-slate-200 p-3 hover:bg-slate-50 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">
                    {c.firstName} {c.lastName}
                    {c.isPrimary && <span className="ml-2 badge bg-amber-100 text-amber-700">Principal</span>}
                  </p>
                  <p className="text-sm text-slate-500">{c.position ?? '-'} - {c.email ?? ''}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {company.opportunities.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Opportunites ({company.opportunities.length})</h2>
          <div className="space-y-2">
            {company.opportunities.map((o: any) => (
              <Link
                key={o.id}
                href={'/opportunities/' + o.id}
                className="block rounded-md border border-slate-200 p-3 hover:bg-slate-50 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{o.title}</p>
                  <p className="text-sm text-slate-500">{stageLabel[o.stage]} - {formatEuro(o.amountHt)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex text-sm">
      <span className="w-32 text-slate-500">{label}</span>
      <span>{value ?? '-'}</span>
    </div>
  );
}
