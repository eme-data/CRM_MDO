'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatEuro, stageLabel } from '@/lib/utils';

const STAGES = ['QUALIFICATION', 'PROPOSITION', 'NEGOCIATION', 'GAGNE', 'PERDU'];
const stageColor: Record<string, string> = {
  QUALIFICATION: 'border-slate-300',
  PROPOSITION: 'border-blue-300',
  NEGOCIATION: 'border-amber-300',
  GAGNE: 'border-emerald-300',
  PERDU: 'border-red-300',
};

export default function OpportunitiesPage() {
  const [kanban, setKanban] = useState<any[]>([]);

  useEffect(() => { api.get('/opportunities/kanban').then(setKanban); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Opportunites</h1>
        <Link href="/opportunities/new" className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouvelle</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {kanban.map((col) => (
          <div key={col.stage} className={'card border-t-4 p-3 ' + stageColor[col.stage]}>
            <div className="flex justify-between mb-2">
              <h3 className="font-semibold text-sm">{stageLabel[col.stage]}</h3>
              <span className="text-xs text-slate-500">{col.count}</span>
            </div>
            <div className="text-xs text-slate-500 mb-3">{formatEuro(col.totalAmount)}</div>
            <div className="space-y-2">
              {col.items.map((o: any) => (
                <Link key={o.id} href={'/opportunities/' + o.id} className="block rounded-md border border-slate-200 p-2 hover:bg-slate-50 text-xs">
                  <div className="font-medium truncate">{o.title}</div>
                  <div className="text-slate-500 truncate">{o.company.name}</div>
                  <div className="mt-1 font-medium text-mdo-600">{formatEuro(o.amountHt)}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
