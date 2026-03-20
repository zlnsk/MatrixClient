import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { ChatWithDetails, MessageWithDetails, User } from '@/types/database'

interface ChatState {
  chats: ChatWithDetails[]
  activeChat: ChatWithDetails | null
  messages: MessageWithDetails[]
  isLoadingChats: boolean
  isLoadingMessages: boolean
  typingUsers: Map<string, Set<string>>
  searchQuery: string
  searchResults: MessageWithDetails[]

  loadChats: (userId: string) => Promise<void>
  setActiveChat: (chat: ChatWithDetails | null) => Promise<void>
  loadMessages: (chatId: string) => Promise<void>
  sendMessage: (chatId: string, senderId: string, content: string, type?: string, replyToId?: string) => Promise<void>
  editMessage: (messageId: string, content: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  addReaction: (messageId: string, chatId: string, userId: string, emoji: string) => Promise<void>
  removeReaction: (reactionId: string) => Promise<void>
  markAsRead: (chatId: string, userId: string) => Promise<void>
  createDirectChat: (userId: string, otherUserId: string) => Promise<string>
  createGroupChat: (userId: string, name: string, memberIds: string[]) => Promise<string>
  searchMessages: (query: string, userId: string) => Promise<void>
  setSearchQuery: (query: string) => void
  addMessageToChat: (message: MessageWithDetails) => void
  updateMessageInChat: (message: MessageWithDetails) => void
  removeMessageFromChat: (messageId: string) => void
  setTypingUser: (chatId: string, userId: string, isTyping: boolean) => void
  loadAllUsers: () => Promise<User[]>
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChat: null,
  messages: [],
  isLoadingChats: false,
  isLoadingMessages: false,
  typingUsers: new Map(),
  searchQuery: '',
  searchResults: [],

  loadChats: async (userId: string) => {
    set({ isLoadingChats: true })
    const supabase = createClient()

    const { data: memberRows } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', userId)

    if (!memberRows?.length) {
      set({ chats: [], isLoadingChats: false })
      return
    }

    const chatIds = memberRows.map(m => m.chat_id)

    const { data: chats } = await supabase
      .from('chats')
      .select('*')
      .in('id', chatIds)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })

    if (!chats) {
      set({ isLoadingChats: false })
      return
    }

