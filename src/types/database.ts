export interface Database {
  public: {
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          display_name: string
          avatar_url: string | null
          public_key: string | null
          status: 'online' | 'offline' | 'away'
          last_seen: string
          created_at: string
          location_lat: number | null
          location_lng: number | null
          location_name: string | null
          location_updated_at: string | null
        }
        Insert: {
          id?: string
          email: string
          display_name?: string
          avatar_url?: string | null
          public_key?: string | null
          status?: 'online' | 'offline' | 'away'
          last_seen?: string
          created_at?: string
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          location_updated_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          display_name?: string
          avatar_url?: string | null
          public_key?: string | null
          status?: 'online' | 'offline' | 'away'
          last_seen?: string
          created_at?: string
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          location_updated_at?: string | null
        }
      }
      chats: {
        Row: {
          id: string
          type: 'direct' | 'group'
          name: string | null
          avatar_url: string | null
          created_by: string
          is_archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          type: 'direct' | 'group'
          name?: string | null
          avatar_url?: string | null
          created_by: string
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          type?: 'direct' | 'group'
          name?: string | null
          avatar_url?: string | null
          created_by?: string
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      chat_members: {
        Row: {
          chat_id: string
          user_id: string
          role: 'admin' | 'member'
          joined_at: string
          last_read_at: string
        }
        Insert: {
          chat_id: string
          user_id: string
          role?: 'admin' | 'member'
          joined_at?: string
          last_read_at?: string
        }
        Update: {
          chat_id?: string
          user_id?: string
          role?: 'admin' | 'member'
          joined_at?: string
          last_read_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          chat_id: string
          sender_id: string
          type: 'text' | 'image' | 'voice' | 'system'
          content: string
          encrypted_key: string | null
          iv: string | null
          media_url: string | null
          media_type: string | null
          is_deleted: boolean
          created_at: string
          updated_at: string
          reply_to_id: string | null
        }
        Insert: {
          id?: string
          chat_id: string
          sender_id: string
          type?: 'text' | 'image' | 'voice' | 'system'
          content?: string
          encrypted_key?: string | null
          iv?: string | null
          media_url?: string | null
          media_type?: string | null
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
          reply_to_id?: string | null
        }
        Update: {
          id?: string
          chat_id?: string
          sender_id?: string
          type?: 'text' | 'image' | 'voice' | 'system'
          content?: string
          encrypted_key?: string | null
          iv?: string | null
          media_url?: string | null
          media_type?: string | null
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
          reply_to_id?: string | null
        }
      }
      contacts: {
        Row: {
          id: string
          user_id: string
          contact_user_id: string
          nickname: string | null
          is_blocked: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          contact_user_id: string
          nickname?: string | null
          is_blocked?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          contact_user_id?: string
          nickname?: string | null
          is_blocked?: boolean
          created_at?: string
        }
      }
      message_reactions: {
        Row: {
          id: string
          message_id: string
          chat_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          chat_id: string
          user_id: string
          emoji: string
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          chat_id?: string
          user_id?: string
          emoji?: string
          created_at?: string
        }
      }
      preferences: {
        Row: {
          id: string
          user_id: string
          theme: 'dark' | 'light' | 'orion-blue'
          notifications_enabled: boolean
          sound_enabled: boolean
          enter_to_send: boolean
          font_size: 'small' | 'medium' | 'large'
        }
        Insert: {
          id?: string
          user_id: string
          theme?: 'dark' | 'light' | 'orion-blue'
          notifications_enabled?: boolean
          sound_enabled?: boolean
          enter_to_send?: boolean
          font_size?: 'small' | 'medium' | 'large'
        }
        Update: {
          id?: string
          user_id?: string
          theme?: 'dark' | 'light' | 'orion-blue'
          notifications_enabled?: boolean
          sound_enabled?: boolean
          enter_to_send?: boolean
          font_size?: 'small' | 'medium' | 'large'
        }
      }
      group_keys: {
        Row: {
          id: string
          chat_id: string
          encrypted_key: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          chat_id: string
          encrypted_key: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          chat_id?: string
          encrypted_key?: string
          created_by?: string
          created_at?: string
        }
      }
      bot_memories: {
        Row: {
          id: string
          user_id: string
          category: string
          subject: string
          content: string
          source: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category?: string
          subject: string
          content: string
          source?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          category?: string
          subject?: string
          content?: string
          source?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

export type User = Database['public']['Tables']['users']['Row']
export type Chat = Database['public']['Tables']['chats']['Row']
export type ChatMember = Database['public']['Tables']['chat_members']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type Contact = Database['public']['Tables']['contacts']['Row']
export type MessageReaction = Database['public']['Tables']['message_reactions']['Row']
export type Preferences = Database['public']['Tables']['preferences']['Row']
export type GroupKey = Database['public']['Tables']['group_keys']['Row']

export interface ChatWithDetails extends Chat {
  members: (ChatMember & { user: User })[]
  last_message?: Message & { sender: User }
  unread_count: number
}

export interface MessageWithDetails extends Message {
  sender: User
  reactions: (MessageReaction & { user: User })[]
  reply_to?: Message & { sender: User }
}
