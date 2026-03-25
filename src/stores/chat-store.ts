import { create } from 'zustand'
import { getMatrixClient, getAvatarUrl, getUserId } from '@/lib/matrix/client'
import type { Room, MatrixEvent, RoomMember } from 'matrix-js-sdk'
import { EventStatus } from 'matrix-js-sdk/lib/models/event-status'

// Cache for profile avatars fetched via getProfileInfo(). Keyed by userId → MXC URL.
// Consulted by roomToMatrixRoom so avatars survive room list rebuilds without re-fetching.
// Empty string means "fetched but no avatar" (negative cache to avoid repeated lookups).
const profileAvatarCache = new Map<string, string>()

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
  mediaInfo: { w?: number; h?: number; mimetype?: string; size?: number; duration?: number } | null
  encryptedFile: { url: string; key: { k: string; alg: string; key_ops: string[]; kty: string; ext: boolean }; iv: string; hashes: Record<string, string>; v: string } | null
  msgtype: string
  readBy: ReadReceipt[]
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  isStateEvent?: boolean
  /** Temporary local ID used for optimistic messages before server confirmation */
  localId?: string
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
  sendMessage: (roomId: string, content: string, replyToEventId?: string) => void
  retryMessage: (localId: string) => void
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
  enableEncryption: (roomId: string) => Promise<void>
  pinMessage: (roomId: string, eventId: string) => Promise<void>
  unpinMessage: (roomId: string, eventId: string) => Promise<void>
  forwardMessage: (fromRoomId: string, eventId: string, toRoomId: string) => Promise<void>
  searchMessages: (query: string) => Promise<{roomId: string, roomName: string, eventId: string, sender: string, body: string, timestamp: number}[]>
  /** Clear all state on logout to prevent cross-session data leakage */
  resetState: () => void
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
    if (lastContent.msgtype === 'm.bad.encrypted') lastMessage = '🔒 Encrypted message'
    else if (lastContent.msgtype === 'm.image') lastMessage = '📷 Image'
    else if (lastContent.msgtype === 'm.video') lastMessage = '🎬 Video'
    else if (lastContent.msgtype === 'm.audio') lastMessage = '🎤 Audio'
    else if (lastContent.msgtype === 'm.file') lastMessage = '📎 File'
    else if (lastContent.body) {
      // Strip Matrix reply fallback (lines starting with "> " and trailing newline)
      lastMessage = lastContent.body.replace(/^(>.*\n?)+\n?/, '').trim() || lastContent.body
    }
    else if (lastContent.algorithm) lastMessage = '🔒 Encrypted message'
    else lastMessage = null
  }

  const joinedMembers = room.getJoinedMembers()
  const members = joinedMembers.map((m: RoomMember) => ({
    userId: m.userId,
    displayName: m.name || m.userId,
    // Prefer profile cache (has real avatar) over room member avatar (may be bridge default like Signal logo)
    // Empty string in cache means "no avatar" (negative cache) — skip it
    avatarUrl: getAvatarUrl(profileAvatarCache.get(m.userId) || m.getMxcAvatarUrl() || null),
    membership: m.membership || 'join',
    presence: (client?.getUser(m.userId)?.presence as 'online' | 'offline' | 'unavailable') || null,
  }))

  // With lazy-loaded members, the bridged user may not appear in getJoinedMembers().
  // Include the avatar fallback member (from room summary heroes) so the sidebar
  // can resolve presence and avatar for Signal-bridged DM rooms.
  const fallbackMember = room.getAvatarFallbackMember()
  if (fallbackMember && !joinedMembers.some((m: RoomMember) => m.userId === fallbackMember.userId)) {
    members.push({
      userId: fallbackMember.userId,
      displayName: fallbackMember.name || fallbackMember.userId,
      avatarUrl: getAvatarUrl(profileAvatarCache.get(fallbackMember.userId) || fallbackMember.getMxcAvatarUrl()),
      membership: fallbackMember.membership || 'join',
      presence: (client?.getUser(fallbackMember.userId)?.presence as 'online' | 'offline' | 'unavailable') || null,
    })
  }

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

  // For DM rooms (or small rooms), prefer the other member's profile avatar
  // over the room avatar. Bridges like mautrix-signal set the Signal logo as
  // the room avatar — the real face is in the user's global profile.
  // Threshold is ≤3 to cover bridge DMs that include an appservice bot.
  let roomAvatarMxc = room.getMxcAvatarUrl()
  const joinedCount = room.getJoinedMembers().length
  const summaryCount = room.currentState?.getJoinedMemberCount?.() || joinedCount
  const isBridgedRoom = members.some(m => /^@(signal_|telegram_|whatsapp_|slack_|discord_|instagram_)/.test(m.userId))
  const isSmallRoom = (joinedCount <= 3 || summaryCount <= 3) && (joinedCount > 0 || summaryCount > 0)
  if (client && (isDirect || isSmallRoom || isBridgedRoom)) {
    const otherMembers = room.getJoinedMembers().filter((m: RoomMember) => m.userId !== client.getUserId())
    // Prefer the member that has an avatar (puppet > bot)
    const otherMember = otherMembers.find((m: RoomMember) => {
      return profileAvatarCache.get(m.userId) || m.getMxcAvatarUrl()
    }) || otherMembers[0]
    // Prefer profile cache (real avatar) over room member avatar (may be bridge default like Signal logo)
    const memberAvatar = (otherMember ? profileAvatarCache.get(otherMember.userId) : undefined) || otherMember?.getMxcAvatarUrl()
    if (memberAvatar) {
      roomAvatarMxc = memberAvatar
    } else {
      // With lazy-loaded members, getJoinedMembers() may not include the
      // bridged user yet. getAvatarFallbackMember() uses room summary heroes
      // which are available even before full member loading completes.
      const fallbackMember = room.getAvatarFallbackMember()
      const fallbackAvatar = (fallbackMember ? profileAvatarCache.get(fallbackMember.userId) : undefined) || fallbackMember?.getMxcAvatarUrl()
      if (fallbackAvatar) {
        roomAvatarMxc = fallbackAvatar
      }
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

  // Handle state events as system messages
  const isStateEvent = effectiveType === 'm.room.encryption' || effectiveType === 'm.room.member' || effectiveType === 'm.room.name' || effectiveType === 'm.room.topic'
  if (isStateEvent) {
    const sender = event.getSender()!
    const member = room.getMember(sender)
    const senderName = cleanDisplayName(member?.name || sender)
    let stateContent = ''

    if (effectiveType === 'm.room.encryption') {
      stateContent = `${senderName} enabled end-to-end encryption`
    } else if (effectiveType === 'm.room.member') {
      const membership = event.getContent()?.membership
      const prevMembership = event.getPrevContent?.()?.membership
      const targetName = cleanDisplayName(event.getContent()?.displayname || event.getStateKey?.() || sender)
      if (membership === 'join' && prevMembership === 'invite') {
        stateContent = `${targetName} joined the room`
      } else if (membership === 'join' && prevMembership === 'join') {
        stateContent = `${targetName} updated their profile`
      } else if (membership === 'join') {
        stateContent = `${targetName} joined the room`
      } else if (membership === 'invite') {
        stateContent = `${senderName} invited ${targetName}`
      } else if (membership === 'leave') {
        if (event.getStateKey?.() === sender) {
          stateContent = `${targetName} left the room`
        } else {
          stateContent = `${senderName} removed ${targetName}`
        }
      } else if (membership === 'ban') {
        stateContent = `${senderName} banned ${targetName}`
      } else {
        stateContent = `${targetName} membership changed to ${membership}`
      }
    } else if (effectiveType === 'm.room.name') {
      const newName = event.getContent()?.name
      stateContent = newName ? `${senderName} changed the room name to "${newName}"` : `${senderName} removed the room name`
    } else if (effectiveType === 'm.room.topic') {
      const newTopic = event.getContent()?.topic
      stateContent = newTopic ? `${senderName} changed the topic to "${newTopic}"` : `${senderName} removed the topic`
    }

    return {
      eventId: event.getId()!,
      roomId: room.roomId,
      senderId: sender,
      senderName,
      senderAvatar: getAvatarUrl((member ? profileAvatarCache.get(member.userId) : undefined) || member?.getMxcAvatarUrl()),
      type: 'm.text',
      msgtype: 'm.text',
      content: stateContent,
      formattedContent: null,
      timestamp: event.getTs(),
      isEdited: false,
      isRedacted: false,
      replyToEvent: null,
      reactions: new Map(),
      mediaUrl: null,
      mediaInfo: null,
      encryptedFile: null,
      readBy: [],
      status: 'sent',
      isStateEvent: true,
    }
  }

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
  // content will have {algorithm, ciphertext, ...} instead of {body, msgtype, ...}.
  // The SDK also uses msgtype "m.bad.encrypted" for events it failed to decrypt
  // (e.g. "missing field algorithm" from the Rust crypto module).
  const isUndecrypted = isEncrypted && (!content.msgtype || content.msgtype === 'm.bad.encrypted')

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
      let replyBody = replyContent?.body || ''
      // Strip Matrix reply fallback (> <@user:server> prefix lines)
      if (replyBody.startsWith('> ')) {
        const lines = replyBody.split('\n')
        const firstNonQuote = lines.findIndex((l: string) => !l.startsWith('> ') && l !== '')
        if (firstNonQuote > 0) {
          replyBody = lines.slice(firstNonQuote).join('\n').trim()
        }
      }
      replyToEvent = {
        eventId: replyEvt.getId()!,
        senderId: replySender,
        senderName: cleanDisplayName(replyMember?.name || replySender),
        content: replyBody,
      }
    }
  }

  // Collect reactions from pre-built index (O(1) per message)
  const reactions = new Map<string, { count: number; users: string[]; includesMe: boolean }>()
  const reactionIndex = (room as any).__reactionIndex as Map<string, Map<string, { count: number; users: string[]; includesMe: boolean }>> | undefined
  if (reactionIndex) {
    const msgReactions = reactionIndex.get(event.getId()!)
    if (msgReactions) {
      for (const [emoji, data] of msgReactions) {
        reactions.set(emoji, { ...data, users: [...data.users] })
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
        avatarUrl: getAvatarUrl((receiptMember ? profileAvatarCache.get(receiptMember.userId) : undefined) || receiptMember?.getMxcAvatarUrl()),
        ts: receipt.data?.ts || 0,
      })
    }
  }

  // Message status for own messages
  let status: MatrixMessage['status'] = 'sent'
  if (sender === userId) {
    const evtStatus = (event as any).status as EventStatus | null
    if (evtStatus === EventStatus.NOT_SENT) {
      status = 'failed'
    } else if (readBy.length > 0) {
      status = 'read'
    } else if (evtStatus === EventStatus.QUEUED || evtStatus === EventStatus.SENDING || evtStatus === EventStatus.ENCRYPTING) {
      status = 'sending'
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
    senderAvatar: getAvatarUrl((member ? profileAvatarCache.get(member.userId) : undefined) || member?.getMxcAvatarUrl()),
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

    const allJoinedRooms = allRooms
      .filter(r => r.getMyMembership() === 'join')
      .map(roomToMatrixRoom)
      .sort((a, b) => b.lastMessageTs - a.lastMessageTs)

    // Deduplicate bridged DM rooms: when a bridge (e.g. Signal) creates two rooms
    // for the same contact (one portal with phone number, one DM with messages),
    // hide the empty duplicate. Detect by finding rooms that share a bridge puppet
    // user and have no real messages.
    const bridgeUserToRooms = new Map<string, typeof allJoinedRooms>()
    for (const room of allJoinedRooms) {
      if (!room.isDirect || !room.isBridged) continue
      for (const m of room.members) {
        if (/^@(signal_|telegram_|whatsapp_|slack_|discord_|instagram_)/.test(m.userId)) {
          const existing = bridgeUserToRooms.get(m.userId) || []
          existing.push(room)
          bridgeUserToRooms.set(m.userId, existing)
        }
      }
    }

    const duplicateRoomIds = new Set<string>()
    for (const [, roomGroup] of bridgeUserToRooms) {
      if (roomGroup.length <= 1) continue
      // Keep the room with the most recent real message, hide the others that have no messages
      const withMessages = roomGroup.filter(r => r.lastMessage !== null && r.lastMessage !== '🔒 Encrypted message')
      const empty = roomGroup.filter(r => r.lastMessage === null || r.lastMessage === '🔒 Encrypted message')
      if (withMessages.length > 0) {
        for (const r of empty) duplicateRoomIds.add(r.roomId)
      }
    }

    const rooms = allJoinedRooms.filter(r => !duplicateRoomIds.has(r.roomId))

    // Auto-archive rooms inactive for more than 1 hour
    const ONE_HOUR = 60 * 60 * 1000
    const now = Date.now()
    for (const room of rooms) {
      if (!room.isArchived && room.lastMessageTs > 0 && (now - room.lastMessageTs) > ONE_HOUR) {
        client.setRoomTag(room.roomId, 'm.lowpriority', { order: 0.5 }).catch(() => {})
        room.isArchived = true
      }
    }

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

    // With lazyLoadMembers, room member state events (including avatars) aren't
    // loaded until the room's timeline is viewed. For DM rooms, proactively load
    // members so the bridge puppet's actual avatar becomes available (the room-level
    // avatar is often a generic bridge placeholder like Signal's default silhouette).
    const joinedRooms = allRooms.filter(r => r.getMyMembership() === 'join')
    const roomsNeedingMembers: Room[] = []
    for (const sdkRoom of joinedRooms) {
      const matrixRoom = rooms.find(r => r.roomId === sdkRoom.roomId)
      // Load members for DM rooms, or any small room without an avatar
      // (after bridge delete-all-portals, m.direct may not be repopulated
      // so we can't rely solely on isDirect).
      const summaryMemberCount = sdkRoom.currentState?.getJoinedMemberCount?.() || sdkRoom.getJoinedMembers().length
      // Always resolve avatars for DMs, small rooms, and bridged rooms — the
      // existing avatar may be a bridge default while the real face is in the profile.
      // Threshold is ≤3 to cover bridge DMs that include an appservice bot.
      const needsAvatar = matrixRoom?.isDirect
        || matrixRoom?.isBridged
        || (sdkRoom.getJoinedMembers().length <= 3 || summaryMemberCount <= 3)
      if (needsAvatar) {
        const otherMember = sdkRoom.getJoinedMembers().find((m: RoomMember) => m.userId !== client!.getUserId())
        // Load members if the other member isn't resolved yet, or if we haven't
        // fetched their profile yet. Skip if profile was already fetched (even with
        // negative result — empty string sentinel).
        if (!otherMember || !profileAvatarCache.has(otherMember.userId)) {
          roomsNeedingMembers.push(sdkRoom)
        }
      }
    }
    if (roomsNeedingMembers.length > 0) {
      Promise.allSettled(
        roomsNeedingMembers.map(r => r.loadMembersIfNeeded())
      ).then(async () => {
        // Always rebuild — loadMembersIfNeeded() returns false if members
        // were already loaded by a previous call (e.g. opening a chat), but
        // the room list may have been built before that load completed.
        let updatedRooms = allRooms
          .filter(r => r.getMyMembership() === 'join')
          .map(roomToMatrixRoom)
          .sort((a, b) => b.lastMessageTs - a.lastMessageTs)
        set((state) => ({
          rooms: updatedRooms,
          activeRoom: state.activeRoom
            ? updatedRooms.find(r => r.roomId === state.activeRoom!.roomId) || state.activeRoom
            : null,
        }))

        // Fetch the global profile for each DM partner. The room member avatar
        // may be a bridge default (e.g. Signal logo) while the user's actual
        // profile has their real face. Always fetch to get the best avatar.
        const profileFetches: Promise<void>[] = []
        for (const sdkRoom of roomsNeedingMembers) {
          const otherMembers = sdkRoom.getJoinedMembers().filter((m: RoomMember) => m.userId !== client!.getUserId())
          // Prefer member with avatar (puppet > bot), then fallback hero
          const otherMember = otherMembers.find((m: RoomMember) => m.getMxcAvatarUrl()) || otherMembers[0]
            || sdkRoom.getAvatarFallbackMember()
          if (!otherMember) continue

          profileFetches.push(
            client!.getProfileInfo(otherMember.userId).then((profile) => {
              if (profile.avatar_url) {
                profileAvatarCache.set(otherMember.userId, profile.avatar_url)
              } else {
                // Negative cache: remember that this user has no avatar
                profileAvatarCache.set(otherMember.userId, '')
              }
            }).catch(() => {
              // Profile fetch failed — cache negative result to avoid repeated lookups
              profileAvatarCache.set(otherMember.userId, '')
            })
          )
        }

        if (profileFetches.length > 0) {
          await Promise.allSettled(profileFetches)
          // Apply profile cache to CURRENT store state (not stale local variable)
          // to avoid race conditions with concurrent loadRooms() calls
          set((state) => {
            const myUserId = getUserId()
            const updated = state.rooms.map(room => {
              let hasUpdate = false
              const updatedMembers = room.members.map(m => {
                const cached = profileAvatarCache.get(m.userId)
                if (cached && m.avatarUrl !== getAvatarUrl(cached)) {
                  hasUpdate = true
                  return { ...m, avatarUrl: getAvatarUrl(cached) }
                }
                return m
              })
              let roomAvatar = room.avatarUrl
              if ((room.isDirect || room.isBridged || room.members.length <= 3) && !roomAvatar) {
                const others = updatedMembers.filter(m => m.userId !== myUserId)
                const other = others.find(m => m.avatarUrl) || others[0]
                if (other?.avatarUrl) {
                  roomAvatar = other.avatarUrl
                  hasUpdate = true
                }
              }
              return hasUpdate ? { ...room, members: updatedMembers, avatarUrl: roomAvatar } : room
            })
            return {
              rooms: updated,
              activeRoom: state.activeRoom
                ? updated.find(r => r.roomId === state.activeRoom!.roomId) || state.activeRoom
                : null,
            }
          })
        }
      })
    }
  },

  setActiveRoom: (room) => {
    set({ activeRoom: room, messages: [], typingUsers: [] })
    if (room) {
      get().loadMessages(room.roomId)
    }
  },

  loadMessages: async (roomId) => {
    // Only show loading spinner when there are no messages yet (initial load).
    // Subsequent refreshes should NOT flash a spinner — that causes the whole
    // message list to jump.
    const hasMessages = get().messages.length > 0 && get().activeRoom?.roomId === roomId
    if (!hasMessages) {
      set({ isLoadingMessages: true })
    }
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

      const timeline = [...room.getLiveTimeline().getEvents(), ...room.getPendingEvents()]

      // Build reaction index once: Map<targetEventId, Map<emoji, summary>>
      // This avoids O(messages × timeline) scanning inside eventToMatrixMessage.
      const reactionIndex = new Map<string, Map<string, { count: number; users: string[]; includesMe: boolean }>>()
      const userId = getUserId()
      for (const e of timeline) {
        if (e.getType() !== 'm.reaction') continue
        const rel = e.getContent()['m.relates_to']
        if (!rel?.event_id || !rel?.key) continue
        let msgReactions = reactionIndex.get(rel.event_id)
        if (!msgReactions) {
          msgReactions = new Map()
          reactionIndex.set(rel.event_id, msgReactions)
        }
        const emoji = rel.key
        const existing = msgReactions.get(emoji) || { count: 0, users: [], includesMe: false }
        existing.count++
        const senderName = room.getMember(e.getSender()!)?.name || e.getSender()!
        existing.users.push(senderName)
        if (e.getSender() === userId) existing.includesMe = true
        msgReactions.set(emoji, existing)
      }
      // Attach index to room object for eventToMatrixMessage to read
      ;(room as any).__reactionIndex = reactionIndex

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

      // Propagate read status backwards: if a later own message is 'read',
      // all earlier own messages should also be 'read' (read receipts in Matrix
      // are implicit acknowledgement of all prior messages).
      let sawRead = false
      for (let i = newMessages.length - 1; i >= 0; i--) {
        const msg = newMessages[i]
        if (msg.senderId !== userId) continue
        if (msg.status === 'read') {
          sawRead = true
        } else if (sawRead && (msg.status === 'delivered' || msg.status === 'sent')) {
          msg.status = 'read'
        }
      }

      // Preserve optimistic messages (sending/failed) that haven't been confirmed
      // by the server sync yet. These have a localId and won't appear in the timeline.
      const existing = get().messages
      const serverEventIds = new Set(newMessages.map(m => m.eventId))
      // Detect when the sync has delivered the same message that our optimistic
      // entry represents (race between sendEvent response and sync echo).
      const myId = getUserId()
      const recentServerMsgs = newMessages.filter(m => m.senderId === myId && Date.now() - m.timestamp < 30000)
      const pendingOptimistic = existing.filter(m => {
        if (!m.localId || (m.status !== 'sending' && m.status !== 'failed')) return false
        if (serverEventIds.has(m.eventId)) return false
        // Check if server already has this message (same sender, content, within 30s)
        if (m.status === 'sending' && recentServerMsgs.some(s => s.content === m.content && Math.abs(s.timestamp - m.timestamp) < 30000)) return false
        return true
      })
      // Append pending optimistic messages at the end (they are the most recent)
      const mergedMessages = pendingOptimistic.length > 0
        ? [...newMessages, ...pendingOptimistic]
        : newMessages

      // Quick equality check: skip setState if messages haven't actually changed.
      // Compare by length, then key fields of each message to avoid unnecessary re-renders.
      let changed = existing.length !== mergedMessages.length
      if (!changed) {
        for (let i = 0; i < mergedMessages.length; i++) {
          const a = existing[i]
          const b = mergedMessages[i]
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
        set({ messages: mergedMessages, isLoadingMessages: false })
      } else {
        set({ isLoadingMessages: false })
      }

      // Rebuild room data from SDK now that timeline loading has resolved
      // member state. With lazy-loaded members, the room list is often built
      // before member data (including avatars) is available.
      const updatedRoom = roomToMatrixRoom(room)
      const currentRooms = get().rooms
      const roomIdx = currentRooms.findIndex(r => r.roomId === roomId)
      if (roomIdx !== -1) {
        const currentRoom = currentRooms[roomIdx]
        // Preserve fields that roomToMatrixRoom doesn't track
        const mergedRoom = {
          ...updatedRoom,
          isArchived: currentRoom.isArchived,
        }
        if (
          mergedRoom.avatarUrl !== currentRoom.avatarUrl ||
          mergedRoom.members.length !== currentRoom.members.length ||
          mergedRoom.members.some((m, i) => m.avatarUrl !== currentRoom.members[i]?.avatarUrl)
        ) {
          const updated = [...currentRooms]
          updated[roomIdx] = mergedRoom
          set((state) => ({
            rooms: updated,
            activeRoom: state.activeRoom?.roomId === roomId ? mergedRoom : state.activeRoom,
          }))
        }
      }
    } catch (err) {
      console.error('Failed to load messages for room', roomId, err)
      set({ isLoadingMessages: false })
    }
  },

  sendMessage: (roomId, content, replyToEventId) => {
    const client = getMatrixClient()
    if (!client) return

    const userId = getUserId()
    if (!userId) return

    // Build the message content for the Matrix API
    const msgContent: Record<string, unknown> = {
      msgtype: 'm.text',
      body: content,
    }

    // Build reply-to event info for the optimistic message
    let replyToEvent: MatrixMessage['replyToEvent'] = null
    if (replyToEventId) {
      const room = client.getRoom(roomId)
      const replyEvt = room?.findEventById(replyToEventId)
      if (replyEvt) {
        const replyBody = replyEvt.getContent().body || ''
        const replySender = replyEvt.getSender()
        const replyMember = room?.getMember(replySender!)
        msgContent.body = `> <${replySender}> ${replyBody}\n\n${content}`
        msgContent.format = 'org.matrix.custom.html'
        const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        msgContent.formatted_body = `<mx-reply><blockquote><a href="https://matrix.to/#/${encodeURIComponent(roomId)}/${encodeURIComponent(replyToEventId)}">In reply to</a> <a href="https://matrix.to/#/${encodeURIComponent(replySender || '')}">${escHtml(replySender || '')}</a><br>${escHtml(replyBody)}</blockquote></mx-reply>${escHtml(content)}`
        msgContent['m.relates_to'] = {
          'm.in_reply_to': { event_id: replyToEventId },
        }
        replyToEvent = {
          eventId: replyEvt.getId()!,
          senderId: replySender!,
          senderName: cleanDisplayName(replyMember?.name || replySender!),
          content: replyBody,
        }
      }
    }

    // Create optimistic local message with a temporary ID
    const localId = `~local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const room = client.getRoom(roomId)
    const member = room?.getMember(userId)
    const optimisticMessage: MatrixMessage = {
      eventId: localId,
      roomId,
      senderId: userId,
      senderName: cleanDisplayName(member?.name || userId),
      senderAvatar: getAvatarUrl((member ? profileAvatarCache.get(member.userId) : undefined) || member?.getMxcAvatarUrl()),
      type: 'm.text',
      msgtype: 'm.text',
      content,
      formattedContent: null,
      timestamp: Date.now(),
      isEdited: false,
      isRedacted: false,
      replyToEvent,
      reactions: new Map(),
      mediaUrl: null,
      mediaInfo: null,
      encryptedFile: null,
      readBy: [],
      status: 'sending',
      localId,
    }

    // Add optimistic message to the list immediately
    const currentMessages = get().messages
    set({ messages: [...currentMessages, optimisticMessage] })

    // Send to server in the background
    ;(async () => {
      try {
        const result = await (client as any).sendEvent(roomId, 'm.room.message', msgContent)
        // Replace the optimistic message with the confirmed event ID and 'sent' status.
        // The sync loop will eventually deliver the real event via loadMessages,
        // which will replace this by eventId match since we update it here.
        const realEventId = result?.event_id
        if (realEventId) {
          const msgs = get().messages.map(m =>
            m.localId === localId
              ? { ...m, eventId: realEventId, status: 'sent' as const, localId: undefined }
              : m
          )
          set({ messages: msgs })
        }
      } catch (err) {
        console.error('Failed to send message:', err)
        // Mark as failed so the user can retry
        const msgs = get().messages.map(m =>
          m.localId === localId ? { ...m, status: 'failed' as const } : m
        )
        set({ messages: msgs })
      }
    })()
  },

  retryMessage: (localId) => {
    const messages = get().messages
    const failedMsg = messages.find(m => m.localId === localId && m.status === 'failed')
    if (!failedMsg) return

    // Remove the failed message from the list
    set({ messages: messages.filter(m => m.localId !== localId) })

    // Re-send using the original content
    get().sendMessage(failedMsg.roomId, failedMsg.content, failedMsg.replyToEvent?.eventId)
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

    const userId = getUserId()
    const room = client.getRoom(roomId)
    if (!room) return

    // Use the pre-built reaction index if available to find existing reaction
    // in O(1), falling back to timeline scan only if needed.
    let existingEventId: string | null = null
    const reactionIndex = (room as any).__reactionIndex as Map<string, Map<string, { count: number; users: string[]; includesMe: boolean }>> | undefined
    if (reactionIndex) {
      const msgReactions = reactionIndex.get(eventId)
      if (msgReactions?.get(emoji)?.includesMe) {
        // Find the actual event ID to redact — need to scan only reaction events
        const events = room.getLiveTimeline().getEvents()
        for (const e of events) {
          if (
            e.getType() === 'm.reaction' &&
            e.getSender() === userId &&
            e.getContent()['m.relates_to']?.event_id === eventId &&
            e.getContent()['m.relates_to']?.key === emoji
          ) {
            existingEventId = e.getId()!
            break
          }
        }
      }
    } else {
      // Fallback: scan timeline
      const events = room.getLiveTimeline().getEvents()
      const existing = events.find(
        (e) =>
          e.getType() === 'm.reaction' &&
          e.getSender() === userId &&
          e.getContent()['m.relates_to']?.event_id === eventId &&
          e.getContent()['m.relates_to']?.key === emoji
      )
      if (existing) existingEventId = existing.getId()!
    }

    if (existingEventId) {
      await client.redactEvent(roomId, existingEventId)
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

    set((state) => {
      const oldRoom = state.rooms.find(r => r.roomId === roomId)
      let updatedRooms = state.rooms.map((r) =>
        r.roomId === roomId ? updatedRoom : r
      )
      // Only re-sort if the timestamp actually changed (new message arrived)
      if (oldRoom && updatedRoom.lastMessageTs !== oldRoom.lastMessageTs) {
        updatedRooms = updatedRooms.sort((a, b) => b.lastMessageTs - a.lastMessageTs)
      }
      return {
        rooms: updatedRooms,
        activeRoom: state.activeRoom?.roomId === roomId ? updatedRoom : state.activeRoom,
      }
    })

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

    // Validate file type — block dangerous MIME types and extensions
    const BLOCKED_MIMES = ['text/html', 'application/xhtml+xml', 'application/x-httpd-php', 'application/javascript', 'text/javascript']
    const BLOCKED_EXTENSIONS = ['.html', '.htm', '.xhtml', '.php', '.js', '.mjs', '.exe', '.bat', '.cmd', '.msi', '.ps1', '.sh']
    const ext = ('.' + (file.name.split('.').pop() || '')).toLowerCase()
    if (BLOCKED_MIMES.includes(file.type)) {
      throw new Error(`File type "${file.type}" is not allowed for security reasons.`)
    }
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      throw new Error(`File extension "${ext}" is not allowed for security reasons.`)
    }
    // Strip SVG files that may contain embedded scripts
    if (file.type === 'image/svg+xml' || ext === '.svg') {
      throw new Error('SVG files are not allowed — they can contain executable code.')
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

  enableEncryption: async (roomId: string) => {
    const client = getMatrixClient()
    if (!client) return

    try {
      await (client as any).sendStateEvent(roomId, 'm.room.encryption', {
        algorithm: 'm.megolm.v1.aes-sha2',
      }, '')
      get().loadRooms()
      get().refreshRoom(roomId)
    } catch (err) {
      console.error('Failed to enable encryption:', err)
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

  resetState: () => {
    profileAvatarCache.clear()
    set({
      rooms: [],
      pendingInvites: [],
      activeRoom: null,
      messages: [],
      isLoadingMessages: false,
      typingUsers: [],
      searchQuery: '',
    })
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
