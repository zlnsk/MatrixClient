'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore, type MatrixMessage } from '@/stores/chat-store'
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
  CheckCheck,
  X,
  Clock,
  Send,
} from 'lucide-react'

interface MessageBubbleProps {
  message: MatrixMessage
  isOwn: boolean
  showAvatar: boolean
  onReply: () => void
  roomId: string
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏', '💯', '✅']

export function MessageBubble({ message, isOwn, showAvatar, onReply, roomId }: MessageBubbleProps) {
  const user = useAuthStore(s => s.user)
  const { sendReaction, editMessage, redactMessage } = useChatStore()
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
    await sendReaction(roomId, message.eventId, emoji)
    setShowEmojiPicker(false)
    setShowActions(false)
  }

  const handleEdit = async () => {
    if (editContent.trim() && editContent !== message.content) {
      await editMessage(roomId, message.eventId, editContent.trim())
    }
    setIsEditing(false)
  }

  const handleDelete = async () => {
    await redactMessage(roomId, message.eventId)
    setShowContextMenu(false)
    setShowActions(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setShowContextMenu(false)
  }

  // Status icon for own messages
  const StatusIcon = () => {
    if (!isOwn) return null
    const iconClass = 'h-3.5 w-3.5'
    switch (message.status) {
      case 'sending':
        return <Clock className={`${iconClass} text-gray-400 dark:text-gray-500`} />
      case 'sent':
        return <Check className={`${iconClass} text-gray-400 dark:text-gray-500`} />
      case 'delivered':
        return <CheckCheck className={`${iconClass} text-gray-400 dark:text-gray-500`} />
      case 'read':
        return <CheckCheck className={`${iconClass} text-blue-400`} />
      default:
        return <Send className={`${iconClass} text-gray-400 dark:text-gray-500`} />
    }
  }

  if (message.isRedacted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
        <div className={`${isOwn ? 'mr-12' : 'ml-12'} rounded-2xl bg-gray-100 dark:bg-gray-800/50 px-4 py-2 shadow-sm`}>
          <p className="text-sm italic text-gray-400 dark:text-gray-500">This message was deleted</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`group flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-4' : 'mt-0.5'}`}
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
              src={message.senderAvatar}
              name={message.senderName}
              size="sm"
            />
          )}
        </div>

        <div className="relative flex flex-col" ref={actionsRef}>
          {/* Reply reference */}
          {message.replyToEvent && (
            <div className={`mb-1 rounded-xl px-3 py-1.5 text-xs shadow-sm ${
              isOwn
                ? 'border-r-2 border-indigo-400 bg-indigo-900/30 dark:bg-indigo-900/30'
                : 'border-l-2 border-gray-400 bg-gray-100 dark:border-gray-600 dark:bg-gray-800/60'
            }`}>
              <p className="font-medium text-indigo-400 dark:text-gray-400">{message.replyToEvent.senderName}</p>
              <p className="truncate text-gray-500 dark:text-gray-500">{message.replyToEvent.content}</p>
            </div>
          )}

          {/* Sender name */}
          {showAvatar && !isOwn && (
            <p className="mb-1 ml-1 text-sm font-semibold text-gray-600 dark:text-gray-400">
              {message.senderName}
            </p>
          )}

          {/* Bubble */}
          <div
            className={`rounded-2xl px-4 py-3 ${
              isOwn
                ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-white text-gray-900 shadow-lg shadow-gray-200/60 dark:bg-gray-800 dark:text-gray-100 dark:shadow-black/30'
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
            ) : message.mediaUrl ? (
              <div>
                {message.type === 'm.image' ? (
                  <img
                    src={message.mediaUrl}
                    alt="Shared image"
                    className="max-h-64 rounded-xl object-cover shadow-sm"
                    style={{
                      width: message.mediaInfo?.w ? Math.min(message.mediaInfo.w, 400) : undefined,
                    }}
                  />
                ) : message.type === 'm.video' ? (
                  <video controls className="max-h-64 rounded-xl shadow-sm">
                    <source src={message.mediaUrl} type={message.mediaInfo?.mimetype} />
                  </video>
                ) : message.type === 'm.audio' ? (
                  <audio controls className="w-full">
                    <source src={message.mediaUrl} type={message.mediaInfo?.mimetype} />
                  </audio>
                ) : (
                  <a
                    href={message.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline"
                  >
                    📎 {message.content}
                  </a>
                )}
                {message.content && message.type === 'm.image' && (
                  <p className="mt-2 text-sm">{message.content}</p>
                )}
              </div>
            ) : (
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
            )}

            {/* Timestamp + status */}
            <div className={`mt-1 flex items-center gap-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <span className={`text-xs ${isOwn ? 'text-indigo-200/80' : 'text-gray-400 dark:text-gray-500'}`}>
                {format(new Date(message.timestamp), 'HH:mm')}
              </span>
              {message.isEdited && (
                <span className={`text-xs ${isOwn ? 'text-indigo-200/80' : 'text-gray-400 dark:text-gray-500'}`}>
                  (edited)
                </span>
              )}
              <StatusIcon />
            </div>
          </div>

          {/* Reactions */}
          {message.reactions.size > 0 && (
            <div className={`mt-1 flex flex-wrap gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {Array.from(message.reactions.entries()).map(([emoji, data]) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm transition-all hover:scale-105 ${
                    data.includesMe
                      ? 'border-indigo-400/50 bg-indigo-100 text-indigo-600 dark:border-indigo-500/50 dark:bg-indigo-900/30 dark:text-indigo-300'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-600'
                  }`}
                  title={data.users.join(', ')}
                >
                  <span>{emoji}</span>
                  <span>{data.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Read receipts (avatars of people who read) */}
          {isOwn && message.readBy.length > 0 && (
            <div className={`mt-1 flex justify-end -space-x-1.5`}>
              {message.readBy.slice(0, 5).map(r => (
                <div key={r.userId} title={`Seen by ${r.displayName}`}>
                  <Avatar src={r.avatarUrl} name={r.displayName} size="sm" />
                </div>
              ))}
              {message.readBy.length > 5 && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  +{message.readBy.length - 5}
                </span>
              )}
            </div>
          )}

          {/* Action buttons — inline above the bubble */}
          {showActions && !isEditing && (
            <div className={`flex items-center gap-0.5 rounded-xl border border-gray-200 bg-white p-0.5 shadow-lg animate-fade-in dark:border-gray-700 dark:bg-gray-800 ${isOwn ? 'self-end' : 'self-start'} mb-1`}>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-white"
                title="React"
              >
                <Smile className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onReply}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-white"
                title="Reply"
              >
                <Reply className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowContextMenu(!showContextMenu)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-white"
                title="More"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Emoji picker */}
          {showEmojiPicker && (
            <div className={`grid grid-cols-5 gap-0.5 rounded-xl border border-gray-200 bg-white p-2 shadow-xl animate-slide-in dark:border-gray-700 dark:bg-gray-800 ${isOwn ? 'self-end' : 'self-start'} mb-1`}>
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="rounded-lg p-1.5 text-lg transition-transform hover:scale-125 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Context menu */}
          {showContextMenu && (
            <div className={`z-10 min-w-[160px] rounded-xl border border-gray-200 bg-white py-1 shadow-xl animate-slide-in dark:border-gray-700 dark:bg-gray-800 ${isOwn ? 'self-end' : 'self-start'}`}>
              <button
                onClick={handleCopy}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
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
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit message
                  </button>
                  <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 transition-colors hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-700"
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
