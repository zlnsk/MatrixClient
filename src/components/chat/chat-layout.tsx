'use client'

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { Sidebar } from './sidebar'
import { ChatArea } from './chat-area'
import { useChatStore } from '@/stores/chat-store'
import { MessageSquare } from 'lucide-react'

// Lazy load heavy modal components — only fetched when opened
// Retry with full page reload on chunk load failure (stale deployment)
const SettingsPanel = lazy(() =>
  import('./settings-panel').then(m => ({ default: m.SettingsPanel })).catch(() => {
    window.location.reload()
    return new Promise(() => {}) // never resolves — page is reloading
  })
)

const SIDEBAR_MIN = 280
const SIDEBAR_MAX = 600
const SIDEBAR_DEFAULT = 380

export function ChatLayout() {
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState<'main' | 'profile' | 'security' | 'about'>('main')
  const [showMobileSidebar, setShowMobileSidebar] = useState(true)
  const activeRoom = useChatStore(s => s.activeRoom)
  const rooms = useChatStore(s => s.rooms)

  // Update document title with unread message count
  useEffect(() => {
    const totalUnread = rooms.reduce((sum, r) => sum + r.unreadCount, 0)
    document.title = totalUnread > 0 ? `(${totalUnread}) szept matrix` : 'szept matrix'
  }, [rooms])

  // Resizable sidebar (desktop only)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar_width')
      if (saved) {
        const w = parseInt(saved, 10)
        if (w >= SIDEBAR_MIN && w <= SIDEBAR_MAX) return w
      }
    }
    return SIDEBAR_DEFAULT
  })
  const isDragging = useRef(false)
  const widthRef = useRef(sidebarWidth)
  widthRef.current = sidebarWidth

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      e.preventDefault()
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX))
      setSidebarWidth(w)
    }
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        localStorage.setItem('sidebar_width', String(widthRef.current))
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

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

  return (
    <div className="flex h-dvh overflow-hidden bg-white dark:bg-m3-surface">
      {/* Sidebar — full width on mobile, resizable on desktop */}
      <div
        className={`sidebar-resizable ${
          activeRoom ? 'hidden md:flex' : 'flex'
        } w-full flex-col border-r border-m3-outline-variant bg-white dark:border-m3-outline-variant dark:bg-m3-surface md:flex-shrink-0 overflow-hidden`}
        style={{ '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <Sidebar
          onSettingsClick={() => { setSettingsSection('main'); setShowSettings(true) }}
          onChatSelect={handleChatSelect}
          onProfileClick={() => { setSettingsSection('profile'); setShowSettings(true) }}
        />
      </div>

      {/* Resize handle (desktop only) */}
      <div
        onMouseDown={startResize}
        className="hidden md:flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center hover:bg-m3-primary/20 active:bg-m3-primary/30 transition-colors"
      />

      {/* Chat area — full width on mobile, flexible on desktop */}
      {activeRoom ? (
        <div className="flex flex-1 flex-col min-w-0">
          <ChatArea onBackClick={handleBackToSidebar} />
        </div>
      ) : (
        <div className="hidden flex-1 md:flex">
          <EmptyState />
        </div>
      )}

      {/* Build version */}
      <span className="fixed bottom-1 right-2 text-[9px] text-m3-outline/50 pointer-events-none select-none z-10">
        v{process.env.NEXT_PUBLIC_BUILD_VERSION}
      </span>

      {/* Settings overlay — lazy loaded */}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsPanel onClose={() => setShowSettings(false)} initialSection={settingsSection} />
        </Suspense>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-m3-surface-container-low p-8 dark:bg-m3-surface">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-m3-primary-container/40 dark:bg-m3-primary-container/20">
        <MessageSquare className="h-12 w-12 text-m3-primary" />
      </div>
      <h3 className="mt-6 text-xl text-m3-on-surface dark:text-m3-on-surface">
        <span className="font-light">szept</span> <span className="font-bold">matrix</span>
      </h3>
      <p className="mt-2 max-w-sm text-center text-sm text-m3-on-surface-variant">
        Select a conversation to start messaging
      </p>
    </div>
  )
}
