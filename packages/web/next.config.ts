import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@exprsn/shared'],
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
