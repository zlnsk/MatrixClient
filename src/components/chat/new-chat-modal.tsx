'use client'

import { useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { getHomeserverDomain } from '@/lib/matrix/client'
import {
  ArrowLeft,
  Users,
  Loader2,
  Lock,
  Globe,
  Send,
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
    <div className="fixed inset-0 z-50 flex bg-white dark:bg-m3-surface animate-fade-in safe-area-pad">
      {/* Full-page new conversation view — Google Messages style */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-m3-outline-variant bg-white px-4 py-3 dark:border-m3-outline-variant dark:bg-m3-surface-container">
          <button
            onClick={onClose}
            className="rounded-full p-2 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base font-medium text-m3-on-surface dark:text-m3-on-surface">New conversation</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-lg">
            {/* "To:" input field — Google Messages style */}
            <div className="border-b border-m3-outline-variant px-6 py-4 dark:border-m3-outline-variant">
              <div className="flex items-center gap-3">
                <span className="text-sm text-m3-on-surface-variant dark:text-m3-outline">To:</span>
                <input
                  type="text"
                  placeholder={`Type a name or @user:${domain}`}
                  value={userId}
                  onChange={e => { setUserId(e.target.value); setTab('direct') }}
                  onKeyDown={e => e.key === 'Enter' && handleDirectChat()}
                  autoFocus
                  className="flex-1 bg-transparent text-sm text-m3-on-surface placeholder-m3-outline focus:outline-none dark:text-m3-on-surface dark:placeholder-m3-outline"
                />
                {userId.trim() && (
                  <button
                    onClick={handleDirectChat}
                    disabled={isCreating}
                    className="rounded-full bg-m3-primary p-2 text-white transition-colors hover:bg-m3-primary/90 disabled:opacity-50"
                  >
                    {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-4 rounded-lg bg-m3-error-container px-4 py-3 text-sm text-m3-error dark:bg-m3-error-container/20 dark:text-m3-error">
                {error}
              </div>
            )}

            {/* Start group conversation option */}
            <button
              onClick={() => setTab('group')}
              className={`flex w-full items-center gap-4 border-b border-m3-outline-variant px-6 py-4 text-left transition-colors hover:bg-m3-surface-container dark:border-m3-outline-variant dark:hover:bg-m3-surface-container-high ${
                tab === 'group' ? 'bg-m3-surface-container dark:bg-m3-surface-container-high' : ''
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-m3-primary-container text-m3-primary dark:bg-m3-primary-container/30 dark:text-m3-primary">
                <Users className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-m3-on-surface dark:text-m3-on-surface">Start group conversation</span>
            </button>

            {/* Group creation form — shown when group tab is active */}
            {tab === 'group' && (
              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">Group name</label>
                  <input
                    type="text"
                    placeholder="My Group"
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    className="w-full border-b border-m3-outline-variant bg-transparent py-2 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none dark:border-m3-outline-variant dark:text-m3-on-surface dark:placeholder-m3-outline"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">
                    Members (comma-separated)
                  </label>
                  <textarea
                    placeholder={`@user1:${domain}, @user2:${domain}`}
                    value={groupMembers}
                    onChange={e => setGroupMembers(e.target.value)}
                    rows={2}
                    className="w-full border-b border-m3-outline-variant bg-transparent py-2 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none dark:border-m3-outline-variant dark:text-m3-on-surface dark:placeholder-m3-outline resize-none"
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
                    className="w-full border-b border-m3-outline-variant bg-transparent py-2 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none dark:border-m3-outline-variant dark:text-m3-on-surface dark:placeholder-m3-outline"
                  />
                </div>

                {/* Toggles */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Lock className="h-4 w-4 text-m3-on-surface-variant dark:text-m3-outline" />
                    <span className="text-sm text-m3-on-surface dark:text-m3-on-surface-variant">Enable encryption</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableEncryption(!enableEncryption)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors ${
                      enableEncryption ? 'bg-m3-primary' : 'bg-m3-outline-variant dark:bg-m3-outline'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                        enableEncryption ? 'translate-x-[22px]' : 'translate-x-0.5'
                      } mt-0.5`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-m3-on-surface-variant dark:text-m3-outline" />
                    <span className="text-sm text-m3-on-surface dark:text-m3-on-surface-variant">Public room</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPublic(!isPublic)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors ${
                      isPublic ? 'bg-m3-primary' : 'bg-m3-outline-variant dark:bg-m3-outline'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                        isPublic ? 'translate-x-[22px]' : 'translate-x-0.5'
                      } mt-0.5`}
                    />
                  </button>
                </div>

                <button
                  onClick={handleCreateGroup}
                  disabled={isCreating || !groupName.trim() || !groupMembers.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-m3-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-m3-primary/90 disabled:opacity-50"
                >
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  Create Group
                </button>
              </div>
            )}

            {/* Hint text */}
            {tab === 'direct' && !userId.trim() && (
              <div className="px-6 pt-8 text-center">
                <p className="text-sm text-m3-on-surface-variant dark:text-m3-outline">
                  Enter a Matrix user ID to start a direct message, or create a group conversation.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
