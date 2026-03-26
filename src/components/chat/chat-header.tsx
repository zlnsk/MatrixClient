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
  Trash2,
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
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const leaveRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (leaveRef.current && !leaveRef.current.contains(e.target as Node)) {
        setShowLeaveConfirm(false)
      }
    }
    if (showLeaveConfirm) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [showLeaveConfirm])

  return (
    <div className="flex items-center border-b border-m3-outline-variant bg-white px-2 py-2 dark:border-m3-outline-variant dark:bg-m3-surface-container md:px-4">
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

      {/* Inline action icons */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onToggleSearch}
          className="rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container"
          title="Search in conversation"
        >
          <Search className="h-5 w-5" />
        </button>
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
        <button
          onClick={onArchiveToggle}
          className="rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container"
          title={activeRoom.isArchived ? 'Unarchive' : 'Archive'}
        >
          {activeRoom.isArchived ? <ArchiveRestore className="h-5 w-5" /> : <Archive className="h-5 w-5" />}
        </button>
        {/* Leave with confirmation */}
        <div className="relative" ref={leaveRef}>
          <button
            onClick={() => setShowLeaveConfirm(!showLeaveConfirm)}
            className="rounded-full p-2.5 text-m3-on-surface-variant transition-colors hover:bg-m3-error-container hover:text-m3-error"
            title="Leave room"
          >
            <LogOut className="h-5 w-5" />
          </button>
          {showLeaveConfirm && (
            <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-2xl border border-m3-outline-variant bg-white py-2 shadow-xl animate-slide-in dark:border-m3-outline-variant dark:bg-m3-surface-container">
              <p className="px-4 py-2 text-xs text-m3-on-surface-variant">Leave this room?</p>
              <button
                onClick={() => { onLeave(); setShowLeaveConfirm(false) }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-m3-error transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                <LogOut className="h-4 w-4" />
                Leave room
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
