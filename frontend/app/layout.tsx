import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { BrandingProvider } from '@/components/BrandingProvider';
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
        {/* Enregistrement du service worker. Strategy "afterInteractive" pour
            ne pas bloquer le first paint. Le SW gere le mode offline + le
            cache des assets statiques (voir public/sw.js). */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
              navigator.serviceWorker.register('/sw.js').catch(function () {});
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
