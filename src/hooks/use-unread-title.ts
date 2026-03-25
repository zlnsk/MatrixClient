'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'

const BASE_TITLE = 'szept'

function getTotalUnread(): number {
  return useChatStore.getState().rooms.reduce(
    (sum, r) => sum + (r.isArchived ? 0 : r.unreadCount), 0
  )
}

function updateTitle() {
  const total = getTotalUnread()
  const newTitle = total > 0 ? `(${total > 99 ? '99+' : total}) ${BASE_TITLE}` : BASE_TITLE
  if (document.title !== newTitle) {
    document.title = newTitle
  }

  // Update app badge if supported
  if ('setAppBadge' in navigator) {
    if (total > 0) {
      (navigator as any).setAppBadge(total).catch(() => {})
    } else {
      (navigator as any).clearAppBadge().catch(() => {})
    }
  }
}

/**
 * Updates document.title with the total unread message count across all rooms.
 * Shows "(3) szept" when there are unread messages, or just "szept" when clear.
 * Uses both zustand subscription and a polling fallback to ensure the title
 * stays in sync even if Next.js metadata overwrites it.
 */
export function useUnreadTitle() {
  useEffect(() => {
    // Subscribe to store changes
    const unsub = useChatStore.subscribe(updateTitle)

    // Polling fallback — catches cases where Next.js metadata or
    // browser tab switching resets the title
    const interval = setInterval(updateTitle, 5000)

    // Set initial title
    updateTitle()

    return () => {
      unsub()
      clearInterval(interval)
    }
  }, [])
}
