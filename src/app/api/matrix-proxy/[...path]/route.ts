import { NextRequest, NextResponse } from 'next/server'

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

let lastCleanup = Date.now()

function isLoginRateLimited(ip: string): boolean {
  const now = Date.now()

  // Lazy cleanup: purge stale entries every 5 minutes instead of setInterval
  // (setInterval with unref() doesn't run in serverless environments like Vercel)
  if (now - lastCleanup > 5 * 60_000) {
    lastCleanup = now
    for (const [key, entry] of loginAttempts) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        loginAttempts.delete(key)
      }
    }
  }

  const entry = loginAttempts.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX_LOGIN) return true
  return false
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

  const { path } = await params
  const matrixPath = '/' + path.join('/')
  const search = request.nextUrl.search

  // Only allow proxying specific /_matrix/ path prefixes to prevent SSRF
  const ALLOWED_MATRIX_PREFIXES = [
    '/_matrix/client/',
    '/_matrix/media/',
    '/_matrix/key/',
    '/_matrix/federation/',
  ]
  if (!ALLOWED_MATRIX_PREFIXES.some(prefix => matrixPath.startsWith(prefix))) {
    return NextResponse.json(
      { error: 'Only /_matrix/client/, /_matrix/media/, /_matrix/key/, and /_matrix/federation/ paths are allowed' },
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
      redirect: 'follow',
    })

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

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  } catch (err) {
    console.error('Matrix proxy error:', err)
    return NextResponse.json(
      { error: 'Failed to reach homeserver' },
      { status: 502 }
    )
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
export const OPTIONS = handler
