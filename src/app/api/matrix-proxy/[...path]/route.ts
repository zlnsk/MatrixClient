import { NextRequest, NextResponse } from 'next/server'

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '') // strip IPv6 brackets
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '[::1]' ||
    h === '::' ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    (h.startsWith('172.') && (() => { const parts = h.split('.'); if (parts.length < 2) return false; const b = parseInt(parts[1], 10); return !isNaN(b) && b >= 16 && b <= 31 })()) ||
    h.startsWith('169.254.') ||
    h.startsWith('0.') ||
    h.startsWith('fc00:') || h.startsWith('fd') || // IPv6 ULA
    h.startsWith('fe80:') || // IPv6 link-local
    h.startsWith('::ffff:10.') || h.startsWith('::ffff:192.168.') || h.startsWith('::ffff:127.') || // IPv4-mapped IPv6
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^\d+$/.test(h) // decimal IP encoding (e.g. 2130706433 = 127.0.0.1)
  )
}

/**
 * Server-side proxy for Matrix API requests.
 * Bypasses browser CORS restrictions when the homeserver (e.g. behind Pangolin)
 * doesn't serve Access-Control-Allow-Origin headers.
 *
 * Client sends: POST /api/matrix-proxy/_matrix/client/v3/sync?...
 *   Header: X-Matrix-Homeserver: https://matrix.lukasz.com
 * Proxy sends: POST https://matrix.lukasz.com/_matrix/client/v3/sync?...
 */

// ---- Per-IP rate limiting (sliding window) ----
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX_LOGIN = 5       // max login attempts per window
const loginAttempts = new Map<string, { count: number; windowStart: number }>()

function isLoginRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX_LOGIN) return true
  return false
}

// Periodic cleanup of stale entries (every 5 minutes)
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of loginAttempts) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        loginAttempts.delete(ip)
      }
    }
  }, 5 * 60_000).unref?.()
}

// Headers that should NOT be forwarded to the upstream server
const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'x-matrix-homeserver',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'connection',
  'transfer-encoding',
])

// Headers that should NOT be returned to the browser
const STRIP_RESPONSE_HEADERS = new Set([
  'transfer-encoding',
  'connection',
  'content-encoding', // Next.js handles its own compression
])

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const homeserver = request.headers.get('x-matrix-homeserver')
  if (!homeserver) {
    return NextResponse.json({ error: 'Missing X-Matrix-Homeserver header' }, { status: 400 })
  }

  // Validate homeserver URL
  let hsUrl: URL
  try {
    hsUrl = new URL(homeserver)
    if (hsUrl.protocol !== 'https:' && process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Homeserver must use HTTPS' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid homeserver URL' }, { status: 400 })
  }

  // SSRF protection: block requests to private/internal hosts
  if (isPrivateHost(hsUrl.hostname)) {
    return NextResponse.json({ error: 'Private/internal addresses are not allowed' }, { status: 400 })
  }

  const { path } = await params
  const matrixPath = '/' + path.join('/')
  const search = request.nextUrl.search

  // Only allow proxying specific /_matrix/ path prefixes to prevent SSRF
  // Federation APIs are intentionally excluded — they are server-to-server only.
  const ALLOWED_MATRIX_PREFIXES = [
    '/_matrix/client/',
    '/_matrix/media/',
    '/_matrix/key/',
  ]
  if (!ALLOWED_MATRIX_PREFIXES.some(prefix => matrixPath.startsWith(prefix))) {
    return NextResponse.json(
      { error: 'Only /_matrix/client/, /_matrix/media/, and /_matrix/key/ paths are allowed' },
      { status: 403 }
    )
  }

  // Rate limit login attempts per IP to prevent brute force
  if (matrixPath.includes('/login') && request.method === 'POST') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    if (isLoginRateLimited(ip)) {
      return NextResponse.json(
        { errcode: 'M_LIMIT_EXCEEDED', error: 'Too many login attempts. Please wait before trying again.' },
        { status: 429 }
      )
    }
  }

  const targetUrl = `${hsUrl.origin}${matrixPath}${search}`

  // Forward request headers, stripping hop-by-hop and internal ones
  const forwardHeaders = new Headers()
  request.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders.set(key, value)
    }
  })

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      // @ts-expect-error -- duplex is required for streaming body in Node 18+
      duplex: request.method !== 'GET' && request.method !== 'HEAD' ? 'half' : undefined,
      redirect: 'manual',
    })

    // Handle redirects manually to prevent SSRF via redirect to internal hosts
    if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      const location = upstreamResponse.headers.get('location')
      if (!location) {
        return NextResponse.json({ error: 'Redirect with no location' }, { status: 502 })
      }
      try {
        const redirectUrl = new URL(location, targetUrl)
        if (redirectUrl.protocol !== 'https:' && process.env.NODE_ENV !== 'development') {
          return NextResponse.json({ error: 'Redirect to non-HTTPS blocked' }, { status: 502 })
        }
        if (isPrivateHost(redirectUrl.hostname)) {
          return NextResponse.json({ error: 'Redirect to private network blocked' }, { status: 502 })
        }
        // Follow the validated redirect
        const redirectResponse = await fetch(redirectUrl.toString(), {
          method: request.method,
          headers: forwardHeaders,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
          // @ts-expect-error -- duplex is required for streaming body in Node 18+
          duplex: request.method !== 'GET' && request.method !== 'HEAD' ? 'half' : undefined,
          redirect: 'manual',
        })
        // Block further redirects from the redirect target
        if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
          return NextResponse.json({ error: 'Too many redirects' }, { status: 502 })
        }
        return buildResponse(redirectResponse, matrixPath)
      } catch {
        return NextResponse.json({ error: 'Invalid redirect destination' }, { status: 502 })
      }
    }

    return buildResponse(upstreamResponse, matrixPath)
  } catch {
    return NextResponse.json(
      { error: 'Failed to reach homeserver' },
      { status: 502 }
    )
  }
}

function buildResponse(upstreamResponse: Response, matrixPath: string): NextResponse {
  // If the server doesn't support push rules (Conduit, etc.), return empty
  // push rules instead of 404. The matrix-js-sdk retries getPushRules
  // infinitely on failure, blocking sync from ever reaching PREPARED state.
  if (upstreamResponse.status === 404 && matrixPath.startsWith('/_matrix/client/v3/pushrules')) {
    return NextResponse.json({
      global: {
        override: [],
        underride: [],
        sender: [],
        room: [],
        content: [],
      },
    }, { status: 200 })
  }

  // Forward response headers, stripping problematic ones
  const responseHeaders = new Headers()
  upstreamResponse.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value)
    }
  })

  responseHeaders.set('x-content-type-options', 'nosniff')

  const isMediaDownload = matrixPath.startsWith('/_matrix/media/') && matrixPath.includes('/download')
  const isSyncOrAuth = matrixPath.includes('/sync') || matrixPath.includes('/login') || matrixPath.includes('/register') || matrixPath.includes('/logout')
  if (isMediaDownload) {
    responseHeaders.set('cache-control', 'public, max-age=31536000, immutable')
  } else if (isSyncOrAuth) {
    responseHeaders.set('cache-control', 'private, no-store')
  }

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
export const OPTIONS = handler
