'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { me, User } from '@/lib/auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
      <main className="flex-1 bg-slate-50">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
