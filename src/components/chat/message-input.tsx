'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { createClient } from '@/lib/supabase/client'
import {
  Send,
  Paperclip,
  Smile,
  X,
  Reply,
  Image as ImageIcon,
  Mic,
} from 'lucide-react'
import type { MessageWithDetails } from '@/types/database'

interface MessageInputProps {
  onSend: (content: string) => Promise<void>
  replyTo: MessageWithDetails | null
  onCancelReply: () => void
  chatId: string
}

const EMOJI_LIST = ['😀', '😂', '🥲', '😍', '🤔', '😎', '🙏', '👍', '👎', '❤️', '🔥', '💯', '🎉', '😢', '😮', '🤝', '✅', '⭐', '🚀', '💡']

export function MessageInput({ onSend, replyTo, onCancelReply, chatId }: MessageInputProps) {
  const user = useAuthStore(s => s.user)
  const preferences = useAuthStore(s => s.preferences)
  const [content, setContent] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)

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

  // Broadcast typing indicator
  useEffect(() => {
    if (!user || !content) return
    const supabase = createClient()
    const channel = supabase.channel(`typing:${chatId}`)
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: user.id, is_typing: content.length > 0 },
    })
    const timeout = setTimeout(() => {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: user.id, is_typing: false },
      })
    }, 3000)
    return () => clearTimeout(timeout)
  }, [content, user, chatId])

  const handleSubmit = async () => {
    const trimmed = content.trim()
    if (!trimmed || isSending) return

    setIsSending(true)
    try {
      await onSend(trimmed)
      setContent('')
      inputRef.current?.focus()
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enterToSend = preferences?.enter_to_send !== false
    if (e.key === 'Enter' && enterToSend && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setIsUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `chat-uploads/${chatId}/${Date.now()}.${ext}`

      const { error } = await supabase.storage
        .from('media')
        .upload(path, file)

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(path)

      // Send as image message
      const { sendMessage } = await import('@/stores/chat-store').then(m => m.useChatStore.getState())
      await sendMessage(chatId, user.id, file.name, 'image', replyTo?.id)
      onCancelReply()
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleEmojiClick = (emoji: string) => {
    setContent(prev => prev + emoji)
    setShowEmoji(false)
    inputRef.current?.focus()
  }

  return (
    <div className="border-t border-gray-800 bg-gray-900/50 p-4">
      {/* Reply preview */}
      {replyTo && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border-l-2 border-indigo-500 bg-gray-800 px-3 py-2 animate-slide-in">
          <Reply className="h-4 w-4 flex-shrink-0 text-indigo-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-indigo-400">
              Replying to {replyTo.sender?.display_name}
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
        <div className="relative">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="rounded-full p-2.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
          >
            {isUploading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-indigo-500" />
            ) : (
              <Paperclip className="h-5 w-5" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

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
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="max-h-32 min-h-[44px] w-full resize-none rounded-full border border-gray-700 bg-gray-800 px-5 py-3 text-sm text-white placeholder-gray-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            style={{ height: content.includes('\n') ? 'auto' : undefined }}
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
