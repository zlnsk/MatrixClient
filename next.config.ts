import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { execSync } from "child_process";

// Build version from package.json + git metadata (no file mutation).
// Format: "<version> (<short-sha> <date>)" e.g. "0.1.0 (a1b2c3d 2026-03-22)"
// CI can override via BUILD_VERSION env var.
function getBuildVersion(): string {
  if (process.env.BUILD_VERSION) return process.env.BUILD_VERSION

  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
  let gitInfo = ''
  let buildNum = ''
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    const date = execSync('git log -1 --format=%cs', { encoding: 'utf-8' }).trim()
    // Build number = total commit count — always increments
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim()
    buildNum = ` build ${count}`
    gitInfo = ` (${sha} ${date})`
  } catch { /* not a git repo or git unavailable */ }

  return `${pkg.version}${buildNum}${gitInfo}`
}

const nextConfig: NextConfig = {
  // Expose build version to client code
  env: {
    NEXT_PUBLIC_BUILD_VERSION: getBuildVersion(),
  },
  output: 'standalone',
  // Turbopack config (default bundler in Next.js 16)
  turbopack: {},
  images: {
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
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none',
          },
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
          // CSP is set per-request by src/middleware.ts (nonce-based script-src)
        ],
      },
    ];
  },
};

export default nextConfig;
