'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useChatStore, type MatrixRoom } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'
import { getProfileCache } from '@/lib/profile-cache'
import { useAuthStore } from '@/stores/auth-store'
import { Search, MessageSquare, Settings, Moon, Sun, Lock, Users } from 'lucide-react'

interface CommandPaletteProps {
  onClose: () => void
  onSelectRoom: (room: MatrixRoom) => void
  onOpenSettings: () => void
}

export function CommandPalette({ onClose, onSelectRoom, onOpenSettings }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const rooms = useChatStore(s => s.rooms)
  const user = useAuthStore(s => s.user)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Build results: rooms + actions
  const results = useMemo(() => {
    const q = query.toLowerCase().trim()
    const items: { type: 'room' | 'action'; room?: MatrixRoom; label: string; icon: string; action?: () => void }[] = []

    // Room results
    const filtered = rooms
      .filter(r => r.name.toLowerCase().includes(q || ''))
      .sort((a, b) => b.lastMessageTs - a.lastMessageTs)
      .slice(0, 10)

    for (const room of filtered) {
      items.push({ type: 'room', room, label: room.name, icon: room.isDirect ? 'dm' : 'group' })
    }

    // Action results (always show if query matches)
    const actions = [
      { label: 'Open Settings', icon: 'settings', action: () => { onOpenSettings(); onClose() } },
    ]

    for (const action of actions) {
      if (!q || action.label.toLowerCase().includes(q)) {
        items.push({ type: 'action', ...action })
      }
    }

    return items
  }, [query, rooms, onOpenSettings, onClose])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleSelect = useCallback((index: number) => {
    const item = results[index]
    if (!item) return
    if (item.type === 'room' && item.room) {
      onSelectRoom(item.room)
      onClose()
    } else if (item.action) {
      item.action()
    }
  }, [results, onSelectRoom, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSelect(selectedIndex)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [results.length, selectedIndex, handleSelect, onClose])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 animate-fade-in" />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-m3-outline-variant bg-white shadow-2xl animate-scale-in dark:border-m3-outline-variant dark:bg-m3-surface-container"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-m3-outline-variant px-4 py-3">
          <Search className="h-5 w-5 flex-shrink-0 text-m3-on-surface-variant" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search rooms, actions..."
            className="w-full bg-transparent text-base text-m3-on-surface placeholder-m3-outline focus:outline-none dark:text-m3-on-surface"
          />
          <kbd className="hidden flex-shrink-0 rounded-md border border-m3-outline-variant bg-m3-surface-container px-1.5 py-0.5 text-[10px] font-medium text-m3-on-surface-variant md:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-m3-on-surface-variant">No results found</p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.type === 'room' ? item.room!.roomId : item.label}
                onClick={() => handleSelect(i)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selectedIndex
                    ? 'bg-m3-primary-container/50 dark:bg-m3-surface-container-high'
                    : 'hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high'
                }`}
              >
                {item.type === 'room' && item.room ? (
                  <>
                    <Avatar
                      src={(() => {
                        if (!item.room.isDirect) return item.room.avatarUrl
                        const others = item.room.members.filter(m => m.userId !== user?.userId)
                        const puppet = others.find(m => /^@(signal_|telegram_|whatsapp_|slack_|discord_|instagram_)/.test(m.userId))
                        const partner = puppet || others[0]
                        if (partner) {
                          const cached = getProfileCache(partner.userId)
                          return cached || partner.avatarUrl || item.room.avatarUrl
                        }
                        return item.room.avatarUrl
                      })()}
                      name={item.room.name}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-m3-on-surface">{item.room.name}</p>
                      {item.room.lastMessage && (
                        <p className="truncate text-xs text-m3-on-surface-variant">{item.room.lastMessage.substring(0, 50)}</p>
                      )}
                    </div>
                    {item.room.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-m3-primary px-1.5 text-[11px] font-medium text-white">
                        {item.room.unreadCount}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-m3-surface-container dark:bg-m3-surface-container-high">
                      <Settings className="h-4 w-4 text-m3-on-surface-variant" />
                    </div>
                    <p className="text-sm text-m3-on-surface">{item.label}</p>
                  </>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-m3-outline-variant px-4 py-2">
          <span className="text-[10px] text-m3-outline">↑↓ navigate · Enter select · Esc close</span>
        </div>
      </div>
    </div>
  )
}
