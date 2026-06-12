'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  LayoutDashboard, Users, CalendarDays, Timer, Receipt, Target,
  MessagesSquare, Footprints, Plane,
} from 'lucide-react';
import { api } from '@/lib/api';
import { me as fetchMe, User } from '@/lib/auth';

interface Absent { userId: string; name: string; typeName: string; color: string; until: string }
interface UpcomingReview { id: string; type: string; scheduledAt: string | null; employee: string }
interface ActiveJourney { id: string; title: string; kind: string; startDate: string | null; employee: string; done: number; total: number }
interface Summary {
  headcount: number;
  absentToday: Absent[];
  counts: { upcomingLeaves: number; pendingLeaves: number; pendingTimesheets: number; pendingExpenses: number; pendingExpensesAmount: number; openObjectives: number };
  upcomingReviews: UpcomingReview[];
  activeJourneys: ActiveJourney[];
}

const RTYPE: Record<string, string> = { ANNUAL: 'Annuel', PROFESSIONAL: 'Professionnel', PROBATION: 'Periode d\'essai', ONE_ON_ONE: 'Individuel' };
const KIND: Record<string, { label: string; cls: string }> = {
  ONBOARDING: { label: 'Arrivee', cls: 'bg-emerald-100 text-emerald-700' },
  OFFBOARDING: { label: 'Depart', cls: 'bg-orange-100 text-orange-700' },
};
function frDate(s: string | null) { return s ? new Date(s).toLocaleDateString('fr-FR') : '-'; }
function eur(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); }

function Kpi({ icon: Icon, label, value, href, accent }: { icon: any; label: string; value: string | number; href: string; accent?: boolean }) {
  return (
    <Link href={href} className={'card p-4 flex items-center gap-3 hover:shadow-md transition-shadow ' + (accent ? 'border-amber-300' : '')}>
      <div className={'h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ' + (accent ? 'bg-amber-100 text-amber-700' : 'bg-mdo-50 text-mdo-600')}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-xs text-slate-500 truncate">{label}</div>
      </div>
    </Link>
  );
}

export default function SirhDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<Summary | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => { fetchMe().then(setUser).catch(() => {}); }, []);
  useEffect(() => {
    if (!user) return;
    api.get<Summary>('/hr-dashboard').then(setData).catch((e) => {
      if (String(e?.message ?? '').match(/403|Reserve|Forbidden/i)) setDenied(true);
      else toast.error('Chargement du dashboard echoue');
    });
  }, [user]);

  if (denied) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold flex items-center gap-3 mb-4"><LayoutDashboard size={28} className="text-mdo-600" /> Tableau de bord RH</h1>
        <p className="text-slate-500">Cet espace est reserve aux RH (roles Admin / Manager). Retrouvez vos infos personnelles dans les autres pages de la section SIRH.</p>
      </div>
    );
  }

  const c = data?.counts;

  return (
    <div className="space-y-8 max-w-5xl">
      <h1 className="text-3xl font-bold flex items-center gap-3"><LayoutDashboard size={28} className="text-mdo-600" /> Tableau de bord RH</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Effectif actif" value={data?.headcount ?? '-'} href="/rh" />
        <Kpi icon={Plane} label="Absents aujourd'hui" value={data?.absentToday.length ?? '-'} href="/planning" />
        <Kpi icon={CalendarDays} label="Conges a valider" value={c?.pendingLeaves ?? '-'} href="/conges" accent={!!c?.pendingLeaves} />
        <Kpi icon={Timer} label="Feuilles a valider" value={c?.pendingTimesheets ?? '-'} href="/feuilles" accent={!!c?.pendingTimesheets} />
        <Kpi icon={Receipt} label={'Frais a valider' + (c?.pendingExpensesAmount ? ' · ' + eur(c.pendingExpensesAmount) : '')} value={c?.pendingExpenses ?? '-'} href="/frais" accent={!!c?.pendingExpenses} />
        <Kpi icon={CalendarDays} label="Conges a venir (14j)" value={c?.upcomingLeaves ?? '-'} href="/planning" />
        <Kpi icon={Target} label="Objectifs en cours" value={c?.openObjectives ?? '-'} href="/entretiens" />
        <Kpi icon={Footprints} label="Parcours en cours" value={data?.activeJourneys.length ?? '-'} href="/parcours" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Absents aujourd'hui */}
        <section className="card overflow-hidden">
          <div className="p-3 border-b font-semibold flex items-center gap-2"><Plane size={16} /> Absents aujourd'hui</div>
          <div className="divide-y">
            {!data ? <p className="p-4 text-sm text-slate-400">Chargement...</p>
              : data.absentToday.length === 0 ? <p className="p-4 text-sm text-slate-400">Tout le monde est present.</p>
              : data.absentToday.map((a) => (
                <div key={a.userId} className="flex items-center gap-3 p-3 text-sm">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                  <span className="font-medium flex-1">{a.name}</span>
                  <span className="text-slate-500">{a.typeName}</span>
                  <span className="text-xs text-slate-400">jusqu'au {frDate(a.until)}</span>
                </div>
              ))}
          </div>
        </section>

        {/* Entretiens a venir */}
        <section className="card overflow-hidden">
          <div className="p-3 border-b font-semibold flex items-center gap-2"><MessagesSquare size={16} /> Entretiens a venir</div>
          <div className="divide-y">
            {!data ? <p className="p-4 text-sm text-slate-400">Chargement...</p>
              : data.upcomingReviews.length === 0 ? <p className="p-4 text-sm text-slate-400">Aucun entretien planifie.</p>
              : data.upcomingReviews.map((r) => (
                <Link key={r.id} href="/entretiens" className="flex items-center gap-3 p-3 text-sm hover:bg-slate-50">
                  <span className="font-medium flex-1">{r.employee}</span>
                  <span className="text-slate-500">{RTYPE[r.type] ?? r.type}</span>
                  <span className="text-xs text-slate-400">{frDate(r.scheduledAt)}</span>
                </Link>
              ))}
          </div>
        </section>
      </div>

      {/* Parcours en cours */}
      <section className="card overflow-hidden">
        <div className="p-3 border-b font-semibold flex items-center gap-2"><Footprints size={16} /> Parcours en cours</div>
        <div className="divide-y">
          {!data ? <p className="p-4 text-sm text-slate-400">Chargement...</p>
            : data.activeJourneys.length === 0 ? <p className="p-4 text-sm text-slate-400">Aucun parcours en cours.</p>
            : data.activeJourneys.map((j) => {
              const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
              return (
                <Link key={j.id} href="/parcours" className="flex items-center gap-3 p-3 text-sm hover:bg-slate-50">
                  <span className={'badge ' + (KIND[j.kind]?.cls ?? '')}>{KIND[j.kind]?.label}</span>
                  <span className="font-medium">{j.title}</span>
                  <span className="text-slate-500">{j.employee}</span>
                  {j.startDate && <span className="text-xs text-slate-400">{frDate(j.startDate)}</span>}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-slate-500">{j.done}/{j.total}</span>
                    <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
                      <div className="h-full bg-mdo-600" style={{ width: pct + '%' }} />
                    </div>
                  </div>
                </Link>
              );
            })}
        </div>
      </section>
    </div>
  );
}
