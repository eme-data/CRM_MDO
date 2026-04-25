'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users as UsersIcon,
  Target,
  FileText,
  Wrench,
  CheckSquare,
  LifeBuoy,
  ClipboardList,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { NotificationBell } from './NotificationBell';

const nav = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/companies', label: 'Societes', icon: Building2 },
  { href: '/contacts', label: 'Contacts', icon: UsersIcon },
  { href: '/opportunities', label: 'Opportunites', icon: Target },
  { href: '/contracts', label: 'Contrats', icon: FileText },
  { href: '/tickets', label: 'Support', icon: LifeBuoy },
  { href: '/interventions', label: 'Interventions', icon: Wrench },
  { href: '/tasks', label: 'Taches', icon: CheckSquare },
  { href: '/templates', label: 'Templates', icon: ClipboardList },
];

export function Sidebar({ user }: { user?: { firstName: string; lastName: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col min-h-screen">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white">CRM MDO</h1>
        <p className="text-xs text-slate-400">Services IT & Cybersecurite</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active ? 'bg-mdo-600 text-white' : 'text-slate-300 hover:bg-slate-800',
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-800 space-y-2">
        {user && (
          <div className="px-3 py-2 text-sm">
            <div className="font-medium">{user.firstName} {user.lastName}</div>
            <div className="text-xs text-slate-400">{user.role}</div>
          </div>
        )}
        <NotificationBell />
        <Link
          href="/time"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          <Settings size={18} /> Mon temps
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          <Settings size={18} /> Mon profil
        </Link>
        {user?.role === 'ADMIN' && (
          <>
            <Link
              href="/users"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              <Settings size={18} /> Utilisateurs
            </Link>
            <Link
              href="/admin/settings"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              <Settings size={18} /> Admin (cles, SMTP, IMAP)
            </Link>
            <Link
              href="/admin/activity"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              <Settings size={18} /> Journal d'activite
            </Link>
          </>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          <LogOut size={18} /> Deconnexion
        </button>
      </div>
    </aside>
  );
}
