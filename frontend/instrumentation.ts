// Hook officiel Next.js : appele une fois au demarrage du runtime serveur.
// On l'utilise pour charger la config Sentry adaptee au runtime (node / edge).
// Le code est isolatement chargeable : si NEXT_PUBLIC_SENTRY_DSN ou SENTRY_DSN
// ne sont pas definis, les fichiers de config initialisent rien.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
