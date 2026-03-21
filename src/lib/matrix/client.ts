'use client'

import * as sdk from 'matrix-js-sdk'
import type { Logger } from 'matrix-js-sdk/lib/logger'
import type { CryptoCallbacks } from 'matrix-js-sdk/lib/crypto-api'

let matrixClient: sdk.MatrixClient | null = null

const HOMESERVER_URL = 'https://lukasz.com'

// Pending secret storage key for the getSecretStorageKey callback
let pendingSecretStorageKey: Uint8Array | null = null
let pendingSecretStorageResolve: ((key: [string, Uint8Array] | null) => void) | null = null

const cryptoCallbacks: CryptoCallbacks = {
  getSecretStorageKey: async ({ keys }: { keys: Record<string, any> }, _name: string): Promise<[string, Uint8Array<ArrayBuffer>] | null> => {
    if (pendingSecretStorageKey) {
      const keyId = Object.keys(keys)[0]
      const key = new Uint8Array(pendingSecretStorageKey) as Uint8Array<ArrayBuffer>
      pendingSecretStorageKey = null
      return [keyId, key]
    }
    return null
  },
}

// Patterns for crypto/decryption noise we want to suppress
const SUPPRESSED_PATTERNS = [
  'key backup is not working',
  'sent before this device logged in',
  'DecryptionError',
  'Failed to decrypt event',
  'Unable to decrypt',
  'olm_internal_error',
  'megolm session not yet available',
  'Received megolm session for',
  // Rust WASM crypto module patterns (these bypass the JS SDK logger)
  'matrix_sdk_crypto',
  "Can't find the room key",
  'Failed to decrypt a room event',
  'WARN matrix_sdk',
  'ERROR matrix_sdk',
]

function isSuppressed(args: any[]): boolean {
  const msg = args.map(a => (typeof a === 'string' ? a : a?.message || '')).join(' ')
  return SUPPRESSED_PATTERNS.some(p => msg.includes(p))
}

// Monkey-patch global console.warn and console.error to suppress Rust WASM crypto noise.
// The Rust crypto module (matrix_sdk_crypto) compiled to WASM calls console.warn/error
// directly, bypassing the JS SDK's logger interface.
if (typeof window !== 'undefined') {
  const originalWarn = console.warn
  const originalError = console.error
  console.warn = (...args: any[]) => {
    if (!isSuppressed(args)) originalWarn.apply(console, args)
  }
  console.error = (...args: any[]) => {
    if (!isSuppressed(args)) originalError.apply(console, args)
  }
}

/**
 * A logger that filters out noisy crypto decryption warnings.
 * These occur for every historical message sent before this device logged in
 * when key backup hasn't been restored yet - expected behavior, not errors.
 */
const filteredLogger: Logger = {
  getChild(namespace: string): Logger {
    return filteredLogger
  },
  trace(...msg: any[]) { if (!isSuppressed(msg)) console.trace(...msg) },
  debug(...msg: any[]) { if (!isSuppressed(msg)) console.debug(...msg) },
  info(...msg: any[]) { if (!isSuppressed(msg)) console.info(...msg) },
  warn(...msg: any[]) { if (!isSuppressed(msg)) console.warn(...msg) },
  error(...msg: any[]) { if (!isSuppressed(msg)) console.error(...msg) },
}

export function getMatrixClient(): sdk.MatrixClient | null {
  return matrixClient
}

async function initCrypto(client: sdk.MatrixClient): Promise<void> {
  try {
    // Use Rust crypto with IndexedDB for persistent key storage
    await client.initRustCrypto({
      useIndexedDB: true,
    })

    // Set the global policy to auto-accept room key requests and
    // trust devices for faster decryption experience
    const crypto = client.getCrypto()
    if (crypto) {
      // Auto-verify own device cross-signing
      await crypto.setDeviceVerified(client.getUserId()!, client.getDeviceId()!)
    }
  } catch (err) {
    console.warn('Crypto initialization failed, encrypted messages will not be decrypted:', err)
  }
}

async function enableKeyBackup(client: sdk.MatrixClient): Promise<void> {
  try {
    const crypto = client.getCrypto()
    if (!crypto) return

    // Check if server has a key backup and enable it
    const check = await crypto.checkKeyBackupAndEnable()
    if (check) {
      console.log('Key backup found on server, version:', check.backupInfo?.version)
      console.log('Backup trusted:', check.trustInfo?.trusted)
    } else {
      console.log('No key backup found on server')
    }
  } catch (err) {
    console.warn('Key backup check failed:', err)
  }
}

