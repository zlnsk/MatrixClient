'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  Lock,
  Phone,
  Video,
  Search,
  Archive,
  ArchiveRestore,
  LogOut,
  Info,
  MoreVertical,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { placeCall } from '@/lib/matrix/voip'
import type { MatrixRoom } from '@/stores/chat-store'

interface ChatHeaderProps {
  activeRoom: MatrixRoom
  roomDisplayName: string
  headerAvatarUrl: string | null | undefined
  roomStatus: string
  typingUsers: string[]
  isSmallOrBridged: boolean
  otherMemberPresence?: string | null
  onBackClick: () => void
  onToggleSearch: () => void
  onToggleRoomInfo: () => void
  onArchiveToggle: () => void
  onLeave: () => void
}

export function ChatHeader({
  activeRoom,
  roomDisplayName,
  headerAvatarUrl,
  roomStatus,
  typingUsers,
  isSmallOrBridged,
  otherMemberPresence,
  onBackClick,
  onToggleSearch,
  onToggleRoomInfo,
  onArchiveToggle,
  onLeave,
}: ChatHeaderProps) {
  const [showKebabMenu, setShowKebabMenu] = useState(false)
  const kebabRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setShowKebabMenu(false)
      }
    }
    if (showKebabMenu) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [showKebabMenu])

  return (
    <div className="flex items-center border-b border-m3-outline-variant bg-white px-2 py-2 dark:border-m3-outline-variant dark:bg-m3-surface-container md:px-4">
      <button
        onClick={onBackClick}
        className="flex-shrink-0 rounded-full p-2 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container active:bg-m3-surface-container-high md:hidden"
        aria-label="Back to chat list"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3 px-2">
        <Avatar
          src={headerAvatarUrl}
          name={roomDisplayName}
          size="md"
          status={isSmallOrBridged ? (otherMemberPresence === 'online' ? 'online' : otherMemberPresence === 'unavailable' ? 'away' : 'offline') : null}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium text-m3-on-surface">{roomDisplayName}</h2>
          <div className="flex items-center gap-1.5">
            {typingUsers.length > 0 ? (
              <span className="truncate text-xs text-m3-primary">
                {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
              </span>
            ) : (
              <span className="truncate text-xs text-m3-on-surface-variant">{roomStatus}</span>
            )}
            {activeRoom.encrypted && (
              <Lock className="h-3 w-3 flex-shrink-0 text-m3-on-surface-variant" />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center">
        {!activeRoom.isBridged && (
          <>
            <button
              onClick={() => placeCall(activeRoom.roomId, false)}
              className="hidden sm:flex rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container"
              title="Voice call"
            >
              <Phone className="h-5 w-5" />
            </button>
            <button
              onClick={() => placeCall(activeRoom.roomId, true)}
              className="hidden sm:flex rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container"
              title="Video call"
            >
              <Video className="h-5 w-5" />
            </button>
          </>
        )}
        {/* Kebab menu (3 dots) */}
        <div className="relative" ref={kebabRef}>
          <button
            onClick={() => setShowKebabMenu(!showKebabMenu)}
            className="rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container"
            aria-label="More options"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {showKebabMenu && (
            <div className="absolute right-0 top-full z-50 mt-1 w-60 rounded-2xl border border-m3-outline-variant bg-white py-2 shadow-xl animate-slide-in dark:border-m3-outline-variant dark:bg-m3-surface-container">
              <button
                onClick={() => { onToggleRoomInfo(); setShowKebabMenu(false) }}
                className="flex w-full items-center gap-4 px-5 py-3 text-sm whitespace-nowrap text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                <Info className="h-5 w-5 flex-shrink-0 text-m3-on-surface-variant" />
                Room details
              </button>
              <button
                onClick={() => { onToggleSearch(); setShowKebabMenu(false) }}
                className="flex w-full items-center gap-4 px-5 py-3 text-sm whitespace-nowrap text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                <Search className="h-5 w-5 flex-shrink-0 text-m3-on-surface-variant" />
                Search in conversation
              </button>
              {!activeRoom.isBridged && (
                <>
                  <button
                    onClick={() => { placeCall(activeRoom.roomId, false); setShowKebabMenu(false) }}
                    className="flex w-full items-center gap-4 px-5 py-3 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high sm:hidden"
                  >
                    <Phone className="h-5 w-5 text-m3-on-surface-variant" />
                    Voice call
                  </button>
                  <button
                    onClick={() => { placeCall(activeRoom.roomId, true); setShowKebabMenu(false) }}
                    className="flex w-full items-center gap-4 px-5 py-3 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                  >
                    <Video className="h-5 w-5 text-m3-on-surface-variant" />
                    Video call
                  </button>
                </>
              )}
              <div className="my-1 border-t border-m3-outline-variant" />
              <button
                onClick={() => { onArchiveToggle(); setShowKebabMenu(false) }}
                className="flex w-full items-center gap-4 px-5 py-3 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                {activeRoom.isArchived ? <ArchiveRestore className="h-5 w-5 text-m3-on-surface-variant" /> : <Archive className="h-5 w-5 text-m3-on-surface-variant" />}
                {activeRoom.isArchived ? 'Unarchive' : 'Archive'}
              </button>
              <button
                onClick={() => { onLeave(); setShowKebabMenu(false) }}
                className="flex w-full items-center gap-4 px-5 py-3 text-sm text-m3-error transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                <LogOut className="h-5 w-5" />
                Leave room
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
