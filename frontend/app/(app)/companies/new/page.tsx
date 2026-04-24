import { CompanyForm } from '@/components/CompanyForm';

export default function NewCompanyPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold">Nouvelle societe</h1>
      <CompanyForm />
    </div>
  );
}
