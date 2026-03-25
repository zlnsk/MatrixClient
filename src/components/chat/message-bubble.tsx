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
  Play,
  Pause,
  AlertCircle,
  RotateCcw,
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
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'svg', 'math', 'foreignobject', 'annotation-xml'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style', 'xlink:href'],
  ALLOW_DATA_ATTR: false,
}

const PURIFY_CONFIG_PLAIN = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'del', 's', 'code', 'pre', 'br', 'a', 'blockquote', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'svg', 'math', 'foreignobject', 'annotation-xml'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style'],
  ALLOW_DATA_ATTR: false,
}

/**
 * Extract the clean display name, stripping any Matrix ID disambiguation
 * that the SDK appends (e.g. "Łukasz (@signal_xxx:server.com)" → "Łukasz").
 * Returns { displayName, matrixId } where matrixId is the raw @user:server part if present.
 */
/** Highlight search term in HTML string — only highlights text outside of tags */
function applySearchHighlight(html: string, term: string): string {
  if (!term || term.length < 2) return html
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  // Split by HTML tags to avoid highlighting inside tags/attributes
  return html.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag
    return text.replace(regex, '<mark class="rounded-sm bg-yellow-300/80 text-inherit dark:bg-yellow-500/40">$1</mark>')
  })
}

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
  // Clean name — hide Matrix ID for bridge users (signal_, telegram_, etc.) since it's just noise
  return { displayName: senderName, matrixId: null }
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
  searchHighlight?: string
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏', '💯', '✅']

/** Custom inline voice/audio player that works inside colored bubbles */
function VoicePlayer({ src, isOwn, duration: durationMs }: { src: string; isOwn: boolean; duration?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(() => (durationMs ? durationMs / 1000 : 0))

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => {
      if (a.duration && isFinite(a.duration)) {
        setProgress(a.currentTime / a.duration)
        setDuration(a.duration)
      }
    }
    const onEnd = () => { setPlaying(false); setProgress(0) }
    const onLoaded = () => { if (a.duration && isFinite(a.duration)) setDuration(a.duration) }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('ended', onEnd)
    a.addEventListener('loadedmetadata', onLoaded)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('ended', onEnd)
      a.removeEventListener('loadedmetadata', onLoaded)
    }
  }, [])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play(); setPlaying(true) }
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    a.currentTime = ratio * a.duration
    setProgress(ratio)
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const textColor = isOwn ? 'text-white' : 'text-m3-on-surface dark:text-m3-on-surface'
  const subColor = isOwn ? 'text-white/70' : 'text-m3-on-surface-variant dark:text-m3-outline'
  const barBg = isOwn ? 'bg-white/30' : 'bg-m3-outline-variant dark:bg-m3-outline'
  const barFg = isOwn ? 'bg-white' : 'bg-m3-primary dark:bg-m3-primary'

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button onClick={toggle} className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-m3-surface-container hover:bg-m3-surface-container-high dark:bg-m3-surface-container-highest dark:hover:bg-m3-outline-variant'} transition-colors`}>
        {playing
          ? <Pause className={`h-4 w-4 ${textColor}`} />
          : <Play className={`h-4 w-4 ${textColor} ml-0.5`} />
        }
      </button>
      <div className="flex flex-1 flex-col gap-1">
        <div className={`h-1 w-full cursor-pointer rounded-full ${barBg}`} onClick={seek}>
          <div className={`h-full rounded-full ${barFg} transition-all`} style={{ width: `${progress * 100}%` }} />
        </div>
        <span className={`text-[11px] ${subColor}`}>
          {playing ? fmt(progress * duration) : fmt(duration)}
        </span>
      </div>
    </div>
  )
}

