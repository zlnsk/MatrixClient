import { create } from 'zustand'
import {
  loginWithPassword,
  restoreSession,
  startSync,
  logout,
  getMatrixClient,
  getAvatarUrl,
  getUserId,
} from '@/lib/matrix/client'
import { useChatStore } from './chat-store'
import { useCallStore } from './call-store'

export interface MatrixUser {
  userId: string
  displayName: string
  avatarUrl: string | null
}

interface AuthState {
  user: MatrixUser | null
  isLoading: boolean
  isAuthenticated: boolean

  initialize: () => Promise<void>
  signIn: (username: string, password: string, homeserverUrl: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: { displayName?: string; avatarUrl?: string }) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    const client = restoreSession()
    if (client) {
      try {
        await startSync()
        const userId = getUserId()
        const matrixUser = client.getUser(userId!)
        set({
          user: {
            userId: userId!,
            displayName: matrixUser?.displayName || userId!,
            avatarUrl: getAvatarUrl(matrixUser?.avatarUrl),
          },
          isAuthenticated: true,
          isLoading: false,
        })
      } catch {
        // Session expired or invalid
        localStorage.removeItem('matrix_session')
        set({ isLoading: false })
      }
    } else {
      set({ isLoading: false })
    }
  },

  signIn: async (username, password, homeserverUrl) => {
    const client = await loginWithPassword(username, password, homeserverUrl)
    await startSync()
    const userId = getUserId()
    const matrixUser = client.getUser(userId!)
    set({
      user: {
        userId: userId!,
        displayName: matrixUser?.displayName || userId!,
        avatarUrl: getAvatarUrl(matrixUser?.avatarUrl),
      },
      isAuthenticated: true,
      isLoading: false,
    })
  },

  signOut: async () => {
    await logout()
    // Clear all stores to prevent cross-session data leakage
    useChatStore.getState().resetState()
    useCallStore.getState().reset()
    set({ user: null, isAuthenticated: false })
  },

  updateProfile: (updates) => {
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            ...(updates.displayName !== undefined && { displayName: updates.displayName }),
            ...(updates.avatarUrl !== undefined && { avatarUrl: updates.avatarUrl }),
          }
        : null,
    }))
  },
}))
