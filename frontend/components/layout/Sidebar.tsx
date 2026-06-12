'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users as UsersIcon,
  Target,
  FileText,
  FileSignature,
  Wrench,
  CheckSquare,
  LifeBuoy,
  ClipboardList,
  Receipt,
  Server,
  Shield,
  ShieldCheck,
  Activity,
  Layers,
  ListChecks,
  Calendar,
  BarChart3,
  Upload,
  LogOut,
  Clock,
  Timer,
  CalendarRange,
  MessagesSquare,
  Footprints,
  User,
  ChevronDown,
  KeyRound,
  FileBarChart,
  Repeat,
  Workflow,
  Phone,
  BookOpen,
  Mail,
  Cpu,
  HardDrive,
  Award,
  Database,
  HelpCircle,
  CalendarDays,
  IdCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/lib/auth';
import { useBranding } from '@/components/BrandingProvider';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from '../ThemeToggle';
import { HealthBadge } from './HealthBadge';

type NavItem = { href: string; label: string; icon: any };
type NavSection = { title: string; items: NavItem[] };

const sections: NavSection[] = [
  {
    title: 'Pilotage',
    items: [
      { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { href: '/health-overview', label: 'Sante clients', icon: Activity },
      { href: '/customer-success', label: 'QBR / Customer Success', icon: Calendar },
      { href: '/reports', label: 'Reporting', icon: BarChart3 },
    ],
  },
  {
    title: 'Commercial',
    items: [
      { href: '/companies', label: 'Societes', icon: Building2 },
      { href: '/contacts', label: 'Contacts', icon: UsersIcon },
      { href: '/opportunities', label: 'Opportunites', icon: Target },
      { href: '/quotes', label: 'Devis', icon: FileSignature },
      { href: '/contracts', label: 'Contrats', icon: FileText },
      { href: '/invoices', label: 'Factures', icon: Receipt },
    ],
  },
  {
    title: 'Service & Support',
    items: [
      { href: '/tickets', label: 'Support', icon: LifeBuoy },
      { href: '/interventions', label: 'Interventions', icon: Wrench },
      { href: '/field', label: 'Mode terrain (tactile)', icon: Wrench },
      { href: '/calls', label: 'Appels', icon: Phone },
      { href: '/calendar', label: 'Calendrier', icon: Calendar },
    ],
  },
  {
    title: 'Infogerance',
    items: [
      { href: '/assets', label: 'Assets clients', icon: Server },
      { href: '/asset-lifecycle', label: 'Lifecycle materiel', icon: Server },
      { href: '/patch-management', label: 'Patch management', icon: Cpu },
      { href: '/backups', label: 'Backup verification', icon: HardDrive },
      { href: '/surveillance', label: 'Surveillance', icon: Shield },
      { href: '/uptime', label: 'Uptime sites', icon: Activity },
      { href: '/audit-dns', label: 'Audit DNS', icon: ShieldCheck },
      { href: '/email-security', label: 'Email security', icon: ShieldCheck },
      { href: '/soc', label: 'Console SOC', icon: ShieldCheck },
      { href: '/phishing', label: 'Phishing campagnes', icon: ShieldCheck },
    ],
  },
  {
    title: 'SIRH',
    items: [
      { href: '/conges', label: 'Conges & absences', icon: CalendarDays },
      { href: '/planning', label: 'Planning equipe', icon: CalendarRange },
      { href: '/feuilles', label: 'Feuilles de temps', icon: Timer },
      { href: '/frais', label: 'Notes de frais', icon: Receipt },
      { href: '/entretiens', label: 'Entretiens & objectifs', icon: MessagesSquare },
      { href: '/parcours', label: 'Arrivees / departs', icon: Footprints },
      { href: '/rh', label: 'Dossier RH', icon: IdCard },
    ],
  },
  {
    title: 'Outils',
    items: [
      { href: '/tasks', label: 'Taches', icon: CheckSquare },
      { href: '/templates', label: 'Templates', icon: ClipboardList },
      { href: '/kb', label: 'Knowledge base', icon: BookOpen },
    ],
  },
];

const adminItems: NavItem[] = [
  { href: '/users', label: 'Utilisateurs', icon: UsersIcon },
  { href: '/imports', label: 'Imports CSV', icon: Upload },
  { href: '/admin/settings', label: 'API, SMTP, IMAP', icon: KeyRound },
  { href: '/admin/billing', label: 'Facturation (Qonto)', icon: Receipt },
  { href: '/admin/executive', label: 'Dashboard exec MSP', icon: BarChart3 },
  { href: '/admin/profitability', label: 'Marges / rentabilite', icon: BarChart3 },
  { href: '/admin/products', label: 'Catalogue produits', icon: Layers },
  { href: '/admin/quote-templates', label: 'Templates devis', icon: FileSignature },
  { href: '/admin/win-loss', label: 'Win / Loss analysis', icon: Target },
  { href: '/admin/drip', label: 'Drip campaigns email', icon: Mail },
  { href: '/admin/api-keys', label: 'Cles API publique', icon: KeyRound },
  { href: '/admin/webhooks', label: 'Webhooks sortants', icon: Workflow },
  { href: '/admin/system-backup', label: 'Backup / Restore CRM', icon: Database },
  { href: '/admin/tenants', label: 'Tenants (super-admin)', icon: Building2 },
  { href: '/admin/cron-jobs', label: 'Cron jobs / planificateur', icon: Clock },
  { href: '/admin/health', label: 'Health check systeme', icon: Activity },
  { href: '/admin/subprocessors', label: 'Sous-traitants RGPD (DPA)', icon: ShieldCheck },
  { href: '/admin/client-reports', label: 'Rapports clients mensuels', icon: FileBarChart },
  { href: '/admin/time-billing', label: 'Facturation du temps', icon: Clock },
  { href: '/admin/flexible-asset-types', label: 'Templates assets flexibles', icon: Layers },
  { href: '/admin/runbooks', label: 'Runbooks / procedures', icon: ListChecks },
  { href: '/admin/onboarding-templates', label: 'Templates onboarding', icon: ListChecks },
  { href: '/admin/skills', label: 'Skills matrix equipe', icon: Award },
  { href: '/admin/recurring-tasks', label: 'Taches recurrentes', icon: Repeat },
  { href: '/admin/workflow-rules', label: 'Regles workflow', icon: Workflow },
  { href: '/admin/activity', label: "Journal d'activite", icon: ClipboardList },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-mdo-600 text-white shadow-sm'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white',
      )}
    >
      <Icon size={18} className={active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({ user }: { user?: { firstName: string; lastName: string; role: string; isSuperAdmin?: boolean } }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user?.role === 'ADMIN';
  const isSuperAdmin = user?.isSuperAdmin === true;
  const adminActive = isAdmin && adminItems.some((i) => pathname?.startsWith(i.href));
  const [adminOpen, setAdminOpen] = useState<boolean>(adminActive);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const branding = useBranding();
  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + '/');
  }

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col min-h-screen border-r border-slate-800">
      <div className="px-6 py-5 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white tracking-tight">CRM {branding.shortName}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{branding.tagline}</p>
        <p className="text-[11px] text-slate-500 mt-2 inline-flex items-center gap-1">
          <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
          <span>+</span>
          <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px]">K</kbd>
          <span>rechercher</span>
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto sidebar-scroll">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {section.title}
            </p>
            <div className="space-y-0.5 mt-1">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          </div>
        ))}

        {isAdmin && <HealthBadge />}

        {isAdmin && (
          <div className="mb-4">
            <button
              onClick={() => setAdminOpen((o) => !o)}
              aria-expanded={adminOpen}
              className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
            >
              <span>Administration</span>
              <ChevronDown size={12} className={cn('transition-transform', adminOpen && 'rotate-180')} />
            </button>
            {adminOpen && (
              <div className="space-y-0.5 mt-1">
                {adminItems.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Section super-admin : visible UNIQUEMENT pour Mathieu (isSuperAdmin
            sur User). Permet de creer/lister/editer/suspendre les tenants.
            Cache pour les admins de tenant client. */}
        {isSuperAdmin && (
          <div className="mb-4 mt-2 pt-3 border-t border-slate-800">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-500">
              Super-admin SaaS
            </p>
            <div className="space-y-0.5 mt-1">
              <NavLink
                item={{ href: '/super-admin/tenants', label: 'Tenants', icon: Building2 }}
                active={isActive('/super-admin/tenants')}
              />
            </div>
          </div>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-slate-800 space-y-1">
        {user && (
          <div className="flex items-center gap-3 px-3 py-2 mb-1 rounded-md bg-slate-800/50">
            <div className="h-8 w-8 rounded-full bg-mdo-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{user.firstName} {user.lastName}</div>
              <div className="text-[11px] text-slate-400 truncate">{user.role}</div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-1">
          <NotificationBell />
          <ThemeToggle />
        </div>
        <NavLink item={{ href: '/aide', label: 'Aide & documentation', icon: HelpCircle }} active={isActive('/aide')} />
        <NavLink item={{ href: '/time', label: 'Mon temps', icon: Clock }} active={isActive('/time')} />
        <NavLink item={{ href: '/settings', label: 'Mon profil', icon: User }} active={isActive('/settings')} />
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut size={18} className="text-slate-400" /> Deconnexion
        </button>
      </div>
    </aside>
  );
}