export const MessageBubble = memo(function MessageBubble({ message, isOwn, showAvatar, onReply, roomId, isPinned, searchHighlight }: MessageBubbleProps) {
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
  const bubbleRef = useRef<HTMLDivElement>(null)
  const touchMenuRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchMoved = useRef(false)

  // Compute portal positions for emoji picker and context menu
  const getMenuPosition = useCallback(() => {
    if (!bubbleRef.current) return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
    return bubbleRef.current.getBoundingClientRect()
  }, [])

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

    return () => {
      cancelled = true
      // Revoke blob URL to free memory when component unmounts or media changes
      if (mediaBlobUrl && mediaBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(mediaBlobUrl)
      }
    }
  }, [message.eventId, message.encryptedFile, message.mediaUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveMediaUrl = mediaBlobUrl

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node
      // Don't close desktop menus if click is inside actions area
      if (actionsRef.current && !actionsRef.current.contains(target)) {
        setShowActions(false)
        setShowEmojiPicker(false)
        setShowContextMenu(false)
        setShowForwardPicker(false)
      }
      // Touch menu is a portal — check its own ref separately
      // Don't close it here; it has its own backdrop dismiss handler
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
        // Haptic feedback — native Android bridge or Web Vibration API
        try { (window as any).Android?.hapticHeavy() } catch (_) {}
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
        return <Clock className={`${iconClass} text-m3-outline dark:text-m3-on-surface-variant animate-pulse`} />
      case 'failed':
        return <AlertCircle className={`${iconClass} text-m3-error`} />
      case 'sent':
        return <Check className={`${iconClass} text-m3-outline dark:text-m3-on-surface-variant`} />
      case 'delivered':
        return <CheckCheck className={`${iconClass} text-m3-outline dark:text-m3-on-surface-variant`} />
      case 'read':
        return <CheckCheck className={`${iconClass} text-green-500`} />
      case 'failed':
        return null // Handled by the failed banner below
      default:
        return <Send className={`${iconClass} text-m3-outline dark:text-m3-on-surface-variant`} />
    }
  }

  if (message.isStateEvent) {
    return (
      <div className="flex justify-center my-2">
        <span className="rounded-full bg-m3-surface-container px-4 py-1.5 text-xs text-m3-on-surface-variant shadow-sm dark:bg-m3-surface-container-high dark:text-m3-outline">
          {message.content}
        </span>
      </div>
    )
  }

  if (message.isRedacted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
        <div className={`${isOwn ? 'mr-12' : 'ml-12'} rounded-2xl bg-m3-surface-container dark:bg-m3-surface-container-high/50 px-4 py-2`}>
          <p className="text-sm italic text-m3-outline dark:text-m3-on-surface-variant">This message was deleted</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`message-bubble-container group flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-4' : 'mt-0.5'} relative ${showActions || showEmojiPicker || showContextMenu ? 'z-30' : 'z-0'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        if (!showEmojiPicker && !showContextMenu) setShowActions(false)
      }}
    >
      <div className={`flex max-w-[85vw] sm:max-w-sm md:max-w-md lg:max-w-lg ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
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
                <span className="text-[15px] font-bold text-m3-on-surface md:text-sm dark:text-m3-on-surface-variant">
                  {displayName}
                </span>
                {matrixId && (
                  <span className="text-xs font-normal text-m3-on-surface-variant md:text-[10px] dark:text-m3-outline truncate max-w-[180px] select-text" title={matrixId}>
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
          <div className="relative" ref={bubbleRef}>
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
            className={`rounded-[20px] overflow-hidden ${message.type === 'm.image' || message.type === 'm.video' ? 'w-fit border border-m3-outline-variant/30 p-2 dark:border-m3-outline-variant/20' : 'px-4 py-2.5'} ${isOwn ? 'cursor-pointer ' : ''}${
              isOwn
                ? message.status === 'failed'
                  ? 'bg-m3-primary/70 text-white ring-2 ring-red-400/50'
                  : message.status === 'sending'
                    ? 'bg-m3-primary/85 text-white'
                    : 'bg-m3-primary text-white'
                : 'border border-m3-outline-variant/50 bg-m3-surface-container-lowest text-m3-on-surface dark:border-m3-outline-variant/30 dark:bg-m3-surface-container-high dark:text-m3-on-surface'
            }`}
          >
            {/* Inline reply quote */}
            {message.replyToEvent && !isEditing && (
              <div className={`mb-2 rounded-lg px-3 py-1.5 text-xs ${(message.type === 'm.image' || message.type === 'm.video') ? 'mx-3 mt-3 ' : ''}${
                isOwn
                  ? 'border-l-2 border-white/60 bg-white/20'
                  : 'border-l-2 border-m3-outline bg-m3-surface-container/80 dark:border-m3-outline dark:bg-m3-surface-container-highest/50'
              }`}>
                <p className={`font-semibold ${isOwn ? 'text-white' : 'text-m3-on-surface dark:text-m3-on-surface-variant'}`}>
                  {message.replyToEvent.senderName}
                </p>
                <p className={`truncate ${isOwn ? 'text-white/80' : 'text-m3-on-surface-variant dark:text-m3-outline'}`}>
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
                <button onClick={handleEdit} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-green-300 transition-colors hover:bg-white/30 hover:text-green-200" title="Save">
                  <Check className="h-5 w-5" />
                </button>
                <button onClick={() => setIsEditing(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-red-300 transition-colors hover:bg-white/30 hover:text-red-200" title="Cancel">
                  <X className="h-5 w-5" />
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
                        className="block min-w-[200px] max-w-full rounded-xl object-contain cursor-pointer transition-opacity hover:opacity-90"
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
                    <div className="flex h-32 w-48 items-center justify-center rounded-xl bg-m3-surface-container dark:bg-m3-surface-container-highest">
                      <Loader2 className="h-6 w-6 animate-spin text-m3-outline" />
                    </div>
                  )
                ) : message.type === 'm.video' ? (
                  effectiveMediaUrl ? (
                    <video controls className="block min-w-[200px] max-w-full rounded-xl" style={{ maxHeight: 480 }}>
                      <source src={effectiveMediaUrl} type={message.mediaInfo?.mimetype} />
                    </video>
                  ) : (
                    <div className="flex h-32 w-48 items-center justify-center rounded-xl bg-m3-surface-container dark:bg-m3-surface-container-highest">
                      <Loader2 className="h-6 w-6 animate-spin text-m3-outline" />
                    </div>
                  )
                ) : message.type === 'm.audio' ? (
                  effectiveMediaUrl ? (
                    <VoicePlayer src={effectiveMediaUrl} isOwn={isOwn} duration={message.mediaInfo?.duration} />
                  ) : (
                    <div className="flex h-8 w-48 items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-m3-outline" />
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
                  <p className="px-3 py-1.5 text-sm">{message.content}</p>
                )}
              </div>
            ) : message.msgtype === 'm.emote' ? (
              <div className="rich-content text-base leading-relaxed md:text-[15px] whitespace-pre-wrap break-words italic">
                <span className="font-medium not-italic">{message.senderName}</span>{' '}
                <span
                  dangerouslySetInnerHTML={{
                    __html: applySearchHighlight(renderRichContent(message.content, message.formattedContent), searchHighlight || ''),
                  }}
                />
              </div>
            ) : (
              <div
                className={`rich-content text-base leading-relaxed md:text-[15px] whitespace-pre-wrap break-words ${message.msgtype === 'm.notice' ? 'italic opacity-70' : ''}`}
                dangerouslySetInnerHTML={{
                  __html: applySearchHighlight(renderRichContent(message.content, message.formattedContent), searchHighlight || ''),
                }}
              />
            )}

            {(() => {
              const url = extractFirstUrl(message.content)
              return url ? <LinkPreview url={url} /> : null
            })()}

            {/* Timestamp + status */}
            <div className={`mt-1 flex items-center gap-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <span className={`text-xs ${isOwn ? 'text-white/70' : 'text-m3-outline dark:text-m3-on-surface-variant'}`}>
                {format(new Date(message.timestamp), 'HH:mm')}
              </span>
              {message.isEdited && (
                <span className={`text-xs ${isOwn ? 'text-white/70' : 'text-m3-outline dark:text-m3-on-surface-variant'}`}>
                  (edited)
                </span>
              )}
              <StatusIcon />
            </div>

            {/* Failed to send indicator with retry */}
            {message.status === 'failed' && (
              <div className="mt-1.5 flex items-center gap-2 text-xs">
                <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                <span className="text-red-300">Failed to send</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    useChatStore.getState().retryMessage(message.eventId)
                  }}
                  className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs text-white transition-colors hover:bg-white/30"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Action buttons — right side of bubble (desktop only, hidden on touch) */}
          <div className={`absolute top-1/2 -translate-y-1/2 z-10 hidden md:flex items-center gap-0.5 rounded-xl border border-m3-outline-variant/80 bg-m3-surface-container-lowest p-0.5 shadow-lg dark:border-m3-outline-variant dark:bg-m3-surface-container-high transition-all duration-150 ${isOwn ? 'right-full mr-1' : 'left-full ml-1'} ${showActions && !isEditing ? 'opacity-100 translate-x-0' : 'opacity-0 pointer-events-none ' + (isOwn ? 'translate-x-1' : '-translate-x-1')}`}>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="rounded-lg p-2 text-m3-outline transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest dark:hover:text-white"
                title="React"
                aria-label="Add reaction"
              >
                <Smile className="h-5 w-5" />
              </button>
              <button
                onClick={onReply}
                className="rounded-lg p-2 text-m3-outline transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest dark:hover:text-white"
                title="Reply"
                aria-label="Reply to message"
              >
                <Reply className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowContextMenu(!showContextMenu)}
                className="rounded-lg p-2 text-m3-outline transition-colors hover:bg-m3-surface-container hover:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest dark:hover:text-white"
                title="More"
                aria-label="More actions"
                aria-haspopup="menu"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>

          {/* Emoji picker (desktop only) — rendered via portal to escape scroll overflow */}
          {showEmojiPicker && (() => {
            const rect = getMenuPosition()
            const pickerStyle: React.CSSProperties = {
              position: 'fixed',
              top: Math.max(8, rect.top - 8),
              transform: 'translateY(-100%)',
              zIndex: 9999,
              ...(isOwn ? { right: window.innerWidth - rect.right } : { left: rect.left }),
            }
            return createPortal(
              <div
                className="hidden md:grid grid-cols-5 gap-1 rounded-2xl border border-m3-outline-variant bg-m3-surface-container-lowest p-2.5 shadow-xl animate-slide-in dark:border-m3-outline-variant dark:bg-m3-surface-container-high"
                style={pickerStyle}
              >
                {QUICK_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-transform hover:scale-125 hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-highest"
                  >
                    {emoji}
                  </button>
                ))}
              </div>,
              document.body
            )
          })()}

          {/* Context menu (desktop only) — rendered via portal to escape scroll overflow */}
          {showContextMenu && (() => {
            const rect = getMenuPosition()
            const menuStyle: React.CSSProperties = {
              position: 'fixed',
              top: rect.top,
              zIndex: 9999,
              ...(isOwn ? { right: window.innerWidth - rect.left + 4 } : { left: rect.right + 4 }),
            }
            return createPortal(
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => { setShowContextMenu(false); setShowActions(false) }} />
                <div className="hidden md:block min-w-[160px] rounded-xl border border-m3-outline-variant bg-m3-surface-container-lowest py-1 shadow-xl animate-slide-in dark:border-m3-outline-variant dark:bg-m3-surface-container-high" style={menuStyle}>
                  <button
                    onClick={handleCopy}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copied!' : 'Copy text'}
                  </button>
                  <button
                    onClick={handlePin}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest"
                  >
                    <Pin className="h-4 w-4" />
                    {isPinned ? 'Unpin message' : 'Pin message'}
                  </button>
                  <button
                    onClick={() => {
                      setShowForwardPicker(!showForwardPicker)
                      setShowContextMenu(false)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest"
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
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit message
                      </button>
                      <div className="my-1 border-t border-m3-outline-variant dark:border-m3-outline-variant" />
                      <button
                        onClick={handleDelete}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-m3-error transition-colors hover:bg-m3-surface-container dark:text-m3-error dark:hover:bg-m3-surface-container-highest"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete message
                      </button>
                    </>
                  )}
                </div>
              </>,
              document.body
            )
          })()}

          {/* Forward room picker (desktop only) — rendered via portal */}
          {showForwardPicker && !showTouchMenu && (() => {
            const rect = getMenuPosition()
            const fwdStyle: React.CSSProperties = {
              position: 'fixed',
              top: rect.top,
              zIndex: 9999,
              ...(isOwn ? { right: window.innerWidth - rect.left + 4 } : { left: rect.right + 4 }),
            }
            return createPortal(
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => { setShowForwardPicker(false); setShowActions(false) }} />
                <div className="hidden md:block min-w-[200px] max-h-[240px] overflow-y-auto rounded-xl border border-m3-outline-variant bg-m3-surface-container-lowest py-1 shadow-xl animate-slide-in dark:border-m3-outline-variant dark:bg-m3-surface-container-high" style={fwdStyle}>
                  <p className="px-3 py-1.5 text-xs font-medium text-m3-on-surface-variant dark:text-m3-outline">Forward to...</p>
                  {rooms
                    .filter(r => r.roomId !== roomId)
                    .map(r => (
                      <button
                        key={r.roomId}
                        onClick={() => handleForward(r.roomId)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:text-m3-on-surface dark:hover:bg-m3-surface-container-highest"
                      >
                        <span className="truncate">{r.name}</span>
                      </button>
                    ))}
                  {rooms.filter(r => r.roomId !== roomId).length === 0 && (
                    <p className="px-3 py-2 text-xs text-m3-outline dark:text-m3-on-surface-variant">No other rooms available</p>
                  )}
                </div>
              </>,
              document.body
            )
          })()}
          {/* Touch-friendly action menu (long-press on mobile) */}
          {showTouchMenu && createPortal(
            <div
              ref={touchMenuRef}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in"
              onClick={(e) => { if (e.target === e.currentTarget) closeTouchMenu() }}
              onTouchEnd={(e) => { if (e.target === e.currentTarget) closeTouchMenu() }}
            >
              <div
                className="w-full max-w-md mx-2 mb-2 animate-slide-in rounded-2xl bg-m3-surface-container-lowest pb-4 pt-2 shadow-2xl dark:bg-m3-surface-container-high"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {/* Drag handle */}
                <div className="mb-3 flex justify-center">
                  <div className="h-1 w-10 rounded-full bg-m3-outline-variant dark:bg-m3-outline" />
                </div>

                {/* Quick reactions row */}
                <div className="flex justify-center gap-1 px-4 pb-3">
                  {QUICK_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => { handleReaction(emoji); closeTouchMenu() }}
                      className="rounded-xl p-2.5 text-2xl transition-transform active:scale-90 hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-highest"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <div className="mx-4 border-t border-m3-outline-variant dark:border-m3-outline-variant" />

                {/* Action buttons */}
                <div className="mt-1 px-2">
                  <button
                    onClick={() => { onReply(); closeTouchMenu() }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-m3-on-surface active:bg-m3-surface-container dark:text-m3-on-surface dark:active:bg-m3-surface-container-highest"
                  >
                    <Reply className="h-5 w-5 text-m3-outline" />
                    Reply
                  </button>
                  <button
                    onClick={() => { handleCopy(); closeTouchMenu() }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-m3-on-surface active:bg-m3-surface-container dark:text-m3-on-surface dark:active:bg-m3-surface-container-highest"
                  >
                    <Copy className="h-5 w-5 text-m3-outline" />
                    Copy text
                  </button>
                  <button
                    onClick={() => { handlePin(); closeTouchMenu() }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-m3-on-surface active:bg-m3-surface-container dark:text-m3-on-surface dark:active:bg-m3-surface-container-highest"
                  >
                    <Pin className="h-5 w-5 text-m3-outline" />
                    {isPinned ? 'Unpin message' : 'Pin message'}
                  </button>
                  <button
                    onClick={() => setShowForwardPicker(true)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-m3-on-surface active:bg-m3-surface-container dark:text-m3-on-surface dark:active:bg-m3-surface-container-highest"
                  >
                    <Forward className="h-5 w-5 text-m3-outline" />
                    Forward
                  </button>
                  {showForwardPicker && (
                    <div className="mb-2 ml-12 max-h-[160px] overflow-y-auto rounded-xl border border-m3-outline-variant bg-m3-surface-container-low dark:border-m3-outline-variant dark:bg-m3-surface-container">
                      {rooms
                        .filter(r => r.roomId !== roomId)
                        .map(r => (
                          <button
                            key={r.roomId}
                            onClick={() => { handleForward(r.roomId); closeTouchMenu() }}
                            className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface active:bg-m3-surface-container-high dark:text-m3-on-surface dark:active:bg-m3-surface-container-highest"
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
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-m3-on-surface active:bg-m3-surface-container dark:text-m3-on-surface dark:active:bg-m3-surface-container-highest"
                      >
                        <Pencil className="h-5 w-5 text-m3-outline" />
                        Edit message
                      </button>
                      <div className="mx-4 border-t border-m3-outline-variant dark:border-m3-outline-variant" />
                      <button
                        onClick={() => { handleDelete(); closeTouchMenu() }}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] text-m3-error active:bg-m3-surface-container dark:text-m3-error dark:active:bg-m3-surface-container-highest"
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

          {/* Reactions — overlapping bottom edge of bubble like Google Messages */}
          {message.reactions.size > 0 && (
            <div className={`relative z-10 -mt-2.5 mb-0.5 flex flex-wrap gap-1 px-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {Array.from(message.reactions.entries()).map(([emoji, data]) => (
                <div key={emoji} className="group/reaction relative">
                  <button
                    onClick={() => handleReaction(emoji)}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm transition-all hover:scale-105 ${
                      data.includesMe
                        ? 'border-m3-primary/50 bg-m3-primary-container text-m3-primary dark:border-m3-primary/50 dark:bg-m3-primary-container/30 dark:text-m3-primary'
                        : 'border-m3-outline-variant bg-white text-m3-on-surface-variant hover:border-m3-outline hover:bg-m3-surface-container-low dark:border-m3-outline-variant dark:bg-m3-surface-container dark:text-m3-outline dark:hover:border-m3-outline'
                    }`}
                  >
                    <span>{emoji}</span>
                    <span>{data.count}</span>
                  </button>
                  {/* Hover tooltip showing who reacted */}
                  <div className={`absolute bottom-full mb-1.5 hidden group-hover/reaction:block z-30 ${isOwn ? 'right-0' : 'left-0'}`}>
                    <div className="rounded-lg border border-m3-outline-variant bg-m3-surface-container-lowest px-2.5 py-1.5 shadow-lg dark:border-m3-outline-variant dark:bg-m3-surface-container-high whitespace-nowrap">
                      <p className="text-[11px] font-medium text-m3-on-surface-variant dark:text-m3-outline mb-0.5">{emoji} {data.count > 1 ? `${data.count} people` : '1 person'}</p>
                      {data.users.map((userName, i) => (
                        <p key={i} className="text-xs text-m3-on-surface dark:text-m3-on-surface-variant">{userName}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Read receipts — "Seen" label + avatars */}
          {isOwn && message.readBy.length > 0 && (
            <div className="mt-1.5 flex items-center justify-end gap-1.5 animate-seen-pop">
              <span className="text-[11px] font-medium text-m3-primary dark:text-m3-primary">
                Seen
              </span>
              <div className="flex -space-x-1.5">
                {message.readBy.slice(0, 4).map(r => (
                  <div key={r.userId} title={`Seen by ${r.displayName}`} className="ring-2 ring-white dark:ring-m3-surface rounded-full">
                    <Avatar src={r.avatarUrl} name={r.displayName} size="sm" />
                  </div>
                ))}
                {message.readBy.length > 4 && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-m3-surface-container-high text-[10px] font-medium text-m3-on-surface-variant ring-2 ring-white dark:ring-m3-surface dark:bg-m3-surface-container-highest dark:text-m3-outline">
                    +{message.readBy.length - 4}
                  </span>
                )}
              </div>
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
