import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { User, Preferences } from '@/types/database'

interface AuthState {
  user: User | null
  preferences: Preferences | null
  isLoading: boolean
  isAuthenticated: boolean

  initialize: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<User>) => Promise<void>
  updatePreferences: (updates: Partial<Preferences>) => Promise<void>
  setOnlineStatus: (status: 'online' | 'offline' | 'away') => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  preferences: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (authUser) {
      // First try matching by auth ID
      let { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      // If no match by ID, try matching by email (links existing users from other apps)
      if (!profile && authUser.email) {
        const { data: emailProfile } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.email)
          .single()

        if (emailProfile) {
          // Update the existing user's ID to match the new auth ID
          // so all their chats, messages, memberships carry over
          await supabase
            .from('users')
            .update({ id: authUser.id })
            .eq('id', emailProfile.id)

          // Update all foreign key references
          await supabase.from('chat_members').update({ user_id: authUser.id }).eq('user_id', emailProfile.id)
          await supabase.from('messages').update({ sender_id: authUser.id }).eq('sender_id', emailProfile.id)
          await supabase.from('contacts').update({ user_id: authUser.id }).eq('user_id', emailProfile.id)
          await supabase.from('contacts').update({ contact_user_id: authUser.id }).eq('contact_user_id', emailProfile.id)
          await supabase.from('message_reactions').update({ user_id: authUser.id }).eq('user_id', emailProfile.id)
          await supabase.from('preferences').update({ user_id: authUser.id }).eq('user_id', emailProfile.id)
          await supabase.from('chats').update({ created_by: authUser.id }).eq('created_by', emailProfile.id)

          profile = { ...emailProfile, id: authUser.id }
        }
      }

      const { data: prefs } = await supabase
        .from('preferences')
        .select('*')
        .eq('user_id', authUser.id)
        .single()

      if (profile) {
        await supabase
          .from('users')
          .update({ status: 'online', last_seen: new Date().toISOString() })
          .eq('id', authUser.id)

        set({
          user: { ...profile, status: 'online' },
          preferences: prefs,
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        // Create profile for new users
        const newProfile = {
          id: authUser.id,
          email: authUser.email!,
          display_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
          avatar_url: authUser.user_metadata?.avatar_url || null,
          status: 'online' as const,
        }
        const { data: created } = await supabase
          .from('users')
          .insert(newProfile)
          .select()
          .single()

        const { data: newPrefs } = await supabase
          .from('preferences')
          .insert({ user_id: authUser.id })
          .select()
          .single()

        set({
          user: created,
          preferences: newPrefs,
          isAuthenticated: true,
          isLoading: false,
        })
      }
    } else {
      set({ isLoading: false })
    }
  },

  signInWithPassword: async (email, password) => {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await get().initialize()
  },

  signUp: async (email, password, displayName) => {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) throw error

    if (data.user) {
      await supabase.from('users').insert({
        id: data.user.id,
        email,
        display_name: displayName,
        status: 'online',
      })
      await supabase.from('preferences').insert({ user_id: data.user.id })
      await get().initialize()
    }
  },

  signInWithGoogle: async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  },

  signOut: async () => {
    const supabase = createClient()
    const user = get().user
    if (user) {
      await supabase
        .from('users')
        .update({ status: 'offline', last_seen: new Date().toISOString() })
        .eq('id', user.id)
    }
    await supabase.auth.signOut()
    set({ user: null, preferences: null, isAuthenticated: false })
  },

  updateProfile: async (updates) => {
    const supabase = createClient()
    const user = get().user
    if (!user) return

    const { data } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    if (data) set({ user: data })
  },

  updatePreferences: async (updates) => {
    const supabase = createClient()
    const user = get().user
    if (!user) return

    const { data } = await supabase
      .from('preferences')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single()

    if (data) set({ preferences: data })
  },

  setOnlineStatus: async (status) => {
    const supabase = createClient()
    const user = get().user
    if (!user) return

    await supabase
      .from('users')
      .update({ status, last_seen: new Date().toISOString() })
      .eq('id', user.id)

    set({ user: { ...user, status } })
  },
}))
