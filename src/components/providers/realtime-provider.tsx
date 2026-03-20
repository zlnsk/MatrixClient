'use client'

import { useEffect, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import type { MessageWithDetails, User } from '@/types/database'

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user)
  const { addMessageToChat, updateMessageInChat, removeMessageFromChat, loadMessages, activeChat } = useChatStore()

  useEffect(() => {
    if (!user) return

    const supabase = createClient()

    // Listen for new messages
    const messagesChannel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const msg = payload.new as MessageWithDetails
          // Fetch full message with sender
          const { data } = await supabase
            .from('messages')
            .select('*, sender:users(*), reactions:message_reactions(*, user:users(*))')
            .eq('id', msg.id)
            .single()

          if (data) {
            const d = data as Record<string, unknown>
            const fullMessage: MessageWithDetails = {
              ...(d as unknown as MessageWithDetails),
              sender: d.sender as unknown as User,
              reactions: (d.reactions || []) as MessageWithDetails['reactions'],
            }
            addMessageToChat(fullMessage)

            // Browser notification
            if (msg.sender_id !== user.id && document.hidden) {
              if (Notification.permission === 'granted') {
                new Notification(`New message from ${fullMessage.sender.display_name}`, {
                  body: fullMessage.content.substring(0, 100),
                  icon: '/favicon.ico',
                })
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        async (payload) => {
          const msg = payload.new as MessageWithDetails
          if (msg.is_deleted) {
            removeMessageFromChat(msg.id)
          } else {
            const { data } = await supabase
              .from('messages')
              .select('*, sender:users(*), reactions:message_reactions(*, user:users(*))')
              .eq('id', msg.id)
              .single()
            if (data) {
              const d2 = data as Record<string, unknown>
              updateMessageInChat({
                ...(d2 as unknown as MessageWithDetails),
                sender: d2.sender as unknown as User,
                reactions: (d2.reactions || []) as MessageWithDetails['reactions'],
              } as MessageWithDetails)
            }
          }
        }
      )
      .subscribe()

    // Listen for reaction changes
    const reactionsChannel = supabase
      .channel('reactions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => {
          if (activeChat) {
            loadMessages(activeChat.id)
          }
        }
      )
      .subscribe()

    // Listen for user presence changes
    const presenceChannel = supabase
      .channel('users-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        () => {
          // Trigger chat list reload to update presence
        }
      )
      .subscribe()

    // Set offline on page unload
    const handleBeforeUnload = () => {
      supabase
        .from('users')
        .update({ status: 'offline' as const, last_seen: new Date().toISOString() })
        .eq('id', user.id)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    return () => {
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(reactionsChannel)
      supabase.removeChannel(presenceChannel)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user, activeChat, addMessageToChat, updateMessageInChat, removeMessageFromChat, loadMessages])

  return <>{children}</>
}
