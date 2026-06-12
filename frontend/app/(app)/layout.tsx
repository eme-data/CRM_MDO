'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { TimerWidget } from '@/components/TimerWidget';
import { DemoBanner } from '@/components/DemoBanner';
import { me, User } from '@/lib/auth';
import { featureForPath, hasFeature, homePathFor } from '@/lib/modules';
import { bootstrapNativePush } from '@/lib/native';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Apply theme on mount (avant le render)
    const theme = localStorage.getItem('crm_mdo_theme');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    // Bootstrap notifications natives si on tourne dans l'app mobile Capacitor.
    // No-op sur le Web. Recupere le token FCM/APNS pour le futur fallback push
    // natif (cf lib/native.ts pour le statut "TODO backend register-native").
    bootstrapNativePush();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('crm_mdo_access_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    me()
      .then((u) => { setUser(u); setLoading(false); })
      .catch(() => router.replace('/login'));
  }, [router]);

  // Garde d'entitlements : si l'URL courante appartient a un module non inclus
  // dans l'offre du tenant, on redirige vers une page autorisee. Le super-admin
  // et les tenants sans restriction ont `modules` = tout le catalogue.
  useEffect(() => {
    if (!user || !pathname) return;
    const feature = featureForPath(pathname);
    if (feature && !hasFeature(user.modules, feature)) {
      router.replace(homePathFor(user.modules));
    }
  }, [user, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user ?? undefined} />
      <main className="flex-1 bg-slate-50 dark:bg-slate-900 dark:text-slate-100">
        <DemoBanner />
        <div className="p-8">{children}</div>
      </main>
      <CommandPalette />
      <TimerWidget />
    </div>
  );
}
