'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Clock, Square, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

// Widget flottant en bas a droite, visible sur TOUTES les pages de l'app.
// Affiche le timer en cours (ticket + duree ecoulee), permet de stop sans
// naviguer. Detecte l'inactivite (pas de souris/clavier/scroll/touch pendant
// IDLE_THRESHOLD_MS) et propose au user de stopper ou de "rendre" le temps
// idle quand il revient.
//
// Polling refresh toutes les 30s pour detecter un timer demarre depuis un
// autre onglet (le user peut avoir 2 tabs). Pas de SSE / WebSocket : le surcoû
// est nul (route deja existante /time-entries/current, payload < 200B).

interface RunningTimer {
  id: string;
  startedAt: string;
  description: string | null;
  ticket?: { id: string; reference: string; title: string } | null;
  intervention?: { id: string; title: string } | null;
}

const IDLE_THRESHOLD_MS = 15 * 60 * 1000; // 15 min
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove',
];

function formatElapsed(start: Date, idleMs: number): string {
  const ms = Math.max(0, Date.now() - start.getTime() - idleMs);
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (
    (h > 0 ? h + 'h' : '') +
    String(m).padStart(2, '0') + 'm' +
    String(s).padStart(2, '0') + 's'
  );
}

export function TimerWidget() {
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [, setTick] = useState(0);
  const [stopping, setStopping] = useState(false);
  const [idlePromptVisible, setIdlePromptVisible] = useState(false);
  const [idleStartedAt, setIdleStartedAt] = useState<number | null>(null);
  // Idle deja "approuve" comme inactif par le user pour cette session de timer.
  // Sert a soustraire la duree au stop (envoye en idleMinutes au backend).
  const accumulatedIdleMsRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const idleCheckRef = useRef<number | null>(null);

  async function load() {
    try {
      const t = await api.get('/time-entries/current');
      setTimer(t);
      // Reset idle si on charge un nouveau timer (id different)
      if (t?.id && timer?.id !== t.id) {
        accumulatedIdleMsRef.current = 0;
        setIdleStartedAt(null);
        setIdlePromptVisible(false);
      }
    } catch {
      setTimer(null);
    }
  }

  // Polling (30s) + tick UI (1s)
  useEffect(() => {
    load();
    const poll = setInterval(load, 30_000);
    const tick = setInterval(() => setTick((n) => n + 1), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, []);

  // Detection d'inactivite : on ecoute les events globaux et on declenche un
  // prompt si pas d'activite depuis IDLE_THRESHOLD_MS pendant qu'un timer
  // tourne. Page Visibility API : si l'onglet est cache, on considere idle.
  useEffect(() => {
    if (!timer) return;
    function onActivity() {
      // Si on revenait d'idle, on stocke la duree idle pour la soustraire au stop.
      if (idleStartedAt) {
        accumulatedIdleMsRef.current += Date.now() - idleStartedAt;
        setIdleStartedAt(null);
        setIdlePromptVisible(true);
      }
      lastActivityRef.current = Date.now();
    }
    function onVisibilityChange() {
      if (document.hidden) {
        if (!idleStartedAt) setIdleStartedAt(Date.now());
      } else {
        onActivity();
      }
    }
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Tick de check : toutes les 30s, si pas d'activite depuis le seuil et
    // qu'on n'a pas encore detecte l'idle, on bascule en idle.
    idleCheckRef.current = window.setInterval(() => {
      const sinceLast = Date.now() - lastActivityRef.current;
      if (sinceLast >= IDLE_THRESHOLD_MS && !idleStartedAt && !document.hidden) {
        setIdleStartedAt(lastActivityRef.current + IDLE_THRESHOLD_MS);
      }
    }, 30_000);

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (idleCheckRef.current) clearInterval(idleCheckRef.current);
    };
  }, [timer, idleStartedAt]);

  async function handleStop(deductIdle: boolean) {
    if (!timer) return;
    setStopping(true);
    const idleMin = deductIdle
      ? Math.round(accumulatedIdleMsRef.current / 60_000)
      : 0;
    try {
      const e = await api.post('/time-entries/stop', { idleMinutes: idleMin });
      const dur = e.durationMin ?? 0;
      const msg = idleMin > 0
        ? `Timer arrete : ${dur} min facturables (${idleMin} min idle deduites)`
        : `Timer arrete : ${dur} min enregistrees`;
      toast.success(msg);
      setTimer(null);
      accumulatedIdleMsRef.current = 0;
      setIdleStartedAt(null);
      setIdlePromptVisible(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setStopping(false);
    }
  }

  function handleResumeKeepAll() {
    // L'utilisateur dit "j'etais actif, ne deduis rien". On reset l'idle.
    accumulatedIdleMsRef.current = 0;
    setIdleStartedAt(null);
    setIdlePromptVisible(false);
    lastActivityRef.current = Date.now();
  }

  if (!timer) return null;

  const startedAt = new Date(timer.startedAt);
  const elapsed = formatElapsed(startedAt, accumulatedIdleMsRef.current);
  const isIdle = idleStartedAt !== null;
  const idleMin = Math.round(accumulatedIdleMsRef.current / 60_000);

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      {idlePromptVisible && idleMin > 0 && (
        <div className="mb-2 card p-3 border-amber-300 bg-amber-50 shadow-lg space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900 flex-1">
              <strong>Inactivite detectee : {idleMin} min</strong>
              <p>Voulez-vous deduire ce temps de la duree facturable ?</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleStop(true)}
              disabled={stopping}
              className="btn btn-primary text-xs py-1 flex-1"
            >
              Stop & deduire {idleMin}min
            </button>
            <button
              onClick={handleResumeKeepAll}
              className="btn btn-secondary text-xs py-1"
              title="Considerer que j'etais actif, ne rien deduire"
            >
              Tout garder
            </button>
          </div>
        </div>
      )}
      <div
        className={
          'card p-3 shadow-lg flex items-center gap-3 ' +
          (isIdle && !idlePromptVisible
            ? 'border-amber-400 bg-amber-50'
            : 'border-mdo-300 bg-mdo-50/80 dark:bg-slate-800')
        }
      >
        <Clock
          size={16}
          className={isIdle && !idlePromptVisible ? 'text-amber-600 animate-pulse' : 'text-mdo-600'}
        />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm font-bold leading-none">{elapsed}</div>
          {timer.ticket ? (
            <Link
              href={'/tickets/' + timer.ticket.id}
              className="text-xs text-slate-600 dark:text-slate-300 hover:underline truncate block"
              title={timer.ticket.title}
            >
              {timer.ticket.reference} — {timer.ticket.title}
            </Link>
          ) : timer.intervention ? (
            <Link
              href={'/interventions'}
              className="text-xs text-slate-600 dark:text-slate-300 hover:underline truncate block"
            >
              {timer.intervention.title}
            </Link>
          ) : (
            <span className="text-xs text-slate-500">Saisie libre</span>
          )}
          {isIdle && !idlePromptVisible && (
            <span className="text-[10px] text-amber-700">Idle ~{idleMin}min</span>
          )}
        </div>
        <button
          onClick={() => handleStop(false)}
          disabled={stopping}
          className="btn btn-danger text-xs py-1 px-2 shrink-0"
          title="Arreter le timer"
        >
          <Square size={12} />
        </button>
      </div>
    </div>
  );
}
