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
      aria-label="Image preview — click anywhere to close"
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
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
  const [showTouchMenu, setShowTouchMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [copied, setCopied] = useState(false)
  const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchMoved = useRef(false)

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
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false)
        setShowEmojiPicker(false)
        setShowContextMenu(false)
        setShowForwardPicker(false)
        setShowTouchMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  // Long-press handlers for touch devices
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchMoved.current = false
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        e.preventDefault()
        setShowTouchMenu(true)
        // Haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(30)
      }
    }, 500)
  }, [])

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const closeTouchMenu = useCallback(() => {
    setShowTouchMenu(false)
    setShowForwardPicker(false)
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

        <div className="flex flex-col" ref={actionsRef}>
          {/* Sender name */}
          {showAvatar && !isOwn && (() => {
            const { displayName, matrixId } = parseDisplayName(message.senderName, message.senderId)
            return (
              <div className="mb-1 ml-1 flex items-baseline gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {displayName}
                </span>
                {matrixId && (
                  <span className="text-[10px] font-normal text-gray-200 dark:text-gray-800 truncate max-w-[180px] select-text" title={matrixId}>
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

          {/* Bubble wrapper — action buttons positioned relative to this */}
          <div className="relative">
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDoubleClick={() => {
              if (isOwn && !isEditing && message.type !== 'm.image' && message.type !== 'm.video' && message.type !== 'm.audio') {
                setIsEditing(true)
                setEditContent(message.content)
              }
            }}
            className={`rounded-2xl px-4 py-3 transition-shadow duration-150 ${isOwn ? 'cursor-pointer ' : ''}${
              isOwn
                ? 'bg-gradient-to-br from-indigo-500 via-indigo-500 to-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.35),0_1px_3px_rgba(99,102,241,0.2)] ring-1 ring-indigo-400/20 group-hover:shadow-[0_4px_12px_rgba(99,102,241,0.4),0_2px_4px_rgba(99,102,241,0.25)]'
                : 'bg-white text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-gray-200/50 group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.08)] group-hover:bg-gray-50/80 dark:bg-gray-800 dark:text-gray-100 dark:shadow-[0_2px_8px_rgba(0,0,0,0.4),0_1px_3px_rgba(0,0,0,0.3)] dark:ring-gray-700/50 dark:group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.5),0_2px_4px_rgba(0,0,0,0.35)] dark:group-hover:bg-gray-750'
            }`}
          >
            {/* Inline reply quote */}
            {message.replyToEvent && !isEditing && (
              <div className={`mb-2 rounded-lg px-3 py-1.5 text-xs ${
                isOwn
                  ? 'border-l-2 border-white/40 bg-black/15'
                  : 'border-l-2 border-gray-300 bg-gray-100/80 dark:border-gray-600 dark:bg-gray-700/50'
              }`}>
                <p className={`font-semibold ${isOwn ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                  {message.replyToEvent.senderName}
                </p>
                <p className={`truncate ${isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                  {message.replyToEvent.content}
                </p>
              </div>
            )}

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
                {message.content && message.type === 'm.image' && !/\.\w{2,5}$/i.test(message.content) && (
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

          {/* Action buttons — right side of bubble (desktop only, hidden on touch) */}
          <div className={`absolute top-1/2 -translate-y-1/2 z-10 hidden md:flex items-center gap-0.5 rounded-xl border border-gray-200/80 bg-white p-0.5 shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.06)] dark:border-gray-700 dark:bg-gray-800 dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-all duration-150 ${isOwn ? 'right-full mr-1' : 'left-full ml-1'} ${showActions && !isEditing ? 'opacity-100 translate-x-0' : 'opacity-0 pointer-events-none ' + (isOwn ? 'translate-x-1' : '-translate-x-1')}`}>
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

          {/* Emoji picker (desktop only) */}
          {showEmojiPicker && (
            <div className={`absolute bottom-full mb-1 z-20 hidden md:grid grid-cols-5 gap-0.5 rounded-xl border border-gray-200 bg-white p-2 shadow-xl animate-slide-in dark:border-gray-700 dark:bg-gray-800 ${isOwn ? 'right-0' : 'left-0'}`}>
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

          {/* Context menu (desktop only) */}
          {showContextMenu && (
            <div className={`absolute top-0 z-20 hidden md:block min-w-[160px] rounded-xl border border-gray-200 bg-white py-1 shadow-xl animate-slide-in dark:border-gray-700 dark:bg-gray-800 ${isOwn ? 'right-full mr-1' : 'left-full ml-1'}`}>
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

          {/* Forward room picker (desktop only) */}
          {showForwardPicker && !showTouchMenu && (
            <div className={`absolute top-0 z-20 hidden md:block min-w-[200px] max-h-[240px] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl animate-slide-in dark:border-gray-700 dark:bg-gray-800 ${isOwn ? 'right-full mr-1' : 'left-full ml-1'}`}>
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
          {/* Touch-friendly action menu (long-press on mobile) */}
          {showTouchMenu && createPortal(
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in"
              onClick={closeTouchMenu}
              onTouchEnd={(e) => { if (e.target === e.currentTarget) closeTouchMenu() }}
            >
              <div
                className="w-full max-w-lg animate-slide-in rounded-t-2xl bg-white pb-8 pt-2 dark:bg-gray-800"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Drag handle */}
                <div className="mb-3 flex justify-center">
                  <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
                </div>

                {/* Quick reactions row */}
                <div className="flex justify-center gap-1 px-4 pb-3">
                  {QUICK_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => { handleReaction(emoji); closeTouchMenu() }}
                      className="rounded-xl p-2.5 text-2xl transition-transform active:scale-90 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <div className="mx-4 border-t border-gray-200 dark:border-gray-700" />

                {/* Action buttons */}
                <div className="mt-1 px-2">
                  <button
                    onClick={() => { onReply(); closeTouchMenu() }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-gray-700 active:bg-gray-100 dark:text-gray-200 dark:active:bg-gray-700"
                  >
                    <Reply className="h-5 w-5 text-gray-400" />
                    Reply
                  </button>
                  <button
                    onClick={() => { handleCopy(); closeTouchMenu() }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-gray-700 active:bg-gray-100 dark:text-gray-200 dark:active:bg-gray-700"
                  >
                    <Copy className="h-5 w-5 text-gray-400" />
                    Copy text
                  </button>
                  <button
                    onClick={() => { handlePin(); closeTouchMenu() }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-gray-700 active:bg-gray-100 dark:text-gray-200 dark:active:bg-gray-700"
                  >
                    <Pin className="h-5 w-5 text-gray-400" />
                    {isPinned ? 'Unpin message' : 'Pin message'}
                  </button>
                  <button
                    onClick={() => setShowForwardPicker(true)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-gray-700 active:bg-gray-100 dark:text-gray-200 dark:active:bg-gray-700"
                  >
                    <Forward className="h-5 w-5 text-gray-400" />
                    Forward
                  </button>
                  {showForwardPicker && (
                    <div className="mb-2 ml-12 max-h-[160px] overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                      {rooms
                        .filter(r => r.roomId !== roomId)
                        .map(r => (
                          <button
                            key={r.roomId}
                            onClick={() => { handleForward(r.roomId); closeTouchMenu() }}
                            className="flex w-full items-center px-4 py-2.5 text-sm text-gray-700 active:bg-gray-200 dark:text-gray-200 dark:active:bg-gray-700"
                          >
                            <span className="truncate">{r.name}</span>
                          </button>
                        ))}
                    </div>
                  )}
                  {isOwn && (
                    <>
                      <button
                        onClick={() => {
                          setIsEditing(true)
                          setEditContent(message.content)
                          closeTouchMenu()
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-gray-700 active:bg-gray-100 dark:text-gray-200 dark:active:bg-gray-700"
                      >
                        <Pencil className="h-5 w-5 text-gray-400" />
                        Edit message
                      </button>
                      <div className="mx-4 border-t border-gray-200 dark:border-gray-700" />
                      <button
                        onClick={() => { handleDelete(); closeTouchMenu() }}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-red-500 active:bg-gray-100 dark:text-red-400 dark:active:bg-gray-700"
                      >
                        <Trash2 className="h-5 w-5" />
                        Delete message
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )}
          </div>{/* end bubble wrapper */}

          {/* Reactions */}
          {message.reactions.size > 0 && (
            <div className={`mt-1 flex flex-wrap gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {Array.from(message.reactions.entries()).map(([emoji, data]) => (
                <div key={emoji} className="group/reaction relative">
                  <button
                    onClick={() => handleReaction(emoji)}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all hover:scale-105 ${
                      data.includesMe
                        ? 'border-indigo-400/50 bg-indigo-100 text-indigo-600 shadow-[0_1px_3px_rgba(99,102,241,0.2)] dark:border-indigo-500/50 dark:bg-indigo-900/30 dark:text-indigo-300'
                        : 'border-gray-200 bg-white text-gray-600 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:border-gray-300 hover:shadow-[0_2px_6px_rgba(0,0,0,0.1)] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] dark:hover:border-gray-600'
                    }`}
                  >
                    <span>{emoji}</span>
                    <span>{data.count}</span>
                  </button>
                  {/* Hover tooltip showing who reacted */}
                  <div className={`absolute bottom-full mb-1.5 hidden group-hover/reaction:block z-30 ${isOwn ? 'right-0' : 'left-0'}`}>
                    <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-800 whitespace-nowrap">
                      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{emoji} {data.count > 1 ? `${data.count} people` : '1 person'}</p>
                      {data.users.map((userName, i) => (
                        <p key={i} className="text-xs text-gray-700 dark:text-gray-300">{userName}</p>
                      ))}
                    </div>
                  </div>
                </div>
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
