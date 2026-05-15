/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Router Cache : Next.js 14 garde par defaut les pages dynamiques en
  // memoire client 30s, ce qui empeche le useEffect de refetch quand on
  // revient sur une page liste apres avoir cree/modifie une entite.
  //
  // Symptome typique : "je cree une societe, je reviens sur /companies,
  // je ne la vois pas — il faut F5 pour la voir".
  //
  // staleTimes.dynamic = 0 force le re-render (et donc le useEffect
  // refetch) a chaque navigation vers une page dynamique.
  // staleTimes.static = 180 garde 3 min pour les pages purement statiques
  // (qui n'ont pas de data fetchee a chaque visite).
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
  // En dev / local, on reroute /api/* vers le backend.
  // En prod, Caddy gere deja ce routage et ce rewrite n'est jamais invoque
  // (les requetes /api sont interceptees avant par Caddy).
  async rewrites() {
    const backend = process.env.INTERNAL_API_URL || 'http://backend:4000';
    return [
      {
        source: '/api/:path*',
        destination: backend + '/:path*',
      },
    ];
  },
};
module.exports = nextConfig;
