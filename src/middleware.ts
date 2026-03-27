import { NextResponse, type NextRequest } from 'next/server'

export default function middleware(request: NextRequest) {
  // Generate a random nonce for this request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  // Build CSP with nonce for inline scripts.
  // style-src 'unsafe-inline' is required because Next.js injects inline styles at runtime
  // and there is no nonce support for style tags yet — this is an accepted trade-off.
  const isDev = process.env.NODE_ENV === 'development'
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''} 'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: blob: data:",
    "media-src 'self' https: blob:",
    "connect-src 'self' https: wss:",
    "manifest-src 'self' https: blob:",
    "font-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /matrixclient/api/csp-report",
  ].join('; ')

  // Pass the nonce to the page via request header so layout.tsx can read it
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  // Override the CSP header set by next.config.ts with the nonce-aware version
  response.headers.set('Content-Security-Policy', csp)

  return response
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    { source: '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2)).*)', },
  ],
}
