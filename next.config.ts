import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack config (default bundler in Next.js 16)
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lukasz.com',
      },
      {
        protocol: 'https',
        hostname: '*.lukasz.com',
      },
    ],
  },
  // WASM support for matrix-sdk-crypto
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
  },
  // Headers for WASM, SharedArrayBuffer, and security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https://lukasz.com https://*.lukasz.com blob: data:",
              "media-src 'self' https://lukasz.com https://*.lukasz.com blob:",
              "connect-src 'self' https://lukasz.com https://*.lukasz.com wss://lukasz.com wss://*.lukasz.com",
              "font-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
