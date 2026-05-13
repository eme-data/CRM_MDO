'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const toneStyles: Record<Tone, { icon: string; button: string }> = {
  danger: { icon: 'text-red-500', button: 'bg-red-600 hover:bg-red-700 text-white' },
  warning: { icon: 'text-amber-500', button: 'bg-amber-500 hover:bg-amber-600 text-white' },
  info: { icon: 'text-mdo-500', button: 'bg-mdo-500 hover:bg-mdo-600 text-white' },
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setState((s) => {
      s?.resolve(value);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    confirmBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, close]);

  const tone = state?.tone ?? 'danger';
  const styles = toneStyles[tone];

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => close(false)}
        >
          <div
            className="card max-w-md w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={cn('shrink-0 rounded-full bg-slate-100 dark:bg-slate-700 p-2', styles.icon)}>
                <AlertTriangle size={20} />
              </div>
              <div className="flex-1">
                <h2 id="confirm-title" className="text-lg font-semibold">{state.title}</h2>
                {state.message && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{state.message}</p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => close(false)} className="btn btn-secondary">
                {state.cancelLabel ?? 'Annuler'}
              </button>
              <button
                ref={confirmBtnRef}
                onClick={() => close(true)}
                className={cn('btn', styles.button)}
              >
                {state.confirmLabel ?? 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm doit etre utilise dans un ConfirmProvider');
  return ctx.confirm;
}
