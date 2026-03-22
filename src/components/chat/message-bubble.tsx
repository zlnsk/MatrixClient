'use client'

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { createPortal } from 'react-dom'
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
import { decryptMediaAttachment, fetchAuthenticatedMedia } from '@/lib/matrix/media'

/**
 * Render rich text from Matrix formatted_body (HTML) or parse markdown from plain text.
 */
// Shared DOMPurify config — restrict to safe subset of HTML
const PURIFY_CONFIG_FORMATTED = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'del', 's', 'strike', 'code', 'pre', 'br', 'p', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'sup', 'sub', 'hr', 'mx-reply'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'data-mx-color', 'data-mx-bg-color', 'class'],
  ADD_ATTR: ['target'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'svg', 'math'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style'],
  ALLOW_DATA_ATTR: false,
}

const PURIFY_CONFIG_PLAIN = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'del', 's', 'code', 'pre', 'br', 'a', 'blockquote', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'svg', 'math'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style'],
  ALLOW_DATA_ATTR: false,
}

/**
 * Extract the clean display name, stripping any Matrix ID disambiguation
 * that the SDK appends (e.g. "Łukasz (@signal_xxx:server.com)" → "Łukasz").
 * Returns { displayName, matrixId } where matrixId is the raw @user:server part if present.
 */
function parseDisplayName(senderName: string, senderId: string): { displayName: string; matrixId: string | null } {
  // If name contains " (@user:server)", strip it
  const match = senderName.match(/^(.+?)\s*\(@[^)]+\)$/)
  if (match) {
    return { displayName: match[1].trim(), matrixId: senderId }
  }
  // If name is just the raw Matrix ID, show it shortened
  if (senderName === senderId || senderName.startsWith('@')) {
    const localpart = senderId.replace(/^@/, '').split(':')[0]
    // Show clean localpart, full ID as subtitle
    return { displayName: localpart, matrixId: senderId }
  }
  // Clean name, only show Matrix ID if it's a bridged/bot user (contains UUID-like patterns)
  const hasUuid = /[0-9a-f]{8}-[0-9a-f]{4}/.test(senderId)
  return { displayName: senderName, matrixId: hasUuid ? senderId : null }
}

