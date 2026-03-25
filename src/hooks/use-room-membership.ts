'use client'

import { useEffect } from 'react'
import { getMatrixClient } from '@/lib/matrix/client'
import { useChatStore } from '@/stores/chat-store'
import * as sdk from 'matrix-js-sdk'

/**
 * Hook that listens for room membership changes, member name/avatar updates,
 * and auto-archives inactive rooms.
 */
export function useRoomMembership(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return

    const client = getMatrixClient()
    if (!client) return

    const { loadRooms } = useChatStore.getState()

    let loadRoomsTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedLoadRooms = () => {
      if (loadRoomsTimer) clearTimeout(loadRoomsTimer)
      loadRoomsTimer = setTimeout(() => {
        loadRooms()
        loadRoomsTimer = null
      }, 300)
    }

    const onRoomMembership = () => {
      debouncedLoadRooms()
    }

    const onRoomMemberChange = () => {
      debouncedLoadRooms()
    }

    client.on(sdk.RoomEvent.MyMembership, onRoomMembership)
    client.on(sdk.RoomMemberEvent.Membership as any, onRoomMemberChange)
    client.on(sdk.RoomMemberEvent.Name as any, onRoomMemberChange)
    client.on(sdk.RoomStateEvent.Events as any, onRoomMemberChange)

    // Auto-archive inactive conversations every 5 minutes
    const AUTO_ARCHIVE_INACTIVITY_MS = 1 * 60 * 60 * 1000 // 1 hour
    const AUTO_ARCHIVE_CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes
    const autoArchiveInterval = setInterval(() => {
      const { rooms, activeRoom, archiveRoom } = useChatStore.getState()
      const now = Date.now()
      for (const room of rooms) {
        if (room.isArchived) continue
        if (room.roomId === activeRoom?.roomId) continue
        if (room.unreadCount > 0) continue
        if (room.lastMessageTs > 0 && now - room.lastMessageTs > AUTO_ARCHIVE_INACTIVITY_MS) {
          archiveRoom(room.roomId)
        }
      }
    }, AUTO_ARCHIVE_CHECK_INTERVAL)

    return () => {
      if (loadRoomsTimer) clearTimeout(loadRoomsTimer)
      clearInterval(autoArchiveInterval)

      client.removeListener(sdk.RoomEvent.MyMembership, onRoomMembership)
      client.removeListener(sdk.RoomMemberEvent.Membership as any, onRoomMemberChange)
      client.removeListener(sdk.RoomMemberEvent.Name as any, onRoomMemberChange)
      client.removeListener(sdk.RoomStateEvent.Events as any, onRoomMemberChange)
    }
  }, [userId])
}
