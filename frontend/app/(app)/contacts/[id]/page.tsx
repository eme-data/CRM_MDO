'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [contact, setContact] = useState<any>(null);

  useEffect(() => { api.get('/contacts/' + id).then(setContact); }, [id]);

  async function handleDelete() {
    if (!confirm('Supprimer ce contact ?')) return;
    await api.delete('/contacts/' + id);
    toast.success('Contact supprime');
    router.replace('/contacts');
  }

  if (!contact) return <div>Chargement...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/contacts" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour aux contacts
      </Link>
      <div className="flex items-start justify-between">
        <h1 className="text-3xl font-bold">{contact.firstName} {contact.lastName}</h1>
        <button onClick={handleDelete} className="btn btn-danger"><Trash2 size={16} className="mr-1" /> Supprimer</button>
      </div>
      <div className="card p-6 space-y-2 text-sm">
        <Info label="Societe" value={contact.company ? <Link className="text-mdo-600 hover:underline" href={'/companies/' + contact.company.id}>{contact.company.name}</Link> : '-'} />
        <Info label="Poste" value={contact.position} />
        <Info label="Email" value={contact.email} />
        <Info label="Telephone" value={contact.phone} />
        <Info label="Mobile" value={contact.mobile} />
        <Info label="Notes" value={<pre className="whitespace-pre-wrap font-sans">{contact.notes || '-'}</pre>} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (<div className="flex"><span className="w-32 text-slate-500">{label}</span><span>{value ?? '-'}</span></div>);
}
