'use client'

import * as sdk from 'matrix-js-sdk'
import type { Logger } from 'matrix-js-sdk/lib/logger'
import type { CryptoCallbacks } from 'matrix-js-sdk/lib/crypto-api'

let matrixClient: sdk.MatrixClient | null = null

/**
 * Get the homeserver URL from the current session or return null.
 */
export function getHomeserverUrl(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const session = localStorage.getItem('matrix_session')
    if (session) {
      return JSON.parse(session).homeserverUrl || null
    }
  } catch { /* ignore */ }
  return null
}

/**
 * Get the homeserver domain (hostname) from the current session.
 */
export function getHomeserverDomain(): string | null {
  const url = getHomeserverUrl()
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * Resolve a Matrix server name to a homeserver base URL.
 * Tries .well-known discovery first, then falls back to https://server.
 */
export async function resolveHomeserver(server: string): Promise<string> {
  // If user typed a full URL, use it directly
  if (server.startsWith('http://') || server.startsWith('https://')) {
    return server.replace(/\/+$/, '')
  }

  // Try .well-known discovery
  try {
    const res = await fetch(`https://${server}/.well-known/matrix/client`)
    if (res.ok) {
      const data = await res.json()
      const base = data?.['m.homeserver']?.base_url
      if (base) return base.replace(/\/+$/, '')
    }
  } catch { /* discovery failed, fall back */ }

  return `https://${server}`
}

// Pending secret storage key for the getSecretStorageKey callback
let pendingSecretStorageKey: Uint8Array | null = null
let pendingSecretStorageResolve: ((key: [string, Uint8Array] | null) => void) | null = null

const cryptoCallbacks: CryptoCallbacks = {
  getSecretStorageKey: async ({ keys }: { keys: Record<string, any> }, _name: string): Promise<[string, Uint8Array<ArrayBuffer>] | null> => {
    if (pendingSecretStorageKey) {
      const keyId = Object.keys(keys)[0]
      // Don't clear pendingSecretStorageKey here — the SDK calls this callback
      // multiple times during restoration (for cross-signing keys + backup key).
      // It's cleared in restoreFromRecoveryKey after the process completes.
      const key = new Uint8Array(pendingSecretStorageKey) as Uint8Array<ArrayBuffer>
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
  'Not checking key backup for session',
  'Adding default global',
  'is not trusted',
  'already queued',
  // Key backup 404 spam for sessions that were never backed up
  'No luck requesting key backup',
  'No room_keys found',
  'requestRoomKeyFromBackup',
  // Rust WASM crypto module patterns (these bypass the JS SDK logger)
  'matrix_sdk_crypto',
  "Can't find the room key",
  'Failed to decrypt a room event',
  'WARN matrix_sdk',
  'ERROR matrix_sdk',
  // to-device decryption errors (expected after crypto store reset / new device)
  'to-device event was not decrypted',
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
  const originalTrace = console.trace
  console.warn = (...args: any[]) => {
    if (!isSuppressed(args)) originalWarn.apply(console, args)
  }
  console.error = (...args: any[]) => {
    if (!isSuppressed(args)) originalError.apply(console, args)
  }
  console.trace = (...args: any[]) => {
    if (!isSuppressed(args)) originalTrace.apply(console, args)
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
  } catch (err) {
    // If the stored crypto account doesn't match the current device ID
    // (e.g. user logged out and back in, or device ID changed),
    // clear the stale IndexedDB crypto store and retry.
    const errMsg = String(err)
    if (errMsg.includes('account in the store doesn\'t match')) {
      console.warn('Crypto store has stale device keys, clearing and reinitializing...')
      try {
        // Delete all IndexedDB databases that the Rust crypto SDK creates
        const databases = await indexedDB.databases()
        for (const db of databases) {
          if (db.name && (db.name.includes('matrix-sdk-crypto') || db.name.includes('_rust_sdk'))) {
            indexedDB.deleteDatabase(db.name)
          }
        }
        // Retry crypto init
        await client.initRustCrypto({
          useIndexedDB: true,
        })
      } catch (retryErr) {
        console.error('Crypto initialization failed after clearing store:', retryErr)
        throw retryErr
      }
    } else {
      console.error('Crypto initialization failed:', err)
      throw err
    }
  }

  // Set the global policy to auto-accept room key requests and
  // trust devices for faster decryption experience
  const crypto = client.getCrypto()
  if (crypto) {
    // Auto-verify own device cross-signing
    await crypto.setDeviceVerified(client.getUserId()!, client.getDeviceId()!)
  }
}

async function enableKeyBackup(client: sdk.MatrixClient): Promise<void> {
  try {
    const crypto = client.getCrypto()
    if (!crypto) return

    // Check if server has a key backup and enable it
    // Check backup info and trust BEFORE enabling, to avoid the SDK firing
    // per-session key requests against an untrusted backup (causing 404 spam).
    const backupInfo = await crypto.getKeyBackupInfo()
    if (!backupInfo) {
      console.log('No key backup found on server')
      return
    }
    console.log('Key backup found on server, version:', backupInfo.version)

    const trustInfo = await crypto.isKeyBackupTrusted(backupInfo)
    console.log('Backup trusted:', trustInfo.trusted)

    if (!trustInfo.trusted) {
      console.log('Skipping key backup enable — backup is not trusted')
      return
    }

    // Backup is trusted — safe to enable without 404 spam
    const check = await crypto.checkKeyBackupAndEnable()
    if (check && pendingSecretStorageKey) {
      try {
        await crypto.loadSessionBackupPrivateKeyFromSecretStorage()
        console.log('Loaded backup decryption key from secret storage')
        const result = await crypto.restoreKeyBackup()
        console.log(`Auto-restored ${result.imported} of ${result.total} keys from backup`)
      } catch (err) {
        console.log('Could not auto-restore from backup:', err)
      }
    }
  } catch (err) {
    console.warn('Key backup check failed:', err)
  }
}

/**
 * Bootstrap cross-signing, secret storage, and key backup.
 * Generates a new security/recovery key that the user must save.
 * Returns the encoded recovery key string.
 */
export async function generateSecurityKey(password: string): Promise<string> {
  if (!matrixClient) throw new Error('Not connected')
  const crypto = matrixClient.getCrypto()
  if (!crypto) throw new Error('Crypto not initialized')

  // Generate the recovery key FIRST so the SSSS callback can always provide it.
  // bootstrapCrossSigning may access existing secret storage, which triggers
  // getSecretStorageKey — without pendingSecretStorageKey set, it returns null
  // causing "getSecretStorageKey callback returned falsey".
  const recoveryKey = await crypto.createRecoveryKeyFromPassphrase()
  const encodedKey = recoveryKey.encodedPrivateKey!
  pendingSecretStorageKey = recoveryKey.privateKey

  // Bootstrap cross-signing so fresh keys exist before secret storage stores them
  await crypto.bootstrapCrossSigning({
    setupNewCrossSigning: true,
    authUploadDeviceSigningKeys: async (makeRequest) => {
      // Try without auth first; if 401, retry with password
      try {
        await makeRequest({})
      } catch (err: any) {
        if (err.httpStatus === 401 && err.data?.flows) {
          await makeRequest({
            type: 'm.login.password',
            identifier: {
              type: 'm.id.user',
              user: matrixClient!.getUserId()!,
            },
            password,
          })
        } else {
          throw err
        }
      }
    },
  })

  // Bootstrap secret storage — stores the fresh cross-signing keys with the new SSSS key
  await crypto.bootstrapSecretStorage({
    createSecretStorageKey: async () => recoveryKey,
    setupNewSecretStorage: true,
    setupNewKeyBackup: true,
  })

  // Load the backup key and restore any existing backed-up room keys
  try {
    await crypto.loadSessionBackupPrivateKeyFromSecretStorage()
    const result = await crypto.restoreKeyBackup()
    console.log(`Restored ${result.imported} of ${result.total} keys after security setup`)
  } catch (err) {
    console.log('No existing key backup to restore:', err)
  }

  pendingSecretStorageKey = null
  return encodedKey
}

/**
 * Check if cross-signing is set up and if this device is cross-signed.
 */
export async function getCrossSigningStatus(): Promise<{
  exists: boolean
  thisDeviceVerified: boolean
}> {
  if (!matrixClient) return { exists: false, thisDeviceVerified: false }
  const crypto = matrixClient.getCrypto()
  if (!crypto) return { exists: false, thisDeviceVerified: false }

  try {
    const status = await crypto.getCrossSigningStatus()
    const isCrossSigned = status.publicKeysOnDevice && status.privateKeysInSecretStorage

    // Check if our device is verified by cross-signing
    const userId = matrixClient.getUserId()!
    const deviceId = matrixClient.getDeviceId()!
    const deviceVerification = await crypto.getDeviceVerificationStatus(userId, deviceId)
    const thisDeviceVerified = deviceVerification?.crossSigningVerified ?? false

    return {
      exists: isCrossSigned,
      thisDeviceVerified,
    }
  } catch {
    return { exists: false, thisDeviceVerified: false }
  }
}

/**
 * Request interactive verification from another session of the same user.
 */
export async function requestSelfVerification(): Promise<any> {
  if (!matrixClient) throw new Error('Not connected')
  const crypto = matrixClient.getCrypto()
  if (!crypto) throw new Error('Crypto not initialized')

  const userId = matrixClient.getUserId()!
  const request = await crypto.requestOwnUserVerification()
  return request
}

export async function restoreFromRecoveryKey(input: string): Promise<void> {
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

  // Step 1: Set the recovery key so the SSSS callback can provide it
  // when bootstrapCrossSigning needs to read cross-signing private keys from Secret Storage.
  pendingSecretStorageKey = keyBytes

  // Step 2: Bootstrap cross-signing WITHOUT setupNewCrossSigning.
  // This loads the existing cross-signing private keys from Secret Storage
  // (master, self-signing, user-signing) rather than creating new ones.
  try {
    await crypto.bootstrapCrossSigning({})
    console.log('Cross-signing keys loaded from Secret Storage')
  } catch (err) {
    console.warn('bootstrapCrossSigning failed:', err)
    // Continue anyway — cross-signing keys may already be cached locally
  }

  // Step 3: Cross-sign this device using the self-signing key.
  // This is what makes getCrossSigningStatus().thisDeviceVerified return true.
  try {
    const deviceId = matrixClient.getDeviceId()!
    await crypto.crossSignDevice(deviceId)
    console.log('Device cross-signed successfully:', deviceId)
  } catch (err) {
    console.warn('crossSignDevice failed (may already be signed):', err)
  }

  // Step 4: Optionally restore from key backup if one exists.
  // Do NOT create a new backup — just restore existing keys if available.
  try {
    await crypto.loadSessionBackupPrivateKeyFromSecretStorage()
    console.log('Loaded backup key from Secret Storage')
    const result = await crypto.restoreKeyBackup({
      progressCallback: (progress: any) => {
        console.log('Key restore progress:', progress)
      },
    })
    console.log(`Restored ${result.imported} of ${result.total} keys from backup`)
  } catch (err) {
    console.log('Key backup restoration skipped (no backup or failed):', err)
  }

  pendingSecretStorageKey = null
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
  password: string,
  homeserverUrl: string
): Promise<sdk.MatrixClient> {
  const tmpClient = sdk.createClient({ baseUrl: homeserverUrl })

  const response = await tmpClient.login('m.login.password', {
    user: username,
    password,
    initial_device_display_name: 'Matrix Client Web',
  })

  matrixClient = sdk.createClient({
    baseUrl: homeserverUrl,
    accessToken: response.access_token,
    userId: response.user_id,
    deviceId: response.device_id,
    logger: filteredLogger,
    cryptoCallbacks,
    timelineSupport: true,
    fallbackICEServerAllowed: true,
    iceCandidatePoolSize: 20,
  })

  await initCrypto(matrixClient)

  // Persist session
  localStorage.setItem(
    'matrix_session',
    JSON.stringify({
      accessToken: response.access_token,
      userId: response.user_id,
      deviceId: response.device_id,
      homeserverUrl,
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

    // Validate homeserver URL is a valid URL
    try {
      new URL(session.homeserverUrl)
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
      timelineSupport: true,
      fallbackICEServerAllowed: true,
      iceCandidatePoolSize: 20,
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

  // If the key backup is not trusted by this device, skip enabling it locally.
  // We intentionally do NOT delete it from the server — it may be trusted by
  // other verified sessions and deleting it would permanently destroy backed-up keys.

  await matrixClient.startClient({
    initialSyncLimit: 50,
    lazyLoadMembers: true,
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
): string | null {
  if (!mxcUrl) return null
  // Return raw MXC URL; Avatar component fetches via authenticated endpoint
  return mxcUrl
}

export function getUserId(): string | null {
  return matrixClient?.getUserId() || null
}

