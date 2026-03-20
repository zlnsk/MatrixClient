'use client'

import { useState, useRef, useEffect } from 'react'
import { useChatStore, type MatrixMessage } from '@/stores/chat-store'
import {
  Send,
  Paperclip,
  Smile,
  X,
  Reply,
} from 'lucide-react'

interface MessageInputProps {
  onSend: (content: string) => Promise<void>
  replyTo: MatrixMessage | null
  onCancelReply: () => void
  roomId: string
}

const EMOJI_LIST = ['😀', '😂', '🥲', '😍', '🤔', '😎', '🙏', '👍', '👎', '❤️', '🔥', '💯', '🎉', '😢', '😮', '🤝', '✅', '⭐', '🚀', '💡']

export function MessageInput({ onSend, replyTo, onCancelReply, roomId }: MessageInputProps) {
  const { sendTyping } = useChatStore()
  const [content, setContent] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
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

    // Send typing indicator
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
    if (!trimmed || isSending) return

    setIsSending(true)
    sendTyping(roomId, false)
    try {
      await onSend(trimmed)
      setContent('')
      inputRef.current?.focus()
    } finally {
      setIsSending(false)
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
    setShowEmoji(false)
    inputRef.current?.focus()
  }

  return (
    <div className="border-t border-gray-200 bg-white/80 p-4 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-[0_-2px_10px_rgba(0,0,0,0.3)]">
      {/* Reply preview */}
      {replyTo && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border-l-2 border-indigo-500 bg-gray-800 px-3 py-2 animate-slide-in">
          <Reply className="h-4 w-4 flex-shrink-0 text-indigo-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-indigo-400">
              Replying to {replyTo.senderName}
            </p>
            <p className="truncate text-xs text-gray-400">{replyTo.content}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-gray-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-3">
        {/* Attachment button */}
        <button
          className="rounded-full p-2.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          title="Attach file"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        {/* Emoji button */}
        <div className="relative" ref={emojiRef}>
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className="rounded-full p-2.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <Smile className="h-5 w-5" />
          </button>
          {showEmoji && (
            <div className="absolute bottom-12 left-0 z-20 grid grid-cols-5 gap-1 rounded-xl border border-gray-700 bg-gray-800 p-3 shadow-xl animate-slide-in">
              {EMOJI_LIST.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleEmojiClick(emoji)}
                  className="rounded-lg p-2 text-xl transition-transform hover:scale-110 hover:bg-gray-700"
                >
                  {emoji}
                </button>
              ))}
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
            placeholder="Type a message..."
            rows={1}
            className="max-h-32 min-h-[44px] w-full resize-none rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm text-gray-900 shadow-inner placeholder-gray-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!content.trim() || isSending}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-all hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
