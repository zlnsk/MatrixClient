/**
 * Matrix media utilities with authenticated media endpoint support.
 * Uses /_matrix/client/v1/media/ endpoints which require auth headers.
 */

const HOMESERVER_URL = 'https://lukasz.com'

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  const session = localStorage.getItem('matrix_session')
  if (!session) return null
  try {
    return JSON.parse(session).accessToken
  } catch {
    return null
  }
}

function parseMxcUrl(mxcUrl: string): { serverName: string; mediaId: string } | null {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/)
  if (!match) return null
  return { serverName: match[1], mediaId: match[2] }
}

/**
 * Fetch media from authenticated Matrix endpoint and return a blob URL.
 */
export async function fetchAuthenticatedMedia(mxcUrl: string, mimetype?: string): Promise<string> {
  const parsed = parseMxcUrl(mxcUrl)
  if (!parsed) throw new Error('Invalid MXC URL: ' + mxcUrl)

  const accessToken = getAccessToken()
  if (!accessToken) throw new Error('Not authenticated')

  const url = `${HOMESERVER_URL}/_matrix/client/v1/media/download/${encodeURIComponent(parsed.serverName)}/${encodeURIComponent(parsed.mediaId)}`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Media fetch failed: ${response.status}`)

  const data = await response.arrayBuffer()
  const blob = new Blob([data], { type: mimetype || response.headers.get('content-type') || 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

/**
 * Fetch a thumbnail from authenticated Matrix endpoint and return a blob URL.
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

  const url = `${HOMESERVER_URL}/_matrix/client/v1/media/thumbnail/${encodeURIComponent(parsed.serverName)}/${encodeURIComponent(parsed.mediaId)}?width=${width}&height=${height}&method=crop`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Thumbnail fetch failed: ${response.status}`)

  const blob = await response.blob()
  return URL.createObjectURL(blob)
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

  const url = `${HOMESERVER_URL}/_matrix/client/v1/media/download/${encodeURIComponent(parsed.serverName)}/${encodeURIComponent(parsed.mediaId)}`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Media fetch failed: ${response.status}`)
  const ciphertext = await response.arrayBuffer()

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
    const firstKey = thumbnailCache.keys().next().value!
    const evicted = thumbnailCache.get(firstKey)
    thumbnailCache.delete(firstKey)
    if (evicted) URL.revokeObjectURL(evicted)
  }

  return blobUrl
}
