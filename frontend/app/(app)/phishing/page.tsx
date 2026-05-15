'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Fish, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface Campaign {
  id: string;
  name: string;
  vendor: string;
  status: string;
  sentAt: string | null;
  totalRecipients: number;
  openedCount: number;
  clickedCount: number;
  reportedCount: number;
  dataEnteredCount: number;
  templateName: string | null;
  company: { id: string; name: string };
  _count: { results: number };
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function pct(part: number, total: number): string {
  return total > 0 ? Math.round((part / total) * 100) + '%' : '-';
}

export default function PhishingPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [creating, setCreating] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);

  async function load() { setItems(await api.get('/phishing/campaigns')); }
  useEffect(() => {
    load();
    api.get('/companies?pageSize=500').then((r) => setCompanies(r.items));
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const payload = {
      name: (f.elements.namedItem('name') as HTMLInputElement).value,
      vendor: (f.elements.namedItem('vendor') as HTMLSelectElement).value,
      companyId: (f.elements.namedItem('companyId') as HTMLSelectElement).value,
      sentAt: (f.elements.namedItem('sentAt') as HTMLInputElement).value || undefined,
      templateName: (f.elements.namedItem('templateName') as HTMLInputElement).value || undefined,
    };
    try { await api.post('/phishing/campaigns', payload); toast.success('Campagne creee'); setCreating(false); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Fish size={28} className="text-mdo-600" /> Campagnes phishing
        </h1>
        {!creating && <button onClick={() => setCreating(true)} className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouvelle</button>}
      </div>

      {creating && (
        <form onSubmit={submit} className="card p-6 space-y-3 border-mdo-200 bg-mdo-50">
          <h2 className="font-semibold">Nouvelle campagne</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Nom *</label><input name="name" required className="input" placeholder="Phishing Q2 2026 Banque" /></div>
            <div><label className="label">Vendor</label>
              <select name="vendor" className="input" defaultValue="GOPHISH">
                <option value="GOPHISH">GoPhish</option>
                <option value="KNOWBE4">KnowBe4</option>
                <option value="M365_ATTACK_SIM">M365 Attack Simulator</option>
                <option value="CUSTOM">Autre</option>
              </select>
            </div>
            <div><label className="label">Societe *</label>
              <select name="companyId" required className="input">
                <option value="">--</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Template email</label><input name="templateName" className="input" placeholder="Faux mail bancaire, etc." /></div>
            <div><label className="label">Date d'envoi</label><input name="sentAt" type="date" className="input" /></div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Creer</button>
            <button type="button" onClick={() => setCreating(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Campagne</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Date envoi</th>
              <th className="p-3 font-medium text-right">Recipients</th>
              <th className="p-3 font-medium text-right">Cliques</th>
              <th className="p-3 font-medium text-right">Compromis</th>
              <th className="p-3 font-medium text-right">Signales</th>
              <th className="p-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Aucune campagne. Creez-en une et importez les resultats CSV apres execution.</td></tr>
            ) : items.map((c) => (
              <tr key={c.id} className="border-t hover:bg-slate-50">
                <td className="p-3">
                  <Link href={'/phishing/' + c.id} className="text-mdo-600 hover:underline font-medium">{c.name}</Link>
                  {c.templateName && <div className="text-xs text-slate-400">{c.templateName}</div>}
                </td>
                <td className="p-3 text-xs">
                  <Link href={'/companies/' + c.company.id} className="text-mdo-600 hover:underline">{c.company.name}</Link>
                </td>
                <td className="p-3 text-xs">{c.sentAt ? formatDate(c.sentAt) : '-'}</td>
                <td className="p-3 text-right">{c.totalRecipients}</td>
                <td className="p-3 text-right">
                  {c.clickedCount} <span className="text-xs text-slate-400">({pct(c.clickedCount, c.totalRecipients)})</span>
                </td>
                <td className="p-3 text-right text-red-600 font-medium">
                  {c.dataEnteredCount} <span className="text-xs">({pct(c.dataEnteredCount, c.totalRecipients)})</span>
                </td>
                <td className="p-3 text-right text-emerald-600">
                  {c.reportedCount} <span className="text-xs">({pct(c.reportedCount, c.totalRecipients)})</span>
                </td>
                <td className="p-3"><span className={'badge ' + STATUS_COLOR[c.status]}>{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
