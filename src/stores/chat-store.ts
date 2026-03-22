import { create } from 'zustand'
import { getMatrixClient, getAvatarUrl, getUserId } from '@/lib/matrix/client'
import type { Room, MatrixEvent, RoomMember } from 'matrix-js-sdk'

/**
 * Strip Matrix ID disambiguation from display names.
 * The SDK appends " (@user:server)" when multiple members share a display name.
 * e.g. "Łukasz (@signal_52c1d86e-...:lukasz.com)" → "Łukasz"
 */
function cleanDisplayName(name: string): string {
  // Strip trailing " (@user:server.com)" disambiguation
  const match = name.match(/^(.+?)\s*\(@[^)]+\)$/)
  if (match) return match[1].trim()
  // If the name IS a raw Matrix ID, extract the localpart
  if (name.startsWith('@') && name.includes(':')) {
    return name.slice(1).split(':')[0]
  }
  return name
}

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
  isArchived: boolean
  isBridged: boolean
}

export interface MatrixRoomMember {
  userId: string
  displayName: string
  avatarUrl: string | null
  membership: string
  presence: 'online' | 'offline' | 'unavailable' | null
}

export interface ReadReceipt {
  userId: string
  displayName: string
  avatarUrl: string | null
  ts: number
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
  encryptedFile: { url: string; key: { k: string; alg: string; key_ops: string[]; kty: string; ext: boolean }; iv: string; hashes: Record<string, string>; v: string } | null
  msgtype: string
  readBy: ReadReceipt[]
  status: 'sending' | 'sent' | 'delivered' | 'read'
}

interface ChatState {
  rooms: MatrixRoom[]
  pendingInvites: MatrixRoom[]
  activeRoom: MatrixRoom | null
  messages: MatrixMessage[]
  isLoadingMessages: boolean
  typingUsers: string[]
  searchQuery: string

  loadRooms: () => void
  acceptInvite: (roomId: string) => Promise<void>
  rejectInvite: (roomId: string) => Promise<void>
  setDisplayName: (name: string) => Promise<void>
  joinRoom: (roomIdOrAlias: string) => Promise<void>
  setActiveRoom: (room: MatrixRoom | null) => void
  loadMessages: (roomId: string) => Promise<void>
  sendMessage: (roomId: string, content: string, replyToEventId?: string) => Promise<void>
  editMessage: (roomId: string, eventId: string, newContent: string) => Promise<void>
  redactMessage: (roomId: string, eventId: string) => Promise<void>
  sendReaction: (roomId: string, eventId: string, emoji: string) => Promise<void>
  createDirectChat: (userId: string) => Promise<string>
  createGroupChat: (name: string, userIds: string[], options?: {
    encrypted?: boolean
    isPublic?: boolean
    topic?: string
  }) => Promise<string>
  setSearchQuery: (query: string) => void
  markAsRead: (roomId: string) => Promise<void>
  sendTyping: (roomId: string, typing: boolean) => void
  refreshRoom: (roomId: string) => void
  archiveRoom: (roomId: string) => Promise<void>
  unarchiveRoom: (roomId: string) => Promise<void>
  uploadFile: (roomId: string, file: File) => Promise<void>
  leaveRoom: (roomId: string) => Promise<void>
  setRoomName: (roomId: string, name: string) => Promise<void>
  setRoomTopic: (roomId: string, topic: string) => Promise<void>
  inviteMember: (roomId: string, userId: string) => Promise<void>
  pinMessage: (roomId: string, eventId: string) => Promise<void>
  unpinMessage: (roomId: string, eventId: string) => Promise<void>
  forwardMessage: (fromRoomId: string, eventId: string, toRoomId: string) => Promise<void>
  searchMessages: (query: string) => Promise<{roomId: string, roomName: string, eventId: string, sender: string, body: string, timestamp: number}[]>
}