    const chatDetails: ChatWithDetails[] = await Promise.all(
      chats.map(async (chat) => {
        const { data: members } = await supabase
          .from('chat_members')
          .select('*, user:users(*)')
          .eq('chat_id', chat.id)

        const { data: lastMsg } = await supabase
          .from('messages')
          .select('*, sender:users(*)')
          .eq('chat_id', chat.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        const myMembership = members?.find(m => m.user_id === userId)
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('chat_id', chat.id)
          .gt('created_at', myMembership?.last_read_at || '1970-01-01')

        return {
          ...chat,
          members: (members || []) as ChatWithDetails['members'],
          last_message: lastMsg as ChatWithDetails['last_message'],
          unread_count: count || 0,
        }
      })
    )

    // Sort by last message time
    chatDetails.sort((a, b) => {
      const aTime = a.last_message?.created_at || a.updated_at
      const bTime = b.last_message?.created_at || b.updated_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

    set({ chats: chatDetails, isLoadingChats: false })
  },

  setActiveChat: async (chat) => {
    set({ activeChat: chat, messages: [] })
    if (chat) {
      await get().loadMessages(chat.id)
    }
  },

  loadMessages: async (chatId: string) => {
    set({ isLoadingMessages: true })
    const supabase = createClient()

    const { data } = await supabase
      .from('messages')
      .select('*, sender:users(*), reactions:message_reactions(*, user:users(*))')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (data) {
      // Load reply_to for messages that have them
      const messagesWithReplies: MessageWithDetails[] = await Promise.all(
        data.map(async (msg) => {
          let reply_to = undefined
          if (msg.reply_to_id) {
            const { data: replyMsg } = await supabase
              .from('messages')
              .select('*, sender:users(*)')
              .eq('id', msg.reply_to_id)
              .single()
            reply_to = replyMsg || undefined
          }
          return {
            ...msg,
            sender: msg.sender as unknown as User,
            reactions: (msg.reactions || []) as MessageWithDetails['reactions'],
            reply_to: reply_to as MessageWithDetails['reply_to'],
          }
        })
      )
      set({ messages: messagesWithReplies, isLoadingMessages: false })
    } else {
      set({ isLoadingMessages: false })
    }
  },

  sendMessage: async (chatId, senderId, content, type = 'text', replyToId) => {
    const supabase = createClient()

    const { data: msg } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        sender_id: senderId,
        content,
        type,
        reply_to_id: replyToId || null,
      })
      .select('*, sender:users(*), reactions:message_reactions(*, user:users(*))')
      .single()

    if (msg) {
      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId)
    }
  },

  editMessage: async (messageId, content) => {
    const supabase = createClient()
    await supabase
      .from('messages')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', messageId)
  },

  deleteMessage: async (messageId) => {
    const supabase = createClient()
    await supabase
      .from('messages')
      .update({ is_deleted: true, content: 'This message was deleted' })
      .eq('id', messageId)
  },

  addReaction: async (messageId, chatId, userId, emoji) => {
    const supabase = createClient()
    // Check if reaction already exists
    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
      .single()

    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('message_reactions').insert({
        message_id: messageId,
        chat_id: chatId,
        user_id: userId,
        emoji,
      })
    }
    await get().loadMessages(chatId)
  },

  removeReaction: async (reactionId) => {
    const supabase = createClient()
    await supabase.from('message_reactions').delete().eq('id', reactionId)
  },

  markAsRead: async (chatId, userId) => {
    const supabase = createClient()
    await supabase
      .from('chat_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .eq('user_id', userId)
  },

  createDirectChat: async (userId, otherUserId) => {
    const supabase = createClient()

    // Check if direct chat already exists
    const { data: myChats } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', userId)

    if (myChats) {
      for (const mc of myChats) {
        const { data: chat } = await supabase
          .from('chats')
          .select('*')
          .eq('id', mc.chat_id)
          .eq('type', 'direct')
          .single()

        if (chat) {
          const { data: otherMember } = await supabase
            .from('chat_members')
            .select('user_id')
            .eq('chat_id', chat.id)
            .eq('user_id', otherUserId)
            .single()

          if (otherMember) return chat.id
        }
      }
    }

    const { data: chat } = await supabase
      .from('chats')
      .insert({ type: 'direct', created_by: userId })
      .select()
      .single()

    if (chat) {
      await supabase.from('chat_members').insert([
        { chat_id: chat.id, user_id: userId, role: 'admin' },
        { chat_id: chat.id, user_id: otherUserId, role: 'member' },
      ])
      return chat.id
    }

    throw new Error('Failed to create chat')
  },

  createGroupChat: async (userId, name, memberIds) => {
    const supabase = createClient()

    const { data: chat } = await supabase
      .from('chats')
      .insert({ type: 'group', name, created_by: userId })
      .select()
      .single()

    if (chat) {
      const members = [userId, ...memberIds].map(id => ({
        chat_id: chat.id,
        user_id: id,
        role: id === userId ? 'admin' as const : 'member' as const,
      }))
      await supabase.from('chat_members').insert(members)
      return chat.id
    }

    throw new Error('Failed to create group')
  },

  searchMessages: async (query, userId) => {
    if (!query.trim()) {
      set({ searchResults: [] })
      return
    }
    const supabase = createClient()

    const { data: myChats } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', userId)

    if (!myChats?.length) return

    const { data } = await supabase
      .from('messages')
      .select('*, sender:users(*), reactions:message_reactions(*, user:users(*))')
      .in('chat_id', myChats.map(c => c.chat_id))
      .ilike('content', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) {
      set({
        searchResults: data.map(msg => ({
          ...msg,
          sender: msg.sender as unknown as User,
          reactions: (msg.reactions || []) as MessageWithDetails['reactions'],
        })) as MessageWithDetails[],
      })
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  addMessageToChat: (message) => {
    const { messages, activeChat, chats } = get()
    if (activeChat && message.chat_id === activeChat.id) {
      // Avoid duplicates
      if (!messages.find(m => m.id === message.id)) {
        set({ messages: [...messages, message] })
      }
    }
    // Update chat list
    const updatedChats = chats.map(chat => {
      if (chat.id === message.chat_id) {
        return {
          ...chat,
          last_message: { ...message, sender: message.sender } as ChatWithDetails['last_message'],
          unread_count: activeChat?.id === chat.id ? chat.unread_count : chat.unread_count + 1,
        }
      }
      return chat
    })
    updatedChats.sort((a, b) => {
      const aTime = a.last_message?.created_at || a.updated_at
      const bTime = b.last_message?.created_at || b.updated_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
    set({ chats: updatedChats })
  },

  updateMessageInChat: (message) => {
    const { messages } = get()
    set({ messages: messages.map(m => m.id === message.id ? message : m) })
  },

  removeMessageFromChat: (messageId) => {
    const { messages } = get()
    set({ messages: messages.map(m => m.id === messageId ? { ...m, is_deleted: true, content: 'This message was deleted' } : m) })
  },

  setTypingUser: (chatId, userId, isTyping) => {
    const { typingUsers } = get()
    const newMap = new Map(typingUsers)
    const users = newMap.get(chatId) || new Set()
    if (isTyping) {
      users.add(userId)
    } else {
      users.delete(userId)
    }
    newMap.set(chatId, users)
    set({ typingUsers: newMap })
  },

  loadAllUsers: async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('display_name')
    return data || []
  },
}))
