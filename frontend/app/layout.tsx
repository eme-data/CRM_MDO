import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import './globals.css';

export const metadata: Metadata = {
  title: 'CRM MDO Services',
  description: 'CRM interne MDO Services',
  manifest: '/manifest.webmanifest',
  applicationName: 'CRM MDO',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CRM MDO',
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
        <ConfirmProvider>{children}</ConfirmProvider>
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
