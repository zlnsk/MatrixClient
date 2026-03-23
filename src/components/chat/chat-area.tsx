'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore, type MatrixMessage } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import {
  ArrowLeft,
  Lock,
  Phone,
  Video,
  Search,
  Loader2,
  Hash,
  Archive,
  ArchiveRestore,
  LogOut,
  Info,
  X,
  Shield,
  Users,
  Pencil,
  UserPlus,
  Bell,
  BellOff,
  Check,
  Pin,
  Image as ImageIcon,
  FileText,
} from 'lucide-react'
import { getMatrixClient } from '@/lib/matrix/client'
import { decryptMediaAttachment, fetchAuthenticatedMedia } from '@/lib/matrix/media'
import { placeCall } from '@/lib/matrix/voip'

function MediaThumbnail({ message }: { message: MatrixMessage }) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!message.mediaUrl) return
    let cancelled = false

    async function loadMedia() {
      try {
        let url: string
        if (message.encryptedFile) {
          url = await decryptMediaAttachment(
            message.encryptedFile.url,
            message.encryptedFile,
            message.mediaInfo?.mimetype
          )
        } else {
          url = await fetchAuthenticatedMedia(message.mediaUrl!, message.mediaInfo?.mimetype)
        }
        if (!cancelled) setDecryptedUrl(url)
      } catch (err) {
        console.error('Failed to load media thumbnail:', err)
      }
    }
    loadMedia()

    return () => {
      cancelled = true
      if (decryptedUrl && decryptedUrl.startsWith('blob:')) URL.revokeObjectURL(decryptedUrl)
    }
  }, [message.eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!decryptedUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-m3-surface-container-high dark:bg-m3-surface-container-highest">
        <Loader2 className="h-4 w-4 animate-spin text-m3-outline" />
      </div>
    )
  }

  if (message.type === 'm.image') {
    return (
      <a href={decryptedUrl} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
        <img src={decryptedUrl} alt="" className="h-full w-full object-cover transition-transform hover:scale-110" />
      </a>
    )
  }

  return (
    <a href={decryptedUrl} target="_blank" rel="noopener noreferrer" className="flex h-full w-full items-center justify-center">
      <Video className="h-6 w-6 text-m3-outline" />
    </a>
  )
}

interface ChatAreaProps {
  onBackClick: () => void
}

