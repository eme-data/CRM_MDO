/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
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
