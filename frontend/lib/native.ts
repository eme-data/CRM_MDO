// Bridge ultra-leger vers Capacitor sans installer @capacitor/core dans le
// frontend. Detection 100% runtime via window.Capacitor (injecte par la
// WebView native). Si on n'est pas dans l'app native, tout retombe sur des
// fallback navigateur (BarcodeDetector pour le scan, navigator.share, etc.).
//
// Pourquoi pas d'install @capacitor/core dans frontend/package.json ?
//   - Le frontend tourne aussi en pur Web (~80% des sessions tech). Pas la
//     peine d'embarquer ~500KB de Capacitor pour les browsers.
//   - L'app mobile charge le meme bundle Next.js — Capacitor est injecte
//     par la WebView avant que React monte, donc accessible via window.

interface CapacitorBridge {
  isNativePlatform: () => boolean;
  getPlatform: () => 'web' | 'ios' | 'android';
  Plugins: Record<string, any>;
}

declare global {
  interface Window {
    Capacitor?: CapacitorBridge;
    BarcodeDetector?: any;
  }
}

// Renvoie true SEULEMENT si on tourne dans la WebView native Capacitor
// (ios ou android). false en pur Web (PWA dans un browser standard).
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.Capacitor?.isNativePlatform() === true;
}

export function getPlatform(): 'web' | 'ios' | 'android' {
  if (typeof window === 'undefined') return 'web';
  return window.Capacitor?.getPlatform() ?? 'web';
}

// ============================================================
// SCAN QR / code-barres
// ============================================================
// Strategie cascade :
//   1. Si app native (Capacitor) avec plugin BarcodeScanner installé : prefer
//      le plugin natif (overlay full-screen, performance optimale).
//   2. Sinon BarcodeDetector du navigateur (Chrome Android moderne, Safari
//      iOS 17+ avec flag).
//   3. Sinon : null (le caller doit afficher un fallback "Saisie manuelle").

export interface ScanResult {
  text: string;
  format?: string;
}

export async function scanBarcode(): Promise<ScanResult | null> {
  // Tentative 1 : plugin Capacitor natif si disponible
  if (isNativeApp()) {
    const scanner = window.Capacitor?.Plugins?.BarcodeScanner;
    if (scanner) {
      try {
        // API du plugin @capacitor-mlkit/barcode-scanning
        const result = await scanner.scan();
        if (result?.barcodes?.length > 0) {
          const b = result.barcodes[0];
          return { text: b.rawValue ?? b.displayValue ?? '', format: b.format };
        }
      } catch (err) {
        // Plugin present mais erreur (permission refusee, scan annule par user) :
        // on retourne null sans tenter le fallback Web (qui ne marcherait
        // pas dans la WebView native de toute facon).
        return null;
      }
    }
  }

  // Tentative 2 : BarcodeDetector du navigateur
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    return scanWithBrowserBarcodeDetector();
  }

  return null;
}

async function scanWithBrowserBarcodeDetector(): Promise<ScanResult | null> {
  try {
    const Detector = (window as any).BarcodeDetector;
    const detector = new Detector({
      formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'data_matrix'],
    });
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    await video.play();

    return new Promise((resolve) => {
      const overlay = createScanOverlay(video, () => {
        stream.getTracks().forEach((t) => t.stop());
        document.body.removeChild(overlay);
        resolve(null);
      });
      document.body.appendChild(overlay);

      const interval = setInterval(async () => {
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0) {
            clearInterval(interval);
            stream.getTracks().forEach((t) => t.stop());
            document.body.removeChild(overlay);
            resolve({ text: codes[0].rawValue, format: codes[0].format });
          }
        } catch {
          // Detect peut throw si le frame est noir, on continue.
        }
      }, 250);
    });
  } catch {
    return null;
  }
}

function createScanOverlay(video: HTMLVideoElement, onClose: () => void): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.9);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  `;
  video.style.cssText = 'max-width: 100%; max-height: 70vh; border: 2px solid #fff; border-radius: 8px;';
  const label = document.createElement('div');
  label.textContent = 'Pointez la camera vers un code-barres / QR code...';
  label.style.cssText = 'color: white; padding: 16px; font-family: sans-serif;';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Annuler';
  closeBtn.style.cssText = `
    margin-top: 16px; padding: 12px 24px; background: white; color: #1d4ed8;
    border: none; border-radius: 6px; font-weight: 600; cursor: pointer;
  `;
  closeBtn.onclick = onClose;
  overlay.appendChild(label);
  overlay.appendChild(video);
  overlay.appendChild(closeBtn);
  return overlay;
}

// ============================================================
// PUSH natifs (FCM/APNS) — bootstrap optionnel
// ============================================================
// Appele au demarrage de l'app si on est en native. Demande la permission,
// recupere le token FCM/APNS, l'envoie au backend pour enregistrer le device.
// Le backend devra ensuite envoyer aux 2 canaux (Web Push existant + FCM/APNS).
//
// Pour l'instant : NO-OP en attendant que MDO configure Firebase + APNs et
// etende PushService cote backend. Le code est prepare pour ne pas avoir a
// rebuilder l'app mobile quand on activera.
export async function bootstrapNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  const push = window.Capacitor?.Plugins?.PushNotifications;
  if (!push) return;
  try {
    const perm = await push.requestPermissions();
    if (perm?.receive !== 'granted') return;
    await push.register();
    push.addListener('registration', async (token: { value: string }) => {
      // TODO : envoyer token au backend des que /push/register-native existe.
      // Pour l'instant on log juste pour pouvoir verifier que l'app recupere
      // bien un token quand on testera.
      console.log('[native push] token:', token.value);
    });
    push.addListener('registrationError', (err: any) => {
      console.warn('[native push] registration error:', err);
    });
  } catch (err) {
    console.warn('[native push] init failed:', err);
  }
}
