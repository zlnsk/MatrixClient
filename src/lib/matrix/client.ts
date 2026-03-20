'use client'

import * as sdk from 'matrix-js-sdk'

let matrixClient: sdk.MatrixClient | null = null

const HOMESERVER_URL = 'https://lukasz.com'

export function getMatrixClient(): sdk.MatrixClient | null {
  return matrixClient
}

function createMatrixClient(opts: {
  baseUrl: string
  accessToken: string
  userId: string
  deviceId: string
}): sdk.MatrixClient {
  return sdk.createClient({
    baseUrl: opts.baseUrl,
    accessToken: opts.accessToken,
    userId: opts.userId,
    deviceId: opts.deviceId,
    // Enable crypto support if available
    cryptoCallbacks: {} as any,
  })
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

  matrixClient = createMatrixClient({
    baseUrl: HOMESERVER_URL,
    accessToken: response.access_token,
    userId: response.user_id,
    deviceId: response.device_id,
  })

  // Try to initialize crypto
  try {
    await (matrixClient as any).initCrypto?.()
  } catch {
    // Crypto not available — encrypted messages will show as locked
  }

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
    matrixClient = createMatrixClient({
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

  // Try to initialize crypto before starting sync
  try {
    await (matrixClient as any).initCrypto?.()
  } catch {
    // Crypto not available
  }

  await matrixClient.startClient({
    initialSyncLimit: 20,
  })

  // Wait for initial sync
  return new Promise((resolve) => {
    const onSync = (state: string) => {
      if (state === 'PREPARED') {
        matrixClient?.removeListener(sdk.ClientEvent.Sync, onSync)
        resolve()
      }
    }
    matrixClient?.on(sdk.ClientEvent.Sync, onSync)
  })
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
