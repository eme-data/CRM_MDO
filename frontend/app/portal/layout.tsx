'use client';
import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, FileText, LifeBuoy, Server, LogOut, Building2, Menu, X, Receipt, Activity, ShieldCheck, HardDrive, FolderOpen } from 'lucide-react';
import { portalApi, getPortalSession, clearPortalSession } from '@/lib/portal-api';
import { cn } from '@/lib/utils';
import { useBranding } from '@/components/BrandingProvider';

interface PortalUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: { id: string; name: string };
}

// Layout du portail client. Distinct du layout (app) interne MDO.
// - Pas de Sidebar internes (Reporting, Settings, etc.)
// - Branding plus discret, focus sur la consultation
// - Auth via session portail (token X-Portal-Session)

export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const branding = useBranding();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const isAuthPage = pathname?.startsWith('/portal/login') || pathname?.startsWith('/portal/verify');

  useEffect(() => {
    if (isAuthPage) {
      setLoading(false);
      return;
    }
    const session = getPortalSession();
    if (!session) {
      router.replace('/portal/login');
      return;
    }
    portalApi.get('/auth/me')
      .then(setUser)
      .catch(() => router.replace('/portal/login'))
      .finally(() => setLoading(false));
  }, [pathname, isAuthPage, router]);

  async function handleLogout() {
    try { await portalApi.post('/auth/logout'); } catch {}
    clearPortalSession();
    router.replace('/portal/login');
  }

  if (isAuthPage) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400">Chargement...</div>
      </div>
    );
  }

  if (!user) return null;

  const nav = [
    { href: '/portal', label: 'Accueil', icon: LayoutDashboard },
    { href: '/portal/tickets', label: 'Tickets', icon: LifeBuoy },
    { href: '/portal/contracts', label: 'Contrats', icon: FileText },
    { href: '/portal/documents', label: 'Documents', icon: FolderOpen },
    { href: '/portal/invoices', label: 'Factures', icon: Receipt },
    { href: '/portal/uptime', label: 'Uptime', icon: Activity },
    { href: '/portal/cyber-score', label: 'Cyber Score', icon: ShieldCheck },
    { href: '/portal/backups', label: 'Sauvegardes', icon: HardDrive },
    { href: '/portal/assets', label: 'Assets', icon: Server },
    { href: '/portal/subprocessors', label: 'Sous-traitants RGPD', icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Link href="/portal" className="font-bold text-lg text-mdo-600 tracking-tight">
            Espace client {branding.shortName}
          </Link>
          <nav className="hidden md:flex gap-1 ml-6">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== '/portal' && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                    active
                      ? 'bg-mdo-50 text-mdo-700 dark:bg-mdo-900/30 dark:text-mdo-300'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                  )}
                >
                  <Icon size={14} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <Building2 size={14} className="text-slate-400" />
              <span className="font-medium">{user.company.name}</span>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Se deconnecter"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Deconnexion</span>
            </button>
            <button
              className="md:hidden text-slate-600"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="md:hidden border-t border-slate-200 dark:border-slate-800 px-2 py-2 space-y-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== '/portal' && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm',
                    active ? 'bg-mdo-50 text-mdo-700' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  <Icon size={14} /> {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">{children}</main>
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-slate-400">
        <a href={branding.websiteUrl} className="hover:underline">{branding.name}</a>
        {branding.tagline ? ' - ' + branding.tagline : ''}
      </footer>
    </div>
  );
}
