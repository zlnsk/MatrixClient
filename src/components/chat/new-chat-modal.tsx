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
      <div className="relative w-full max-w-md animate-slide-in rounded-2xl border border-m3-outline-variant bg-m3-surface-container-lowest shadow-2xl dark:border-m3-outline-variant dark:bg-m3-surface-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-m3-outline-variant p-4 dark:border-m3-outline-variant">
          <h2 className="text-lg font-bold text-m3-on-surface dark:text-m3-on-surface">New Conversation</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-m3-outline-variant dark:border-m3-outline-variant">
          <button
            onClick={() => setTab('direct')}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'direct'
                ? 'border-b-2 border-m3-primary text-m3-primary dark:text-m3-primary'
                : 'text-m3-outline hover:text-m3-on-surface-variant dark:hover:text-m3-outline-variant'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Direct Message
          </button>
          <button
            onClick={() => setTab('group')}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'group'
                ? 'border-b-2 border-m3-primary text-m3-primary dark:text-m3-primary'
                : 'text-m3-outline hover:text-m3-on-surface-variant dark:hover:text-m3-outline-variant'
            }`}
          >
            <Users className="h-4 w-4" />
            Group Chat
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-3 rounded-lg border border-m3-error bg-m3-error-container px-4 py-3 text-sm text-m3-error dark:border-m3-error/50 dark:bg-m3-error-container/20 dark:text-m3-error">
              {error}
            </div>
          )}

          {tab === 'direct' ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">
                  Matrix User ID
                </label>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-m3-on-surface-variant" />
                  <input
                    type="text"
                    placeholder={`username:${domain}`}
                    value={userId}
                    onChange={e => setUserId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleDirectChat()}
                    className="w-full rounded-lg border border-m3-outline-variant bg-m3-surface-container-low py-2.5 pl-10 pr-4 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                  />
                </div>
                <p className="mt-1 text-xs text-m3-on-surface-variant">
                  e.g. user:{domain} or @user:{domain}
                </p>
              </div>

              <button
                onClick={handleDirectChat}
                disabled={isCreating || !userId.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-m3-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-m3-primary disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                Start Chat
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">Group name</label>
                <input
                  type="text"
                  placeholder="My Group"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  className="w-full rounded-lg border border-m3-outline-variant bg-m3-surface-container-low px-4 py-2.5 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">
                  Members (comma-separated Matrix IDs)
                </label>
                <textarea
                  placeholder={`@user1:${domain}, @user2:${domain}`}
                  value={groupMembers}
                  onChange={e => setGroupMembers(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-m3-outline-variant bg-m3-surface-container-low px-4 py-2.5 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">
                  Topic (optional)
                </label>
                <input
                  type="text"
                  placeholder="What is this room about?"
                  value={groupTopic}
                  onChange={e => setGroupTopic(e.target.value)}
                  className="w-full rounded-lg border border-m3-outline-variant bg-m3-surface-container-low px-4 py-2.5 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-m3-outline-variant bg-m3-surface-container-low px-4 py-3 dark:border-m3-outline-variant dark:bg-m3-surface-container-high">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-m3-on-surface-variant dark:text-m3-outline" />
                  <span className="text-sm text-m3-on-surface dark:text-m3-on-surface-variant">Enable encryption</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableEncryption(!enableEncryption)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    enableEncryption ? 'bg-m3-primary' : 'bg-m3-outline-variant dark:bg-m3-outline'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-m3-surface-container-lowest shadow ring-0 transition-transform ${
                      enableEncryption ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-m3-outline-variant bg-m3-surface-container-low px-4 py-3 dark:border-m3-outline-variant dark:bg-m3-surface-container-high">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-m3-on-surface-variant dark:text-m3-outline" />
                  <span className="text-sm text-m3-on-surface dark:text-m3-on-surface-variant">Public room</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    isPublic ? 'bg-m3-primary' : 'bg-m3-outline-variant dark:bg-m3-outline'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-m3-surface-container-lowest shadow ring-0 transition-transform ${
                      isPublic ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <button
                onClick={handleCreateGroup}
                disabled={isCreating || !groupName.trim() || !groupMembers.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-m3-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-m3-primary disabled:opacity-50"
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
