'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('crm_mdo_access_token') : null;
    router.replace(token ? '/dashboard' : '/login');
  }, [router]);
  return null;
}
