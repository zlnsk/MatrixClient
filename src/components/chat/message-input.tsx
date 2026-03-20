'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore, type MatrixMessage } from '@/stores/chat-store'
import {
  Send,
  Paperclip,
  Smile,
  X,
  Reply,
  Image as ImageIcon,
  FileText,
  Loader2,
} from 'lucide-react'

interface MessageInputProps {
  onSend: (content: string) => Promise<void>
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
  const { sendTyping, uploadFile } = useChatStore()
  const [content, setContent] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [emojiCategory, setEmojiCategory] = useState('Smileys')
  const [isSending, setIsSending] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (replyTo) inputRef.current?.focus()
  }, [replyTo])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleContentChange = (value: string) => {
    setContent(value)
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

  const handleSubmit = async () => {
    const trimmed = content.trim()
    const hasFiles = pendingFiles.length > 0

    if (!trimmed && !hasFiles) return
    if (isSending || isUploading) return

    setIsSending(true)
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
      // Send text message if present
      if (trimmed) {
        await onSend(trimmed)
      }
      setContent('')
      inputRef.current?.focus()
    } finally {
      setIsSending(false)
      setIsUploading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  const getFilePreview = (file: File) => {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file)
    }
    return null
  }

  return (
    <div className="border-t border-gray-200 bg-white/80 p-4 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-[0_-2px_10px_rgba(0,0,0,0.3)]">
      {/* Reply preview */}
      {replyTo && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border-l-2 border-indigo-500 bg-gray-100 px-3 py-2 animate-slide-in dark:bg-gray-800">
          <Reply className="h-4 w-4 flex-shrink-0 text-indigo-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
              Replying to {replyTo.senderName}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{replyTo.content}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-white"
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
                className="group relative flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                {preview ? (
                  <img src={preview} alt={file.name} className="h-12 w-12 rounded object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-200 dark:bg-gray-700">
                    {getFileIcon(file)}
                  </div>
                )}
                <div className="max-w-[120px]">
                  <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">{file.name}</p>
                  <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  onClick={() => removePendingFile(idx)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition-transform hover:scale-110"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-end gap-3">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.tar,.gz"
        />

        {/* Attachment button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-full p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
          title="Attach file"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        {/* Emoji button */}
        <div className="relative" ref={emojiRef}>
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className="rounded-full p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <Smile className="h-5 w-5" />
          </button>
          {showEmoji && (
            <div className="absolute bottom-12 left-0 z-20 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-xl animate-slide-in dark:border-gray-700 dark:bg-gray-800">
              {/* Category tabs */}
              <div className="mb-2 flex gap-1 overflow-x-auto border-b border-gray-200 pb-2 dark:border-gray-700">
                {Object.keys(EMOJI_CATEGORIES).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setEmojiCategory(cat)}
                    className={`whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors ${
                      emojiCategory === cat
                        ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                        : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                    className="rounded-lg p-1.5 text-xl transition-transform hover:scale-110 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Text input */}
        <div className="flex-1">
          <textarea
            ref={inputRef}
            value={content}
            onChange={e => handleContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type a message..."
            rows={1}
            className="max-h-32 min-h-[44px] w-full resize-none rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm text-gray-900 shadow-inner placeholder-gray-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={(!content.trim() && pendingFiles.length === 0) || isSending || isUploading}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-all hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600"
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  )
}
