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
  MoreVertical,
  Search,
  Users,
  Loader2,
  Hash,
} from 'lucide-react'

interface ChatAreaProps {
  onBackClick: () => void
}

export function ChatArea({ onBackClick }: ChatAreaProps) {
  const user = useAuthStore(s => s.user)
  const { activeRoom, messages, isLoadingMessages, sendMessage, typingUsers } = useChatStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [replyTo, setReplyTo] = useState<MatrixMessage | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [chatSearch, setChatSearch] = useState('')

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
    <div className="flex flex-1 flex-col min-h-0 bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80 dark:shadow-none">
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
              {!activeRoom.isDirect && <Hash className="h-4 w-4 text-gray-500" />}
            </div>
            <div className="flex items-center gap-2">
              {typingUsers.length > 0 ? (
                <span className="text-xs text-indigo-400">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </span>
              ) : (
                <span className="text-xs text-gray-500">{roomStatus}</span>
              )}
              {activeRoom.encrypted && (
                <div className="flex items-center gap-1 rounded-full bg-green-900/50 px-2 py-0.5">
                  <Lock className="h-3 w-3 text-green-400" />
                  <span className="text-xs text-green-400">Encrypted</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <Search className="h-5 w-5" />
          </button>
          <button className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
            <Phone className="h-5 w-5" />
          </button>
          <button className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
            <Video className="h-5 w-5" />
          </button>
          <button className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
            <MoreVertical className="h-5 w-5" />
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
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {activeRoom.topic && (
              <div className="flex items-center justify-center py-2">
                <span className="rounded-full bg-gray-800 px-4 py-1.5 text-xs text-gray-400">
                  {activeRoom.topic}
                </span>
              </div>
            )}

            {groupedMessages.map(group => (
              <div key={group.date}>
                <div className="flex items-center justify-center py-4">
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-500 shadow-sm dark:bg-gray-800 dark:text-gray-400">
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
                <div className="rounded-2xl bg-gray-800 px-4 py-3">
                  <div className="flex gap-1">
                    <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
                    <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
                    <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
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
    </div>
  )
}
