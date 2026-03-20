import { create } from 'zustand'
import { getMatrixClient, getAvatarUrl, getUserId } from '@/lib/matrix/client'
import type { Room, MatrixEvent, RoomMember } from 'matrix-js-sdk'

export interface MatrixRoom {
  roomId: string
  name: string
  avatarUrl: string | null
  topic: string | null
  isDirect: boolean
  lastMessage: string | null
  lastMessageTs: number
  lastSenderName: string | null
  unreadCount: number
  members: MatrixRoomMember[]
  encrypted: boolean
}

export interface MatrixRoomMember {
  userId: string
  displayName: string
  avatarUrl: string | null
  membership: string
  presence: 'online' | 'offline' | 'unavailable' | null
}

export interface MatrixMessage {
  eventId: string
  roomId: string
  senderId: string
  senderName: string
  senderAvatar: string | null
  type: string
  content: string
  formattedContent: string | null
  timestamp: number
  isEdited: boolean
  isRedacted: boolean
  replyToEvent: {
    eventId: string
    senderId: string
    senderName: string
    content: string
  } | null
  reactions: Map<string, { count: number; users: string[]; includesMe: boolean }>
  mediaUrl: string | null
  mediaInfo: { w?: number; h?: number; mimetype?: string; size?: number } | null
}

interface ChatState {
  rooms: MatrixRoom[]
  activeRoom: MatrixRoom | null
  messages: MatrixMessage[]
  isLoadingMessages: boolean
  typingUsers: string[]
  searchQuery: string

  loadRooms: () => void
  setActiveRoom: (room: MatrixRoom | null) => void
  loadMessages: (roomId: string) => void
  sendMessage: (roomId: string, content: string, replyToEventId?: string) => Promise<void>
  editMessage: (roomId: string, eventId: string, newContent: string) => Promise<void>
  redactMessage: (roomId: string, eventId: string) => Promise<void>
  sendReaction: (roomId: string, eventId: string, emoji: string) => Promise<void>
  createDirectChat: (userId: string) => Promise<string>
  createGroupChat: (name: string, userIds: string[]) => Promise<string>
  setSearchQuery: (query: string) => void
  markAsRead: (roomId: string) => Promise<void>
  sendTyping: (roomId: string, typing: boolean) => void
  refreshRoom: (roomId: string) => void
}

function roomToMatrixRoom(room: Room): MatrixRoom {
  const client = getMatrixClient()
  const userId = getUserId()

  const timeline = room.getLiveTimeline().getEvents()
  const lastEvent = timeline.filter(
    (e) => e.getType() === 'm.room.message' || e.getType() === 'm.room.encrypted'
  ).pop()

  const lastContent = lastEvent?.getContent()
  let lastMessage: string | null = null
  if (lastContent) {
    if (lastContent.msgtype === 'm.image') lastMessage = '📷 Image'
    else if (lastContent.msgtype === 'm.video') lastMessage = '🎬 Video'
    else if (lastContent.msgtype === 'm.audio') lastMessage = '🎤 Audio'
    else if (lastContent.msgtype === 'm.file') lastMessage = '📎 File'
    else lastMessage = lastContent.body || null
  }

  const members = room.getJoinedMembers().map((m: RoomMember) => ({
    userId: m.userId,
    displayName: m.name || m.userId,
    avatarUrl: getAvatarUrl(m.getMxcAvatarUrl()),
    membership: m.membership || 'join',
    presence: (client?.getUser(m.userId)?.presence as 'online' | 'offline' | 'unavailable') || null,
  }))

  // Check if direct message
  const dmMap = (client as any)?.getAccountData('m.direct')?.getContent() || {}
  let isDirect = false
  for (const userRooms of Object.values(dmMap) as string[][]) {
    if (userRooms.includes(room.roomId)) {
      isDirect = true
      break
    }
  }

  return {
    roomId: room.roomId,
    name: room.name || 'Unnamed Room',
    avatarUrl: getAvatarUrl(room.getMxcAvatarUrl()),
    topic: room.currentState.getStateEvents('m.room.topic', '')?.getContent()?.topic || null,
    isDirect,
    lastMessage,
    lastMessageTs: lastEvent?.getTs() || room.getLastActiveTimestamp() || 0,
    lastSenderName: lastEvent ? (room.getMember(lastEvent.getSender()!)?.name || lastEvent.getSender() || null) : null,
    unreadCount: (room as any).getUnreadNotificationCount('total') || 0,
    members,
    encrypted: room.hasEncryptionStateEvent(),
  }
}

