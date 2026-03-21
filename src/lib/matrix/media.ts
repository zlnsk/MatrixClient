/**
 * Decrypt an encrypted Matrix media attachment using Web Crypto API.
 * Used for attachments in encrypted rooms that use AES-CTR encryption.
 */
export async function decryptMediaAttachment(
  url: string,
  encryptedFile: {
    url: string
    key: { k: string; alg: string; key_ops: string[]; kty: string; ext: boolean }
    iv: string
    hashes: Record<string, string>
    v: string
  },
  mimetype?: string
): Promise<string> {
  const response = await fetch(url)
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