function renderRichContent(content: string, formattedContent: string | null): string {
  // If Matrix HTML formatted_body is available, sanitize and use it
  if (formattedContent) {
    return DOMPurify.sanitize(formattedContent, PURIFY_CONFIG_FORMATTED)
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

  return DOMPurify.sanitize(html, PURIFY_CONFIG_PLAIN)
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

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-pointer animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-label="Image preview"
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        aria-label="Close preview"
      >
        <X className="h-6 w-6" />
      </button>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onClick={e => e.stopPropagation()}
        onLoad={() => setLoaded(true)}
      />
    </div>,
    document.body
  )
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

export const MessageBubble = memo(function MessageBubble({ message, isOwn, showAvatar, onReply, roomId, isPinned }: MessageBubbleProps) {
  const user = useAuthStore(s => s.user)
  const { sendReaction, editMessage, redactMessage, pinMessage, unpinMessage, forwardMessage, rooms } = useChatStore()
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [showForwardPicker, setShowForwardPicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [copied, setCopied] = useState(false)
  const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  // Fetch all media via authenticated endpoint (handles both encrypted and unencrypted)
  useEffect(() => {
    if (!message.mediaUrl) return
    let cancelled = false

    async function loadMedia() {
      try {
        let url: string
        if (message.encryptedFile) {
          // Encrypted media: fetch with auth, then decrypt
          url = await decryptMediaAttachment(
            message.encryptedFile.url,
            message.encryptedFile,
            message.mediaInfo?.mimetype
          )
        } else {
          // Unencrypted media: fetch with auth, return blob URL
          url = await fetchAuthenticatedMedia(message.mediaUrl!, message.mediaInfo?.mimetype)
        }
        if (!cancelled) setMediaBlobUrl(url)
      } catch (err) {
        console.error('Failed to load media:', err)
      }
    }
    loadMedia()

    return () => { cancelled = true }
  }, [message.eventId, message.encryptedFile, message.mediaUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveMediaUrl = mediaBlobUrl

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
        <div className={`${isOwn ? 'mr-12' : 'ml-12'} rounded-2xl bg-gray-100 dark:bg-gray-800/50 px-4 py-2 shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.3)]`}>
          <p className="text-sm italic text-gray-400 dark:text-gray-500">This message was deleted</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`message-bubble-container group flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-4' : 'mt-0.5'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        if (!showEmojiPicker && !showContextMenu) setShowActions(false)
      }}
    >
      <div className={`flex max-w-sm md:max-w-md lg:max-w-lg ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
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
          {showAvatar && !isOwn && (() => {
            const { displayName, matrixId } = parseDisplayName(message.senderName, message.senderId)
            return (
              <div className="mb-1 ml-1 flex items-baseline gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {displayName}
                </span>
                {matrixId && (
                  <span className="text-[10px] font-normal text-gray-400/70 dark:text-gray-600 truncate max-w-[180px]" title={matrixId}>
                    {matrixId}
                  </span>
                )}
              </div>
            )
          })()}

          {/* Pin indicator */}
          {isPinned && (
            <div className={`mb-1 flex items-center gap-1 text-xs text-amber-500 dark:text-amber-400 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <Pin className="h-3 w-3" />
              <span>Pinned</span>
            </div>
          )}

          {/* Bubble */}
          <div
            className={`rounded-2xl px-4 py-3 transition-all duration-200 ${
              isOwn
                ? 'bg-gradient-to-br from-indigo-500 via-indigo-500 to-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.35),0_1px_3px_rgba(99,102,241,0.2)] ring-1 ring-indigo-400/20 group-hover:shadow-[0_4px_12px_rgba(99,102,241,0.4),0_2px_4px_rgba(99,102,241,0.25)]'
                : 'bg-white text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-gray-200/50 group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.08)] group-hover:bg-gray-50/80 dark:bg-gray-800 dark:text-gray-100 dark:shadow-[0_2px_8px_rgba(0,0,0,0.4),0_1px_3px_rgba(0,0,0,0.3)] dark:ring-gray-700/50 dark:group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.5),0_2px_4px_rgba(0,0,0,0.35)] dark:group-hover:bg-gray-750'
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
                    <>
                      <img
                        src={effectiveMediaUrl}
                        alt={message.content || 'Shared image'}
                        className="max-w-full rounded-xl object-contain shadow-sm cursor-pointer transition-opacity hover:opacity-90"
                        style={{
                          maxHeight: 480,
                          width: message.mediaInfo?.w ? Math.min(message.mediaInfo.w, 400) : undefined,
                        }}
                        onClick={() => setLightboxOpen(true)}
                      />
                      {lightboxOpen && (
                        <ImageLightbox
                          src={effectiveMediaUrl}
                          alt={message.content || 'Shared image'}
                          onClose={() => setLightboxOpen(false)}
                        />
                      )}
                    </>
                  ) : (
                    <div className="flex h-32 w-48 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  )
                ) : message.type === 'm.video' ? (
                  effectiveMediaUrl ? (
                    <video controls className="max-w-full rounded-xl shadow-sm" style={{ maxHeight: 480 }}>
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
                {message.content && message.type === 'm.image' && !/^(image\.\w+|pasted-image-\d+\.\w+)$/i.test(message.content) && (
                  <p className="mt-2 text-sm">{message.content}</p>
                )}
              </div>
            ) : message.msgtype === 'm.emote' ? (
              <div className="rich-content text-[15px] leading-relaxed whitespace-pre-wrap break-words italic">
                <span className="font-medium not-italic">{message.senderName}</span>{' '}
                <span
                  dangerouslySetInnerHTML={{
                    __html: renderRichContent(message.content, message.formattedContent),
                  }}
                />
              </div>
            ) : (
              <div
                className={`rich-content text-[15px] leading-relaxed whitespace-pre-wrap break-words ${message.msgtype === 'm.notice' ? 'italic opacity-70' : ''}`}
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
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all hover:scale-105 ${
                    data.includesMe
                      ? 'border-indigo-400/50 bg-indigo-100 text-indigo-600 shadow-[0_1px_3px_rgba(99,102,241,0.2)] dark:border-indigo-500/50 dark:bg-indigo-900/30 dark:text-indigo-300'
                      : 'border-gray-200 bg-white text-gray-600 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:border-gray-300 hover:shadow-[0_2px_6px_rgba(0,0,0,0.1)] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] dark:hover:border-gray-600'
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

          {/* Action buttons — floating above the bubble */}
          <div className={`absolute -top-8 z-10 flex items-center gap-0.5 rounded-xl border border-gray-200/80 bg-white p-0.5 shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.06)] dark:border-gray-700 dark:bg-gray-800 dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-all duration-150 ${isOwn ? 'right-0' : 'left-0'} ${showActions && !isEditing ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'}`}>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-white"
                title="React"
                aria-label="Add reaction"
              >
                <Smile className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onReply}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-white"
                title="Reply"
                aria-label="Reply to message"
              >
                <Reply className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowContextMenu(!showContextMenu)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-white"
                title="More"
                aria-label="More actions"
                aria-haspopup="menu"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>

          {/* Emoji picker */}
          {showEmojiPicker && (
            <div className={`absolute -top-20 z-20 grid grid-cols-5 gap-0.5 rounded-xl border border-gray-200 bg-white p-2 shadow-xl animate-slide-in dark:border-gray-700 dark:bg-gray-800 ${isOwn ? 'right-0' : 'left-0'}`}>
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
            <div className={`absolute top-0 z-20 min-w-[160px] rounded-xl border border-gray-200 bg-white py-1 shadow-xl animate-slide-in dark:border-gray-700 dark:bg-gray-800 ${isOwn ? 'right-full mr-1' : 'left-full ml-1'}`}>
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
            <div className={`absolute top-0 z-20 min-w-[200px] max-h-[240px] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl animate-slide-in dark:border-gray-700 dark:bg-gray-800 ${isOwn ? 'right-full mr-1' : 'left-full ml-1'}`}>
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
}, (prevProps, nextProps) => {
  // Custom comparator for React.memo — return true if props are equal (skip re-render)
  const prevMsg = prevProps.message
  const nextMsg = nextProps.message
  return (
    prevMsg.eventId === nextMsg.eventId &&
    prevMsg.content === nextMsg.content &&
    prevMsg.formattedContent === nextMsg.formattedContent &&
    prevMsg.isEdited === nextMsg.isEdited &&
    prevMsg.isRedacted === nextMsg.isRedacted &&
    prevMsg.reactions.size === nextMsg.reactions.size &&
    prevMsg.readBy.length === nextMsg.readBy.length &&
    prevMsg.status === nextMsg.status &&
    prevMsg.mediaUrl === nextMsg.mediaUrl &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.showAvatar === nextProps.showAvatar &&
    prevProps.roomId === nextProps.roomId &&
    prevProps.isPinned === nextProps.isPinned
  )
})
