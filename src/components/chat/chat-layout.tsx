'use client'

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Sidebar } from './sidebar'
import { ChatArea } from './chat-area'
import { useChatStore } from '@/stores/chat-store'

// Lazy load heavy modal components — only fetched when opened
// Retry with full page reload on chunk load failure (stale deployment)
const SettingsPanel = lazy(() =>
  import('./settings-panel').then(m => ({ default: m.SettingsPanel })).catch(() => {
    window.location.reload()
    return new Promise(() => {}) // never resolves — page is reloading
  })
)

export function ChatLayout() {
  const [showSettings, setShowSettings] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(true)
  const activeRoom = useChatStore(s => s.activeRoom)

  // Navigate into chat: push a history entry so Android back button works
  const handleChatSelect = useCallback(() => {
    setShowMobileSidebar(false)
    history.pushState({ view: 'chat' }, '')
  }, [])

  // Navigate back to sidebar
  const handleBackToSidebar = useCallback(() => {
    useChatStore.getState().setActiveRoom(null)
    setShowMobileSidebar(true)
    // If we pushed a state, go back to pop it; otherwise just show sidebar
    if (history.state?.view === 'chat') {
      history.back()
    }
  }, [])

  // Handle browser/Android back button
  useEffect(() => {
    const handlePopState = () => {
      useChatStore.getState().setActiveRoom(null)
      setShowMobileSidebar(true)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Alt+1-9 to switch between chats (Alt avoids overriding browser/OS shortcuts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return
      const num = parseInt(e.key, 10)
      if (num < 1 || num > 9 || isNaN(num)) return

      const { rooms, setActiveRoom, markAsRead } = useChatStore.getState()
      const visibleRooms = rooms
        .filter(r => !r.isArchived)
        .sort((a, b) => b.lastMessageTs - a.lastMessageTs)
      const target = visibleRooms[num - 1]
      if (!target) return

      e.preventDefault()
      setActiveRoom(target)
      markAsRead(target.roomId)
      setShowMobileSidebar(false)
      history.pushState({ view: 'chat' }, '')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleBackdropClick = useCallback(() => {
    useChatStore.getState().setActiveRoom(null)
    setShowMobileSidebar(true)
  }, [])

  return (
    <div className="relative h-dvh overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* Sidebar — always visible behind the overlay */}
      <div className={`absolute inset-0 flex bg-transparent transition-[filter] duration-150 ${
        activeRoom ? 'blur-[2px] brightness-[0.85] dark:brightness-75 pointer-events-none' : ''
      }`}>
        <div className="flex w-full max-w-md flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
          <Sidebar
            onSettingsClick={() => setShowSettings(true)}
            onChatSelect={handleChatSelect}
          />
        </div>
      </div>

      {/* Chat overlay */}
      {activeRoom && (
        <>
          {/* Backdrop — click to dismiss */}
          <div
            className="absolute inset-0 z-20 animate-fade-in"
            onClick={handleBackdropClick}
          />

          {/* Chat window */}
          <div className="absolute inset-0 z-30 flex items-center justify-center p-0 md:p-8 lg:p-10 pointer-events-none">
            <div className="pointer-events-auto relative flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-none bg-white shadow-none md:max-h-[85vh] md:rounded-2xl md:shadow-xl dark:bg-gray-900 md:border md:border-gray-200 dark:md:border-gray-800 animate-slide-in">
              <ChatArea onBackClick={handleBackToSidebar} />
            </div>
          </div>
        </>
      )}

      {/* Build version */}
      <span className="fixed bottom-1 right-2 text-[10px] text-gray-300 dark:text-gray-700 pointer-events-none select-none z-10">
        v{process.env.NEXT_PUBLIC_BUILD_VERSION}
      </span>

      {/* Settings overlay — lazy loaded */}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </Suspense>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 p-8 dark:bg-gray-950">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 shadow-lg dark:bg-gray-900">
        <svg
          className="h-10 w-10 text-gray-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h3 className="mt-6 text-lg font-medium text-gray-700 dark:text-gray-300">
        Welcome to szept
      </h3>
      <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
        Select a conversation from the sidebar or start a new chat to begin messaging securely.
      </p>
      <div className="mt-4 flex items-center gap-2 rounded-full bg-green-900/30 px-3 py-1.5">
        <div className="h-2 w-2 rounded-full bg-green-400" />
        <span className="text-xs text-green-400">End-to-end encrypted</span>
      </div>
    </div>
  )
}
