import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  experimental: { authInterrupts: true },
};

export default createNextIntlPlugin()(nextConfig);
