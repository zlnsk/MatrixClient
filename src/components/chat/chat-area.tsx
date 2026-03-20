'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
} from 'lucide-react'
import { getMatrixClient } from '@/lib/matrix/client'

interface ChatAreaProps {
  onBackClick: () => void
}

export function ChatArea({ onBackClick }: ChatAreaProps) {
  const user = useAuthStore(s => s.user)
  const { activeRoom, messages, isLoadingMessages, sendMessage, typingUsers, archiveRoom, unarchiveRoom, setActiveRoom, leaveRoom, setRoomName, setRoomTopic, inviteMember } = useChatStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

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

  const filteredMessages = chatSearch
    ? messages.filter(m => m.content.toLowerCase().includes(chatSearch.toLowerCase()))
    : messages

  // Group messages by date
  const groupedMessages: { date: string; messages: MatrixMessage[] }[] = []
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
      groupedMessages.push({ date: msgDate, messages: [msg] })
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg)
    }
  }

  return (
    <div className="relative flex flex-1 flex-col min-h-0 bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white/90 px-4 py-3 shadow-md shadow-gray-200/40 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/90 dark:shadow-black/30">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackClick}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar
            src={activeRoom.isDirect ? otherMember?.avatarUrl : activeRoom.avatarUrl}
            name={roomDisplayName}
            size="md"
            status={activeRoom.isDirect ? (otherMember?.presence === 'online' ? 'online' : otherMember?.presence === 'unavailable' ? 'away' : 'offline') : null}
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{roomDisplayName}</h2>
              {!activeRoom.isDirect && <Hash className="h-4 w-4 text-gray-400" />}
            </div>
            <div className="flex items-center gap-2">
              {typingUsers.length > 0 ? (
                <span className="text-sm text-indigo-500 dark:text-indigo-400">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </span>
              ) : (
                <span className="text-sm text-gray-500">{roomStatus}</span>
              )}
              {activeRoom.encrypted && (
                <div className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 dark:bg-green-900/50">
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
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
            title="Room info"
          >
            <Info className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
            title="Search"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            onClick={handleArchiveToggle}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
            title={activeRoom.isArchived ? 'Unarchive' : 'Archive'}
          >
            {activeRoom.isArchived ? (
              <ArchiveRestore className="h-5 w-5" />
            ) : (
              <Archive className="h-5 w-5" />
            )}
          </button>
          <button
            onClick={() => setConfirmLeave(true)}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title="Leave room"
          >
            <LogOut className="h-5 w-5" />
          </button>
          <button className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white">
            <Phone className="h-5 w-5" />
          </button>
          <button className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white">
            <Video className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="animate-slide-in border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-900/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search in conversation..."
              value={chatSearch}
              onChange={e => setChatSearch(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>
        </div>
      )}

      {/* Leave confirmation */}
      {confirmLeave && (
        <div className="animate-slide-in border-b border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-300">
            Leave <strong>{activeRoom.name}</strong>? You will lose access to this room.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                await leaveRoom(activeRoom.roomId)
                setConfirmLeave(false)
              }}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-500"
            >
              Leave
            </button>
            <button
              onClick={() => setConfirmLeave(false)}
              className="rounded-lg bg-gray-200 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {activeRoom.topic && (
              <div className="flex items-center justify-center py-2">
                <span className="rounded-full bg-gray-200 px-4 py-1.5 text-sm text-gray-500 shadow-sm dark:bg-gray-800 dark:text-gray-400">
                  {activeRoom.topic}
                </span>
              </div>
            )}

            {groupedMessages.map(group => (
              <div key={group.date}>
                <div className="flex items-center justify-center py-4">
                  <span className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-gray-500 shadow-md shadow-gray-200/50 dark:bg-gray-800 dark:text-gray-400 dark:shadow-black/20">
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
                      />
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="flex items-end gap-2 animate-fade-in">
                <div className="rounded-2xl bg-white px-4 py-3 shadow-md dark:bg-gray-800">
                  <div className="flex gap-1">
                    <span className="typing-dot h-2.5 w-2.5 rounded-full bg-indigo-400" />
                    <span className="typing-dot h-2.5 w-2.5 rounded-full bg-indigo-400" />
                    <span className="typing-dot h-2.5 w-2.5 rounded-full bg-indigo-400" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
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

      {/* Room Info Panel */}
      {showRoomInfo && (
        <div className="absolute right-0 top-0 z-40 h-full w-80 border-l border-gray-200 bg-white shadow-2xl animate-slide-in dark:border-gray-800 dark:bg-gray-900 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Room Details</h3>
            <button
              onClick={() => setShowRoomInfo(false)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
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
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white">{roomDisplayName}</h4>
                    {!activeRoom.isDirect && (
                      <button
                        onClick={() => { setNameInput(activeRoom.name); setEditingName(true) }}
                        className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
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
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center justify-center gap-1">
                    {activeRoom.topic ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{activeRoom.topic}</p>
                    ) : (
                      <p className="text-sm italic text-gray-400 dark:text-gray-500">No topic set</p>
                    )}
                    {!activeRoom.isDirect && (
                      <button
                        onClick={() => { setTopicInput(activeRoom.topic || ''); setEditingTopic(true) }}
                        className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
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
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Room ID</p>
              <p className="mt-1 font-mono text-xs text-gray-700 dark:text-gray-300 break-all">{activeRoom.roomId}</p>
            </div>

            {/* Encryption */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                {activeRoom.encrypted ? (
                  <>
                    <Shield className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">End-to-end encrypted</span>
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Not encrypted</span>
                  </>
                )}
              </div>
            </div>

            {/* Notification Settings */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="h-4 w-4 text-gray-500" />
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Notifications</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setNotifSetting('all')}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    notifSetting === 'all'
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                      : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setNotifSetting('mentions')}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    notifSetting === 'mentions'
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                      : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  Mentions
                </button>
                <button
                  onClick={() => setNotifSetting('mute')}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    notifSetting === 'mute'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                      : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  <BellOff className="mx-auto h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Invite Member */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="h-4 w-4 text-gray-500" />
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Invite Member</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteInput}
                  onChange={e => { setInviteInput(e.target.value); setInviteError('') }}
                  placeholder="@user:server.com"
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
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
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                </button>
              </div>
              {inviteError && (
                <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{inviteError}</p>
              )}
            </div>

            {/* Members */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-gray-500" />
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Members ({activeRoom.members.length})
                </h4>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activeRoom.members.map(member => (
                  <div key={member.userId} className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <Avatar
                      src={member.avatarUrl}
                      name={member.displayName}
                      size="sm"
                      status={member.presence === 'online' ? 'online' : member.presence === 'unavailable' ? 'away' : null}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{member.displayName}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{member.userId}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
