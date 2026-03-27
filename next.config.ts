import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { execSync } from "child_process";

// Build version from package.json + git metadata (no file mutation).
// Format: "<version> build <total> (<sha> <date>) | <today-count> today"
// CI can override via BUILD_VERSION env var.
function getBuildVersion(): string {
  if (process.env.BUILD_VERSION) return process.env.BUILD_VERSION

  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
  let sha = ''
  let date = ''
  let count = ''
  let todayCount = ''

  try {
    sha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    date = execSync('git log -1 --format=%cs', { encoding: 'utf-8' }).trim()
    count = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim()
    const today = new Date().toISOString().slice(0, 10)
    todayCount = execSync(`git rev-list --count --since="${today}T00:00:00Z" HEAD`, { encoding: 'utf-8' }).trim()
  } catch {
    // git unavailable (e.g. shallow clone or no .git directory)
    date = new Date().toISOString().slice(0, 10)
  }

  const buildNum = count ? ` build ${count}` : ''
  const todayBuild = todayCount && todayCount !== '0' ? ` (${todayCount} today)` : ''
  const gitInfo = sha ? ` · ${sha} · ${date}` : ''

  return `v${pkg.version}${buildNum}${todayBuild}${gitInfo}`
}

const nextConfig: NextConfig = {
  basePath: '/matrixclient',
  // Expose build version to client code
  env: {
    NEXT_PUBLIC_BUILD_VERSION: getBuildVersion(),
  },
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
          // CSP is set per-request by src/proxy.ts (nonce-based script-src)
        ],
      },
    ];
  },
};

export default nextConfig;
