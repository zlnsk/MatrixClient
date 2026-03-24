'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useChatStore, type MatrixMessage } from '@/stores/chat-store'
import { getMatrixClient } from '@/lib/matrix/client'
import {
  Send,
  Paperclip,
  Smile,
  X,
  Reply,
  Image as ImageIcon,
  FileText,
  Loader2,
  Mic,
  Square,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'

// Matches strings that contain only emoji (same regex as message-bubble)
const EMOJI_ONLY_RE = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Regional_Indicator}{2}|[\u200d\uFE0F]|\d\uFE0F?\u20E3)+$/u

function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length > 0 && trimmed.length <= 30 && EMOJI_ONLY_RE.test(trimmed)
}

interface MessageInputProps {
  onSend: (content: string) => void
  replyTo: MatrixMessage | null
  onCancelReply: () => void
  roomId: string
}

const EMOJI_CATEGORIES: Record<string, string[]> = {
  'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥲', '😎', '🤓', '🧐'],
  'Gestures': ['👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏', '🙌', '🤲', '🤝', '🙏'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  'Objects': ['🔥', '💯', '✅', '❌', '⭐', '🌟', '💡', '🎉', '🎊', '🏆', '🥇', '🎯', '💎', '🔔', '📌', '📎', '✏️', '📝', '💼', '📁', '🗂️', '📊', '📈', '📉', '🔑', '🔒', '🔓'],
  'Symbols': ['💬', '💭', '🗯️', '⚡', '💥', '💫', '💦', '🚀', '🛸', '🌈', '☀️', '🌙', '⭐', '🎵', '🎶', '➕', '➖', '✖️', '➗', '♾️', '❓', '❗', '‼️', '⁉️', '💤'],
}

