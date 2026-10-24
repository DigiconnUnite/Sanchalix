import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  experimental: { authInterrupts: true },
  // The container image runs a self-contained server. Left off elsewhere, so `next start` keeps working.
  ...(process.env.BUILD_STANDALONE && { output: 'standalone' as const }),
  // pdfkit reads its font files from its own folder at run time, which a bundled copy can't find.
  serverExternalPackages: ['pdfkit'],
  // The PDFs' font is read from disk when one is drawn, so it has to travel with those routes when deployed.
  outputFileTracingIncludes: {
    '/api/v1/payments/[id]/receipt': ['./assets/fonts/*.ttf'],
    '/api/v1/students/[id]/transfer-certificate': ['./assets/fonts/*.ttf'],
  },
};

export default createNextIntlPlugin()(nextConfig);
