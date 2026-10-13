import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  experimental: { authInterrupts: true },
  // pdfkit reads its font files from its own folder at run time, which a bundled copy can't find.
  serverExternalPackages: ['pdfkit'],
  // The receipt's font is read from disk when a PDF is drawn, so it has to travel with that route when deployed.
  outputFileTracingIncludes: { '/api/v1/payments/[id]/receipt': ['./assets/fonts/*.ttf'] },
};

export default createNextIntlPlugin()(nextConfig);
