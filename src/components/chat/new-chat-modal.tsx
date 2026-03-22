'use client'

import { useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { getHomeserverDomain } from '@/lib/matrix/client'
import {
  MessageSquare,
  Users,
  Loader2,
  AtSign,
  Lock,
  Globe,
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
  const [groupTopic, setGroupTopic] = useState('')
  const [enableEncryption, setEnableEncryption] = useState(true)
  const [isPublic, setIsPublic] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  const domain = getHomeserverDomain() || 'matrix.org'

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
        fullUserId = `${fullUserId}:${domain}`
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
          if (!id.includes(':')) id = `${id}:${domain}`
          return id
        })
        .filter(Boolean)

      const roomId = await createGroupChat(groupName.trim(), memberIds, {
        encrypted: enableEncryption,
        isPublic,
        topic: groupTopic.trim() || undefined,
      })
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md animate-slide-in rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-gray-200 p-4 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">New Conversation</h2>
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
                    placeholder={`username:${domain}`}
                    value={userId}
                    onChange={e => setUserId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleDirectChat()}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  e.g. user:{domain} or @user:{domain}
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
                  placeholder={`@user1:${domain}, @user2:${domain}`}
                  value={groupMembers}
                  onChange={e => setGroupMembers(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Topic (optional)
                </label>
                <input
                  type="text"
                  placeholder="What is this room about?"
                  value={groupTopic}
                  onChange={e => setGroupTopic(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Enable encryption</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableEncryption(!enableEncryption)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    enableEncryption ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform ${
                      enableEncryption ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Public room</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    isPublic ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform ${
                      isPublic ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
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
