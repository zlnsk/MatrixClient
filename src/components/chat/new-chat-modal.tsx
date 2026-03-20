'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'
import {
  X,
  Search,
  MessageSquare,
  Users,
  UserPlus,
  Loader2,
  Check,
} from 'lucide-react'
import type { User, ChatWithDetails } from '@/types/database'

interface NewChatModalProps {
  onClose: () => void
  onChatCreated: (chat: ChatWithDetails) => void
}

export function NewChatModal({ onClose, onChatCreated }: NewChatModalProps) {
  const currentUser = useAuthStore(s => s.user)
  const { loadAllUsers, createDirectChat, createGroupChat, loadChats, chats } = useChatStore()
  const [tab, setTab] = useState<'direct' | 'group'>('direct')
  const [users, setUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [groupName, setGroupName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    loadAllUsers().then(allUsers => {
      setUsers(allUsers.filter(u => u.id !== currentUser?.id))
      setIsLoading(false)
    })
  }, [loadAllUsers, currentUser])

  const filteredUsers = users.filter(u =>
    u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleDirectChat = async (otherUser: User) => {
    if (!currentUser) return
    setIsCreating(true)
    try {
      const chatId = await createDirectChat(currentUser.id, otherUser.id)
      await loadChats(currentUser.id)
      const chat = useChatStore.getState().chats.find(c => c.id === chatId)
      if (chat) onChatCreated(chat)
      onClose()
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateGroup = async () => {
    if (!currentUser || !groupName.trim() || selectedUsers.length === 0) return
    setIsCreating(true)
    try {
      const chatId = await createGroupChat(
        currentUser.id,
        groupName.trim(),
        selectedUsers.map(u => u.id)
      )
      await loadChats(currentUser.id)
      const chat = useChatStore.getState().chats.find(c => c.id === chatId)
      if (chat) onChatCreated(chat)
      onClose()
    } finally {
      setIsCreating(false)
    }
  }

  const toggleUserSelection = (user: User) => {
    setSelectedUsers(prev =>
      prev.find(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-slide-in rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 p-4">
          <h2 className="text-lg font-bold text-white">New Conversation</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => { setTab('direct'); setSelectedUsers([]) }}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'direct'
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Direct Message
          </button>
          <button
            onClick={() => setTab('group')}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'group'
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Users className="h-4 w-4" />
            Group Chat
          </button>
        </div>

        <div className="p-4">
          {/* Group name input */}
          {tab === 'group' && (
            <div className="mb-3">
              <input
                type="text"
                placeholder="Group name"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Selected users (group) */}
          {tab === 'group' && selectedUsers.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedUsers.map(u => (
                <span
                  key={u.id}
                  className="flex items-center gap-1.5 rounded-full bg-indigo-600/20 px-3 py-1 text-xs text-indigo-300"
                >
                  {u.display_name}
                  <button onClick={() => toggleUserSelection(u)} className="hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* User list */}
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-8 text-center">
                <UserPlus className="mx-auto h-8 w-8 text-gray-700" />
                <p className="mt-2 text-sm text-gray-500">No users found</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => tab === 'direct' ? handleDirectChat(u) : toggleUserSelection(u)}
                    disabled={isCreating}
                    className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-gray-800 disabled:opacity-50"
                  >
                    <Avatar src={u.avatar_url} name={u.display_name} size="md" status={u.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">{u.display_name}</p>
                      <p className="truncate text-xs text-gray-500">{u.email}</p>
                    </div>
                    {tab === 'group' && selectedUsers.find(s => s.id === u.id) && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Create group button */}
        {tab === 'group' && (
          <div className="border-t border-gray-800 p-4">
            <button
              onClick={handleCreateGroup}
              disabled={isCreating || !groupName.trim() || selectedUsers.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              Create Group ({selectedUsers.length} members)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
