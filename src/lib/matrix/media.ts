/**
 * Matrix media utilities with authenticated media endpoint support.
 * Uses /_matrix/client/v1/media/ endpoints which require auth headers.
 */

function getSession(): { accessToken: string; homeserverUrl: string } | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem('matrix_session')
  if (!raw) return null
  try {
    const s = JSON.parse(raw)
    if (s.accessToken && s.homeserverUrl) return s
    return null
  } catch {
    return null
  }
}

function getAccessToken(): string | null {
  return getSession()?.accessToken ?? null
}

function getHomeserverUrl(): string {
  return getSession()?.homeserverUrl ?? ''
}

/**
 * Fetch that routes /_matrix/ requests through our CORS proxy.
 */
function proxiedFetch(url: string, init?: RequestInit): Promise<Response> {
  const hs = getHomeserverUrl()
  if (hs && url.startsWith(hs + '/_matrix/')) {
    const matrixPath = url.slice(hs.length) // /_matrix/...
    const proxyUrl = `/MatrixClient/api/matrix-proxy${matrixPath}`
    const headers = new Headers(init?.headers)
    headers.set('X-Matrix-Homeserver', hs)
    return fetch(proxyUrl, { ...init, headers })
  }
  return fetch(url, init)
}

function parseMxcUrl(mxcUrl: string): { serverName: string; mediaId: string } | null {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/)
  if (!match) return null
  return { serverName: match[1], mediaId: match[2] }
}

/**
 * Fetch media from authenticated Matrix endpoint and return a blob URL.
 * Falls back to legacy /_matrix/media/v3/ endpoint if v1 fails.
 */
