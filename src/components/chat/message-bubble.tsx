'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore, type MatrixMessage } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'
import { format } from 'date-fns'
import DOMPurify from 'dompurify'
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
  Pin,
  Forward,
  Loader2,
} from 'lucide-react'
import { LinkPreview } from './link-preview'

/**
 * Decrypt an encrypted Matrix media attachment using Web Crypto API.
 */
async function decryptMediaAttachment(
  url: string,
  encryptedFile: NonNullable<MatrixMessage['encryptedFile']>,
  mimetype?: string
): Promise<string> {
  const response = await fetch(url)
  const ciphertext = await response.arrayBuffer()

  // Import the AES key from JWK
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: encryptedFile.key.kty,
      alg: 'A256CTR',
      k: encryptedFile.key.k,
      key_ops: ['decrypt'],
      ext: true,
    },
    { name: 'AES-CTR', length: 256 },
    false,
    ['decrypt']
  )

  // Decode the IV from unpadded base64
  const ivBase64 = encryptedFile.iv.replace(/-/g, '+').replace(/_/g, '/')
  const ivPadded = ivBase64 + '='.repeat((4 - (ivBase64.length % 4)) % 4)
  const ivBytes = Uint8Array.from(atob(ivPadded), c => c.charCodeAt(0))

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: ivBytes, length: 64 },
    cryptoKey,
    ciphertext
  )

  // Create blob URL
  const blob = new Blob([plaintext], { type: mimetype || 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

/**
 * Render rich text from Matrix formatted_body (HTML) or parse markdown from plain text.
 */
function renderRichContent(content: string, formattedContent: string | null): string {
  // If Matrix HTML formatted_body is available, sanitize and use it
  if (formattedContent) {
    return DOMPurify.sanitize(formattedContent, {
      ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'del', 's', 'strike', 'code', 'pre', 'br', 'p', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'sup', 'sub', 'hr', 'mx-reply'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'data-mx-color', 'data-mx-bg-color', 'class'],
      ADD_ATTR: ['target'],
    })
  }

  // Parse markdown from plain text
  let html = escapeHtml(content)

  // Code blocks (```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
  // Italic (*text* or _text_)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
  // Strikethrough (~~text~~)
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
  // Links (auto-detect URLs)
  html = html.replace(
    /(?<!")https?:\/\/[^\s<]+/g,
    '<a href="$&" target="_blank" rel="noopener noreferrer">$&</a>'
  )

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'del', 's', 'code', 'pre', 'br', 'a', 'blockquote', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<]+/)
  return match ? match[0] : null
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface MessageBubbleProps {
  message: MatrixMessage
  isOwn: boolean
  showAvatar: boolean
  onReply: () => void
  roomId: string
  isPinned?: boolean
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏', '💯', '✅']

export function MessageBubble({ message, isOwn, showAvatar, onReply, roomId, isPinned }: MessageBubbleProps) {
  const user = useAuthStore(s => s.user)
  const { sendReaction, editMessage, redactMessage, pinMessage, unpinMessage, forwardMessage, rooms } = useChatStore()
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [showForwardPicker, setShowForwardPicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [copied, setCopied] = useState(false)
  const [decryptedMediaUrl, setDecryptedMediaUrl] = useState<string | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  // Decrypt encrypted media attachments
  useEffect(() => {
    if (!message.encryptedFile || !message.mediaUrl) return
    let cancelled = false
    decryptMediaAttachment(
      message.mediaUrl,
      message.encryptedFile,
      message.mediaInfo?.mimetype
    ).then(url => {
      if (!cancelled) setDecryptedMediaUrl(url)
    }).catch(err => {
      console.error('Failed to decrypt media:', err)
    })
    return () => {
      cancelled = true
      if (decryptedMediaUrl) URL.revokeObjectURL(decryptedMediaUrl)
    }
  }, [message.eventId, message.encryptedFile, message.mediaUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Use decrypted URL for encrypted media, otherwise use direct URL
  const effectiveMediaUrl = message.encryptedFile ? decryptedMediaUrl : message.mediaUrl

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false)
        setShowEmojiPicker(false)
        setShowContextMenu(false)
        setShowForwardPicker(false)
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

  const handlePin = async () => {
    try {
      if (isPinned) {
        await unpinMessage(roomId, message.eventId)
      } else {
        await pinMessage(roomId, message.eventId)
      }
    } catch (err) {
      console.error('Failed to pin/unpin message:', err)
    }
    setShowContextMenu(false)
    setShowActions(false)
  }

  const handleForward = async (toRoomId: string) => {
    try {
      await forwardMessage(roomId, message.eventId, toRoomId)
    } catch (err) {
      console.error('Failed to forward message:', err)
    }
    setShowForwardPicker(false)
    setShowContextMenu(false)
    setShowActions(false)
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

          {/* Pin indicator */}
          {isPinned && (
            <div className={`mb-1 flex items-center gap-1 text-xs text-amber-500 dark:text-amber-400 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <Pin className="h-3 w-3" />
              <span>Pinned</span>
            </div>
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
            ) : (message.mediaUrl || effectiveMediaUrl) ? (
              <div>
                {message.type === 'm.image' ? (
                  effectiveMediaUrl ? (
                    <img
                      src={effectiveMediaUrl}
                      alt="Shared image"
                      className="max-h-64 rounded-xl object-cover shadow-sm"
                      style={{
                        width: message.mediaInfo?.w ? Math.min(message.mediaInfo.w, 400) : undefined,
                      }}
                    />
                  ) : (
                    <div className="flex h-32 w-48 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  )
                ) : message.type === 'm.video' ? (
                  effectiveMediaUrl ? (
                    <video controls className="max-h-64 rounded-xl shadow-sm">
                      <source src={effectiveMediaUrl} type={message.mediaInfo?.mimetype} />
                    </video>
                  ) : (
                    <div className="flex h-32 w-48 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  )
                ) : message.type === 'm.audio' ? (
                  effectiveMediaUrl ? (
                    <audio controls className="w-full">
                      <source src={effectiveMediaUrl} type={message.mediaInfo?.mimetype} />
                    </audio>
                  ) : (
                    <div className="flex h-8 w-48 items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  )
                ) : (
                  <a
                    href={effectiveMediaUrl || message.mediaUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline"
                  >
                    {message.content}
                  </a>
                )}
                {message.content && message.type === 'm.image' && (
                  <p className="mt-2 text-sm">{message.content}</p>
                )}
              </div>
            ) : (
              <div
                className="rich-content text-[15px] leading-relaxed whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{
                  __html: renderRichContent(message.content, message.formattedContent),
                }}
              />
            )}

            {(() => {
              const url = extractFirstUrl(message.content)
              return url ? <LinkPreview url={url} /> : null
            })()}

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
              <button
                onClick={handlePin}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Pin className="h-4 w-4" />
                {isPinned ? 'Unpin message' : 'Pin message'}
              </button>
              <button
                onClick={() => {
                  setShowForwardPicker(!showForwardPicker)
                  setShowContextMenu(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Forward className="h-4 w-4" />
                Forward
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

          {/* Forward room picker */}
          {showForwardPicker && (
            <div className={`z-10 min-w-[200px] max-h-[240px] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl animate-slide-in dark:border-gray-700 dark:bg-gray-800 ${isOwn ? 'self-end' : 'self-start'}`}>
              <p className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Forward to...</p>
              {rooms
                .filter(r => r.roomId !== roomId)
                .map(r => (
                  <button
                    key={r.roomId}
                    onClick={() => handleForward(r.roomId)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <span className="truncate">{r.name}</span>
                  </button>
                ))}
              {rooms.filter(r => r.roomId !== roomId).length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No other rooms available</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
