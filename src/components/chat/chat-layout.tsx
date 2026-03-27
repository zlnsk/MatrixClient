'use client'

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { Sidebar } from './sidebar'
import { ChatArea } from './chat-area'
import { useChatStore } from '@/stores/chat-store'
import { MessageSquare, X } from 'lucide-react'
import { ConnectionBanner } from '@/components/ui/connection-banner'

// Lazy load heavy modal components — only fetched when opened
// Retry with full page reload on chunk load failure (stale deployment)
const SettingsPanel = lazy(() =>
  import('./settings-panel').then(m => ({ default: m.SettingsPanel })).catch(() => {
    window.location.reload()
    return new Promise(() => {}) // never resolves — page is reloading
  })
)
const CommandPalette = lazy(() =>
  import('./command-palette').then(m => ({ default: m.CommandPalette }))
)

const SIDEBAR_MIN = 280
const SIDEBAR_MAX = 600
const SIDEBAR_DEFAULT = 380

export function ChatLayout() {
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState<'main' | 'profile' | 'security' | 'about'>('main')
  const [showMobileSidebar, setShowMobileSidebar] = useState(true)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const activeRoom = useChatStore(s => s.activeRoom)
  const rooms = useChatStore(s => s.rooms)

  // Update document title with unread message count
  useEffect(() => {
    const totalUnread = rooms.reduce((sum, r) => sum + r.unreadCount, 0)
    document.title = totalUnread > 0 ? `(${totalUnread}) Messages` : 'Messages'
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
    if (history.state?.view !== 'chat') {
      history.pushState({ view: 'chat' }, '')
    }
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

  // Cmd/Ctrl+K to open command palette
  useEffect(() => {
    const handleCmdK = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowCommandPalette(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleCmdK)
    return () => window.removeEventListener('keydown', handleCmdK)
  }, [])

  // ? to toggle keyboard shortcuts overlay
  useEffect(() => {
    const handleShortcutKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
        e.preventDefault()
        setShowShortcuts(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleShortcutKey)
    return () => window.removeEventListener('keydown', handleShortcutKey)
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
      if (history.state?.view !== 'chat') {
        history.pushState({ view: 'chat' }, '')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white dark:bg-m3-surface">
      <ConnectionBanner />
      <div className="flex flex-1 min-h-0">
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
        <StatusBar />
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

      {/* Build version is shown in sidebar StatusBar */}
      </div>

      {/* Settings overlay — lazy loaded */}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsPanel onClose={() => setShowSettings(false)} initialSection={settingsSection} />
        </Suspense>
      )}

      {/* Command palette (Cmd/Ctrl+K) */}
      {showCommandPalette && (
        <Suspense fallback={null}>
          <CommandPalette
            onClose={() => setShowCommandPalette(false)}
            onSelectRoom={(room) => {
              useChatStore.getState().setActiveRoom(room)
              useChatStore.getState().markAsRead(room.roomId)
              setShowMobileSidebar(false)
              if (history.state?.view !== 'chat') {
                history.pushState({ view: 'chat' }, '')
              }
            }}
            onOpenSettings={() => { setSettingsSection('main'); setShowSettings(true) }}
          />
        </Suspense>
      )}

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={() => setShowShortcuts(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-scale-in dark:bg-m3-surface-container" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-m3-on-surface">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} className="rounded-full p-1 text-m3-on-surface-variant hover:bg-m3-surface-container">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                ['Ctrl/⌘ + K', 'Command palette'],
                ['Alt + 1-9', 'Switch between chats'],
                ['?', 'Show keyboard shortcuts'],
                ['Enter', 'Send message'],
                ['Escape', 'Close dialog / Cancel edit'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-m3-on-surface-variant">{desc}</span>
                  <kbd className="rounded-lg bg-m3-surface-container px-2.5 py-1 text-xs font-mono font-medium text-m3-on-surface dark:bg-m3-surface-container-high">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBar() {
  const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'
  return (
    <div className="flex-shrink-0 border-t border-m3-outline-variant/50 bg-m3-surface-container-lowest px-4 py-1.5 dark:border-m3-outline-variant/30 dark:bg-m3-surface">
      <p className="truncate text-[11px] font-mono text-m3-outline dark:text-m3-on-surface-variant/60">
        {buildVersion}
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[#f8f9fa] p-8 dark:bg-m3-surface">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 dark:bg-m3-primary-container/20">
        <MessageSquare className="h-10 w-10 text-m3-primary" />
      </div>
      <h3 className="mt-5 text-xl font-normal text-m3-on-surface">
        Messages for Matrix
      </h3>
      <p className="mt-2 max-w-xs text-center text-sm text-m3-on-surface-variant">
        Send and receive messages with your Matrix contacts. Select a conversation to get started.
      </p>
      <p className="mt-6 flex items-center gap-2 text-xs text-m3-outline">
        <kbd className="rounded-md bg-white px-2 py-0.5 font-mono shadow-sm dark:bg-m3-surface-container-high">Ctrl+K</kbd>
        <span>to open command palette</span>
      </p>
    </div>
  )
}
