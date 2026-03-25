'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore, type MatrixMessage } from '@/stores/chat-store'
import { resolveRoomAvatarFromSDK } from '@/lib/matrix/client'
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
  MoreVertical,
  Pin,
  Image as ImageIcon,
  FileText,
  AtSign,
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
  const [showKebabMenu, setShowKebabMenu] = useState(false)
  const kebabRef = useRef<HTMLDivElement>(null)

  // Close kebab menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setShowKebabMenu(false)
      }
    }
    if (showKebabMenu) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [showKebabMenu])

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

  // On room switch: reset sticky, close details panel, scroll instantly after messages render
  useEffect(() => {
    if (activeRoom && activeRoom.roomId !== prevRoomIdRef.current) {
      prevRoomIdRef.current = activeRoom.roomId
      stickyRef.current = true
      setShowRoomInfo(false)
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

  const isSmallOrBridged = activeRoom.isDirect || activeRoom.isBridged || activeRoom.members.length <= 3
  const otherMember = isSmallOrBridged
    ? (activeRoom.members.filter(m => m.userId !== user.userId).find(m => m.avatarUrl) || activeRoom.members.find(m => m.userId !== user.userId))
    : null
  // Fallback: query SDK directly if store data doesn't have the avatar
  const headerAvatarUrl = (isSmallOrBridged ? otherMember?.avatarUrl : null)
    || activeRoom.avatarUrl
    || resolveRoomAvatarFromSDK(activeRoom.roomId)

  const roomDisplayName = activeRoom.name
  const roomStatus = isSmallOrBridged
    ? otherMember?.presence === 'online' ? 'online' : otherMember?.presence === 'unavailable' ? 'away' : 'offline'
    : `${activeRoom.members.length} members`

  const handleSend = useCallback((content: string) => {
    sendMessage(activeRoom.roomId, content, replyTo?.eventId)
    setReplyTo(null)
    // Always scroll to bottom when sending a message, even if user scrolled up
    stickyRef.current = true
    requestAnimationFrame(() => scrollToBottom(true))
  }, [activeRoom.roomId, replyTo?.eventId, sendMessage, scrollToBottom])

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




  return (
    <div className="relative flex flex-1 flex-col min-h-0 bg-white dark:bg-m3-surface">
      {/* Header — Google Messages style */}
      <div className="flex items-center border-b border-m3-outline-variant bg-white px-2 py-2 dark:border-m3-outline-variant dark:bg-m3-surface-container md:px-4">
        <button
          onClick={onBackClick}
          className="flex-shrink-0 rounded-full p-2 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container active:bg-m3-surface-container-high md:hidden"
          aria-label="Back to chat list"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-2">
          <Avatar
            src={headerAvatarUrl}
            name={roomDisplayName}
            size="md"
            status={isSmallOrBridged ? (otherMember?.presence === 'online' ? 'online' : otherMember?.presence === 'unavailable' ? 'away' : 'offline') : null}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium text-m3-on-surface">{roomDisplayName}</h2>
            <div className="flex items-center gap-1.5">
              {typingUsers.length > 0 ? (
                <span className="truncate text-xs text-m3-primary">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </span>
              ) : (
                <span className="truncate text-xs text-m3-on-surface-variant">{roomStatus}</span>
              )}
              {activeRoom.encrypted && (
                <Lock className="h-3 w-3 flex-shrink-0 text-m3-on-surface-variant" />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center">
          {!activeRoom.isBridged && (
            <>
              <button
                onClick={() => placeCall(activeRoom.roomId, false)}
                className="hidden sm:flex rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container"
                title="Voice call"
              >
                <Phone className="h-5 w-5" />
              </button>
              <button
                onClick={() => placeCall(activeRoom.roomId, true)}
                className="hidden sm:flex rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container"
                title="Video call"
              >
                <Video className="h-5 w-5" />
              </button>
            </>
          )}
          {/* Kebab menu (3 dots) */}
          <div className="relative" ref={kebabRef}>
            <button
              onClick={() => setShowKebabMenu(!showKebabMenu)}
              className="rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container"
              aria-label="More options"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {showKebabMenu && (
              <div className="absolute right-0 top-full z-50 mt-1 w-60 rounded-2xl border border-m3-outline-variant bg-white py-2 shadow-xl animate-slide-in dark:border-m3-outline-variant dark:bg-m3-surface-container">
                <button
                  onClick={() => { setShowRoomInfo(!showRoomInfo); setShowKebabMenu(false) }}
                  className="flex w-full items-center gap-4 px-5 py-3 text-sm whitespace-nowrap text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                >
                  <Info className="h-5 w-5 flex-shrink-0 text-m3-on-surface-variant" />
                  Room details
                </button>
                <button
                  onClick={() => { setShowSearch(!showSearch); setShowKebabMenu(false) }}
                  className="flex w-full items-center gap-4 px-5 py-3 text-sm whitespace-nowrap text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                >
                  <Search className="h-5 w-5 flex-shrink-0 text-m3-on-surface-variant" />
                  Search in conversation
                </button>
                {!activeRoom.isBridged && (
                  <>
                    <button
                      onClick={() => { placeCall(activeRoom.roomId, false); setShowKebabMenu(false) }}
                      className="flex w-full items-center gap-4 px-5 py-3 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high sm:hidden"
                    >
                      <Phone className="h-5 w-5 text-m3-on-surface-variant" />
                      Voice call
                    </button>
                    <button
                      onClick={() => { placeCall(activeRoom.roomId, true); setShowKebabMenu(false) }}
                      className="flex w-full items-center gap-4 px-5 py-3 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                    >
                      <Video className="h-5 w-5 text-m3-on-surface-variant" />
                      Video call
                    </button>
                  </>
                )}
                <div className="my-1 border-t border-m3-outline-variant" />
                <button
                  onClick={() => { handleArchiveToggle(); setShowKebabMenu(false) }}
                  className="flex w-full items-center gap-4 px-5 py-3 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                >
                  {activeRoom.isArchived ? <ArchiveRestore className="h-5 w-5 text-m3-on-surface-variant" /> : <Archive className="h-5 w-5 text-m3-on-surface-variant" />}
                  {activeRoom.isArchived ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  onClick={() => { setConfirmLeave(true); setShowKebabMenu(false) }}
                  className="flex w-full items-center gap-4 px-5 py-3 text-sm text-m3-error transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                >
                  <LogOut className="h-5 w-5" />
                  Leave room
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="animate-slide-in border-b border-m3-outline-variant bg-white px-4 py-2 dark:border-m3-outline-variant dark:bg-m3-surface-container">
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
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700"
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
      <div ref={scrollContainerRef} className="message-scroll-container min-h-0 flex-1 overflow-y-auto bg-m3-surface-container-lowest px-2 pt-4 pb-6 dark:bg-m3-surface md:px-6 lg:px-8 md:pb-8">
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
                  <span className="rounded-full bg-m3-surface-container px-4 py-1 text-xs font-medium text-m3-on-surface-variant shadow-sm dark:bg-m3-surface-container-high dark:text-m3-outline">
                    {group.date}
                  </span>
                </div>
                <div className="space-y-0.5">
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
                <div className="rounded-[20px] border border-m3-outline-variant/50 bg-m3-surface-container-lowest px-4 py-3 dark:border-m3-outline-variant/30 dark:bg-m3-surface-container-high">
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
      <MessageInput
        onSend={handleSend}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        roomId={activeRoom.roomId}
      />

      {/* Room Info Panel — Google Messages style full-page overlay */}
      {showRoomInfo && (
        <div className="absolute inset-0 z-40 flex flex-col bg-white dark:bg-m3-surface">
          {/* Header with back arrow */}
          <div className="flex items-center gap-3 border-b border-m3-outline-variant bg-white px-2 py-2 dark:border-m3-outline-variant dark:bg-m3-surface-container md:px-4">
            <button
              onClick={() => setShowRoomInfo(false)}
              className="rounded-full p-2 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h3 className="text-base font-medium text-m3-on-surface dark:text-m3-on-surface">Details</h3>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {/* Avatar + name hero section */}
            <div className="flex flex-col items-center px-6 py-8">
              <Avatar
                src={headerAvatarUrl}
                name={roomDisplayName}
                size="lg"
              />
              <div className="mt-4 w-full text-center">
                {editingName ? (
                  <div className="mx-auto flex max-w-xs items-center gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      autoFocus
                      className="flex-1 border-b-2 border-m3-primary bg-transparent px-1 py-1.5 text-center text-lg font-medium text-m3-on-surface focus:outline-none dark:text-m3-on-surface"
                      onKeyDown={async e => {
                        if (e.key === 'Enter' && nameInput.trim()) {
                          setSavingName(true)
                          try { await setRoomName(activeRoom.roomId, nameInput.trim()) } catch {}
                          setSavingName(false); setEditingName(false)
                        } else if (e.key === 'Escape') setEditingName(false)
                      }}
                    />
                    <button
                      onClick={async () => {
                        if (!nameInput.trim()) return
                        setSavingName(true)
                        try { await setRoomName(activeRoom.roomId, nameInput.trim()) } catch {}
                        setSavingName(false); setEditingName(false)
                      }}
                      disabled={savingName}
                      className="rounded-full p-1.5 text-m3-primary transition-colors hover:bg-m3-primary-container"
                    >
                      {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button onClick={() => setEditingName(false)} className="rounded-full p-1.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <h4 className="text-xl font-medium text-m3-on-surface dark:text-m3-on-surface">{roomDisplayName}</h4>
                    {!activeRoom.isDirect && (
                      <button
                        onClick={() => { setNameInput(activeRoom.name); setEditingName(true) }}
                        className="rounded-full p-1.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {editingTopic ? (
                  <div className="mx-auto mt-2 flex max-w-xs items-center gap-2">
                    <input
                      type="text"
                      value={topicInput}
                      onChange={e => setTopicInput(e.target.value)}
                      placeholder="Set a topic..."
                      autoFocus
                      className="flex-1 border-b border-m3-primary bg-transparent px-1 py-1 text-center text-sm text-m3-on-surface focus:outline-none dark:text-m3-on-surface"
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          setSavingTopic(true)
                          try { await setRoomTopic(activeRoom.roomId, topicInput.trim()) } catch {}
                          setSavingTopic(false); setEditingTopic(false)
                        } else if (e.key === 'Escape') setEditingTopic(false)
                      }}
                    />
                    <button
                      onClick={async () => {
                        setSavingTopic(true)
                        try { await setRoomTopic(activeRoom.roomId, topicInput.trim()) } catch {}
                        setSavingTopic(false); setEditingTopic(false)
                      }}
                      disabled={savingTopic}
                      className="rounded-full p-1 text-m3-primary transition-colors hover:bg-m3-primary-container"
                    >
                      {savingTopic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => setEditingTopic(false)} className="rounded-full p-1 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center justify-center gap-1">
                    {activeRoom.topic ? (
                      <p className="text-sm text-m3-on-surface-variant dark:text-m3-outline">{activeRoom.topic}</p>
                    ) : !activeRoom.isDirect ? (
                      <p className="text-sm italic text-m3-outline dark:text-m3-on-surface-variant">No topic set</p>
                    ) : null}
                    {!activeRoom.isDirect && (
                      <button
                        onClick={() => { setTopicInput(activeRoom.topic || ''); setEditingTopic(true) }}
                        className="rounded-full p-1 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons row — Google Messages style */}
            <div className="flex justify-center gap-6 border-b border-m3-outline-variant px-6 py-5 dark:border-m3-outline-variant">
              {activeRoom.encrypted ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/20">
                    <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-xs text-green-600 dark:text-green-400">Encrypted</span>
                </div>
              ) : (
                <button
                  onClick={async () => { try { await enableEncryption(activeRoom.roomId) } catch {} }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container transition-colors hover:bg-m3-surface-container-high dark:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-highest">
                    <Lock className="h-5 w-5 text-m3-on-surface-variant" />
                  </div>
                  <span className="text-xs text-m3-on-surface-variant">Encrypt</span>
                </button>
              )}
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => setNotifSetting(notifSetting === 'mute' ? 'all' : 'mute')}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container transition-colors hover:bg-m3-surface-container-high dark:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-highest"
                >
                  {notifSetting === 'mute' ? <BellOff className="h-5 w-5 text-m3-error" /> : <Bell className="h-5 w-5 text-m3-on-surface-variant" />}
                </button>
                <span className="text-xs text-m3-on-surface-variant">{notifSetting === 'mute' ? 'Muted' : 'Notifications'}</span>
              </div>
            </div>

            {/* List-style sections */}
            <div className="divide-y divide-m3-outline-variant dark:divide-m3-outline-variant">
              {/* Room ID — subtle, compact */}
              <button
                onClick={() => { navigator.clipboard.writeText(activeRoom.roomId) }}
                className="flex w-full items-start gap-4 px-6 py-4 text-left transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                <AtSign className="mt-0.5 h-5 w-5 flex-shrink-0 text-m3-on-surface-variant dark:text-m3-outline" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-m3-on-surface dark:text-m3-on-surface break-all font-mono">{activeRoom.roomId}</p>
                  <p className="mt-0.5 text-xs text-m3-on-surface-variant dark:text-m3-outline">Tap to copy</p>
                </div>
              </button>

              {/* Notification settings — expanded */}
              <div className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <Bell className="h-5 w-5 flex-shrink-0 text-m3-on-surface-variant dark:text-m3-outline" />
                  <p className="text-sm text-m3-on-surface dark:text-m3-on-surface">Notifications</p>
                </div>
                <div className="mt-3 ml-9 flex gap-2">
                  {(['all', 'mentions', 'mute'] as const).map(setting => (
                    <button
                      key={setting}
                      onClick={() => setNotifSetting(setting)}
                      className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                        notifSetting === setting
                          ? setting === 'mute'
                            ? 'bg-m3-error-container text-m3-error dark:bg-m3-error-container/30'
                            : 'bg-m3-primary-container text-m3-on-primary-container dark:bg-m3-primary-container/30 dark:text-m3-primary'
                          : 'bg-m3-surface-container text-m3-on-surface-variant hover:bg-m3-surface-container-high dark:bg-m3-surface-container-high dark:text-m3-outline dark:hover:bg-m3-surface-container-highest'
                      }`}
                    >
                      {setting === 'mute' ? 'Mute' : setting.charAt(0).toUpperCase() + setting.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Invite Member */}
              <div className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <UserPlus className="h-5 w-5 flex-shrink-0 text-m3-on-surface-variant dark:text-m3-outline" />
                  <p className="text-sm text-m3-on-surface dark:text-m3-on-surface">Invite member</p>
                </div>
                <div className="mt-3 ml-9 flex gap-2">
                  <input
                    type="text"
                    value={inviteInput}
                    onChange={e => { setInviteInput(e.target.value); setInviteError('') }}
                    placeholder="@user:server.com"
                    className="flex-1 border-b border-m3-outline-variant bg-transparent py-1.5 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none dark:border-m3-outline dark:text-m3-on-surface dark:placeholder-m3-outline"
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        const matrixIdRegex = /^@[a-zA-Z0-9._=\-/+]+:[a-zA-Z0-9.-]+$/
                        if (!matrixIdRegex.test(inviteInput.trim())) { setInviteError('Invalid Matrix user ID format'); return }
                        setInviting(true); setInviteError('')
                        try { await inviteMember(activeRoom.roomId, inviteInput.trim()); setInviteInput('') }
                        catch (err) { setInviteError(err instanceof Error ? err.message : 'Failed to invite') }
                        setInviting(false)
                      }
                    }}
                  />
                  <button
                    onClick={async () => {
                      const matrixIdRegex = /^@[a-zA-Z0-9._=\-/+]+:[a-zA-Z0-9.-]+$/
                      if (!matrixIdRegex.test(inviteInput.trim())) { setInviteError('Invalid Matrix user ID format'); return }
                      setInviting(true); setInviteError('')
                      try { await inviteMember(activeRoom.roomId, inviteInput.trim()); setInviteInput('') }
                      catch (err) { setInviteError(err instanceof Error ? err.message : 'Failed to invite') }
                      setInviting(false)
                    }}
                    disabled={inviting || !inviteInput.trim()}
                    className="rounded-full bg-m3-primary p-2 text-white transition-colors hover:bg-m3-primary/90 disabled:opacity-50"
                  >
                    {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  </button>
                </div>
                {inviteError && <p className="ml-9 mt-1.5 text-xs text-m3-error">{inviteError}</p>}
              </div>

              {/* Members */}
              <div className="px-6 py-4">
                <div className="flex items-center gap-4 mb-3">
                  <Users className="h-5 w-5 flex-shrink-0 text-m3-on-surface-variant dark:text-m3-outline" />
                  <p className="text-sm font-medium text-m3-on-surface dark:text-m3-on-surface">
                    Members ({activeRoom.members.length})
                  </p>
                </div>
                <div className="space-y-1">
                  {activeRoom.members.map(member => (
                    <div key={member.userId} className="flex items-center gap-3 rounded-full px-3 py-2 transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high">
                      <Avatar
                        src={member.avatarUrl}
                        name={member.displayName}
                        size="sm"
                        status={member.presence === 'online' ? 'online' : member.presence === 'unavailable' ? 'away' : null}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-m3-on-surface dark:text-m3-on-surface">{member.displayName}</p>
                        <p className="truncate text-xs text-m3-on-surface-variant dark:text-m3-outline">{member.userId}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Media Gallery */}
              <div className="px-6 py-4">
                <div className="flex items-center gap-4 mb-3">
                  <ImageIcon className="h-5 w-5 flex-shrink-0 text-m3-on-surface-variant dark:text-m3-outline" />
                  <p className="text-sm font-medium text-m3-on-surface dark:text-m3-on-surface">Shared media</p>
                </div>
                <div className="grid grid-cols-5 gap-0.5 overflow-hidden rounded-xl">
                  {messages
                    .filter(m => m.mediaUrl && (m.type === 'm.image' || m.type === 'm.video'))
                    .slice(-30)
                    .reverse()
                    .map(m => (
                      <div key={m.eventId} className="aspect-square overflow-hidden bg-m3-surface-container dark:bg-m3-surface-container-high">
                        <MediaThumbnail message={m} />
                      </div>
                    ))}
                  {messages.filter(m => m.mediaUrl && (m.type === 'm.image' || m.type === 'm.video')).length === 0 && (
                    <p className="col-span-5 py-6 text-center text-sm text-m3-outline dark:text-m3-on-surface-variant">No shared media yet</p>
                  )}
                </div>

                {messages.filter(m => m.mediaUrl && m.type === 'm.file').length > 0 && (
                  <div className="mt-4 space-y-1">
                    <p className="mb-2 text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">Files</p>
                    {messages
                      .filter(m => m.mediaUrl && m.type === 'm.file')
                      .slice(-10)
                      .reverse()
                      .map(m => (
                        <a key={m.eventId} href={m.mediaUrl!} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                        >
                          <FileText className="h-4 w-4 flex-shrink-0 text-m3-outline" />
                          <span className="truncate text-m3-on-surface dark:text-m3-on-surface-variant">{m.content}</span>
                        </a>
                      ))}
                  </div>
                )}
              </div>

              {/* Leave Room */}
              <div className="px-6 py-4">
                <button
                  onClick={async () => {
                    if (!confirm(`Leave ${activeRoom.isDirect ? 'this conversation' : activeRoom.name}?`)) return
                    try { await leaveRoom(activeRoom.roomId); setShowRoomInfo(false) }
                    catch (err) { console.error('Failed to leave room:', err) }
                  }}
                  className="flex w-full items-center gap-4 rounded-full px-3 py-3 text-sm text-m3-error transition-colors hover:bg-m3-error-container dark:text-m3-error dark:hover:bg-red-900/20"
                >
                  <LogOut className="h-5 w-5" />
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
