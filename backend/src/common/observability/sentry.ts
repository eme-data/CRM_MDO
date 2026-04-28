// Initialisation Sentry. Opt-in via SENTRY_DSN : si la variable n'est pas set,
// l'integration ne fait rien et n'introduit aucun overhead.
//
// On charge Sentry de facon paresseuse (require dynamique) pour ne pas imposer
// le SDK aux installations qui n'en veulent pas.

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      release: process.env.SENTRY_RELEASE,
      // 10% des transactions echantillonnees pour limiter le volume
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      // Pas de profiling auto, pas de capture des PII (email/ip)
      sendDefaultPii: false,
      attachStacktrace: true,
      ignoreErrors: [
        // Erreurs reseau "normales" qu'on ne veut pas alerter
        'ECONNRESET',
        'ECONNREFUSED',
        'EPIPE',
      ],
    });
    initialized = true;
    // eslint-disable-next-line no-console
    console.log('[Sentry] initialized for env=' + (process.env.NODE_ENV ?? 'development'));
  } catch (err) {
    // SDK absent (build sans @sentry/node) → on ignore silencieusement
    // eslint-disable-next-line no-console
    console.warn('[Sentry] SENTRY_DSN set but @sentry/node not installed:', (err as Error).message);
  }
}

// Capture manuelle d'une exception (utile dans les jobs cron / processors)
export function captureException(err: unknown, context?: Record<string, any>): void {
  if (!initialized) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node');
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // ignore
  }
}