export function MessageInput({ onSend, replyTo, onCancelReply, roomId }: MessageInputProps) {
  const { sendTyping, uploadFile, setDisplayName, joinRoom, inviteMember, setRoomTopic } = useChatStore()
  const activeRoom = useChatStore(s => s.activeRoom)
  const [content, setContent] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [emojiCategory, setEmojiCategory] = useState('Smileys')
  // isSending state removed — messages are now sent optimistically
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [commandStatus, setCommandStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionStart, setMentionStart] = useState(0)
  const mentionRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (replyTo) inputRef.current?.focus()
  }, [replyTo])

  // Auto-focus input when opening a chat
  useEffect(() => {
    inputRef.current?.focus()
  }, [roomId])

  // Auto-dismiss command status after 4 seconds
  useEffect(() => {
    if (commandStatus) {
      const timer = setTimeout(() => setCommandStatus(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [commandStatus])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Record as OGG if supported natively (Firefox), otherwise WebM (Chrome)
      // and convert to OGG before uploading for bridge compatibility
      const nativeOgg = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      const mimeType = nativeOgg ? 'audio/ogg;codecs=opus' : 'audio/webm;codecs=opus'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        let blob = new Blob(audioChunksRef.current, { type: mimeType })
        if (blob.size > 0) {
          // Convert WebM to OGG for bridge compatibility (Signal, WhatsApp, etc.)
          if (!nativeOgg) {
            const { convertWebmToOgg } = await import('@/lib/audio/webm-to-ogg')
            blob = await convertWebmToOgg(blob)
          }
          const file = new File([blob], `voice-message-${Date.now()}.ogg`, { type: 'audio/ogg; codecs=opus' })
          await uploadFile(roomId, file)
        }
        setRecordingDuration(0)
      }

      mediaRecorder.start()
      setIsRecording(true)

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1)
      }, 1000)
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop())
      }
      mediaRecorderRef.current.stop()
    }
    audioChunksRef.current = []
    setIsRecording(false)
    setRecordingDuration(0)
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const handleContentChange = (value: string) => {
    setContent(value)

    // Detect @ mention trigger
    const textarea = inputRef.current
    if (textarea) {
      const cursorPos = textarea.selectionStart
      const textBeforeCursor = value.slice(0, cursorPos)
      // Find the last '@' that starts a mention (preceded by space or at start)
      const mentionMatch = textBeforeCursor.match(/(?:^|\s)@([^\s]*)$/)
      if (mentionMatch) {
        setMentionQuery(mentionMatch[1].toLowerCase())
        setMentionStart(cursorPos - mentionMatch[1].length - 1) // -1 for '@'
        setMentionIndex(0)
      } else {
        setMentionQuery(null)
      }
    }

    if (value.length > 0) {
      sendTyping(roomId, true)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(roomId, false)
      }, 4000)
    } else {
      sendTyping(roomId, false)
    }
  }

  const filteredMembers = mentionQuery !== null && activeRoom
    ? activeRoom.members.filter(m =>
        m.displayName.toLowerCase().includes(mentionQuery) ||
        m.userId.toLowerCase().includes(mentionQuery)
      ).slice(0, 8)
    : []

  const insertMention = (member: { userId: string; displayName: string }) => {
    const before = content.slice(0, mentionStart)
    const after = content.slice(inputRef.current?.selectionStart ?? content.length)
    const mention = `${member.displayName} `
    const newContent = `${before}@${mention}${after}`
    setContent(newContent)
    setMentionQuery(null)
    // Restore focus and cursor position
    requestAnimationFrame(() => {
      const pos = mentionStart + 1 + mention.length
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(pos, pos)
    })
  }

  const handleSlashCommand = async (trimmed: string): Promise<boolean> => {
    const client = getMatrixClient()
    if (!client) return false

    // /me <action> - Send an emote
    const meMatch = trimmed.match(/^\/me\s+([\s\S]+)$/)
    if (meMatch) {
      const action = meMatch[1]
      await (client as any).sendEvent(roomId, 'm.room.message', {
        msgtype: 'm.emote',
        body: action,
      })
      setCommandStatus({ type: 'success', message: 'Emote sent' })
      return true
    }

    // /nick <name> - Change display name
    const nickMatch = trimmed.match(/^\/nick\s+([\s\S]+)$/)
    if (nickMatch) {
      await setDisplayName(nickMatch[1])
      setCommandStatus({ type: 'success', message: `Display name changed to "${nickMatch[1]}"` })
      return true
    }

    // /topic <topic> - Set room topic
    const topicMatch = trimmed.match(/^\/topic\s+([\s\S]+)$/)
    if (topicMatch) {
      await setRoomTopic(roomId, topicMatch[1])
      setCommandStatus({ type: 'success', message: 'Room topic updated' })
      return true
    }

    // /invite <userId> - Invite user to room
    const inviteMatch = trimmed.match(/^\/invite\s+(\S+)$/)
    if (inviteMatch) {
      await inviteMember(roomId, inviteMatch[1])
      setCommandStatus({ type: 'success', message: `Invited ${inviteMatch[1]}` })
      return true
    }

    // /join <roomId> - Join a room
    const joinMatch = trimmed.match(/^\/join\s+(\S+)$/)
    if (joinMatch) {
      await joinRoom(joinMatch[1])
      setCommandStatus({ type: 'success', message: `Joined ${joinMatch[1]}` })
      return true
    }

    // /shrug [message] - Prepend shrug to message
    const shrugMatch = trimmed.match(/^\/shrug(?:\s+([\s\S]*))?$/)
    if (shrugMatch) {
      const shrugMsg = `¯\\_(ツ)_/¯${shrugMatch[1] ? ' ' + shrugMatch[1] : ''}`
      await onSend(shrugMsg)
      return true
    }

    return false
  }

  const handleSubmit = async () => {
    const trimmed = content.trim()
    const hasFiles = pendingFiles.length > 0

    if (!trimmed && !hasFiles) return
    if (isUploading) return

    setCommandStatus(null)
    sendTyping(roomId, false)
    try {
      // Upload pending files first
      if (hasFiles) {
        setIsUploading(true)
        for (const file of pendingFiles) {
          await uploadFile(roomId, file)
        }
        setPendingFiles([])
        setIsUploading(false)
      }
      // Check for slash commands
      if (trimmed && trimmed.startsWith('/')) {
        try {
          const handled = await handleSlashCommand(trimmed)
          if (handled) {
            setContent('')
            inputRef.current?.focus()
            return
          }
        } catch (err) {
          setCommandStatus({ type: 'error', message: err instanceof Error ? err.message : 'Command failed' })
          return
        }
      }
      // Send text message if present — non-blocking, message appears optimistically
      if (trimmed) {
        onSend(trimmed)
      }
      setContent('')
      inputRef.current?.focus()
    } finally {
      setIsUploading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle mention popup navigation
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => (i + 1) % filteredMembers.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(i => (i - 1 + filteredMembers.length) % filteredMembers.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredMembers[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleEmojiClick = (emoji: string) => {
    setContent(prev => prev + emoji)
    inputRef.current?.focus()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setPendingFiles(prev => [...prev, ...files])
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  // Handle paste events for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter(item => item.type.startsWith('image/'))
    if (imageItems.length > 0) {
      e.preventDefault()
      const files: File[] = []
      for (const item of imageItems) {
        const file = item.getAsFile()
        if (file) {
          // Give pasted images a descriptive name
          const ext = file.type.split('/')[1] || 'png'
          const namedFile = new File([file], `pasted-image-${Date.now()}.${ext}`, { type: file.type })
          files.push(namedFile)
        }
      }
      if (files.length > 0) {
        setPendingFiles(prev => [...prev, ...files])
      }
    }
  }, [])

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <ImageIcon className="h-4 w-4" />
    return <FileText className="h-4 w-4" />
  }

  // Memoize file preview blob URLs to avoid creating new ones on every render.
  // Revoke stale URLs when files are removed or component unmounts.
  const previewUrlsRef = useRef<Map<File, string>>(new Map())
  const filePreviewUrls = useMemo(() => {
    const prev = previewUrlsRef.current
    const next = new Map<File, string>()
    for (const file of pendingFiles) {
      if (file.type.startsWith('image/')) {
        next.set(file, prev.get(file) || URL.createObjectURL(file))
      }
    }
    // Revoke URLs for removed files
    for (const [file, url] of prev) {
      if (!next.has(file)) URL.revokeObjectURL(url)
    }
    previewUrlsRef.current = next
    return next
  }, [pendingFiles])

  // Revoke all preview URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current.values()) URL.revokeObjectURL(url)
    }
  }, [])

  const getFilePreview = (file: File) => filePreviewUrls.get(file) ?? null

  return (
    <div className="bg-white px-3 py-2.5 dark:bg-m3-surface-container md:px-4 md:py-3" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
      {/* Command status */}
      {commandStatus && (
        <div
          className={`mb-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
            commandStatus.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-m3-error-container text-m3-on-error-container dark:bg-m3-error-container/20 dark:text-m3-error'
          }`}
        >
          <span>{commandStatus.message}</span>
          <button
            onClick={() => setCommandStatus(null)}
            className="ml-2 flex-shrink-0 rounded p-0.5 transition-colors hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border-l-2 border-m3-primary bg-m3-surface-container px-3 py-2 animate-slide-in dark:bg-m3-surface-container-high">
          <Reply className="h-4 w-4 flex-shrink-0 text-m3-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-m3-primary dark:text-m3-primary">
              Replying to {replyTo.senderName}
            </p>
            <p className="truncate text-xs text-m3-on-surface-variant dark:text-m3-outline">{replyTo.content}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 rounded p-1 text-m3-outline transition-colors hover:bg-m3-surface-container-high hover:text-m3-on-surface dark:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {pendingFiles.map((file, idx) => {
            const preview = getFilePreview(file)
            return (
              <div
                key={`${file.name}-${idx}`}
                className="group relative flex items-center gap-2 rounded-lg border border-m3-outline-variant bg-m3-surface-container-low p-2 shadow-sm dark:border-m3-outline-variant dark:bg-m3-surface-container-high"
              >
                {preview ? (
                  <img src={preview} alt={file.name} className="h-12 w-12 rounded object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-m3-surface-container-high dark:bg-m3-surface-container-highest">
                    {getFileIcon(file)}
                  </div>
                )}
                {!file.type.startsWith('image/') && (
                  <div className="max-w-[120px]">
                    <p className="truncate text-xs font-medium text-m3-on-surface dark:text-m3-on-surface-variant">{file.name}</p>
                    <p className="text-xs text-m3-outline">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                )}
                <button
                  onClick={() => removePendingFile(idx)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm transition-transform hover:scale-110"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="relative flex items-center gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.tar,.gz"
        />

        {/* Mention autocomplete popup */}
        {mentionQuery !== null && filteredMembers.length > 0 && (
          <div
            ref={mentionRef}
            className="absolute bottom-full left-0 right-0 mb-1 max-h-52 overflow-y-auto rounded-xl border border-m3-outline-variant bg-m3-surface-container-lowest shadow-lg dark:border-m3-outline-variant dark:bg-m3-surface-container-high z-30"
          >
            {filteredMembers.map((member, i) => (
              <button
                key={member.userId}
                onMouseDown={e => {
                  e.preventDefault()
                  insertMention(member)
                }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  i === mentionIndex
                    ? 'bg-m3-primary-container text-m3-on-primary-container dark:bg-m3-primary-container/30 dark:text-m3-primary'
                    : 'text-m3-on-surface hover:bg-m3-surface-container-low dark:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest/50'
                }`}
              >
                <Avatar src={member.avatarUrl} name={member.displayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{member.displayName}</p>
                  <p className="truncate text-xs text-m3-outline dark:text-m3-on-surface-variant">{member.userId}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Unified input bar — Google Messages style: pill contains input + action buttons */}
        {isRecording ? (
          <div className="flex flex-1 items-center gap-3 rounded-full border border-red-300 bg-m3-error-container px-5 py-2.5 dark:border-red-800 dark:bg-m3-error-container/20">
            <span className="h-3 w-3 animate-pulse rounded-full bg-red-600" />
            <span className="text-sm font-medium text-m3-error dark:text-m3-error">Recording {formatDuration(recordingDuration)}</span>
            <div className="flex-1" />
            <button onClick={cancelRecording} className="rounded-full p-1 text-m3-outline hover:text-m3-error" title="Cancel">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-1 items-center rounded-full border border-m3-outline-variant/60 bg-m3-surface-container dark:border-m3-outline-variant/40 dark:bg-m3-surface-container-high">
            <textarea
              ref={inputRef}
              value={content}
              onChange={e => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type a message..."
              rows={1}
              enterKeyHint="send"
              className={`max-h-32 min-h-[42px] flex-1 resize-none bg-transparent px-5 py-2.5 text-m3-on-surface placeholder-m3-on-surface-variant focus:outline-none dark:text-m3-on-surface dark:placeholder-m3-outline md:min-h-[44px] md:py-3 ${isEmojiOnly(content) ? 'text-4xl leading-tight' : 'text-sm'}`}
            />
            {/* Action buttons inside the pill */}
            <div className="flex flex-shrink-0 items-center gap-0.5 pr-2">
              {/* Emoji button */}
              <div className="relative" ref={emojiRef}>
                <button
                  onClick={() => setShowEmoji(!showEmoji)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-m3-outline transition-colors hover:bg-m3-surface-container-high hover:text-m3-on-surface dark:hover:bg-m3-surface-container-highest dark:hover:text-white"
                  aria-label="Emoji picker"
                >
                  <Smile className="h-5 w-5" />
                </button>
                {showEmoji && (
                  <div className="absolute bottom-12 right-0 z-20 w-80 rounded-xl border border-m3-outline-variant bg-m3-surface-container-lowest p-3 shadow-xl animate-slide-in dark:border-m3-outline-variant dark:bg-m3-surface-container-high">
                    {/* Category tabs */}
                    <div className="mb-2 flex gap-1 overflow-x-auto border-b border-m3-outline-variant pb-2 dark:border-m3-outline-variant">
                      {Object.keys(EMOJI_CATEGORIES).map(cat => (
                        <button
                          key={cat}
                          onClick={() => setEmojiCategory(cat)}
                          className={`whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors ${
                            emojiCategory === cat
                              ? 'bg-m3-primary-container text-m3-primary dark:bg-m3-primary-container/30 dark:text-m3-primary'
                              : 'text-m3-on-surface-variant hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-highest'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    {/* Emoji grid */}
                    <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
                      {EMOJI_CATEGORIES[emojiCategory].map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handleEmojiClick(emoji)}
                          className="rounded-lg p-1.5 text-xl transition-transform hover:scale-110 hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-highest"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Attachment button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 w-9 items-center justify-center rounded-full text-m3-outline transition-colors hover:bg-m3-surface-container-high hover:text-m3-on-surface dark:hover:bg-m3-surface-container-highest dark:hover:text-white"
                title="Attach file"
                aria-label="Attach file"
              >
                <Paperclip className="h-5 w-5" />
              </button>

              {/* Image button */}
              <button
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'image/*'
                    fileInputRef.current.click()
                    // Reset accept after click
                    requestAnimationFrame(() => {
                      if (fileInputRef.current) fileInputRef.current.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.tar,.gz'
                    })
                  }
                }}
                className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full text-m3-outline transition-colors hover:bg-m3-surface-container-high hover:text-m3-on-surface dark:hover:bg-m3-surface-container-highest dark:hover:text-white"
                title="Send image"
                aria-label="Send image"
              >
                <ImageIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Send / Stop / Mic button — outside the pill */}
        {isRecording ? (
          <button
            onClick={stopRecording}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white transition-all hover:bg-red-600 active:bg-red-700"
            title="Stop recording"
            aria-label="Stop recording"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : !content.trim() && pendingFiles.length === 0 ? (
          <button
            onClick={startRecording}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-m3-surface-container-high text-m3-on-surface-variant transition-all hover:bg-m3-outline-variant active:bg-m3-outline-variant dark:bg-m3-surface-container-highest dark:text-m3-on-surface-variant dark:hover:bg-m3-surface-container-highest"
            title="Record voice message"
            aria-label="Record voice message"
          >
            <Mic className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={(!content.trim() && pendingFiles.length === 0) || isUploading}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-m3-primary text-white transition-all hover:bg-m3-primary/90 active:bg-m3-primary/80 disabled:opacity-30"
            aria-label="Send message"
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
