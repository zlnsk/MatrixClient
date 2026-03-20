'use client'

import { useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import {
  X,
  MessageSquare,
  Users,
  Loader2,
  AtSign,
} from 'lucide-react'

interface NewChatModalProps {
  onClose: () => void
  onRoomCreated: (roomId: string) => void
}

export function NewChatModal({ onClose, onRoomCreated }: NewChatModalProps) {
  const { createDirectChat, createGroupChat, loadRooms } = useChatStore()
  const [tab, setTab] = useState<'direct' | 'group'>('direct')
  const [userId, setUserId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  const handleDirectChat = async () => {
    if (!userId.trim()) return
    setError('')
    setIsCreating(true)
    try {
      // Ensure full Matrix user ID format
      let fullUserId = userId.trim()
      if (!fullUserId.startsWith('@')) {
        fullUserId = `@${fullUserId}`
      }
      if (!fullUserId.includes(':')) {
        fullUserId = `${fullUserId}:lukasz.com`
      }

      // Validate Matrix user ID format: @localpart:domain
      const matrixIdRegex = /^@[a-zA-Z0-9._=\-/+]+:[a-zA-Z0-9.-]+$/
      if (!matrixIdRegex.test(fullUserId)) {
        setError('Invalid Matrix user ID format. Expected: @user:domain.com')
        setIsCreating(false)
        return
      }

      const roomId = await createDirectChat(fullUserId)
      loadRooms()
      onRoomCreated(roomId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chat')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim() || !groupMembers.trim()) return
    setError('')
    setIsCreating(true)
    try {
      const memberIds = groupMembers
        .split(',')
        .map(m => {
          let id = m.trim()
          if (!id.startsWith('@')) id = `@${id}`
          if (!id.includes(':')) id = `${id}:lukasz.com`
          return id
        })
        .filter(Boolean)

      const roomId = await createGroupChat(groupName.trim(), memberIds)
      loadRooms()
      onRoomCreated(roomId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-slide-in rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">New Conversation</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setTab('direct')}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'direct'
                ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Direct Message
          </button>
          <button
            onClick={() => setTab('group')}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'group'
                ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            <Users className="h-4 w-4" />
            Group Chat
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {tab === 'direct' ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Matrix User ID
                </label>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="username:lukasz.com"
                    value={userId}
                    onChange={e => setUserId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleDirectChat()}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  e.g. lca:lukasz.com or @lca:lukasz.com
                </p>
              </div>

              <button
                onClick={handleDirectChat}
                disabled={isCreating || !userId.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                Start Chat
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">Group name</label>
                <input
                  type="text"
                  placeholder="My Group"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Members (comma-separated Matrix IDs)
                </label>
                <textarea
                  placeholder="@user1:lukasz.com, @user2:lukasz.com"
                  value={groupMembers}
                  onChange={e => setGroupMembers(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                />
              </div>

              <button
                onClick={handleCreateGroup}
                disabled={isCreating || !groupName.trim() || !groupMembers.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Create Group
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