export function ChatArea({ onBackClick }: ChatAreaProps) {
  const user = useAuthStore(s => s.user)
  const { activeRoom, messages, isLoadingMessages, sendMessage, typingUsers, archiveRoom, unarchiveRoom, setActiveRoom, leaveRoom, setRoomName, setRoomTopic, inviteMember, enableEncryption } = useChatStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [replyTo, setReplyTo] = useState<MatrixMessage | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [chatSearch, setChatSearch] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [showRoomInfo, setShowRoomInfo] = useState(false)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  // Room settings state
  const [editingName, setEditingName] = useState(false)
  const [editingTopic, setEditingTopic] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [topicInput, setTopicInput] = useState('')
  const [inviteInput, setInviteInput] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savingTopic, setSavingTopic] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [notifSetting, setNotifSetting] = useState<'all' | 'mentions' | 'mute'>('all')
  const [showPinnedBanner, setShowPinnedBanner] = useState(true)

  // Memoize pinned event IDs - only recompute when activeRoom or messages change
  const pinnedEventIds = useMemo(() => {
    if (!activeRoom) return []
    const client = getMatrixClient()
    if (!client) return []
    const room = client.getRoom(activeRoom.roomId)
    if (!room) return []
    const pinEvent = room.currentState.getStateEvents('m.room.pinned_events', '')
    return (pinEvent?.getContent()?.pinned || []) as string[]
  }, [activeRoom, messages])

  const prevRoomIdRef = useRef<string | null>(null)
  const stickyRef = useRef(true) // true = user is at the bottom, auto-scroll on changes

  const isAtBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  const scrollToBottom = useCallback((instant?: boolean) => {
    const el = scrollContainerRef.current
    if (!el) return
    if (instant) {
      el.scrollTop = el.scrollHeight
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  // Track user scroll — if they scroll up, stop auto-scrolling
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onScroll = () => { stickyRef.current = isAtBottom() }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isAtBottom])

  // On room switch: reset sticky and scroll instantly after messages render
  useEffect(() => {
    if (activeRoom && activeRoom.roomId !== prevRoomIdRef.current) {
      prevRoomIdRef.current = activeRoom.roomId
      stickyRef.current = true
    }
  }, [activeRoom])

  // Scroll when messages change (new message or room switch)
  useEffect(() => {
    if (!stickyRef.current) return
    // Use rAF to wait for DOM update, then scroll
    requestAnimationFrame(() => {
      scrollToBottom(true)
    })
  }, [messages, scrollToBottom])

  // Watch for layout shifts (images loading, media decrypting) and re-scroll if sticky
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (stickyRef.current) {
        el.scrollTop = el.scrollHeight
      }
    })
    // Observe the inner content, not the scroll container itself
    for (const child of el.children) {
      ro.observe(child)
    }
    return () => ro.disconnect()
  }, [messages]) // re-attach when messages change (DOM children change)

  // Re-scroll when mobile keyboard opens/closes (viewport resize)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => { if (stickyRef.current) scrollToBottom(true) }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [scrollToBottom])

  if (!activeRoom || !user) return null

  const otherMember = activeRoom.isDirect
    ? activeRoom.members.find(m => m.userId !== user.userId)
    : null

  const roomDisplayName = activeRoom.name
  const roomStatus = activeRoom.isDirect
    ? otherMember?.presence === 'online' ? 'online' : otherMember?.presence === 'unavailable' ? 'away' : 'offline'
    : `${activeRoom.members.length} members`

  const handleSend = async (content: string) => {
    await sendMessage(activeRoom.roomId, content, replyTo?.eventId)
    setReplyTo(null)
  }

  const handleArchiveToggle = async () => {
    if (activeRoom.isArchived) {
      await unarchiveRoom(activeRoom.roomId)
    } else {
      await archiveRoom(activeRoom.roomId)
      setActiveRoom(null)
    }
  }

  const filteredMessages = useMemo(() => {
    return chatSearch
      ? messages.filter(m => m.content.toLowerCase().includes(chatSearch.toLowerCase()))
      : messages
  }, [messages, chatSearch])

  // Memoize date-grouped messages to avoid recalculating on every render
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: MatrixMessage[] }[] = []
    let currentDate = ''
    for (const msg of filteredMessages) {
      const msgDate = new Date(msg.timestamp).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      if (msgDate !== currentDate) {
        currentDate = msgDate
        groups.push({ date: msgDate, messages: [msg] })
      } else {
        groups[groups.length - 1].messages.push(msg)
      }
    }
    return groups
  }, [filteredMessages])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const currentX = dragPos?.x ?? 0
    const currentY = dragPos?.y ?? 0
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: currentX, origY: currentY }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setDragPos({
        x: dragRef.current.origX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (ev.clientY - dragRef.current.startY),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [dragPos])

  return (
    <div className="relative flex flex-1 flex-col min-h-0 bg-m3-surface-container-low dark:bg-m3-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-m3-outline-variant bg-m3-surface-container-lowest px-4 py-3 dark:border-m3-outline-variant dark:bg-m3-surface-container">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <button
            onClick={onBackClick}
            className="flex-shrink-0 rounded-lg p-1.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface active:bg-m3-surface-container-high dark:text-m3-outline dark:hover:bg-m3-surface-container-high dark:hover:text-white dark:active:bg-m3-surface-container-highest md:hidden"
            aria-label="Back to chat list"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar
            src={activeRoom.isDirect ? otherMember?.avatarUrl : activeRoom.avatarUrl}
            name={roomDisplayName}
            size="md"
            status={activeRoom.isDirect ? (otherMember?.presence === 'online' ? 'online' : otherMember?.presence === 'unavailable' ? 'away' : 'offline') : null}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-base font-bold text-m3-on-surface dark:text-m3-on-surface md:text-lg">{roomDisplayName}</h2>
              {!activeRoom.isDirect && <Hash className="h-4 w-4 flex-shrink-0 text-m3-outline" />}
            </div>
            <div className="flex items-center gap-1.5">
              {typingUsers.length > 0 ? (
                <span className="truncate text-xs text-m3-primary dark:text-m3-primary md:text-sm">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </span>
              ) : (
                <span className="truncate text-xs text-m3-on-surface-variant md:text-sm">{roomStatus}</span>
              )}
              {activeRoom.encrypted && (
                <div className="hidden items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 dark:bg-green-900/50 sm:flex">
                  <Lock className="h-3 w-3 text-green-500 dark:text-green-400" />
                  <span className="text-xs text-green-600 dark:text-green-400">Encrypted</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowRoomInfo(!showRoomInfo)}
            className="rounded-lg p-2 text-m3-outline transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface dark:hover:bg-m3-surface-container-high dark:hover:text-white"
            title="Room info"
            aria-label="Room info"
          >
            <Info className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="hidden sm:block rounded-lg p-2 text-m3-outline transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface dark:hover:bg-m3-surface-container-high dark:hover:text-white"
            title="Search"
            aria-label="Search in conversation"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            onClick={handleArchiveToggle}
            className="hidden sm:block rounded-lg p-2 text-m3-outline transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface dark:hover:bg-m3-surface-container-high dark:hover:text-white"
            title={activeRoom.isArchived ? 'Unarchive' : 'Archive'}
            aria-label={activeRoom.isArchived ? 'Unarchive' : 'Archive'}
          >
            {activeRoom.isArchived ? (
              <ArchiveRestore className="h-5 w-5" />
            ) : (
              <Archive className="h-5 w-5" />
            )}
          </button>
          <button
            onClick={() => setConfirmLeave(true)}
            className="hidden md:block rounded-lg p-2 text-m3-outline transition-colors hover:bg-m3-error-container hover:text-m3-error dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title="Leave room"
            aria-label="Leave room"
          >
            <LogOut className="h-5 w-5" />
          </button>
          {!activeRoom.isBridged && (
            <>
              <button
                onClick={() => placeCall(activeRoom.roomId, false)}
                className="rounded-lg p-2 text-m3-outline transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface dark:hover:bg-m3-surface-container-high dark:hover:text-white"
                title="Voice call"
                aria-label="Voice call"
              >
                <Phone className="h-5 w-5" />
              </button>
              <button
                onClick={() => placeCall(activeRoom.roomId, true)}
                className="hidden sm:block rounded-lg p-2 text-m3-outline transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface dark:hover:bg-m3-surface-container-high dark:hover:text-white"
                title="Video call"
                aria-label="Video call"
              >
                <Video className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="animate-slide-in border-b border-m3-outline-variant bg-m3-surface-container-low px-4 py-2 dark:border-m3-outline-variant dark:bg-m3-surface-container/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-m3-on-surface-variant" />
            <input
              type="text"
              placeholder="Search in conversation..."
              value={chatSearch}
              onChange={e => setChatSearch(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-m3-outline-variant bg-m3-surface-container-lowest py-2 pl-10 pr-4 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
            />
          </div>
        </div>
      )}

      {/* Pinned messages banner */}
      {pinnedEventIds.length > 0 && showPinnedBanner && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-900/50 dark:bg-amber-900/20">
          <div className="flex items-center gap-2">
            <Pin className="h-4 w-4 text-amber-500 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {pinnedEventIds.length} pinned {pinnedEventIds.length === 1 ? 'message' : 'messages'}
            </span>
          </div>
          <button
            onClick={() => setShowPinnedBanner(false)}
            className="rounded-lg p-1 text-amber-500 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Leave confirmation */}
      {confirmLeave && (
        <div className="animate-slide-in border-b border-m3-error bg-m3-error-container px-4 py-3 dark:border-m3-error/50 dark:bg-m3-error-container/20">
          <p className="text-sm text-m3-on-error-container dark:text-red-300">
            Leave <strong>{activeRoom.name}</strong>? You will lose access to this room.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                await leaveRoom(activeRoom.roomId)
                setConfirmLeave(false)
              }}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-m3-error-container0"
            >
              Leave
            </button>
            <button
              onClick={() => setConfirmLeave(false)}
              className="rounded-lg bg-m3-surface-container-high px-4 py-1.5 text-sm font-medium text-m3-on-surface hover:bg-m3-outline-variant dark:bg-m3-surface-container-highest dark:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="message-scroll-container min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6 md:px-6 md:pb-8">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-m3-primary" />
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end space-y-4">
            {activeRoom.topic && (
              <div className="flex items-center justify-center py-2">
                <span className="rounded-full bg-m3-surface-container-high px-4 py-1.5 text-sm text-m3-on-surface-variant shadow-sm dark:bg-m3-surface-container-high dark:text-m3-outline">
                  {activeRoom.topic}
                </span>
              </div>
            )}

            {groupedMessages.map(group => (
              <div key={group.date}>
                <div className="flex items-center justify-center py-4">
                  <span className="rounded-full bg-m3-surface-container-lowest px-4 py-1.5 text-xs font-medium text-m3-on-surface-variant shadow-md shadow-gray-200/50 dark:bg-m3-surface-container-high dark:text-m3-outline dark:shadow-black/20">
                    {group.date}
                  </span>
                </div>
                <div className="space-y-1">
                  {group.messages.map((msg, idx) => {
                    const prevMsg = idx > 0 ? group.messages[idx - 1] : null
                    const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId
                    return (
                      <MessageBubble
                        key={msg.eventId}
                        message={msg}
                        isOwn={msg.senderId === user.userId}
                        showAvatar={showAvatar}
                        onReply={() => setReplyTo(msg)}
                        roomId={activeRoom.roomId}
                        isPinned={pinnedEventIds.includes(msg.eventId)}
                        searchHighlight={chatSearch}
                      />
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="flex items-end gap-2 animate-fade-in">
                <div className="rounded-2xl bg-m3-surface-container-lowest px-4 py-3 shadow-md dark:bg-m3-surface-container-high">
                  <div className="flex gap-1">
                    <span className="typing-dot h-2.5 w-2.5 rounded-full bg-m3-primary" />
                    <span className="typing-dot h-2.5 w-2.5 rounded-full bg-m3-primary" />
                    <span className="typing-dot h-2.5 w-2.5 rounded-full bg-m3-primary" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-1" />
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="relative">
        <MessageInput
          onSend={handleSend}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          roomId={activeRoom.roomId}
        />
        <span className="absolute bottom-1 right-3 text-[9px] text-m3-outline-variant/60 pointer-events-none select-none">
          v{process.env.NEXT_PUBLIC_BUILD_VERSION}
        </span>
      </div>

      {/* Room Info Panel */}
      {showRoomInfo && (
        <div className="fixed inset-0 z-[100]" onClick={() => { setShowRoomInfo(false); setDragPos(null) }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
          <div
            className="absolute right-16 top-16 z-50 w-96 max-h-[85vh] rounded-2xl bg-m3-surface-container-lowest shadow-2xl animate-slide-in dark:bg-m3-surface-container overflow-y-auto"
            style={dragPos ? { transform: `translate(${dragPos.x}px, ${dragPos.y}px)` } : undefined}
            onClick={e => e.stopPropagation()}
          >
          <div
            className="border-b border-m3-outline-variant p-4 dark:border-m3-outline-variant cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleDragStart}
          >
            <h3 className="text-base font-bold text-m3-on-surface dark:text-m3-on-surface">Room Details</h3>
          </div>

          <div className="p-4 space-y-5">
            {/* Room avatar + name */}
            <div className="flex flex-col items-center gap-3">
              <Avatar
                src={activeRoom.isDirect ? otherMember?.avatarUrl : activeRoom.avatarUrl}
                name={roomDisplayName}
                size="lg"
              />
              <div className="w-full text-center">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      autoFocus
                      className="flex-1 rounded-lg border border-m3-outline bg-m3-surface-container-lowest px-3 py-1.5 text-sm text-m3-on-surface focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline dark:bg-m3-surface-container-high dark:text-m3-on-surface"
                      onKeyDown={async e => {
                        if (e.key === 'Enter' && nameInput.trim()) {
                          setSavingName(true)
                          try {
                            await setRoomName(activeRoom.roomId, nameInput.trim())
                          } catch { /* handled in store */ }
                          setSavingName(false)
                          setEditingName(false)
                        } else if (e.key === 'Escape') {
                          setEditingName(false)
                        }
                      }}
                    />
                    <button
                      onClick={async () => {
                        if (!nameInput.trim()) return
                        setSavingName(true)
                        try {
                          await setRoomName(activeRoom.roomId, nameInput.trim())
                        } catch { /* handled in store */ }
                        setSavingName(false)
                        setEditingName(false)
                      }}
                      disabled={savingName}
                      className="rounded-lg p-1.5 text-green-600 transition-colors hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                    >
                      {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="rounded-lg p-1.5 text-m3-outline transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <h4 className="text-lg font-bold text-m3-on-surface dark:text-m3-on-surface">{roomDisplayName}</h4>
                    {!activeRoom.isDirect && (
                      <button
                        onClick={() => { setNameInput(activeRoom.name); setEditingName(true) }}
                        className="rounded-lg p-1 text-m3-outline transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface dark:hover:bg-m3-surface-container-high dark:hover:text-white"
                        title="Edit room name"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {editingTopic ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={topicInput}
                      onChange={e => setTopicInput(e.target.value)}
                      placeholder="Set a topic..."
                      autoFocus
                      className="flex-1 rounded-lg border border-m3-outline bg-m3-surface-container-lowest px-3 py-1.5 text-sm text-m3-on-surface focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline dark:bg-m3-surface-container-high dark:text-m3-on-surface"
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          setSavingTopic(true)
                          try {
                            await setRoomTopic(activeRoom.roomId, topicInput.trim())
                          } catch { /* handled in store */ }
                          setSavingTopic(false)
                          setEditingTopic(false)
                        } else if (e.key === 'Escape') {
                          setEditingTopic(false)
                        }
                      }}
                    />
                    <button
                      onClick={async () => {
                        setSavingTopic(true)
                        try {
                          await setRoomTopic(activeRoom.roomId, topicInput.trim())
                        } catch { /* handled in store */ }
                        setSavingTopic(false)
                        setEditingTopic(false)
                      }}
                      disabled={savingTopic}
                      className="rounded-lg p-1.5 text-green-600 transition-colors hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                    >
                      {savingTopic ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => setEditingTopic(false)}
                      className="rounded-lg p-1.5 text-m3-outline transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center justify-center gap-1">
                    {activeRoom.topic ? (
                      <p className="text-sm text-m3-on-surface-variant dark:text-m3-outline">{activeRoom.topic}</p>
                    ) : (
                      <p className="text-sm italic text-m3-outline dark:text-m3-on-surface-variant">No topic set</p>
                    )}
                    {!activeRoom.isDirect && (
                      <button
                        onClick={() => { setTopicInput(activeRoom.topic || ''); setEditingTopic(true) }}
                        className="rounded-lg p-1 text-m3-outline transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface dark:hover:bg-m3-surface-container-high dark:hover:text-white"
                        title="Edit room topic"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Room ID */}
            <div className="rounded-xl border border-m3-outline-variant bg-m3-surface-container-low p-3 shadow-sm dark:border-m3-outline-variant dark:bg-m3-surface-container-high/50">
              <p className="text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">Room ID</p>
              <p className="mt-1 font-mono text-xs text-m3-on-surface dark:text-m3-on-surface-variant break-all">{activeRoom.roomId}</p>
            </div>

            {/* Encryption */}
            <div className="rounded-xl border border-m3-outline-variant bg-m3-surface-container-low p-3 shadow-sm dark:border-m3-outline-variant dark:bg-m3-surface-container-high/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {activeRoom.encrypted ? (
                    <>
                      <Shield className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">End-to-end encrypted</span>
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 text-m3-outline" />
                      <span className="text-sm font-medium text-m3-on-surface-variant dark:text-m3-outline">Not encrypted</span>
                    </>
                  )}
                </div>
                {!activeRoom.encrypted && (
                  <button
                    onClick={async () => {
                      try {
                        await enableEncryption(activeRoom.roomId)
                      } catch { /* handled in store */ }
                    }}
                    className="flex items-center gap-1 rounded-lg bg-m3-primary px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-m3-primary/90"
                  >
                    <Lock className="h-3 w-3" />
                    Enable
                  </button>
                )}
              </div>
            </div>

            {/* Notification Settings */}
            <div className="rounded-xl border border-m3-outline-variant bg-m3-surface-container-low p-3 shadow-sm dark:border-m3-outline-variant dark:bg-m3-surface-container-high/50">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="h-4 w-4 text-m3-on-surface-variant" />
                <p className="text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">Notifications</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setNotifSetting('all')}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    notifSetting === 'all'
                      ? 'bg-m3-primary-container text-m3-on-primary-container dark:bg-m3-primary-container/50 dark:text-m3-primary'
                      : 'text-m3-on-surface-variant hover:bg-m3-surface-container-high dark:text-m3-outline dark:hover:bg-m3-surface-container-highest'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setNotifSetting('mentions')}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    notifSetting === 'mentions'
                      ? 'bg-m3-primary-container text-m3-on-primary-container dark:bg-m3-primary-container/50 dark:text-m3-primary'
                      : 'text-m3-on-surface-variant hover:bg-m3-surface-container-high dark:text-m3-outline dark:hover:bg-m3-surface-container-highest'
                  }`}
                >
                  Mentions
                </button>
                <button
                  onClick={() => setNotifSetting('mute')}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    notifSetting === 'mute'
                      ? 'bg-red-100 text-m3-on-error-container dark:bg-m3-error-container/50 dark:text-red-300'
                      : 'text-m3-on-surface-variant hover:bg-m3-surface-container-high dark:text-m3-outline dark:hover:bg-m3-surface-container-highest'
                  }`}
                >
                  <BellOff className="mx-auto h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Invite Member */}
            <div className="rounded-xl border border-m3-outline-variant bg-m3-surface-container-low p-3 shadow-sm dark:border-m3-outline-variant dark:bg-m3-surface-container-high/50">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="h-4 w-4 text-m3-on-surface-variant" />
                <p className="text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">Invite Member</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteInput}
                  onChange={e => { setInviteInput(e.target.value); setInviteError('') }}
                  placeholder="@user:server.com"
                  className="flex-1 rounded-lg border border-m3-outline bg-m3-surface-container-lowest px-3 py-1.5 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      const matrixIdRegex = /^@[a-zA-Z0-9._=\-/+]+:[a-zA-Z0-9.-]+$/
                      if (!matrixIdRegex.test(inviteInput.trim())) {
                        setInviteError('Invalid Matrix user ID format')
                        return
                      }
                      setInviting(true)
                      setInviteError('')
                      try {
                        await inviteMember(activeRoom.roomId, inviteInput.trim())
                        setInviteInput('')
                      } catch (err) {
                        setInviteError(err instanceof Error ? err.message : 'Failed to invite')
                      }
                      setInviting(false)
                    }
                  }}
                />
                <button
                  onClick={async () => {
                    const matrixIdRegex = /^@[a-zA-Z0-9._=\-/+]+:[a-zA-Z0-9.-]+$/
                    if (!matrixIdRegex.test(inviteInput.trim())) {
                      setInviteError('Invalid Matrix user ID format')
                      return
                    }
                    setInviting(true)
                    setInviteError('')
                    try {
                      await inviteMember(activeRoom.roomId, inviteInput.trim())
                      setInviteInput('')
                    } catch (err) {
                      setInviteError(err instanceof Error ? err.message : 'Failed to invite')
                    }
                    setInviting(false)
                  }}
                  disabled={inviting || !inviteInput.trim()}
                  className="rounded-lg bg-m3-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-m3-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                </button>
              </div>
              {inviteError && (
                <p className="mt-1.5 text-xs text-m3-error dark:text-m3-error">{inviteError}</p>
              )}
            </div>

            {/* Members */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-m3-on-surface-variant" />
                <h4 className="text-sm font-medium text-m3-on-surface dark:text-m3-on-surface-variant">
                  Members ({activeRoom.members.length})
                </h4>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activeRoom.members.map(member => (
                  <div key={member.userId} className="flex items-center gap-3 rounded-lg p-2 hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high">
                    <Avatar
                      src={member.avatarUrl}
                      name={member.displayName}
                      size="sm"
                      status={member.presence === 'online' ? 'online' : member.presence === 'unavailable' ? 'away' : null}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-m3-on-surface dark:text-m3-on-surface">{member.displayName}</p>
                      <p className="truncate text-xs text-m3-on-surface-variant dark:text-m3-outline">{member.userId}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Media Gallery */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon className="h-4 w-4 text-m3-on-surface-variant" />
                <h4 className="text-sm font-medium text-m3-on-surface dark:text-m3-on-surface-variant">Shared Media</h4>
              </div>
              <div className="grid grid-cols-3 gap-1 max-h-64 overflow-y-auto rounded-lg">
                {messages
                  .filter(m => m.mediaUrl && (m.type === 'm.image' || m.type === 'm.video'))
                  .slice(-30)
                  .reverse()
                  .map(m => (
                    <div
                      key={m.eventId}
                      className="aspect-square overflow-hidden rounded-lg bg-m3-surface-container dark:bg-m3-surface-container-high"
                    >
                      <MediaThumbnail message={m} />
                    </div>
                  ))}
                {messages.filter(m => m.mediaUrl && (m.type === 'm.image' || m.type === 'm.video')).length === 0 && (
                  <p className="col-span-3 py-4 text-center text-xs text-m3-outline">No shared media yet</p>
                )}
              </div>

              {/* Shared files */}
              {messages.filter(m => m.mediaUrl && m.type === 'm.file').length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">Files</p>
                  {messages
                    .filter(m => m.mediaUrl && m.type === 'm.file')
                    .slice(-10)
                    .reverse()
                    .map(m => (
                      <a
                        key={m.eventId}
                        href={m.mediaUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg p-2 text-sm transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                      >
                        <FileText className="h-4 w-4 flex-shrink-0 text-m3-outline" />
                        <span className="truncate text-m3-on-surface dark:text-m3-on-surface-variant">{m.content}</span>
                      </a>
                    ))}
                </div>
              )}
            </div>

            {/* Leave Room */}
            <div className="pt-2 border-t border-m3-outline-variant dark:border-m3-outline-variant">
              <button
                onClick={async () => {
                  if (!confirm(`Leave ${activeRoom.isDirect ? 'this conversation' : activeRoom.name}?`)) return
                  try {
                    await leaveRoom(activeRoom.roomId)
                    setShowRoomInfo(false)
                  } catch (err) {
                    console.error('Failed to leave room:', err)
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-m3-error transition-colors hover:bg-m3-error-container dark:text-m3-error dark:hover:bg-red-900/20"
              >
                <LogOut className="h-4 w-4" />
                {activeRoom.isDirect ? 'Leave Conversation' : 'Leave Room'}
              </button>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  )
}