function eventToMatrixMessage(event: MatrixEvent, room: Room): MatrixMessage | null {
  const type = event.getType()
  const client = getMatrixClient()
  const userId = getUserId()

  if (type === 'm.room.message' || type === 'm.room.encrypted' || type === 'm.sticker') {
    const content = event.getContent()
    const sender = event.getSender()!
    const member = room.getMember(sender)

    // Check for reply
    let replyToEvent = null
    const relatesTo = content['m.relates_to']
    if (relatesTo?.['m.in_reply_to']?.event_id) {
      const replyEvent = room.findEventById(relatesTo['m.in_reply_to'].event_id)
      if (replyEvent) {
        const replySender = replyEvent.getSender()!
        const replyMember = room.getMember(replySender)
        replyToEvent = {
          eventId: replyEvent.getId()!,
          senderId: replySender,
          senderName: replyMember?.name || replySender,
          content: replyEvent.getContent()?.body || '',
        }
      }
    }

    // Collect reactions
    const reactions = new Map<string, { count: number; users: string[]; includesMe: boolean }>()
    const relatedEvents = room.getLiveTimeline().getEvents()
    for (const e of relatedEvents) {
      if (e.getType() === 'm.reaction') {
        const rel = e.getContent()['m.relates_to']
        if (rel?.event_id === event.getId() && rel?.key) {
          const emoji = rel.key
          const existing = reactions.get(emoji) || { count: 0, users: [], includesMe: false }
          existing.count++
          existing.users.push(e.getSender()!)
          if (e.getSender() === userId) existing.includesMe = true
          reactions.set(emoji, existing)
        }
      }
    }

    // Check if edited
    const isEdited = !!(content['m.new_content'] || event.replacingEvent())
    const displayContent = content['m.new_content'] || content

    // Media
    let mediaUrl: string | null = null
    let mediaInfo = null
    if (displayContent.msgtype === 'm.image' || displayContent.msgtype === 'm.video' || displayContent.msgtype === 'm.audio' || displayContent.msgtype === 'm.file') {
      const mxcUrl = displayContent.url
      if (mxcUrl && client) {
        mediaUrl = client.mxcUrlToHttp(mxcUrl) || null
      }
      mediaInfo = displayContent.info || null
    }

    // Strip reply fallback from body
    let body = displayContent.body || ''
    if (body.startsWith('> ')) {
      const lines = body.split('\n')
      const firstNonQuote = lines.findIndex((l: string) => !l.startsWith('> ') && l !== '')
      if (firstNonQuote > 0) {
        body = lines.slice(firstNonQuote).join('\n').trim()
      }
    }

    return {
      eventId: event.getId()!,
      roomId: room.roomId,
      senderId: sender,
      senderName: member?.name || sender,
      senderAvatar: getAvatarUrl(member?.getMxcAvatarUrl()),
      type: displayContent.msgtype || 'm.text',
      content: body,
      formattedContent: displayContent.formatted_body || null,
      timestamp: event.getTs(),
      isEdited,
      isRedacted: event.isRedacted(),
      replyToEvent,
      reactions,
      mediaUrl,
      mediaInfo,
    }
  }

  return null
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  activeRoom: null,
  messages: [],
  isLoadingMessages: false,
  typingUsers: [],
  searchQuery: '',

  loadRooms: () => {
    const client = getMatrixClient()
    if (!client) return

    const rooms = client.getRooms()
      .filter(r => r.getMyMembership() === 'join')
      .map(roomToMatrixRoom)
      .sort((a, b) => b.lastMessageTs - a.lastMessageTs)

    set({ rooms })
  },

  setActiveRoom: (room) => {
    set({ activeRoom: room, messages: [], typingUsers: [] })
    if (room) {
      get().loadMessages(room.roomId)
    }
  },

  loadMessages: (roomId) => {
    set({ isLoadingMessages: true })
    const client = getMatrixClient()
    if (!client) return

    const room = client.getRoom(roomId)
    if (!room) {
      set({ isLoadingMessages: false })
      return
    }

    const timeline = room.getLiveTimeline().getEvents()
    const messages = timeline
      .map((e) => eventToMatrixMessage(e, room))
      .filter((m): m is MatrixMessage => m !== null)

    set({ messages, isLoadingMessages: false })
  },

  sendMessage: async (roomId, content, replyToEventId) => {
    const client = getMatrixClient()
    if (!client) return

    const msgContent: Record<string, unknown> = {
      msgtype: 'm.text',
      body: content,
    }

    if (replyToEventId) {
      const room = client.getRoom(roomId)
      const replyEvent = room?.findEventById(replyToEventId)
      if (replyEvent) {
        const replyBody = replyEvent.getContent().body || ''
        const replySender = replyEvent.getSender()
        msgContent.body = `> <${replySender}> ${replyBody}\n\n${content}`
        msgContent.format = 'org.matrix.custom.html'
        msgContent.formatted_body = `<mx-reply><blockquote><a href="https://matrix.to/#/${roomId}/${replyToEventId}">In reply to</a> <a href="https://matrix.to/#/${replySender}">${replySender}</a><br>${replyBody}</blockquote></mx-reply>${content}`
        msgContent['m.relates_to'] = {
          'm.in_reply_to': { event_id: replyToEventId },
        }
      }
    }

    await (client as any).sendEvent(roomId, 'm.room.message', msgContent)
  },

  editMessage: async (roomId, eventId, newContent) => {
    const client = getMatrixClient()
    if (!client) return

    await (client as any).sendEvent(roomId, 'm.room.message', {
      msgtype: 'm.text',
      body: `* ${newContent}`,
      'm.new_content': {
        msgtype: 'm.text',
        body: newContent,
      },
      'm.relates_to': {
        rel_type: 'm.replace',
        event_id: eventId,
      },
    })
  },

  redactMessage: async (roomId, eventId) => {
    const client = getMatrixClient()
    if (!client) return
    await client.redactEvent(roomId, eventId)
  },

  sendReaction: async (roomId, eventId, emoji) => {
    const client = getMatrixClient()
    if (!client) return

    // Check if user already reacted with this emoji
    const userId = getUserId()
    const room = client.getRoom(roomId)
    if (!room) return

    const events = room.getLiveTimeline().getEvents()
    const existing = events.find(
      (e) =>
        e.getType() === 'm.reaction' &&
        e.getSender() === userId &&
        e.getContent()['m.relates_to']?.event_id === eventId &&
        e.getContent()['m.relates_to']?.key === emoji
    )

    if (existing) {
      await client.redactEvent(roomId, existing.getId()!)
    } else {
      await (client as any).sendEvent(roomId, 'm.reaction', {
        'm.relates_to': {
          rel_type: 'm.annotation',
          event_id: eventId,
          key: emoji,
        },
      })
    }
  },

  createDirectChat: async (userId) => {
    const client = getMatrixClient()
    if (!client) throw new Error('Not connected')

    const result = await client.createRoom({
      is_direct: true,
      invite: [userId],
      preset: 'trusted_private_chat' as sdk.Preset,
    })

    // Mark as direct message
    const dmMap = (client as any).getAccountData('m.direct')?.getContent() || {}
    const existing = dmMap[userId] || []
    dmMap[userId] = [...existing, result.room_id]
    await (client as any).setAccountData('m.direct', dmMap)

    return result.room_id
  },

  createGroupChat: async (name, userIds) => {
    const client = getMatrixClient()
    if (!client) throw new Error('Not connected')

    const result = await client.createRoom({
      name,
      invite: userIds,
      preset: 'private_chat' as sdk.Preset,
    })

    return result.room_id
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  markAsRead: async (roomId) => {
    const client = getMatrixClient()
    if (!client) return

    const room = client.getRoom(roomId)
    if (!room) return

    const lastEvent = room.getLiveTimeline().getEvents().pop()
    if (lastEvent) {
      await client.sendReadReceipt(lastEvent)
    }
  },

  sendTyping: (roomId, typing) => {
    const client = getMatrixClient()
    if (!client) return
    client.sendTyping(roomId, typing, typing ? 30000 : 0)
  },

  refreshRoom: (roomId) => {
    const client = getMatrixClient()
    if (!client) return
    const room = client.getRoom(roomId)
    if (!room) return

    const updatedRoom = roomToMatrixRoom(room)

    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.roomId === roomId ? updatedRoom : r
      ).sort((a, b) => b.lastMessageTs - a.lastMessageTs),
      activeRoom: state.activeRoom?.roomId === roomId ? updatedRoom : state.activeRoom,
    }))

    if (get().activeRoom?.roomId === roomId) {
      get().loadMessages(roomId)
    }
  },
}))

// Need to import sdk for Preset type
import * as sdk from 'matrix-js-sdk'
