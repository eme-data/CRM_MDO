'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Upload, AlertTriangle, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

function pct(part: number, total: number): string {
  return total > 0 ? Math.round((part / total) * 100) + '%' : '-';
}

// Parser CSV minimaliste (header + lignes virgule). Pour le MVP suffit ;
// si besoin de robustesse (quotes, escaping), passer a papaparse.
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [c, setC] = useState<any>(null);

  async function load() { setC(await api.get('/phishing/campaigns/' + id)); }
  useEffect(() => { load(); }, [id]);

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { toast.error('CSV vide ou invalide'); return; }
    try {
      const res = await api.post('/phishing/campaigns/' + id + '/import', { rows });
      toast.success(res.imported + ' resultat(s) importe(s)');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  if (!c) return <div>Chargement...</div>;

  const compromised = c.results.filter((r: any) => r.dataEntered);
  const clickedNotEntered = c.results.filter((r: any) => r.clicked && !r.dataEntered);
  const reported = c.results.filter((r: any) => r.reportedAsPhish);

  return (
    <div className="space-y-6">
      <Link href="/phishing" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour campagnes
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{c.name}</h1>
          <p className="text-slate-600 mt-1">
            <Link href={'/companies/' + c.company.id} className="text-mdo-600 hover:underline">{c.company.name}</Link>
            {' · '}{c.vendor}
            {c.sentAt && ' · envoye ' + formatDate(c.sentAt)}
          </p>
        </div>
        <label className="btn btn-primary cursor-pointer">
          <Upload size={14} className="mr-1" /> Importer CSV resultats
          <input type="file" accept=".csv" className="hidden" onChange={importCsv} />
        </label>
      </div>

      <div className="card p-3 text-xs text-slate-600 bg-slate-50">
        Format CSV attendu : <code>email,name,opened,clicked,reportedAsPhish,dataEntered,openedAt,clickedAt,reportedAt,dataEnteredAt</code>
        — booleens true/false/1/0/yes/no, dates ISO ou vides.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card p-3"><p className="text-xs text-slate-500">Destinataires</p><p className="text-2xl font-bold">{c.totalRecipients}</p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Ouverts</p><p className="text-2xl font-bold">{c.openedCount}<span className="text-xs text-slate-400 ml-1">{pct(c.openedCount, c.totalRecipients)}</span></p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Cliques</p><p className="text-2xl font-bold text-amber-600">{c.clickedCount}<span className="text-xs ml-1">{pct(c.clickedCount, c.totalRecipients)}</span></p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Compromis</p><p className="text-2xl font-bold text-red-600">{c.dataEnteredCount}<span className="text-xs ml-1">{pct(c.dataEnteredCount, c.totalRecipients)}</span></p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Signales (bons reflexes)</p><p className="text-2xl font-bold text-emerald-600">{c.reportedCount}<span className="text-xs ml-1">{pct(c.reportedCount, c.totalRecipients)}</span></p></div>
      </div>

      {compromised.length > 0 && (
        <div className="card p-4 border-l-4 border-red-300 bg-red-50/50">
          <h3 className="font-semibold flex items-center gap-2 text-red-700">
            <AlertTriangle size={16} /> {compromised.length} utilisateur(s) compromis (a former en priorite)
          </h3>
          <ul className="mt-2 text-sm space-y-0.5">
            {compromised.map((r: any) => (
              <li key={r.id}>
                <strong>{r.userName ?? r.userEmail}</strong> &lt;{r.userEmail}&gt;
                {r.dataEnteredAt && <span className="text-xs text-slate-500"> — saisie {formatDate(r.dataEnteredAt)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Destinataire</th>
              <th className="p-3 font-medium text-center">Ouvert</th>
              <th className="p-3 font-medium text-center">Clique</th>
              <th className="p-3 font-medium text-center">Compromis</th>
              <th className="p-3 font-medium text-center">Signale</th>
            </tr>
          </thead>
          <tbody>
            {c.results.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-slate-400">Aucun resultat. Importez le CSV ci-dessus.</td></tr>
            ) : c.results.map((r: any) => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="p-3">
                  <div className="font-medium">{r.userName ?? '—'}</div>
                  <div className="text-xs text-slate-400">{r.userEmail}</div>
                </td>
                <td className="p-3 text-center">{r.opened ? <Check size={16} className="text-amber-500 mx-auto" /> : <X size={16} className="text-slate-300 mx-auto" />}</td>
                <td className="p-3 text-center">{r.clicked ? <Check size={16} className="text-amber-600 mx-auto" /> : <X size={16} className="text-slate-300 mx-auto" />}</td>
                <td className="p-3 text-center">{r.dataEntered ? <Check size={16} className="text-red-600 mx-auto" /> : <X size={16} className="text-slate-300 mx-auto" />}</td>
                <td className="p-3 text-center">{r.reportedAsPhish ? <Check size={16} className="text-emerald-600 mx-auto" /> : <X size={16} className="text-slate-300 mx-auto" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
