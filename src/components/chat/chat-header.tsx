'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  Lock,
  Bell,
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
  const [showMenu, setShowMenu] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
        setShowLeaveConfirm(false)
      }
    }
    if (showMenu || showLeaveConfirm) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [showMenu, showLeaveConfirm])

  return (
    <div className="flex items-center border-b border-m3-outline-variant/50 bg-white px-2 py-2.5 dark:border-m3-outline-variant/50 dark:bg-m3-surface md:px-4">
      <button
        onClick={onBackClick}
        className="flex-shrink-0 rounded-full p-2 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container active:bg-m3-surface-container-high md:hidden"
        aria-label="Back to chat list"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      {/* Clickable room info area — opens room details */}
      <button
        onClick={onToggleRoomInfo}
        className="flex min-w-0 flex-1 items-center gap-3 px-2 rounded-xl transition-colors hover:bg-m3-surface-container cursor-pointer"
      >
        <Avatar
          src={headerAvatarUrl}
          name={roomDisplayName}
          size="md"
          status={isSmallOrBridged ? (otherMemberPresence === 'online' ? 'online' : otherMemberPresence === 'unavailable' ? 'away' : 'offline') : null}
        />
        <div className="min-w-0 flex-1 text-left">
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
      </button>

      {/* Notification bell + three-dot menu — Google Messages style */}
      <div className="flex items-center gap-0.5">
        <button
          className="rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>
        {/* Three-dot menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => { setShowMenu(!showMenu); setShowLeaveConfirm(false) }}
            className="rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container"
            title="More options"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {showMenu && !showLeaveConfirm && (
            <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-m3-outline-variant bg-white py-1.5 shadow-xl animate-scale-in dark:border-m3-outline-variant dark:bg-m3-surface-container">
              <button
                onClick={() => { onToggleRoomInfo(); setShowMenu(false) }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                Details
              </button>
              <button
                onClick={() => { onToggleSearch(); setShowMenu(false) }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                Search
              </button>
              {!activeRoom.isBridged && (
                <>
                  <button
                    onClick={() => { placeCall(activeRoom.roomId, false); setShowMenu(false) }}
                    className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                  >
                    Voice call
                  </button>
                  <button
                    onClick={() => { placeCall(activeRoom.roomId, true); setShowMenu(false) }}
                    className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                  >
                    Video call
                  </button>
                </>
              )}
              <button
                onClick={() => { onArchiveToggle(); setShowMenu(false) }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                {activeRoom.isArchived ? 'Unarchive' : 'Archive'}
              </button>
              <button
                onClick={() => { setShowLeaveConfirm(true); setShowMenu(false) }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                Delete
              </button>
            </div>
          )}
          {showLeaveConfirm && (
            <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-m3-outline-variant bg-white py-1.5 shadow-xl animate-scale-in dark:border-m3-outline-variant dark:bg-m3-surface-container">
              <p className="px-4 py-2 text-xs text-m3-on-surface-variant">Leave this room?</p>
              <button
                onClick={() => { onLeave(); setShowLeaveConfirm(false) }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-m3-error transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                Leave room
              </button>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
