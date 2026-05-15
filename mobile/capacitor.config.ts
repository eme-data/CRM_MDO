import type { CapacitorConfig } from '@capacitor/cli';

// App "wrapper" : la webview charge le frontend deploye en production.
// Ne necessite PAS de re-builder la PWA dans l'app mobile — toute mise
// a jour du frontend est immediatement reflechie sans repassage AppStore.
//
// Pour pointer vers un serveur de dev local (depuis ton PC vers ton
// telephone) : remplace temporairement server.url par http://192.168.X.Y:3000
// (et accepte le cleartext via android.allowMixedContent=true).

const config: CapacitorConfig = {
  appId: 'fr.mdoservices.crm',
  appName: 'CRM MDO',
  // bundledWebRuntime: false — pas d'assets locaux, on charge tout depuis le serveur
  webDir: 'www',
  server: {
    // URL de production. Override possible via env CRM_URL au build :
    //   CRM_URL=https://crm-staging.mdoservices.fr npm run sync
    url: process.env.CRM_URL ?? 'https://crm.mdoservices.fr',
    cleartext: false, // refuse HTTP (HTTPS uniquement en prod)
  },
  android: {
    // Permet a la WebView Android d'utiliser les service workers + push API
    // (necessaire pour la PWA Web Push deja en place cote frontend)
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production',
  },
  ios: {
    // Le contentInset 'always' evite que le top de la WebView passe sous
    // la barre de statut iOS.
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#1d4ed8',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    PushNotifications: {
      // iOS : presente la notif meme app au premier plan
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
