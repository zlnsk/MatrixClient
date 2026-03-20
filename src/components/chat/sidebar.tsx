'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'
import { NewChatModal } from './new-chat-modal'
import { formatDistanceToNow } from 'date-fns'
import {
  Search,
  Settings,
  Plus,
  Lock,
  Users,
  MessageSquare,
  X,
} from 'lucide-react'
import type { ChatWithDetails } from '@/types/database'

interface SidebarProps {
  onSettingsClick: () => void
  onChatSelect: () => void
}

export function Sidebar({ onSettingsClick, onChatSelect }: SidebarProps) {
  const user = useAuthStore(s => s.user)
  const { chats, isLoadingChats, loadChats, setActiveChat, activeChat, markAsRead } = useChatStore()
  const [searchFilter, setSearchFilter] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)

  useEffect(() => {
    if (user) loadChats(user.id)
  }, [user, loadChats])

  const handleSelectChat = useCallback(async (chat: ChatWithDetails) => {
    await setActiveChat(chat)
    if (user) await markAsRead(chat.id, user.id)
    onChatSelect()
  }, [setActiveChat, markAsRead, user, onChatSelect])

  const getChatDisplayName = (chat: ChatWithDetails) => {
    if (chat.type === 'group') return chat.name || 'Group Chat'
    const other = chat.members.find(m => m.user_id !== user?.id)
    return other?.user?.display_name || 'Unknown'
  }

  const getChatAvatar = (chat: ChatWithDetails) => {
    if (chat.type === 'group') return chat.avatar_url
    const other = chat.members.find(m => m.user_id !== user?.id)
    return other?.user?.avatar_url
  }

  const getChatStatus = (chat: ChatWithDetails) => {
    if (chat.type === 'group') return null
    const other = chat.members.find(m => m.user_id !== user?.id)
    return other?.user?.status || null
  }

  const filteredChats = chats.filter(chat =>
    getChatDisplayName(chat).toLowerCase().includes(searchFilter.toLowerCase())
  )

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 p-4">
        <div className="flex items-center gap-3">
          <Avatar
            src={user?.avatar_url}
            name={user?.display_name || 'U'}
            size="md"
            status={user?.status}
          />
          <div>
            <h1 className="text-lg font-bold text-white">Matrix</h1>
            <p className="text-xs text-gray-500">lukasz.com</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowNewChat(true)}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            title="New chat"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            onClick={onSettingsClick}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Encryption badge */}
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-green-900/30 px-3 py-2">
        <Lock className="h-3.5 w-3.5 text-green-400" />
        <span className="text-xs font-medium text-green-400">End-to-end encrypted</span>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2">
        {isLoadingChats ? (
          <div className="flex flex-col gap-3 p-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg p-3">
                <div className="h-10 w-10 rounded-full bg-gray-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-gray-800" />
                  <div className="h-2.5 w-40 rounded bg-gray-800" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-gray-700" />
            <p className="mt-3 text-sm text-gray-500">
              {searchFilter ? 'No conversations found' : 'No conversations yet'}
            </p>
            {!searchFilter && (
              <button
                onClick={() => setShowNewChat(true)}
                className="mt-3 text-sm text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Start a new chat
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5 py-1">
            {filteredChats.map(chat => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isActive={activeChat?.id === chat.id}
                onClick={() => handleSelectChat(chat)}
                displayName={getChatDisplayName(chat)}
                avatarUrl={getChatAvatar(chat)}
                status={getChatStatus(chat)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onChatCreated={handleSelectChat}
        />
      )}
    </>
  )
}

function ChatListItem({
  chat,
  isActive,
  onClick,
  displayName,
  avatarUrl,
  status,
}: {
  chat: ChatWithDetails
  isActive: boolean
  onClick: () => void
  displayName: string
  avatarUrl: string | null | undefined
  status: string | null
}) {
  const lastMsg = chat.last_message
  const lastMsgPreview = lastMsg
    ? lastMsg.is_deleted
      ? 'Message deleted'
      : lastMsg.type === 'image'
        ? '📷 Photo'
        : lastMsg.type === 'voice'
          ? '🎤 Voice message'
          : lastMsg.content.substring(0, 50) + (lastMsg.content.length > 50 ? '...' : '')
    : 'No messages yet'

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
        isActive ? 'bg-gray-800' : 'hover:bg-gray-800/60'
      }`}
    >
      <Avatar
        src={avatarUrl}
        name={displayName}
        size="md"
        status={status as 'online' | 'offline' | 'away' | null}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="truncate text-sm font-medium text-white">
            {displayName}
          </span>
          {lastMsg && (
            <span className="ml-2 flex-shrink-0 text-xs text-gray-500">
              {formatDistanceToNow(new Date(lastMsg.created_at), { addSuffix: false })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="truncate text-xs text-gray-400">{lastMsgPreview}</p>
          {chat.unread_count > 0 && (
            <span className="ml-2 flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-medium text-white">
              {chat.unread_count > 99 ? '99+' : chat.unread_count}
            </span>
          )}
        </div>
      </div>
      {chat.type === 'group' && (
        <Users className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />
      )}
    </button>
  )
}