export async function fetchAuthenticatedMedia(mxcUrl: string, mimetype?: string): Promise<string> {
  const parsed = parseMxcUrl(mxcUrl)
  if (!parsed) throw new Error('Invalid MXC URL: ' + mxcUrl)

  const accessToken = getAccessToken()
  if (!accessToken) throw new Error('Not authenticated')

  const hs = getHomeserverUrl()
  const server = encodeURIComponent(parsed.serverName)
  const media = encodeURIComponent(parsed.mediaId)

  // Try authenticated v1 endpoint first
  try {
    const v1Url = `${hs}/_matrix/client/v1/media/download/${server}/${media}`
    const res = await proxiedFetch(v1Url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (res.ok) {
      const data = await res.arrayBuffer()
      const blob = new Blob([data], { type: mimetype || res.headers.get('content-type') || 'application/octet-stream' })
      return URL.createObjectURL(blob)
    }
  } catch { /* fall through to legacy */ }

  // Fallback: legacy endpoint
  const legacyUrl = `${hs}/_matrix/media/v3/download/${server}/${media}`
  const response = await proxiedFetch(legacyUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Media fetch failed: ${response.status}`)

  const data = await response.arrayBuffer()
  const blob = new Blob([data], { type: mimetype || response.headers.get('content-type') || 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

/**
 * Fetch a thumbnail from authenticated Matrix endpoint and return a blob URL.
 * Falls back to the legacy /_matrix/media/v3/ endpoint if the v1 authenticated
 * endpoint fails (some homeservers don't support it yet).
 */
export async function fetchAuthenticatedThumbnail(
  mxcUrl: string,
  width: number = 96,
  height: number = 96
): Promise<string> {
  const parsed = parseMxcUrl(mxcUrl)
  if (!parsed) throw new Error('Invalid MXC URL: ' + mxcUrl)

  const accessToken = getAccessToken()
  if (!accessToken) throw new Error('Not authenticated')

  const hs = getHomeserverUrl()
  const server = encodeURIComponent(parsed.serverName)
  const media = encodeURIComponent(parsed.mediaId)
  const qs = `width=${width}&height=${height}&method=crop`

  const authHeaders = { 'Authorization': `Bearer ${accessToken}` }

  // Try both thumbnail endpoints in parallel
  const thumbnailUrls = [
    `${hs}/_matrix/client/v1/media/thumbnail/${server}/${media}?${qs}`,
    `${hs}/_matrix/media/v3/thumbnail/${server}/${media}?${qs}`,
  ]

  const thumbnailResults = await Promise.allSettled(
    thumbnailUrls.map(url =>
      proxiedFetch(url, { headers: authHeaders }).then(async res => {
        if (!res.ok) throw new Error(`${res.status}`)
        const blob = await res.blob()
        if (blob.size === 0) throw new Error('empty')
        return URL.createObjectURL(blob)
      })
    )
  )

  for (const result of thumbnailResults) {
    if (result.status === 'fulfilled') return result.value
  }

  // Fallback: try full download endpoints in parallel
  const downloadUrls = [
    `${hs}/_matrix/client/v1/media/download/${server}/${media}`,
    `${hs}/_matrix/media/v3/download/${server}/${media}`,
  ]

  const downloadResults = await Promise.allSettled(
    downloadUrls.map(url =>
      proxiedFetch(url, { headers: authHeaders }).then(async res => {
        if (!res.ok) throw new Error(`${res.status}`)
        const blob = await res.blob()
        if (blob.size === 0) throw new Error('empty')
        return URL.createObjectURL(blob)
      })
    )
  )

  for (const result of downloadResults) {
    if (result.status === 'fulfilled') return result.value
  }

  throw new Error(`Thumbnail fetch failed for ${mxcUrl}`)
}

/**
 * Decrypt an encrypted Matrix media attachment using Web Crypto API.
 * Fetches via authenticated endpoint, then decrypts with AES-CTR.
 */
export async function decryptMediaAttachment(
  mxcUrl: string,
  encryptedFile: {
    url: string
    key: { k: string; alg: string; key_ops: string[]; kty: string; ext: boolean }
    iv: string
    hashes: Record<string, string>
    v: string
  },
  mimetype?: string
): Promise<string> {
  const parsed = parseMxcUrl(mxcUrl)
  if (!parsed) throw new Error('Invalid MXC URL: ' + mxcUrl)

  const accessToken = getAccessToken()
  if (!accessToken) throw new Error('Not authenticated')

  const url = `${getHomeserverUrl()}/_matrix/client/v1/media/download/${encodeURIComponent(parsed.serverName)}/${encodeURIComponent(parsed.mediaId)}`
  const response = await proxiedFetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Media fetch failed: ${response.status}`)
  const ciphertext = await response.arrayBuffer()

  // Verify SHA-256 hash of ciphertext before trusting it
  if (encryptedFile.hashes?.sha256) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', ciphertext)
    const hashBytes = new Uint8Array(hashBuffer)
    // Encode as unpadded base64 to match Matrix spec format
    let hashBase64 = btoa(String.fromCharCode(...hashBytes))
    hashBase64 = hashBase64.replace(/=+$/, '')
    // Also normalise the expected hash by stripping any trailing padding
    const expectedHash = encryptedFile.hashes.sha256.replace(/=+$/, '')
    if (hashBase64 !== expectedHash) {
      throw new Error(
        'Hash mismatch for encrypted media: ciphertext has been tampered with or corrupted'
      )
    }
  }

  // Import the AES key from JWK
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: encryptedFile.key.kty,
      alg: 'A256CTR',
      k: encryptedFile.key.k,
      key_ops: ['decrypt'],
      ext: true,
    },
    { name: 'AES-CTR', length: 256 },
    false,
    ['decrypt']
  )

  // Decode the IV from unpadded base64
  const ivBase64 = encryptedFile.iv.replace(/-/g, '+').replace(/_/g, '/')
  const ivPadded = ivBase64 + '='.repeat((4 - (ivBase64.length % 4)) % 4)
  const ivBytes = Uint8Array.from(atob(ivPadded), c => c.charCodeAt(0))

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: ivBytes, length: 64 },
    cryptoKey,
    ciphertext
  )

  // Create blob URL
  const blob = new Blob([plaintext], { type: mimetype || 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

// LRU cache for thumbnail blob URLs — evicts oldest entries to bound memory
const THUMBNAIL_CACHE_MAX = 500
const thumbnailCache = new Map<string, string>()

/**
 * Fetch a thumbnail with LRU caching. Returns blob URL.
 * Evicts oldest entries and revokes their blob URLs when cache exceeds max size.
 */
export async function fetchCachedThumbnail(mxcUrl: string, width: number = 96, height: number = 96): Promise<string> {
  const cacheKey = `${mxcUrl}:${width}x${height}`
  const cached = thumbnailCache.get(cacheKey)
  if (cached) {
    // Move to end (most recently used) by re-inserting
    thumbnailCache.delete(cacheKey)
    thumbnailCache.set(cacheKey, cached)
    return cached
  }

  const blobUrl = await fetchAuthenticatedThumbnail(mxcUrl, width, height)
  thumbnailCache.set(cacheKey, blobUrl)

  // Evict oldest entries if over limit
  if (thumbnailCache.size > THUMBNAIL_CACHE_MAX) {
    const first = thumbnailCache.keys().next()
    if (!first.done) {
      const evicted = thumbnailCache.get(first.value)
      thumbnailCache.delete(first.value)
      if (evicted) URL.revokeObjectURL(evicted)
    }
  }

  return blobUrl
}
