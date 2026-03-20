'use client'

import { useEffect, type ReactNode } from 'react'
import { getMatrixClient } from '@/lib/matrix/client'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import * as sdk from 'matrix-js-sdk'

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user)
  const { loadRooms, refreshRoom, activeRoom, loadMessages } = useChatStore()

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

      // Refresh the room in the sidebar
      loadRooms()

      // If this is the active room, reload messages
      if (activeRoom?.roomId === room.roomId) {
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
          const body = event.getContent()?.body || 'New message'
          new Notification(`${senderName} in ${room.name}`, {
            body: body.substring(0, 100),
            icon: '/favicon.ico',
          })
        }
      }
    }

    // Listen for typing events
    const onTyping = (event: sdk.MatrixEvent, member: sdk.RoomMember) => {
      if (activeRoom && member.roomId === activeRoom.roomId) {
        const typingMembers = client.getRoom(activeRoom.roomId)
          ?.getMembers()
          .filter((m) => {
            const typingEvent = client.getRoom(activeRoom.roomId)?.currentState
              .getStateEvents('m.typing', '')
            return false // typing handled below
          })
        // Use the room's typing members directly
      }
    }

    // Listen for room membership changes
    const onRoomMembership = () => {
      loadRooms()
    }

    // Listen for typing notifications
    const onRoomTyping = (event: sdk.MatrixEvent, room: sdk.Room) => {
      if (activeRoom?.roomId === room.roomId) {
        const typingUserIds = (event.getContent()?.user_ids || []) as string[]
        const typingNames = typingUserIds
          .filter((id: string) => id !== user.userId)
          .map((id: string) => room.getMember(id)?.name || id)

        useChatStore.setState({ typingUsers: typingNames })
      }
    }

    client.on(sdk.RoomEvent.Timeline, onTimelineEvent)
    client.on(sdk.RoomEvent.MyMembership, onRoomMembership)
    client.on(sdk.RoomMemberEvent.Typing, onTyping)

    // For typing, listen on the raw event
    client.on('RoomMember.typing' as any, onRoomTyping)

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    return () => {
      client.removeListener(sdk.RoomEvent.Timeline, onTimelineEvent)
      client.removeListener(sdk.RoomEvent.MyMembership, onRoomMembership)
      client.removeListener(sdk.RoomMemberEvent.Typing, onTyping)
      client.removeListener('RoomMember.typing' as any, onRoomTyping)
    }
  }, [user, activeRoom, loadRooms, refreshRoom, loadMessages])

  return <>{children}</>
}
