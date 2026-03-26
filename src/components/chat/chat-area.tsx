'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore, type MatrixMessage } from '@/stores/chat-store'
import { resolveRoomAvatarFromSDK } from '@/lib/matrix/client'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import { ChatHeader } from './chat-header'
import { RoomInfoPanel } from './room-info-panel'
import {
  Search,
  Loader2,
  X,
  Pin,
} from 'lucide-react'
import { getMatrixClient } from '@/lib/matrix/client'
import { useUploadStore } from '@/stores/upload-store'

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
  const [showPinnedBanner, setShowPinnedBanner] = useState(true)

  // Memoize pinned event IDs
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
  const stickyRef = useRef(true)

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

  // Track user scroll
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onScroll = () => { stickyRef.current = isAtBottom() }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isAtBottom])

  // On room switch: reset sticky, close details panel
  useEffect(() => {
    if (activeRoom && activeRoom.roomId !== prevRoomIdRef.current) {
      prevRoomIdRef.current = activeRoom.roomId
      stickyRef.current = true
      setShowRoomInfo(false)
    }
  }, [activeRoom])

  // Scroll when messages change
  useEffect(() => {
    if (!stickyRef.current) return
    requestAnimationFrame(() => {
      scrollToBottom(true)
    })
  }, [messages, scrollToBottom])

  // Watch for layout shifts
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (stickyRef.current) {
        el.scrollTop = el.scrollHeight
      }
    })
    for (const child of el.children) {
      ro.observe(child)
    }
    return () => ro.disconnect()
  }, [messages])

  // Re-scroll when mobile keyboard opens/closes
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
      {/* Header */}
      <ChatHeader
        activeRoom={activeRoom}
        roomDisplayName={roomDisplayName}
        headerAvatarUrl={headerAvatarUrl}
        roomStatus={roomStatus}
        typingUsers={typingUsers}
        isSmallOrBridged={isSmallOrBridged}
        otherMemberPresence={otherMember?.presence}
        onBackClick={onBackClick}
        onToggleSearch={() => setShowSearch(!showSearch)}
        onToggleRoomInfo={() => setShowRoomInfo(!showRoomInfo)}
        onArchiveToggle={handleArchiveToggle}
        onLeave={() => setConfirmLeave(true)}
      />

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
          <div className="flex h-full flex-col justify-end space-y-4 px-4 py-6">
            {/* Skeleton messages */}
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`flex ${i % 3 === 0 ? 'justify-end' : 'justify-start'}`}>
                <div className={`animate-skeleton rounded-[20px] ${
                  i % 3 === 0
                    ? 'bg-m3-primary/20 dark:bg-m3-primary/10'
                    : 'bg-m3-surface-container dark:bg-m3-surface-container-high'
                }`} style={{ width: `${35 + (i * 13) % 40}%`, height: `${36 + (i * 7) % 24}px` }} />
              </div>
            ))}
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

      {/* Upload progress bar */}
      <UploadProgress roomId={activeRoom.roomId} />

      {/* Message Input */}
      <MessageInput
        onSend={handleSend}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        roomId={activeRoom.roomId}
      />

      {/* Room Info Panel */}
      {showRoomInfo && (
        <RoomInfoPanel
          activeRoom={activeRoom}
          roomDisplayName={roomDisplayName}
          headerAvatarUrl={headerAvatarUrl}
          messages={messages}
          onClose={() => setShowRoomInfo(false)}
          onSetRoomName={setRoomName}
          onSetRoomTopic={setRoomTopic}
          onInviteMember={inviteMember}
          onEnableEncryption={enableEncryption}
          onLeaveRoom={leaveRoom}
        />
      )}
    </div>
  )
}

/** Compact upload progress indicators shown above the message input. */
function UploadProgress({ roomId }: { roomId: string }) {
  // Subscribe to the full tasks array, then filter in render.
  // Using .filter() inside the selector creates a new array reference every time,
  // which causes Zustand to think state changed → infinite re-render loop.
  const allTasks = useUploadStore(s => s.tasks)
  const tasks = allTasks.filter(t => t.roomId === roomId)

  if (tasks.length === 0) return null

  return (
    <div className="border-t border-m3-outline-variant/40 bg-m3-surface-container-low px-4 py-2 dark:bg-m3-surface-container">
      {tasks.map(task => (
        <div key={task.id} className="flex items-center gap-3 py-1">
          <span className="text-xs text-m3-on-surface-variant truncate max-w-[180px]">
            {task.fileName}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-m3-surface-container-high dark:bg-m3-surface-container-highest overflow-hidden">
            <div
              className="h-full rounded-full bg-m3-primary transition-all duration-300 ease-out"
              style={{ width: `${task.status === 'done' ? 100 : task.progress}%` }}
            />
          </div>
          <span className="text-[11px] text-m3-on-surface-variant flex-shrink-0 w-14 text-right">
            {task.status === 'queued' && 'Queued'}
            {task.status === 'uploading' && `${task.progress}%`}
            {task.status === 'sending' && 'Sending'}
            {task.status === 'done' && 'Done'}
            {task.status === 'failed' && <span className="text-m3-error">Failed</span>}
          </span>
        </div>
      ))}
    </div>
  )
}
