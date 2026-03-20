'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'
import { format } from 'date-fns'
import {
  Reply,
  Smile,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  Check,
  X,
} from 'lucide-react'
import type { MessageWithDetails } from '@/types/database'

interface MessageBubbleProps {
  message: MessageWithDetails
  isOwn: boolean
  showAvatar: boolean
  onReply: () => void
  chatId: string
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

export function MessageBubble({ message, isOwn, showAvatar, onReply, chatId }: MessageBubbleProps) {
  const user = useAuthStore(s => s.user)
  const { addReaction, editMessage, deleteMessage } = useChatStore()
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [copied, setCopied] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false)
        setShowEmojiPicker(false)
        setShowContextMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleReaction = async (emoji: string) => {
    if (!user) return
    await addReaction(message.id, chatId, user.id, emoji)
    setShowEmojiPicker(false)
    setShowActions(false)
  }

  const handleEdit = async () => {
    if (editContent.trim() && editContent !== message.content) {
      await editMessage(message.id, editContent.trim())
    }
    setIsEditing(false)
  }

  const handleDelete = async () => {
    await deleteMessage(message.id)
    setShowContextMenu(false)
    setShowActions(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setShowContextMenu(false)
  }

  if (message.is_deleted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
        <div className={`${isOwn ? 'mr-12' : 'ml-12'} rounded-2xl bg-gray-800/50 px-4 py-2`}>
          <p className="text-sm italic text-gray-500">This message was deleted</p>
        </div>
      </div>
    )
  }

  // Group reactions by emoji
  const reactionGroups = message.reactions?.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = []
    acc[r.emoji].push(r)
    return acc
  }, {} as Record<string, typeof message.reactions>) || {}

  return (
    <div
      className={`group flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        if (!showEmojiPicker && !showContextMenu) setShowActions(false)
      }}
    >
      <div className={`flex max-w-xs md:max-w-sm lg:max-w-md ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
        {/* Avatar */}
        <div className="w-8 flex-shrink-0">
          {showAvatar && !isOwn && (
            <Avatar
              src={message.sender?.avatar_url}
              name={message.sender?.display_name || 'U'}
              size="sm"
            />
          )}
        </div>

        <div className="relative" ref={actionsRef}>
          {/* Reply reference */}
          {message.reply_to && (
            <div className={`mb-1 rounded-lg bg-gray-800/60 px-3 py-1.5 text-xs ${isOwn ? 'border-r-2 border-indigo-500' : 'border-l-2 border-gray-600'}`}>
              <p className="font-medium text-gray-400">{message.reply_to.sender?.display_name}</p>
              <p className="truncate text-gray-500">{message.reply_to.content}</p>
            </div>
          )}

          {/* Sender name (group chats) */}
          {showAvatar && !isOwn && (
            <p className="mb-1 ml-1 text-xs font-medium text-gray-400">
              {message.sender?.display_name}
            </p>
          )}

          {/* Bubble */}
          <div
            className={`rounded-2xl px-4 py-2 ${
              isOwn
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-100'
            }`}
          >
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleEdit()
                    if (e.key === 'Escape') setIsEditing(false)
                  }}
                  autoFocus
                  className="min-w-[200px] rounded bg-transparent text-sm focus:outline-none"
                />
                <button onClick={handleEdit} className="text-green-400 hover:text-green-300">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setIsEditing(false)} className="text-red-400 hover:text-red-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : message.type === 'image' && message.media_url ? (
              <div>
                <img
                  src={message.media_url}
                  alt="Shared image"
                  className="max-h-64 rounded-lg object-cover"
                />
                {message.content && <p className="mt-2 text-sm">{message.content}</p>}
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            )}

            {/* Timestamp */}
            <div className={`mt-1 flex items-center gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <span className={`text-xs ${isOwn ? 'text-indigo-200' : 'text-gray-500'}`}>
                {format(new Date(message.created_at), 'HH:mm')}
              </span>
              {message.updated_at !== message.created_at && !message.is_deleted && (
                <span className={`text-xs ${isOwn ? 'text-indigo-200' : 'text-gray-500'}`}>
                  (edited)
                </span>
              )}
            </div>
          </div>

          {/* Reactions */}
          {Object.keys(reactionGroups).length > 0 && (
            <div className={`mt-1 flex flex-wrap gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {Object.entries(reactionGroups).map(([emoji, reactions]) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    reactions.some(r => r.user_id === user?.id)
                      ? 'border-indigo-500/50 bg-indigo-900/30 text-indigo-300'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span>{emoji}</span>
                  <span>{reactions.length}</span>
                </button>
              ))}
            </div>
          )}

          {/* Action buttons */}
          {showActions && !isEditing && (
            <div className={`absolute -top-8 ${isOwn ? 'right-0' : 'left-0'} flex items-center gap-0.5 rounded-lg border border-gray-700 bg-gray-800 p-0.5 shadow-lg animate-fade-in`}>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                title="React"
              >
                <Smile className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onReply}
                className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                title="Reply"
              >
                <Reply className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowContextMenu(!showContextMenu)}
                className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                title="More"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Emoji picker */}
          {showEmojiPicker && (
            <div className={`absolute -top-16 ${isOwn ? 'right-0' : 'left-0'} flex gap-1 rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-lg animate-slide-in`}>
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="rounded p-1 text-lg transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Context menu */}
          {showContextMenu && (
            <div className={`absolute top-full mt-1 ${isOwn ? 'right-0' : 'left-0'} z-10 min-w-[160px] rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl animate-slide-in`}>
              <button
                onClick={handleCopy}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700"
              >
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy text'}
              </button>
              {isOwn && (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(true)
                      setEditContent(message.content)
                      setShowContextMenu(false)
                      setShowActions(false)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit message
                  </button>
                  <div className="my-1 border-t border-gray-700" />
                  <button
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-gray-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete message
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
