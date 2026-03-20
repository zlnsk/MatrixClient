'use client'

import { useEffect, type ReactNode } from 'react'
import { getMatrixClient } from '@/lib/matrix/client'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import * as sdk from 'matrix-js-sdk'

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user)
  const { loadRooms, activeRoom, loadMessages } = useChatStore()

  useEffect(() => {
    if (!user) return

    const client = getMatrixClient()
    if (!client) return

    // Listen for new timeline events (messages, reactions, redactions)
    const onTimelineEvent = (
      event: sdk.MatrixEvent,
      room: sdk.Room | undefined,
    ) => {
      if (!room) return

      // Refresh the room list
      loadRooms()

      // If this is the active room, reload messages
      const currentActiveRoom = useChatStore.getState().activeRoom
      if (currentActiveRoom?.roomId === room.roomId) {
        loadMessages(room.roomId)
      }

      // Browser notification for messages from others
      const eventType = event.getType()
      if (
        (eventType === 'm.room.message' || eventType === 'm.room.encrypted') &&
        event.getSender() !== user.userId &&
        document.hidden
      ) {
        if ('Notification' in window && Notification.permission === 'granted') {
          const senderName = room.getMember(event.getSender()!)?.name || event.getSender()
          const clearContent = (event as any).getClearContent?.()
          const content = clearContent || event.getContent()
          const body = content?.body || 'New message'
          new Notification(`${senderName} in ${room.name}`, {
            body: body.substring(0, 100),
            icon: '/favicon.ico',
          })
        }
      }
    }

    // When an encrypted event gets decrypted, reload messages
    const onEventDecrypted = (event: sdk.MatrixEvent) => {
      const currentActiveRoom = useChatStore.getState().activeRoom
      if (currentActiveRoom && event.getRoomId() === currentActiveRoom.roomId) {
        loadMessages(currentActiveRoom.roomId)
      }
      // Also refresh sidebar for last message preview
      loadRooms()
    }

    // Listen for room membership changes
    const onRoomMembership = () => {
      loadRooms()
    }

    // Listen for typing notifications
    const onRoomTyping = (_event: sdk.MatrixEvent, room: sdk.Room) => {
      const currentActiveRoom = useChatStore.getState().activeRoom
      if (currentActiveRoom?.roomId === room.roomId) {
        const typingMembers = (room as any).getTypingMembers?.() || []
        const typingNames = typingMembers
          .filter((m: any) => m.userId !== user.userId)
          .map((m: any) => m.name || m.userId)
        useChatStore.setState({ typingUsers: typingNames })
      }
    }

    // Listen for read receipts
    const onReceipt = (_event: sdk.MatrixEvent, room: sdk.Room) => {
      const currentActiveRoom = useChatStore.getState().activeRoom
      if (currentActiveRoom?.roomId === room.roomId) {
        loadMessages(room.roomId)
      }
    }

    client.on(sdk.RoomEvent.Timeline, onTimelineEvent)
    client.on(sdk.RoomEvent.MyMembership, onRoomMembership)
    client.on(sdk.RoomEvent.Receipt, onReceipt)
    client.on(sdk.MatrixEventEvent.Decrypted, onEventDecrypted)
    client.on('RoomMember.typing' as any, onRoomTyping)

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    return () => {
      client.removeListener(sdk.RoomEvent.Timeline, onTimelineEvent)
      client.removeListener(sdk.RoomEvent.MyMembership, onRoomMembership)
      client.removeListener(sdk.RoomEvent.Receipt, onReceipt)
      client.removeListener(sdk.MatrixEventEvent.Decrypted, onEventDecrypted)
      client.removeListener('RoomMember.typing' as any, onRoomTyping)
    }
  }, [user, activeRoom, loadRooms, loadMessages])

  return <>{children}</>
}