export async function restoreFromRecoveryKey(input: string): Promise<{ total: number; imported: number }> {
  if (!matrixClient) throw new Error('Not connected')
  const crypto = matrixClient.getCrypto()
  if (!crypto) throw new Error('Crypto not initialized')

  const trimmed = input.trim()

  // Try decoding as a recovery key (space-separated base58 groups like "EsTH r6vv 8Yi8...")
  let keyBytes: Uint8Array | null = null

  try {
    const { decodeRecoveryKey } = await import('matrix-js-sdk/lib/crypto-api/recovery-key')
    keyBytes = decodeRecoveryKey(trimmed)
  } catch {
    console.log('Not a recovery key format, trying as passphrase...')
  }

  if (!keyBytes) {
    // Try deriving from passphrase via SSSS passphrase info
    try {
      const secretStorage = matrixClient.secretStorage
      const defaultKeyId = await secretStorage.getDefaultKeyId()
      if (defaultKeyId) {
        const keyInfo = await secretStorage.getKey(defaultKeyId)
        if (keyInfo && keyInfo[1]?.passphrase) {
          const { deriveRecoveryKeyFromPassphrase } = await import('matrix-js-sdk/lib/crypto-api/key-passphrase')
          const pp = keyInfo[1].passphrase
          keyBytes = await deriveRecoveryKeyFromPassphrase(trimmed, pp.salt, pp.iterations, pp.bits || 256)
        }
      }
    } catch {
      // Not a passphrase either
    }
  }

  if (!keyBytes) {
    throw new Error(
      'Could not decode the recovery key. Make sure you entered it correctly, ' +
      'including all spaces between groups.'
    )
  }

  // Method 1: Use Secret Storage (SSSS) flow - this is how Element's "Security Key" works.
  // The recovery key unlocks Secret Storage, which contains the backup decryption key.
  try {
    pendingSecretStorageKey = keyBytes
    await crypto.loadSessionBackupPrivateKeyFromSecretStorage()
    console.log('Loaded backup key from Secret Storage')

    const result = await crypto.restoreKeyBackup({
      progressCallback: (progress: any) => {
        console.log('Key restore progress:', progress)
      },
    })
    return result
  } catch (err) {
    console.log('Secret Storage flow failed, trying direct backup key:', err)
    pendingSecretStorageKey = null
  }

  // Method 2: Try using the key directly as the backup decryption key
  const backupInfo = await crypto.getKeyBackupInfo()
  if (!backupInfo?.version) throw new Error('No key backup found on server')

  try {
    await crypto.storeSessionBackupPrivateKey(keyBytes, backupInfo.version)
    const result = await crypto.restoreKeyBackup({
      progressCallback: (progress: any) => {
        console.log('Key restore progress:', progress)
      },
    })
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('does not match')) {
      throw new Error(
        'Recovery key does not match the backup on the server. ' +
        'Make sure you are using the correct security key for this account. ' +
        'You can find it in another Matrix client under Settings > Security.'
      )
    }
    throw err
  }
}

export async function deleteOtherDevice(
  deviceId: string,
  password: string
): Promise<void> {
  if (!matrixClient) throw new Error('Not connected')

  try {
    // First attempt without auth to get the session info
    await matrixClient.deleteDevice(deviceId)
  } catch (err: any) {
    // The server will return 401 with the auth flow info
    if (err.httpStatus === 401 && err.data?.flows) {
      await matrixClient.deleteDevice(deviceId, {
        type: 'm.login.password',
        identifier: {
          type: 'm.id.user',
          user: matrixClient.getUserId()!,
        },
        password,
      } as any)
    } else {
      throw err
    }
  }
}

export async function loginWithPassword(
  username: string,
  password: string
): Promise<sdk.MatrixClient> {
  const tmpClient = sdk.createClient({ baseUrl: HOMESERVER_URL })

  const response = await tmpClient.login('m.login.password', {
    user: username,
    password,
    initial_device_display_name: 'Matrix Client Web',
  })

  matrixClient = sdk.createClient({
    baseUrl: HOMESERVER_URL,
    accessToken: response.access_token,
    userId: response.user_id,
    deviceId: response.device_id,
    logger: filteredLogger,
    cryptoCallbacks,
  })

  await initCrypto(matrixClient)

  // Persist session
  localStorage.setItem(
    'matrix_session',
    JSON.stringify({
      accessToken: response.access_token,
      userId: response.user_id,
      deviceId: response.device_id,
      homeserverUrl: HOMESERVER_URL,
    })
  )

  return matrixClient
}

export function restoreSession(): sdk.MatrixClient | null {
  const stored = localStorage.getItem('matrix_session')
  if (!stored) return null

  try {
    const session = JSON.parse(stored)

    // Validate session data
    if (!session.accessToken || !session.userId || !session.deviceId || !session.homeserverUrl) {
      localStorage.removeItem('matrix_session')
      return null
    }

    // Validate homeserver URL matches expected server
    try {
      const url = new URL(session.homeserverUrl)
      if (!url.hostname.endsWith('lukasz.com') && url.hostname !== 'lukasz.com') {
        console.warn('Session homeserver does not match expected domain')
        localStorage.removeItem('matrix_session')
        return null
      }
    } catch {
      localStorage.removeItem('matrix_session')
      return null
    }

    matrixClient = sdk.createClient({
      baseUrl: session.homeserverUrl,
      accessToken: session.accessToken,
      userId: session.userId,
      deviceId: session.deviceId,
      logger: filteredLogger,
      cryptoCallbacks,
    })
    return matrixClient
  } catch {
    localStorage.removeItem('matrix_session')
    return null
  }
}

export async function startSync(): Promise<void> {
  if (!matrixClient) return

  // Init crypto before starting sync so decryption works
  await initCrypto(matrixClient)

  await matrixClient.startClient({
    initialSyncLimit: 50,
  })

  // Wait for initial sync
  await new Promise<void>((resolve) => {
    const onSync = (state: string) => {
      if (state === 'PREPARED') {
        matrixClient?.removeListener(sdk.ClientEvent.Sync, onSync)
        resolve()
      }
    }
    matrixClient?.on(sdk.ClientEvent.Sync, onSync)
  })

  // After sync, check and enable key backup for decrypting historical messages
  await enableKeyBackup(matrixClient)
}

export async function logout(): Promise<void> {
  if (matrixClient) {
    try {
      matrixClient.stopClient()
      await matrixClient.logout(true)
    } catch {
      // ignore errors during logout
    }
  }
  matrixClient = null
  localStorage.removeItem('matrix_session')
}

export function getAvatarUrl(
  mxcUrl: string | null | undefined,
  size: number = 96
): string | null {
  if (!mxcUrl || !matrixClient) return null
  return matrixClient.mxcUrlToHttp(mxcUrl, size, size, 'crop') || null
}

export function getUserId(): string | null {
  return matrixClient?.getUserId() || null
}

export { HOMESERVER_URL }
