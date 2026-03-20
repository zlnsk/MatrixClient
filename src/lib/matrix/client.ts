'use client'

import * as sdk from 'matrix-js-sdk'

let matrixClient: sdk.MatrixClient | null = null

const HOMESERVER_URL = 'https://lukasz.com'

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

  // Get the backup info from server
  const backupInfo = await crypto.getKeyBackupInfo()
  if (!backupInfo) throw new Error('No key backup found on server')

  // Try decoding as a recovery key first (space-separated base58 groups)
  // If that fails, try as a passphrase
  let keyBytes: Uint8Array | null = null

  try {
    const { decodeRecoveryKey } = await import('matrix-js-sdk/lib/crypto-api/recovery-key')
    keyBytes = decodeRecoveryKey(trimmed)
  } catch {
    // Not a valid recovery key format — will try as passphrase below
    console.log('Not a recovery key format, trying as passphrase...')
  }

  if (keyBytes) {
    // Store the decoded key and attempt restore
    await crypto.storeSessionBackupPrivateKey(keyBytes, backupInfo.version!)

    try {
      const result = await crypto.restoreKeyBackup({
        progressCallback: (progress: any) => {
          console.log('Key restore progress:', progress)
        },
      })
      return result
    } catch (err) {
      // If the key doesn't match, provide a clear error
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

  // Fall back to passphrase-based restore
  try {
    const result = await crypto.restoreKeyBackupWithPassphrase(trimmed, {
      progressCallback: (progress: any) => {
        console.log('Key restore progress:', progress)
      },
    })
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('does not match')) {
      throw new Error(
        'The passphrase or recovery key does not match the backup on the server. ' +
        'Please check and try again.'
      )
    }
    throw err
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
    matrixClient = sdk.createClient({
      baseUrl: session.homeserverUrl,
      accessToken: session.accessToken,
      userId: session.userId,
      deviceId: session.deviceId,
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