function roomToMatrixRoom(room: Room): MatrixRoom {
  const client = getMatrixClient()
  const userId = getUserId()

  const timeline = room.getLiveTimeline().getEvents()
  const lastEvent = timeline.filter(
    (e) => e.getType() === 'm.room.message' || e.getType() === 'm.room.encrypted'
  ).pop()

  // Use decrypted content for last message preview
  const lastClear = lastEvent ? (lastEvent as any).getClearContent?.() : null
  const lastContent = lastClear || lastEvent?.getContent()
  let lastMessage: string | null = null
  if (lastContent) {
    if (lastContent.msgtype === 'm.image') lastMessage = '📷 Image'
    else if (lastContent.msgtype === 'm.video') lastMessage = '🎬 Video'
    else if (lastContent.msgtype === 'm.audio') lastMessage = '🎤 Audio'
    else if (lastContent.msgtype === 'm.file') lastMessage = '📎 File'
    else if (lastContent.body) lastMessage = lastContent.body
    else if (lastContent.algorithm) lastMessage = '🔒 Encrypted message'
    else lastMessage = null
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

  // Check if archived (has m.lowpriority tag)
  const tags = room.tags || {}
  const isArchived = 'm.lowpriority' in tags

  // For DM rooms, prefer the other member's avatar over the room avatar
  // (bridges like mautrix-signal often set the room avatar to a generic logo)
  let roomAvatarMxc = room.getMxcAvatarUrl()
  if (isDirect && client) {
    const otherMember = room.getJoinedMembers().find((m: RoomMember) => m.userId !== client.getUserId())
    const memberAvatar = otherMember?.getMxcAvatarUrl()
    if (memberAvatar) {
      roomAvatarMxc = memberAvatar
    }
  }

  return {
    roomId: room.roomId,
    name: room.name || 'Unnamed Room',
    avatarUrl: getAvatarUrl(roomAvatarMxc),
    topic: room.currentState.getStateEvents('m.room.topic', '')?.getContent()?.topic || null,
    isDirect,
    lastMessage,
    lastMessageTs: lastEvent?.getTs() || room.getLastActiveTimestamp() || 0,
    lastSenderName: lastEvent ? cleanDisplayName(room.getMember(lastEvent.getSender()!)?.name || lastEvent.getSender() || '') || null : null,
    unreadCount: (room as any).getUnreadNotificationCount('total') || 0,
    members,
    encrypted: room.hasEncryptionStateEvent(),
    isArchived,
    isBridged: members.some(m => /^@(signal_|telegram_|whatsapp_|slack_|discord_|instagram_)/.test(m.userId)),
  }
}

function eventToMatrixMessage(event: MatrixEvent, room: Room): MatrixMessage | null {
  const wireType = event.getWireType?.() || event.getType()
  const effectiveType = event.getType()
  const client = getMatrixClient()
  const userId = getUserId()

  // Accept message events, encrypted events, and stickers
  const isMessage = effectiveType === 'm.room.message' || effectiveType === 'm.sticker'
  const isEncrypted = wireType === 'm.room.encrypted' || effectiveType === 'm.room.encrypted'

  if (!isMessage && !isEncrypted) return null

  const sender = event.getSender()!
  const member = room.getMember(sender)

  // For encrypted events, try to get decrypted content first.
  // getContent() returns decrypted content if the SDK has decrypted the event.
  // getClearContent() returns decrypted content only for encrypted events.
  // We check both to handle all SDK code paths (JS crypto vs Rust crypto).
  const rawContent = event.getContent()
  const clearContent = (event as any).getClearContent?.()
  const content = (clearContent?.msgtype ? clearContent : null) || (rawContent?.msgtype ? rawContent : null) || clearContent || rawContent

  // If this is an encrypted event that hasn't been decrypted,
  // content will have {algorithm, ciphertext, ...} instead of {body, msgtype, ...}
  const isUndecrypted = isEncrypted && !content.msgtype

  // Check for reply
  let replyToEvent = null
  const relatesTo = content['m.relates_to']
  if (relatesTo?.['m.in_reply_to']?.event_id) {
    const replyEvt = room.findEventById(relatesTo['m.in_reply_to'].event_id)
    if (replyEvt) {
      const replySender = replyEvt.getSender()!
      const replyMember = room.getMember(replySender)
      const replyClear = (replyEvt as any).getClearContent?.()
      const replyContent = replyClear || replyEvt.getContent()
      replyToEvent = {
        eventId: replyEvt.getId()!,
        senderId: replySender,
        senderName: cleanDisplayName(replyMember?.name || replySender),
        content: replyContent?.body || '',
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
        const senderName = room.getMember(e.getSender()!)?.name || e.getSender()!
        existing.users.push(senderName)
        if (e.getSender() === userId) existing.includesMe = true
        reactions.set(emoji, existing)
      }
    }
  }

  // Check if edited
  const replacingEvt = event.replacingEvent?.()
  const isEdited = !!(content['m.new_content'] || replacingEvt)
  let displayContent = content
  if (content['m.new_content']) {
    displayContent = content['m.new_content']
  } else if (replacingEvt) {
    const replaceClear = (replacingEvt as any).getClearContent?.()
    const replaceContent = replaceClear || replacingEvt.getContent()
    if (replaceContent?.['m.new_content']) {
      displayContent = replaceContent['m.new_content']
    }
  }

  // Media - handle both unencrypted (url) and encrypted (file.url) attachments
  let mediaUrl: string | null = null
  let mediaInfo = null
  let encryptedFile = null
  if (displayContent.msgtype === 'm.image' || displayContent.msgtype === 'm.video' || displayContent.msgtype === 'm.audio' || displayContent.msgtype === 'm.file') {
    const mxcUrl = displayContent.url || displayContent.file?.url
    if (mxcUrl) {
      mediaUrl = mxcUrl  // Store raw MXC URL; components fetch via authenticated endpoint
    }
    if (displayContent.file) {
      encryptedFile = displayContent.file
    }
    mediaInfo = displayContent.info || null
  }

  // Get body text
  let body: string
  if (isUndecrypted) {
    body = '\u{1F512} Encrypted message (unable to decrypt)'
  } else {
    body = displayContent.body || ''
    // Strip reply fallback from body
    if (body.startsWith('> ')) {
      const lines = body.split('\n')
      const firstNonQuote = lines.findIndex((l: string) => !l.startsWith('> ') && l !== '')
      if (firstNonQuote > 0) {
        body = lines.slice(firstNonQuote).join('\n').trim()
      }
    }
    // Fallback if body is still empty
    if (!body && !mediaUrl) {
      body = isEncrypted ? '\u{1F512} Encrypted message' : '[empty message]'
    }
  }

  // Read receipts
  const readBy: ReadReceipt[] = []
  const roomReceipts = room.getReceiptsForEvent(event)
  if (roomReceipts) {
    for (const receipt of roomReceipts) {
      if (receipt.userId === sender) continue // skip own read receipt
      const receiptMember = room.getMember(receipt.userId)
      readBy.push({
        userId: receipt.userId,
        displayName: receiptMember?.name || receipt.userId,
        avatarUrl: getAvatarUrl(receiptMember?.getMxcAvatarUrl()),
        ts: receipt.data?.ts || 0,
      })
    }
  }

  // Message status for own messages
  let status: MatrixMessage['status'] = 'sent'
  if (sender === userId) {
    if (readBy.length > 0) {
      status = 'read'
    } else {
      // Check if event has been sent to server
      const isSent = event.getId() && !event.getId()!.startsWith('~')
      status = isSent ? 'delivered' : 'sending'
    }
  }

  return {
    eventId: event.getId()!,
    roomId: room.roomId,
    senderId: sender,
    senderName: cleanDisplayName(member?.name || sender),
    senderAvatar: getAvatarUrl(member?.getMxcAvatarUrl()),
    type: displayContent.msgtype || 'm.text',
    msgtype: displayContent.msgtype || 'm.text',
    content: body,
    formattedContent: displayContent.formatted_body || null,
    timestamp: event.getTs(),
    isEdited,
    isRedacted: event.isRedacted(),
    replyToEvent,
    reactions,
    mediaUrl,
    mediaInfo,
    encryptedFile,
    readBy,
    status,
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  pendingInvites: [],
  activeRoom: null,
  messages: [],
  isLoadingMessages: false,
  typingUsers: [],
  searchQuery: '',

  loadRooms: () => {
    const client = getMatrixClient()
    if (!client) return

    const allRooms = client.getRooms()

    const rooms = allRooms
      .filter(r => r.getMyMembership() === 'join')
      .map(roomToMatrixRoom)
      .sort((a, b) => b.lastMessageTs - a.lastMessageTs)

    const pendingInvites = allRooms
      .filter(r => r.getMyMembership() === 'invite')
      .map((r) => ({
        roomId: r.roomId,
        name: r.name || 'Unnamed Room',
        avatarUrl: getAvatarUrl(r.getMxcAvatarUrl()),
        topic: r.currentState.getStateEvents('m.room.topic', '')?.getContent()?.topic || null,
        isDirect: false,
        lastMessage: null,
        lastMessageTs: 0,
        lastSenderName: null,
        unreadCount: 0,
        members: [],
        encrypted: r.hasEncryptionStateEvent(),
        isArchived: false,
        isBridged: false,
      } satisfies MatrixRoom))

    set({ rooms, pendingInvites })
  },

  setActiveRoom: (room) => {
    set({ activeRoom: room, messages: [], typingUsers: [] })
    if (room) {
      get().loadMessages(room.roomId)
    }
  },

  loadMessages: async (roomId) => {
    set({ isLoadingMessages: true })
    const client = getMatrixClient()
    if (!client) {
      set({ isLoadingMessages: false })
      return
    }

    const room = client.getRoom(roomId)
    if (!room) {
      set({ isLoadingMessages: false })
      return
    }

    try {
      // Paginate backwards to load more history if the timeline is small
      const timelineSet = room.getLiveTimeline()
      const events = timelineSet.getEvents()
      if (events.length < 50) {
        try {
          await client.scrollback(room, 50)
        } catch {
          // Pagination may fail for some rooms, that's ok
        }
      }

      // Re-check active room: if user switched rooms during scrollback, bail out
      if (get().activeRoom?.roomId !== roomId) {
        set({ isLoadingMessages: false })
        return
      }

      const timeline = room.getLiveTimeline().getEvents()
      const seen = new Set<string>()
      const newMessages: MatrixMessage[] = []
      for (const e of timeline) {
        try {
          const id = e.getId()
          if (id && seen.has(id)) continue // deduplicate
          if (id) seen.add(id)
          const msg = eventToMatrixMessage(e, room)
          if (msg) newMessages.push(msg)
        } catch {
          // Skip events that fail to convert rather than losing all messages
        }
      }
      // Ensure chronological order (bridged/decrypted events can arrive out of order)
      newMessages.sort((a, b) => a.timestamp - b.timestamp)

      // Quick equality check: skip setState if messages haven't actually changed.
      // Compare by length, then key fields of each message to avoid unnecessary re-renders.
      const existing = get().messages
      let changed = existing.length !== newMessages.length
      if (!changed) {
        for (let i = 0; i < newMessages.length; i++) {
          const a = existing[i]
          const b = newMessages[i]
          if (
            a.eventId !== b.eventId ||
            a.timestamp !== b.timestamp ||
            a.content !== b.content ||
            a.isEdited !== b.isEdited ||
            a.isRedacted !== b.isRedacted ||
            a.reactions.size !== b.reactions.size ||
            a.readBy.length !== b.readBy.length ||
            a.status !== b.status
          ) {
            changed = true
            break
          }
        }
      }

      if (changed) {
        set({ messages: newMessages, isLoadingMessages: false })
      } else {
        set({ isLoadingMessages: false })
      }
    } catch (err) {
      console.error('Failed to load messages for room', roomId, err)
      set({ isLoadingMessages: false })
    }
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

  createGroupChat: async (name, userIds, options) => {
    const client = getMatrixClient()
    if (!client) throw new Error('Not connected')

    const roomOptions: Record<string, unknown> = {
      name,
      invite: userIds,
      preset: options?.isPublic ? 'public_chat' as sdk.Preset : 'private_chat' as sdk.Preset,
    }

    if (options?.isPublic) {
      roomOptions.visibility = 'public'
    }

    if (options?.topic) {
      roomOptions.topic = options.topic
    }

    if (options?.encrypted !== false) {
      roomOptions.initial_state = [
        {
          type: 'm.room.encryption',
          state_key: '',
          content: { algorithm: 'm.megolm.v1.aes-sha2' },
        },
      ]
    }

    const result = await client.createRoom(roomOptions)

    return result.room_id
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  markAsRead: async (roomId) => {
    // Immediately clear the unread count in local state
    const state = get()
    const updateRoom = (r: MatrixRoom) =>
      r.roomId === roomId ? { ...r, unreadCount: 0 } : r
    set({
      rooms: state.rooms.map(updateRoom),
      activeRoom: state.activeRoom?.roomId === roomId
        ? { ...state.activeRoom, unreadCount: 0 }
        : state.activeRoom,
    })

    const client = getMatrixClient()
    if (!client) return

    const room = client.getRoom(roomId)
    if (!room) return

    const events = room.getLiveTimeline().getEvents()
    // Find the last event with a real server-assigned ID (skip local echoes starting with ~)
    const lastEvent = events.findLast(e => {
      const id = e.getId()
      return id && !id.startsWith('~')
    })
    if (lastEvent) {
      try {
        await client.sendReadReceipt(lastEvent)
      } catch {
        // Read receipt may fail for some events, ignore
      }
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

  archiveRoom: async (roomId) => {
    const client = getMatrixClient()
    if (!client) return
    await client.setRoomTag(roomId, 'm.lowpriority', { order: 0.5 })
    get().loadRooms()
  },

  unarchiveRoom: async (roomId) => {
    const client = getMatrixClient()
    if (!client) return
    await client.deleteRoomTag(roomId, 'm.lowpriority')
    get().loadRooms()
  },

  uploadFile: async (roomId, file) => {
    const client = getMatrixClient()
    if (!client) return

    // Validate file size (100MB max)
    const MAX_FILE_SIZE = 100 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File too large. Maximum size is 100MB.')
    }

    // Upload file to Matrix content repository
    const uploadResponse = await client.uploadContent(file, {
      name: file.name,
      type: file.type,
    })
    const mxcUrl = uploadResponse.content_uri

    // Determine message type based on file MIME type
    let msgtype = 'm.file'
    if (file.type.startsWith('image/')) msgtype = 'm.image'
    else if (file.type.startsWith('video/')) msgtype = 'm.video'
    else if (file.type.startsWith('audio/')) msgtype = 'm.audio'

    const content: Record<string, unknown> = {
      msgtype,
      body: file.name,
      url: mxcUrl,
      info: {
        mimetype: file.type,
        size: file.size,
      },
    }

    // Mark voice messages with MSC3245 voice flag for bridge compatibility
    if (msgtype === 'm.audio' && file.name.startsWith('voice-message-')) {
      content['org.matrix.msc3245.voice'] = {}
    }

    // For images, try to get dimensions
    if (msgtype === 'm.image') {
      try {
        const dimensions = await getImageDimensions(file)
        ;(content.info as Record<string, unknown>).w = dimensions.width
        ;(content.info as Record<string, unknown>).h = dimensions.height
      } catch { /* ignore */ }
    }

    await (client as any).sendEvent(roomId, 'm.room.message', content)
  },

  leaveRoom: async (roomId) => {
    const client = getMatrixClient()
    if (!client) return

    // If this is the active room, clear it first
    if (get().activeRoom?.roomId === roomId) {
      set({ activeRoom: null, messages: [] })
    }

    await client.leave(roomId)
    // Optionally forget (removes from room list permanently)
    try {
      await client.forget(roomId)
    } catch {
      // forget may fail if server doesn't support it
    }
    get().loadRooms()
  },

  setRoomName: async (roomId: string, name: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      await client.setRoomName(roomId, name)
      get().loadRooms()
      get().refreshRoom(roomId)
    } catch (err) {
      console.error('Failed to set room name:', err)
      throw err
    }
  },

  setRoomTopic: async (roomId: string, topic: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      await client.setRoomTopic(roomId, topic)
      get().loadRooms()
      get().refreshRoom(roomId)
    } catch (err) {
      console.error('Failed to set room topic:', err)
      throw err
    }
  },

  inviteMember: async (roomId: string, userId: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      await client.invite(roomId, userId)
      get().loadRooms()
      get().refreshRoom(roomId)
    } catch (err) {
      console.error('Failed to invite member:', err)
      throw err
    }
  },

  acceptInvite: async (roomId: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      await client.joinRoom(roomId)
      get().loadRooms()
    } catch (err) {
      console.error('Failed to accept invite:', err)
      throw err
    }
  },

  rejectInvite: async (roomId: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      await client.leave(roomId)
      get().loadRooms()
    } catch (err) {
      console.error('Failed to reject invite:', err)
      throw err
    }
  },

  setDisplayName: async (name: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      await client.setDisplayName(name)
    } catch (err) {
      console.error('Failed to set display name:', err)
      throw err
    }
  },

  joinRoom: async (roomIdOrAlias: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      await client.joinRoom(roomIdOrAlias)
      get().loadRooms()
    } catch (err) {
      console.error('Failed to join room:', err)
      throw err
    }
  },

  pinMessage: async (roomId: string, eventId: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      const room = client.getRoom(roomId)
      if (!room) return
      const pinEvent = room.currentState.getStateEvents('m.room.pinned_events', '')
      const currentPinned: string[] = pinEvent?.getContent()?.pinned || []
      if (currentPinned.includes(eventId)) return
      await (client as any).sendStateEvent(roomId, 'm.room.pinned_events', { pinned: [...currentPinned, eventId] }, '')
    } catch (err) {
      console.error('Failed to pin message:', err)
      throw err
    }
  },

  unpinMessage: async (roomId: string, eventId: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      const room = client.getRoom(roomId)
      if (!room) return
      const pinEvent = room.currentState.getStateEvents('m.room.pinned_events', '')
      const currentPinned: string[] = pinEvent?.getContent()?.pinned || []
      const updated = currentPinned.filter((id: string) => id !== eventId)
      await (client as any).sendStateEvent(roomId, 'm.room.pinned_events', { pinned: updated }, '')
    } catch (err) {
      console.error('Failed to unpin message:', err)
      throw err
    }
  },

  searchMessages: async (query: string) => {
    const client = getMatrixClient()
    if (!client) return []

    try {
      const response = await (client as any).searchRoomEvents({ term: query })
      return (response?.results || []).map((r: any) => ({
        roomId: r.result?.room_id || '',
        roomName: client.getRoom(r.result?.room_id)?.name || r.result?.room_id,
        eventId: r.result?.event_id || '',
        sender: r.result?.sender || '',
        body: r.result?.content?.body || '',
        timestamp: r.result?.origin_server_ts || 0,
      })).slice(0, 20)
    } catch (err) {
      console.error('Search failed:', err)
      return []
    }
  },

  forwardMessage: async (fromRoomId: string, eventId: string, toRoomId: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      const room = client.getRoom(fromRoomId)
      if (!room) return
      const event = room.findEventById(eventId)
      if (!event) return

      const clearContent = (event as any).getClearContent?.()
      const content = clearContent || event.getContent()
      const msgtype = content.msgtype || 'm.text'

      if (msgtype === 'm.image' || msgtype === 'm.video' || msgtype === 'm.audio' || msgtype === 'm.file') {
        await (client as any).sendEvent(toRoomId, 'm.room.message', {
          msgtype,
          body: content.body || '',
          url: content.url,
          info: content.info || {},
        })
      } else {
        const forwardContent: Record<string, unknown> = {
          msgtype: 'm.text',
          body: content.body || '',
        }
        if (content.formatted_body) {
          forwardContent.format = 'org.matrix.custom.html'
          forwardContent.formatted_body = content.formatted_body
        }
        await (client as any).sendEvent(toRoomId, 'm.room.message', forwardContent)
      }
    } catch (err) {
      console.error('Failed to forward message:', err)
      throw err
    }
  },
}))

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// Need to import sdk for Preset type
import * as sdk from 'matrix-js-sdk'
