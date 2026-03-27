'use client'

import { useState, useEffect, useRef } from 'react'
import { getMatrixClient } from '@/lib/matrix/client'
import { WifiOff, Loader2 } from 'lucide-react'

type ConnectionState = 'connected' | 'reconnecting' | 'offline'

export function ConnectionBanner() {
  const [state, setState] = useState<ConnectionState>('connected')
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const client = getMatrixClient()
    if (!client) return

    const onSync = (syncState: string) => {
      if (syncState === 'SYNCING' || syncState === 'PREPARED') {
        setState('connected')
      } else if (syncState === 'RECONNECTING') {
        setState('reconnecting')
      } else if (syncState === 'ERROR' || syncState === 'STOPPED') {
        setState('offline')
      }
    }

    // Listen for online/offline browser events — use ref to avoid re-subscribing
    const onOnline = () => {
      if (stateRef.current === 'offline') setState('reconnecting')
    }
    const onOffline = () => setState('offline')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client.on('sync' as any, onSync)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.removeListener('sync' as any, onSync)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, []) // stable deps — stateRef avoids stale closure

  if (state === 'connected') return null

  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium animate-slide-in ${
      state === 'reconnecting'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
        : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
    }`}>
      {state === 'reconnecting' ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Reconnecting...</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>You are offline</span>
        </>
      )}
    </div>
  )
}
