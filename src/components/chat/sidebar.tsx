'use client'

import { useEffect, useState, useCallback, useRef, useMemo, memo, lazy, Suspense } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore, type MatrixRoom } from '@/stores/chat-store'
import { useTheme } from '@/components/providers/theme-provider'
import { Avatar } from '@/components/ui/avatar'

// Lazy load modals — only fetched when opened
const NewChatModal = lazy(() => import('./new-chat-modal').then(m => ({ default: m.NewChatModal })))
import { formatDistanceToNow } from 'date-fns'
import {
  Search,
  Settings,
  Lock,
  Users,
  MessageSquare,
  X,
  Hash,
  Archive,
  ArchiveRestore,
  Check,
  Mail,
  Sun,
  Moon,
  Loader2,
  MessageSquareDashed,
  Menu,
  MessageCircle,
  ChevronRight,
  Trash2,
} from 'lucide-react'

interface SidebarProps {
  onSettingsClick: () => void
  onChatSelect: () => void
  onProfileClick: () => void
}

export function Sidebar({ onSettingsClick, onChatSelect, onProfileClick }: SidebarProps) {
  const user = useAuthStore(s => s.user)
  const { rooms, pendingInvites, loadRooms, setActiveRoom, activeRoom, markAsRead, archiveRoom, unarchiveRoom, leaveRoom, acceptInvite, rejectInvite, searchMessages } = useChatStore()
  const { theme, toggleTheme } = useTheme()
  const [searchFilter, setSearchFilter] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [showInvites, setShowInvites] = useState(true)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [messageResults, setMessageResults] = useState<{roomId: string, roomName: string, eventId: string, sender: string, body: string, timestamp: number}[]>([])
  const [isSearchingMessages, setIsSearchingMessages] = useState(false)
  const [showHamburger, setShowHamburger] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hamburgerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user) loadRooms()
  }, [user, loadRooms])

  // Close hamburger on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (hamburgerRef.current && !hamburgerRef.current.contains(e.target as Node)) {
        setShowHamburger(false)
      }
    }
    if (showHamburger) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [showHamburger])

  // Debounced message search when query has 3+ characters
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    if (searchFilter.trim().length >= 3) {
      setIsSearchingMessages(true)
      searchDebounceRef.current = setTimeout(async () => {
        const results = await searchMessages(searchFilter.trim())
        setMessageResults(results)
        setIsSearchingMessages(false)
      }, 400)
    } else {
      setMessageResults([])
      setIsSearchingMessages(false)
    }

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
    }
  }, [searchFilter, searchMessages])

  const handleSelectRoom = useCallback(async (room: MatrixRoom) => {
    setActiveRoom(room)
    await markAsRead(room.roomId)
    onChatSelect()
  }, [setActiveRoom, markAsRead, onChatSelect])

  const activeRooms = useMemo(() => rooms.filter(room =>
    !room.isArchived && room.name.toLowerCase().includes(searchFilter.toLowerCase())
  ), [rooms, searchFilter])
  const archivedRooms = useMemo(() => rooms.filter(room =>
    room.isArchived && room.name.toLowerCase().includes(searchFilter.toLowerCase())
  ), [rooms, searchFilter])

  const getOtherMemberAvatar = (room: MatrixRoom) => {
    // For DMs or small rooms without an explicit room avatar, use the other
    // member's avatar. After bridge room recreation, m.direct may not be set
    // so we also check member count as a heuristic.
    const usesMemberAvatar = room.isDirect
      || (!room.avatarUrl && room.members.length > 0 && room.members.length <= 2)
    if (usesMemberAvatar && room.members.length > 0) {
      const other = room.members.find(m => m.userId !== user?.userId)
      return other?.avatarUrl || room.avatarUrl
    }
    return room.avatarUrl
  }

  const getOtherMemberPresence = (room: MatrixRoom): 'online' | 'offline' | 'away' | null => {
    if (room.isDirect) {
      const other = room.members.find(m => m.userId !== user?.userId)
      if (other?.presence === 'online') return 'online'
      if (other?.presence === 'unavailable') return 'away'
      if (other?.presence === 'offline') return 'offline'
    }
    return null
  }

  const handleArchive = async (e: React.MouseEvent, room: MatrixRoom) => {
    e.stopPropagation()
    if (room.isArchived) {
      await unarchiveRoom(room.roomId)
    } else {
      await archiveRoom(room.roomId)
      if (activeRoom?.roomId === room.roomId) {
        setActiveRoom(null)
      }
    }
  }

  const [confirmDeleteRoom, setConfirmDeleteRoom] = useState<MatrixRoom | null>(null)

  const handleLeave = (e: React.MouseEvent, room: MatrixRoom) => {
    e.stopPropagation()
    setConfirmDeleteRoom(room)
  }

  const confirmLeave = async () => {
    if (!confirmDeleteRoom) return
    if (activeRoom?.roomId === confirmDeleteRoom.roomId) {
      setActiveRoom(null)
    }
    await leaveRoom(confirmDeleteRoom.roomId)
    setConfirmDeleteRoom(null)
  }

  return (
    <>
      {/* Header — Google Messages style */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="relative" ref={hamburgerRef}>
          <button
            onClick={() => setShowHamburger(!showHamburger)}
            className="rounded-full p-2 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container active:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-high"
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Hamburger dropdown */}
          {showHamburger && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-2xl border border-m3-outline-variant bg-white py-2 shadow-xl animate-slide-in dark:border-m3-outline-variant dark:bg-m3-surface-container">
              {/* App title */}
              <div className="px-6 py-3 border-b border-m3-outline-variant">
                <h2 className="text-lg text-m3-on-surface"><span className="font-light">szept</span> <span className="font-bold">matrix</span></h2>
                <p className="text-xs text-m3-on-surface-variant">{user?.userId}</p>
              </div>

              <div className="py-1">
                <button
                  onClick={() => { onSettingsClick(); setShowHamburger(false) }}
                  className="flex w-full items-center gap-4 px-6 py-3 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                >
                  <Settings className="h-5 w-5 text-m3-on-surface-variant" />
                  Settings
                </button>
                <button
                  onClick={() => { toggleTheme(); setShowHamburger(false) }}
                  className="flex w-full items-center gap-4 px-6 py-3 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                >
                  {theme === 'dark' ? <Sun className="h-5 w-5 text-m3-on-surface-variant" /> : <Moon className="h-5 w-5 text-m3-on-surface-variant" />}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
              </div>
            </div>
          )}
        </div>

        <h1 className="flex-1 text-xl text-m3-on-surface"><span className="font-light">szept</span> <span className="font-bold">matrix</span></h1>

        <button
          onClick={onProfileClick}
          className="rounded-full transition-opacity hover:opacity-80"
          aria-label="Profile settings"
        >
          <Avatar
            src={user?.avatarUrl}
            name={user?.displayName || 'U'}
            size="sm"
            status="online"
          />
        </button>
      </div>

      {/* FAB — Start chat (Google Messages style) */}
      <div className="px-4 pb-3">
        <button
          onClick={() => setShowNewChat(true)}
          className="flex items-center gap-3 rounded-2xl bg-m3-primary-container px-5 py-3.5 text-base font-medium text-m3-on-primary-container shadow-sm transition-all hover:shadow-md active:shadow-sm md:text-sm"
        >
          <MessageCircle className="h-5 w-5" />
          Start chat
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-m3-on-surface-variant" />
          <input
            type="search"
            placeholder="Search conversations"
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            aria-label="Search rooms and messages"
            className="w-full rounded-full bg-m3-surface-container py-2.5 pl-11 pr-11 text-base text-m3-on-surface placeholder-m3-outline transition-colors focus:bg-m3-surface-container-high focus:outline-none dark:bg-m3-surface-container dark:text-m3-on-surface dark:placeholder-m3-outline dark:focus:bg-m3-surface-container-high md:text-sm"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-m3-on-surface-variant hover:text-m3-on-surface"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Room list */}
      <nav className="flex-1 overflow-y-auto" aria-label="Chat rooms">
        {/* Invitations section */}
        {pendingInvites.length > 0 && (
          <div className="mb-1">
            <button
              onClick={() => setShowInvites(!showInvites)}
              className="flex w-full items-center gap-3 px-5 py-2.5 text-xs font-medium text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
            >
              <Mail className="h-4 w-4" />
              Invitations ({pendingInvites.length})
              <span className="ml-auto text-m3-outline">{showInvites ? '▲' : '▼'}</span>
            </button>
            {inviteError && (
              <p className="px-5 py-1 text-xs text-m3-error">{inviteError}</p>
            )}
            {showInvites && (
              <div>
                {pendingInvites.map(invite => (
                  <div
                    key={invite.roomId}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                  >
                    <Avatar
                      src={invite.avatarUrl}
                      name={invite.name}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-m3-on-surface">
                        {invite.name}
                      </span>
                      <span className="text-xs text-m3-on-surface-variant">Invited</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          try {
                            setInviteError(null)
                            await acceptInvite(invite.roomId)
                          } catch (err) {
                            setInviteError(`Failed to accept: ${err instanceof Error ? err.message : 'Unknown error'}`)
                          }
                        }}
                        className="rounded-full p-2 text-green-600 transition-colors hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
                        title="Accept invitation"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            setInviteError(null)
                            await rejectInvite(invite.roomId)
                          } catch (err) {
                            setInviteError(`Failed to reject: ${err instanceof Error ? err.message : 'Unknown error'}`)
                          }
                        }}
                        className="rounded-full p-2 text-m3-error transition-colors hover:bg-red-100 dark:text-m3-error dark:hover:bg-red-900/30"
                        title="Reject invitation"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeRooms.length === 0 && !showArchived && !(searchFilter.trim() && archivedRooms.length > 0) ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="h-12 w-12 text-m3-outline-variant" />
            <p className="mt-4 text-sm text-m3-on-surface-variant">
              {searchFilter ? 'No conversations found' : 'No conversations yet'}
            </p>
            {!searchFilter && (
              <button
                onClick={() => setShowNewChat(true)}
                className="mt-3 text-sm font-medium text-m3-primary transition-colors hover:text-m3-primary/80"
              >
                Start a new chat
              </button>
            )}
          </div>
        ) : (
          <div>
            {activeRooms.map(room => (
              <RoomListItem
                key={room.roomId}
                room={room}
                isActive={activeRoom?.roomId === room.roomId}
                onClick={() => handleSelectRoom(room)}
                onArchive={(e) => handleArchive(e, room)}
                onDelete={(e) => handleLeave(e, room)}
                avatarUrl={getOtherMemberAvatar(room)}
                presence={getOtherMemberPresence(room)}
              />
            ))}
          </div>
        )}

        {/* Archived section — collapsible in chat list */}
        {archivedRooms.length > 0 && (
          <div className="border-t border-m3-outline-variant">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex w-full items-center gap-2 px-5 py-2.5 text-xs font-medium text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${showArchived ? 'rotate-90' : ''}`} />
              <Archive className="h-3.5 w-3.5" />
              Archived ({archivedRooms.length})
            </button>
            {(showArchived || (searchFilter.trim() && archivedRooms.length > 0)) && (
              <div>
                {archivedRooms.map(room => (
                  <RoomListItem
                    key={room.roomId}
                    room={room}
                    isActive={activeRoom?.roomId === room.roomId}
                    onClick={() => handleSelectRoom(room)}
                    onArchive={(e) => handleArchive(e, room)}
                    onDelete={(e) => handleLeave(e, room)}
                    avatarUrl={getOtherMemberAvatar(room)}
                    presence={getOtherMemberPresence(room)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message search results */}
        {searchFilter.trim().length >= 3 && (
          <div className="border-t border-m3-outline-variant">
            <div className="flex items-center gap-3 px-5 py-2.5 text-xs font-medium text-m3-on-surface-variant">
              <MessageSquareDashed className="h-4 w-4" />
              Message Results
              {isSearchingMessages && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            {messageResults.length === 0 && !isSearchingMessages ? (
              <p className="px-4 py-3.5 text-xs text-m3-outline">No messages found</p>
            ) : (
              <div>
                {messageResults.map(result => (
                  <button
                    key={result.eventId}
                    onClick={() => {
                      const room = rooms.find(r => r.roomId === result.roomId)
                      if (room) {
                        handleSelectRoom(room)
                      } else {
                        handleSelectRoom({
                          roomId: result.roomId,
                          name: result.roomName,
                          avatarUrl: null,
                          topic: null,
                          isDirect: false,
                          lastMessage: null,
                          lastMessageTs: 0,
                          lastSenderName: null,
                          unreadCount: 0,
                          members: [],
                          encrypted: false,
                          isArchived: false,
                          isBridged: false,
                        })
                      }
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-xs font-medium text-m3-primary">{result.roomName}</span>
                        {result.timestamp > 0 && (
                          <span className="ml-2 flex-shrink-0 text-xs text-m3-on-surface-variant">
                            {formatDistanceToNow(new Date(result.timestamp), { addSuffix: false })}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-m3-on-surface-variant">
                        <span className="text-m3-outline">{result.sender}: </span>
                        <span>{(() => {
                          const escaped = searchFilter.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                          if (escaped.length < 2) return result.body
                          const parts = result.body.split(new RegExp(`(${escaped})`, 'gi'))
                          return parts.map((part, i) =>
                            i % 2 === 1
                              ? <mark key={i} className="rounded-sm bg-yellow-300/80 text-inherit dark:bg-yellow-500/40">{part}</mark>
                              : part
                          )
                        })()}</span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* New Chat Modal — lazy loaded */}
      {showNewChat && (
        <Suspense fallback={null}>
          <NewChatModal
            onClose={() => setShowNewChat(false)}
            onRoomCreated={(roomId) => {
              const room = rooms.find(r => r.roomId === roomId)
              if (room) handleSelectRoom(room)
            }}
          />
        </Suspense>
      )}

      {/* Delete confirmation dialog */}
      {confirmDeleteRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmDeleteRoom(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-m3-surface-container" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-medium text-m3-on-surface dark:text-m3-on-surface">Delete conversation?</h3>
            <p className="mt-2 text-sm text-m3-on-surface-variant dark:text-m3-outline">
              Leave and remove <strong>{confirmDeleteRoom.name}</strong>? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteRoom(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
              >
                Cancel
              </button>
              <button
                onClick={confirmLeave}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}

const RoomListItem = memo(function RoomListItem({
  room,
  isActive,
  onClick,
  onArchive,
  onDelete,
  avatarUrl,
  presence,
}: {
  room: MatrixRoom
  isActive: boolean
  onClick: () => void
  onArchive: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  avatarUrl: string | null
  presence: 'online' | 'offline' | 'away' | null
}) {
  const lastMsgPreview = room.lastMessage
    ? room.lastMessage.substring(0, 60) + (room.lastMessage.length > 60 ? '...' : '')
    : 'No messages yet'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className={`group flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors duration-75 ${
        isActive
          ? 'bg-m3-primary-container/50 dark:bg-m3-surface-container-high'
          : 'hover:bg-m3-surface-container active:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-high/60 dark:active:bg-m3-surface-container-highest'
      }`}
    >
      <Avatar
        src={avatarUrl}
        name={room.name}
        size="md"
        status={presence}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="truncate text-[17px] font-medium text-m3-on-surface md:text-[15px]">
            {room.name}
          </span>
          {room.lastMessageTs > 0 && (
            <span className="ml-2 flex-shrink-0 text-sm text-m3-on-surface-variant md:text-xs">
              {formatDistanceToNow(new Date(room.lastMessageTs), { addSuffix: false })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="truncate text-[15px] text-m3-on-surface-variant md:text-[13px]">
            {room.lastSenderName && <span>{room.lastSenderName}: </span>}
            {lastMsgPreview}
          </p>
          <div className="ml-2 flex items-center gap-1.5">
            {room.encrypted && (
              <Lock className="h-3 w-3 flex-shrink-0 text-m3-on-surface-variant" />
            )}
            {room.unreadCount > 0 && (
              <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-m3-primary px-1.5 text-[13px] font-medium text-white md:text-[11px]">
                {room.unreadCount > 99 ? '99+' : room.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Archive & Delete buttons on hover */}
      <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-all group-hover:opacity-100">
        <button
          onClick={onArchive}
          className="rounded-full p-1.5 text-m3-outline transition-colors hover:bg-m3-surface-container-high hover:text-m3-on-surface dark:hover:bg-m3-surface-container-highest"
          title={room.isArchived ? 'Unarchive' : 'Archive'}
        >
          {room.isArchived ? (
            <ArchiveRestore className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={onDelete}
          className="rounded-full p-1.5 text-m3-outline transition-colors hover:bg-m3-error-container hover:text-m3-error dark:hover:bg-m3-error-container"
          title="Leave chat"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  const prevRoom = prevProps.room
  const nextRoom = nextProps.room
  return (
    prevRoom.roomId === nextRoom.roomId &&
    prevRoom.name === nextRoom.name &&
    prevRoom.lastMessage === nextRoom.lastMessage &&
    prevRoom.lastMessageTs === nextRoom.lastMessageTs &&
    prevRoom.lastSenderName === nextRoom.lastSenderName &&
    prevRoom.unreadCount === nextRoom.unreadCount &&
    prevRoom.isDirect === nextRoom.isDirect &&
    prevRoom.encrypted === nextRoom.encrypted &&
    prevRoom.isArchived === nextRoom.isArchived &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.avatarUrl === nextProps.avatarUrl &&
    prevProps.presence === nextProps.presence
  )
})
