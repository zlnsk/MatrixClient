'use client'

import { useEffect, useState, useCallback, useRef, useMemo, memo, lazy, Suspense } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore, type MatrixRoom } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'

// Lazy load modals — only fetched when opened
const NewChatModal = lazy(() => import('./new-chat-modal').then(m => ({ default: m.NewChatModal })))
const RoomDirectory = lazy(() => import('./room-directory').then(m => ({ default: m.RoomDirectory })))
import { formatDistanceToNow } from 'date-fns'
import {
  Search,
  Settings,
  Plus,
  Lock,
  Users,
  MessageSquare,
  X,
  Hash,
  Archive,
  ArchiveRestore,
  Check,
  Mail,
  Globe,
  Loader2,
  MessageSquareDashed,
} from 'lucide-react'

interface SidebarProps {
  onSettingsClick: () => void
  onChatSelect: () => void
}

export function Sidebar({ onSettingsClick, onChatSelect }: SidebarProps) {
  const user = useAuthStore(s => s.user)
  const { rooms, pendingInvites, loadRooms, setActiveRoom, activeRoom, markAsRead, archiveRoom, unarchiveRoom, acceptInvite, rejectInvite, searchMessages } = useChatStore()
  const [searchFilter, setSearchFilter] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [showInvites, setShowInvites] = useState(true)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [showDirectory, setShowDirectory] = useState(false)
  const [messageResults, setMessageResults] = useState<{roomId: string, roomName: string, eventId: string, sender: string, body: string, timestamp: number}[]>([])
  const [isSearchingMessages, setIsSearchingMessages] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (user) loadRooms()
  }, [user, loadRooms])

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
    if (room.isDirect && room.members.length > 0) {
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

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <Avatar
            src={user?.avatarUrl}
            name={user?.displayName || 'U'}
            size="md"
            status="online"
          />
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Matrix</h1>
            <p className="text-xs text-gray-500">{user?.userId}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowNewChat(true)}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
            title="New chat"
            aria-label="New chat"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowDirectory(true)}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
            title="Browse rooms"
            aria-label="Browse public rooms"
          >
            <Globe className="h-5 w-5" />
          </button>
          <button
            onClick={onSettingsClick}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            placeholder="Search rooms..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            aria-label="Search rooms and messages"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-inner transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Room list */}
      <nav className="flex-1 overflow-y-auto px-2" aria-label="Chat rooms">
        {/* Invitations section */}
        {pendingInvites.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => setShowInvites(!showInvites)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Mail className="h-3.5 w-3.5" />
              Invitations ({pendingInvites.length})
              <span className="ml-auto text-gray-400">{showInvites ? '▲' : '▼'}</span>
            </button>
            {inviteError && (
              <p className="px-3 py-1 text-xs text-red-500">{inviteError}</p>
            )}
            {showInvites && (
              <div className="space-y-0.5 py-1">
                {pendingInvites.map(invite => (
                  <div
                    key={invite.roomId}
                    className="flex items-center gap-3 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  >
                    <Avatar
                      src={invite.avatarUrl}
                      name={invite.name}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {invite.name}
                      </span>
                      <span className="text-xs text-gray-500">Invited</span>
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
                        className="rounded-lg p-1.5 text-green-600 transition-colors hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
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
                        className="rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
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

        {activeRooms.length === 0 && !showArchived ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-gray-300 dark:text-gray-700" />
            <p className="mt-3 text-sm text-gray-500">
              {searchFilter ? 'No rooms found' : 'No rooms yet'}
            </p>
            {!searchFilter && (
              <button
                onClick={() => setShowNewChat(true)}
                className="mt-3 text-sm text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Start a new chat
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5 py-1">
            {activeRooms.map(room => (
              <RoomListItem
                key={room.roomId}
                room={room}
                isActive={activeRoom?.roomId === room.roomId}
                onClick={() => handleSelectRoom(room)}
                onArchive={(e) => handleArchive(e, room)}
                avatarUrl={getOtherMemberAvatar(room)}
                presence={getOtherMemberPresence(room)}
              />
            ))}
          </div>
        )}

        {/* Archived section */}
        {archivedRooms.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Archive className="h-3.5 w-3.5" />
              Archived ({archivedRooms.length})
              <span className="ml-auto text-gray-400">{showArchived ? '▲' : '▼'}</span>
            </button>
            {showArchived && (
              <div className="space-y-0.5 py-1">
                {archivedRooms.map(room => (
                  <RoomListItem
                    key={room.roomId}
                    room={room}
                    isActive={activeRoom?.roomId === room.roomId}
                    onClick={() => handleSelectRoom(room)}
                    onArchive={(e) => handleArchive(e, room)}
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
          <div className="mt-2">
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-500">
              <MessageSquareDashed className="h-3.5 w-3.5" />
              Message Results
              {isSearchingMessages && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            {messageResults.length === 0 && !isSearchingMessages ? (
              <p className="px-3 py-2 text-xs text-gray-400">No messages found</p>
            ) : (
              <div className="space-y-0.5 py-1">
                {messageResults.map(result => (
                  <button
                    key={result.eventId}
                    onClick={() => {
                      const room = rooms.find(r => r.roomId === result.roomId)
                      if (room) {
                        handleSelectRoom(room)
                      } else {
                        // Room might not be in local state (e.g. left room still in search index)
                        // Create a minimal room object to allow navigation
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
                    className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-xs font-semibold text-indigo-500">{result.roomName}</span>
                        {result.timestamp > 0 && (
                          <span className="ml-2 flex-shrink-0 text-xs text-gray-400">
                            {formatDistanceToNow(new Date(result.timestamp), { addSuffix: false })}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        <span className="text-gray-400 dark:text-gray-500">{result.sender}: </span>
                        {result.body}
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

      {/* Room Directory Modal — lazy loaded */}
      {showDirectory && (
        <Suspense fallback={null}>
          <RoomDirectory
            onClose={() => setShowDirectory(false)}
            onRoomJoined={(roomId) => {
              const room = rooms.find(r => r.roomId === roomId)
              if (room) handleSelectRoom(room)
            }}
          />
        </Suspense>
      )}
    </>
  )
}

const RoomListItem = memo(function RoomListItem({
  room,
  isActive,
  onClick,
  onArchive,
  avatarUrl,
  presence,
}: {
  room: MatrixRoom
  isActive: boolean
  onClick: () => void
  onArchive: (e: React.MouseEvent) => void
  avatarUrl: string | null
  presence: 'online' | 'offline' | 'away' | null
}) {
  const lastMsgPreview = room.lastMessage
    ? room.lastMessage.substring(0, 50) + (room.lastMessage.length > 50 ? '...' : '')
    : 'No messages yet'

  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-150 ${
        isActive
          ? 'bg-indigo-50 shadow-[0_2px_8px_rgba(99,102,241,0.15)] ring-1 ring-indigo-200/50 dark:bg-gray-800 dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] dark:ring-gray-700/50'
          : 'hover:bg-gray-50 hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:hover:bg-gray-800/60 dark:hover:shadow-[0_1px_4px_rgba(0,0,0,0.2)]'
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
          <span className={`truncate font-semibold ${isActive ? 'text-indigo-700 dark:text-white' : 'text-gray-900 dark:text-white'}`}>
            {room.name}
          </span>
          {room.lastMessageTs > 0 && (
            <span className="ml-2 flex-shrink-0 text-xs text-gray-400">
              {formatDistanceToNow(new Date(room.lastMessageTs), { addSuffix: false })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {room.lastSenderName && <span className="text-gray-400 dark:text-gray-500">{room.lastSenderName}: </span>}
            {lastMsgPreview}
          </p>
          <div className="ml-2 flex items-center gap-1">
            {room.unreadCount > 0 && (
              <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-medium text-white shadow-sm shadow-indigo-600/30">
                {room.unreadCount > 99 ? '99+' : room.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="relative flex flex-col items-center gap-1">
        {!room.isDirect && (
          <Hash className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        )}
        {room.encrypted && (
          <Lock className="h-3 w-3 flex-shrink-0 text-green-500" />
        )}
        <button
          onClick={onArchive}
          className="absolute -right-1 -top-1 hidden rounded-full bg-white p-1 text-gray-400 shadow-sm transition-colors hover:text-indigo-500 group-hover:block dark:bg-gray-800"
          title={room.isArchived ? 'Unarchive' : 'Archive'}
        >
          {room.isArchived ? (
            <ArchiveRestore className="h-3 w-3" />
          ) : (
            <Archive className="h-3 w-3" />
          )}
        </button>
      </div>
    </button>
  )
}, (prevProps, nextProps) => {
  // Custom comparator: skip re-render if the room data we display hasn't changed
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
