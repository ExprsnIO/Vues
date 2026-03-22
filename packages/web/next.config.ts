import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['exprsn.io'],
  output: 'standalone',
  transpilePackages: ['@exprsn/shared', '@atproto/oauth-client-browser'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.digitaloceanspaces.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.exprsn.io',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
