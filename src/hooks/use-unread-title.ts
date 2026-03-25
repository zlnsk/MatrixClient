'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'

const BASE_TITLE = 'szept'

/**
 * Updates document.title with the total unread message count across all rooms.
 * Shows "(3) szept" when there are unread messages, or just "szept" when clear.
 */
export function useUnreadTitle() {
  const rooms = useChatStore(s => s.rooms)

  useEffect(() => {
    const total = rooms.reduce((sum, r) => sum + (r.isArchived ? 0 : r.unreadCount), 0)
    document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ${BASE_TITLE}` : BASE_TITLE

    // Update app badge if supported
    if ('setAppBadge' in navigator) {
      if (total > 0) {
        (navigator as any).setAppBadge(total).catch(() => {})
      } else {
        (navigator as any).clearAppBadge().catch(() => {})
      }
    }
  }, [rooms])
}
