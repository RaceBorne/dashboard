import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: false,
  },
  // Hide the floating Next.js "N" dev badge that sits in the corner during
  // `next dev`. It's a dev-only overlay and disappears in production anyway.
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'https', hostname: 'evari.cc' },
    ],
  },
};

export default nextConfig;
