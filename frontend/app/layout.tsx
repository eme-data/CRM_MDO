import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { BrandingProvider } from '@/components/BrandingProvider';
import { SwUpdater } from '@/components/SwUpdater';
import './globals.css';

// Metadata defaut : remplaces dynamiquement cote client par le BrandingProvider
// pour les instances multi-instance (cf .env BRAND_NAME). Pour un changement
// du <title> sur une instance reseaude, on utilise un useEffect qui set
// document.title depuis useBranding (cf MetadataSetter ci-dessous).
export const metadata: Metadata = {
  title: 'CRM',
  description: 'CRM',
  manifest: '/manifest.webmanifest',
  applicationName: 'CRM',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CRM',
  },
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <BrandingProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </BrandingProvider>
        <Toaster position="top-right" richColors />
        {/* Enregistre le service worker (offline + cache assets) et gere les
            mises a jour post-deploiement via un toast "Nouvelle version" (cf
            components/SwUpdater.tsx) — pas de reload surprise. */}
        <SwUpdater />
      </body>
    </html>
  );
}
