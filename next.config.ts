import type { NextConfig } from "next";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const isTauri = process.env.TAURI_ENV === '1'

// Build version: <package version>+<git short hash>.<YYYYMMDD-HHmmss>
function getBuildVersion(): string {
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
  let gitHash = 'unknown'
  try {
    gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch { /* not a git repo */ }
  const now = new Date()
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15) // YYYYMMDDHHmmss
  return `${pkg.version}+${gitHash}.${ts}`
}

const nextConfig: NextConfig = {
  // Expose build version to client code
  env: {
    NEXT_PUBLIC_BUILD_VERSION: getBuildVersion(),
  },
  // Static export for Tauri, standalone for Docker/server
  ...(isTauri ? { output: 'export' } : { output: 'standalone' }),
  // Turbopack config (default bundler in Next.js 16)
  turbopack: {},
  images: {
    ...(isTauri && { unoptimized: true }),
    unoptimized: true,
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
            value: 'camera=(self), microphone=(self), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https: blob: data:",
              "media-src 'self' https: blob:",
              "connect-src 'self' https: wss:",
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
