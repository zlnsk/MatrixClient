'use client'

import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { getHomeserverDomain } from '@/lib/matrix/client'
import {
  Users,
  Loader2,
  Lock,
  Globe,
  Send,
  X,
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
  const panelRef = useRef<HTMLDivElement>(null)

  const domain = getHomeserverDomain() || 'matrix.org'

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handleDirectChat = async () => {
    if (!userId.trim()) return
    setError('')
    setIsCreating(true)
    try {
      let fullUserId = userId.trim()
      if (!fullUserId.startsWith('@')) {
        fullUserId = `@${fullUserId}`
      }
      if (!fullUserId.includes(':')) {
        fullUserId = `${fullUserId}:${domain}`
      }

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-16 animate-fade-in sm:justify-start sm:pl-4 sm:pt-14">
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-2xl bg-m3-surface-container-lowest shadow-xl dark:bg-m3-surface-container sm:ml-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-m3-outline-variant px-4 py-3 dark:border-m3-outline-variant">
          <h2 className="text-sm font-medium text-m3-on-surface">New conversation</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-m3-outline-variant dark:border-m3-outline-variant">
          <button
            onClick={() => { setTab('direct'); setError('') }}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === 'direct'
                ? 'border-b-2 border-m3-primary text-m3-primary'
                : 'text-m3-on-surface-variant hover:text-m3-on-surface'
            }`}
          >
            Direct message
          </button>
          <button
            onClick={() => { setTab('group'); setError('') }}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === 'group'
                ? 'border-b-2 border-m3-primary text-m3-primary'
                : 'text-m3-on-surface-variant hover:text-m3-on-surface'
            }`}
          >
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Group</span>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-3 mt-3 rounded-lg bg-m3-error-container px-3 py-2 text-xs text-m3-error dark:bg-m3-error-container/20 dark:text-m3-error">
            {error}
          </div>
        )}

        {/* Direct message tab */}
        {tab === 'direct' && (
          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-m3-on-surface-variant dark:text-m3-outline">To:</span>
              <input
                type="text"
                placeholder={`@user:${domain}`}
                value={userId}
                onChange={e => setUserId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleDirectChat()}
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm text-m3-on-surface placeholder-m3-outline focus:outline-none dark:text-m3-on-surface dark:placeholder-m3-outline"
              />
              <button
                onClick={handleDirectChat}
                disabled={isCreating || !userId.trim()}
                className="rounded-full bg-m3-primary p-1.5 text-white transition-colors hover:bg-m3-primary/90 disabled:opacity-40"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-3 text-xs text-m3-on-surface-variant dark:text-m3-outline">
              Enter a Matrix user ID to start a direct message.
            </p>
          </div>
        )}

        {/* Group tab */}
        {tab === 'group' && (
          <div className="space-y-3 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">Group name</label>
              <input
                type="text"
                placeholder="My Group"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                autoFocus
                className="w-full border-b border-m3-outline-variant bg-transparent py-1.5 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none dark:border-m3-outline-variant dark:text-m3-on-surface dark:placeholder-m3-outline"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">
                Members (comma-separated)
              </label>
              <textarea
                placeholder={`@user1:${domain}, @user2:${domain}`}
                value={groupMembers}
                onChange={e => setGroupMembers(e.target.value)}
                rows={2}
                className="w-full border-b border-m3-outline-variant bg-transparent py-1.5 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none dark:border-m3-outline-variant dark:text-m3-on-surface dark:placeholder-m3-outline resize-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">
                Topic (optional)
              </label>
              <input
                type="text"
                placeholder="What is this room about?"
                value={groupTopic}
                onChange={e => setGroupTopic(e.target.value)}
                className="w-full border-b border-m3-outline-variant bg-transparent py-1.5 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none dark:border-m3-outline-variant dark:text-m3-on-surface dark:placeholder-m3-outline"
              />
            </div>

            {/* Toggles */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-m3-on-surface-variant dark:text-m3-outline" />
                <span className="text-xs text-m3-on-surface dark:text-m3-on-surface-variant">Encryption</span>
              </div>
              <button
                type="button"
                onClick={() => setEnableEncryption(!enableEncryption)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-all duration-200 ${
                  enableEncryption ? 'bg-m3-primary' : 'bg-m3-outline-variant dark:bg-m3-outline'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-all duration-200 ${
                    enableEncryption ? 'translate-x-[18px]' : 'translate-x-0.5'
                  } mt-0.5`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-m3-on-surface-variant dark:text-m3-outline" />
                <span className="text-xs text-m3-on-surface dark:text-m3-on-surface-variant">Public room</span>
              </div>
              <button
                type="button"
                onClick={() => setIsPublic(!isPublic)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-all duration-200 ${
                  isPublic ? 'bg-m3-primary' : 'bg-m3-outline-variant dark:bg-m3-outline'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-all duration-200 ${
                    isPublic ? 'translate-x-[18px]' : 'translate-x-0.5'
                  } mt-0.5`}
                />
              </button>
            </div>

            <button
              onClick={handleCreateGroup}
              disabled={isCreating || !groupName.trim() || !groupMembers.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-m3-primary py-2 text-xs font-medium text-white transition-colors hover:bg-m3-primary/90 disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
              Create Group
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
