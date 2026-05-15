'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

// Bouton pour s'abonner / se desabonner aux Web Push notifications.
// Affiche un message si :
//  - VAPID non configure cote serveur (admin doit lancer generate-vapid)
//  - Browser ne supporte pas Push API
//  - Permission user refusee

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function PushSubscribeButton() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
    setSupported(ok);
    if (!ok) return;
    api.get('/push/public-key').then((r) => setVapidKey(r.publicKey)).catch(() => setVapidKey(null));
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    });
  }, []);

  async function subscribe() {
    if (!vapidKey) {
      toast.error('Push non configure cote serveur (VAPID manquant)');
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast.error('Permission notifications refusee');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: json.keys,
      });
      setSubscribed(true);
      toast.success('Notifications activees sur ce navigateur');
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.delete('/push/subscribe').catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success('Notifications desactivees');
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  async function test() {
    try {
      const r = await api.post('/push/test');
      toast.success('Test envoye (' + r.sent + ' device(s))');
    } catch (err: any) { toast.error(err.message); }
  }

  if (supported === null) return null;
  if (!supported) {
    return <p className="text-xs text-slate-500">Ce navigateur ne supporte pas Web Push.</p>;
  }
  if (!vapidKey) {
    return (
      <p className="text-xs text-amber-600">
        Push pas encore configure cote serveur. Demandez a un admin de generer les cles VAPID
        (POST /push/admin/generate-vapid).
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {subscribed ? (
        <>
          <button onClick={unsubscribe} disabled={busy} className="btn btn-secondary text-sm">
            <BellOff size={14} className="mr-1" /> Desactiver les notifications
          </button>
          <button onClick={test} disabled={busy} className="btn btn-secondary text-sm">Tester</button>
        </>
      ) : (
        <button onClick={subscribe} disabled={busy} className="btn btn-primary text-sm">
          <Bell size={14} className="mr-1" /> Activer les notifications navigateur
        </button>
      )}
    </div>
  );
}
