'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ContractForm } from '@/components/ContractForm';

export default function NewContractPage() {
  const sp = useSearchParams();
  const companyId = sp.get('companyId') ?? undefined;
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    api.get('/companies?pageSize=500').then((res) => setCompanies(res.items));
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold">Nouveau contrat</h1>
      <ContractForm defaultCompanyId={companyId} companies={companies} />
    </div>
  );
}
