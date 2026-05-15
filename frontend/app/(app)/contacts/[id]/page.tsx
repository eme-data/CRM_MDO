'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [contact, setContact] = useState<any>(null);
  const confirm = useConfirm();

  useEffect(() => {
    api.get('/contacts/' + id)
      .then(setContact)
      .catch((err) => toast.error('Chargement contact : ' + err.message));
  }, [id]);

  async function handleDelete() {
    const fullName = contact ? `${contact.firstName} ${contact.lastName}` : 'ce contact';
    const ok = await confirm({
      title: 'Supprimer ce contact ?',
      message: `« ${fullName} » sera definitivement supprime.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete('/contacts/' + id);
      toast.success('Contact supprime');
      router.replace('/contacts');
    } catch (err: any) { toast.error(err.message); }
  }

  if (!contact) return (
    <div className="space-y-6 max-w-3xl">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-64" />
      <div className="card p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
      </div>
    </div>
  );

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
