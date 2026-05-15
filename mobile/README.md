# CRM MDO — Wrapper mobile (Capacitor)

App native Android / iOS qui wrap la PWA `crm.mdoservices.fr` dans une WebView.
Avantages vs PWA seule :
- Notifications push **natives** (au-dela du Web Push qui ne marche pas sur iOS Safari)
- Acces camera (scan QR / code-barres pour assets en intervention)
- Icone sur l'ecran d'accueil sans la magouille "Ajouter a l'ecran d'accueil"
- Mode offline-light (cache de la PWA toujours actif)

## Pre-requis

- Node 20+
- Android Studio (pour `.apk`)
- Xcode 15+ + un Mac (pour `.ipa`)
- JDK 17 (Capacitor 6 exige Java 17)

## Premiere installation

```bash
cd mobile
npm install                # installe Capacitor + plugins (200 Mo)

# Genere les projets natifs
npm run init:android       # cree mobile/android/
npm run init:ios           # cree mobile/ios/ (Mac uniquement)
```

Les dossiers `android/` et `ios/` sont commites dans le repo (necessaire pour
les builds CI). Ils sont volumineux (~50 Mo chacun) mais c'est le standard
Capacitor — on ne peut pas les regenerer sans perdre la config Android Studio /
Xcode (signing, icones, splash).

## Build Android (.apk debug)

```bash
npm run build:android-debug
# APK : mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Pour un APK signe production, configurer les cles dans
`android/app/build.gradle` puis `npm run build:android-release`.

## Build iOS

```bash
npm run sync
npm run open:ios          # ouvre Xcode -> Build & Archive -> AppStore Connect
```

## Push notifications natives

Le module `@capacitor/push-notifications` est inclus pour Firebase Cloud
Messaging (Android) et APNS (iOS). Pour activer :

1. Cote Firebase : creer un projet, telecharger `google-services.json` et
   le poser dans `android/app/`
2. Cote Apple : configurer un APNs Auth Key sur App Store Connect, l'uploader
   dans Firebase
3. Cote backend CRM : etendre `PushService` pour envoyer aussi les notifs
   FCM/APNS en plus du Web Push (futur — pour l'instant la WebView recoit les
   Web Push standards via le service worker `/sw.js`)

## Scan code-barres / QR (optionnel)

Le frontend expose un bouton "Scanner" sur la page Assets. Sans plugin natif,
il utilise `BarcodeDetector` du navigateur (Chrome Android moderne) en
fallback. Pour une experience native premium (overlay full-screen, multi-format,
flash), ajouter le plugin ML Kit Google :

```bash
cd mobile
npm install @capacitor-mlkit/barcode-scanning
npm run sync                     # propage dans android/ et ios/
npm run build:android-debug
```

Le plugin est detecte automatiquement par `frontend/lib/native.ts` : si
`window.Capacitor.Plugins.BarcodeScanner` existe, il est prefere a la version
Web. Aucun changement frontend requis.

Android : ajouter dans `android/app/src/main/AndroidManifest.xml` :
```xml
<uses-permission android:name="android.permission.CAMERA" />
```
iOS : ajouter dans `ios/App/App/Info.plist` :
```xml
<key>NSCameraUsageDescription</key>
<string>Scanner les codes-barres des assets clients</string>
```

## Mise a jour

Quand le frontend evolue, **aucun rebuild de l'app mobile n'est necessaire** :
la WebView re-charge l'URL au prochain demarrage. Les seules raisons de
rebuild :
- Ajout d'un nouveau plugin Capacitor (camera, biometrie, ...)
- Changement d'icone / splash
- Mise a jour de Capacitor lui-meme

## Notes deploiement

- Bundle ID iOS : `fr.mdoservices.crm`
- Package Android : `fr.mdoservices.crm`
- Splash screen : couleur `#1d4ed8` (couleur mdo-600 du design)
- Statut bar : style automatique selon le theme
