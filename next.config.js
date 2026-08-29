/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  webpack: (config, { isServer }) => {
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
        'canvas',           // native module (node-canvas) used to rasterize PDFs
      ];
    } else {
      // pdfjs-dist references an optional Node `canvas` module that must
      // resolve to nothing in the browser bundle — only stub it client-side,
      // since the server actually needs the real module to render PDF pages.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        fs: false,
      };
    }

    return config;
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;