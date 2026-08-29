/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  webpack: (config, { isServer }) => {
    // pdfjs-dist and tesseract.js rely on browser/worker globals that need
    // fallbacks when bundled for the Next.js server runtime.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      fs: false,
    };

    if (isServer) {
      // Keep these as external requires so webpack never bundles them or tries
      // to resolve their internal worker/wasm files into vendor-chunks.
      // This is what causes "Cannot find module …pdf.worker.mjs" at runtime.
      config.externals = [
        ...(config.externals || []),
        'sharp',
        'tesseract.js',
        'pdfjs-dist',
        /^pdfjs-dist\/.*/,   // catches pdfjs-dist/legacy/build/pdf.mjs etc.
      ];
    }

    return config;
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;