'use client'

import { useEffect, useState, useCallback, useRef, useMemo, memo, lazy, Suspense } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore, type MatrixRoom } from '@/stores/chat-store'
import { resolveRoomAvatarFromSDK } from '@/lib/matrix/client'
import { getAccountDataContent, setAccountData } from '@/lib/matrix/sdk-compat'
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
  Check,
  Mail,
  Sun,
  Moon,
  Loader2,
  MessageSquareDashed,
  Menu,
  MessageCircle,
  Plus,
  ChevronRight,
  Pencil,
} from 'lucide-react'
import { getMatrixClient } from '@/lib/matrix/client'

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
  const [roomFilter, setRoomFilter] = useState<'all' | 'unread' | 'direct' | 'groups'>('all')
  const [searchTab, setSearchTab] = useState<'conversations' | 'messages'>('conversations')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [messageResults, setMessageResults] = useState<{roomId: string, roomName: string, eventId: string, sender: string, body: string, timestamp: number}[]>([])
  const [isSearchingMessages, setIsSearchingMessages] = useState(false)
  const [showHamburger, setShowHamburger] = useState(false)
  const [showProfilePopover, setShowProfilePopover] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [currentPresence, setCurrentPresence] = useState<'online' | 'unavailable' | 'offline'>('online')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hamburgerRef = useRef<HTMLDivElement>(null)
  const profilePopoverRef = useRef<HTMLDivElement>(null)

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

  // Close profile popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node)) {
        setShowProfilePopover(false)
      }
    }
    if (showProfilePopover) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [showProfilePopover])

  // Load saved status and presence from server on mount
  useEffect(() => {
    const client = getMatrixClient()
    if (!client) return
    try {
      // Load status message from account data (persists across sessions)
      const statusData = getAccountDataContent(client, 'im.vector.web.status') as { status_msg?: string }
      if (statusData?.status_msg) setStatusText(statusData.status_msg)
      // Load current presence from the SDK's user object
      const myUser = client.getUser(client.getUserId()!)
      if (myUser?.presence) {
        setCurrentPresence(myUser.presence as 'online' | 'unavailable' | 'offline')
      }
    } catch { /* ignore — account data may not exist yet */ }
  }, [user])

  const handleSaveStatus = useCallback(async () => {
    const client = getMatrixClient()
    if (!client) return
    // Persist status message to account data (survives browser close)
    try {
      await setAccountData(client, 'im.vector.web.status', { status_msg: statusText || '' })
    } catch { /* ignore */ }
    // Also set presence with status_msg for real-time visibility to other users
    try {
      await (client as unknown as { setPresence: (opts: { presence: string; status_msg?: string }) => Promise<void> })
        .setPresence({ presence: currentPresence, status_msg: statusText || undefined })
    } catch { /* ignore */ }
  }, [statusText, currentPresence])

  const handleSetPresence = useCallback(async (presence: 'online' | 'unavailable' | 'offline') => {
    setCurrentPresence(presence)
    const client = getMatrixClient()
    if (!client) return
    try {
      await (client as unknown as { setPresence: (opts: { presence: string; status_msg?: string }) => Promise<void> })
        .setPresence({ presence, status_msg: statusText || undefined })
    } catch { /* ignore */ }
  }, [statusText])

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

  const activeRooms = useMemo(() => rooms.filter(room => {
    if (room.isArchived) return false
    if (searchFilter && !room.name.toLowerCase().includes(searchFilter.toLowerCase())) return false
    if (roomFilter === 'unread') return room.unreadCount > 0
    if (roomFilter === 'direct') return room.isDirect
    if (roomFilter === 'groups') return !room.isDirect
    return true
  }), [rooms, searchFilter, roomFilter])
  const archivedRooms = useMemo(() => rooms.filter(room =>
    room.isArchived && room.name.toLowerCase().includes(searchFilter.toLowerCase())
  ), [rooms, searchFilter])
  const unreadCount = useMemo(() => rooms.filter(r => !r.isArchived && r.unreadCount > 0).length, [rooms])

  // Avatar: roomToMatrixRoom() already computes the correct avatar via
  // Element Web's algorithm. Just use room.avatarUrl, with SDK fallback.
  const getOtherMemberAvatar = useCallback((room: MatrixRoom) => {
    if (room.avatarUrl) return room.avatarUrl
    return resolveRoomAvatarFromSDK(room.roomId)
  }, [])

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

  const handleMarkAsRead = async (e: React.MouseEvent, room: MatrixRoom) => {
    e.stopPropagation()
    await markAsRead(room.roomId)
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
      {/* Header — Google Messages Web style */}
      <div className="flex items-center gap-3 px-4 py-3">
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
                <h2 className="text-lg font-normal text-m3-on-surface">Messages</h2>
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

        <h1
          onClick={() => { setActiveRoom(null); onChatSelect() }}
          className="flex-1 cursor-pointer text-[22px] font-normal text-m3-on-surface transition-opacity hover:opacity-70"
        >Messages</h1>

        <button
          onClick={() => setShowNewChat(true)}
          className="rounded-full p-1.5 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container active:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-high"
          aria-label="Start new chat"
        >
          <Plus className="h-5 w-5" />
        </button>

        <div className="relative" ref={profilePopoverRef}>
          <button
            onClick={() => setShowProfilePopover(!showProfilePopover)}
            className="rounded-full transition-all hover:ring-2 hover:ring-m3-primary/30 active:scale-95"
            aria-label="Profile and status"
          >
            <Avatar
              src={user?.avatarUrl}
              name={user?.displayName || 'U'}
              size="md"
              status="online"
            />
          </button>

          {/* Profile popover */}
          {showProfilePopover && (
            <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-m3-outline-variant bg-white shadow-xl animate-scale-in dark:border-m3-outline-variant dark:bg-m3-surface-container">
              {/* User info */}
              <div className="flex items-center gap-3 px-5 py-4">
                <Avatar src={user?.avatarUrl} name={user?.displayName || 'U'} size="lg" status="online" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-m3-on-surface">{user?.displayName}</p>
                  <p className="truncate text-xs text-m3-on-surface-variant">{user?.userId}</p>
                </div>
              </div>

              {/* Status input */}
              <div className="border-t border-m3-outline-variant px-5 py-3 dark:border-m3-outline-variant">
                <label className="mb-1.5 block text-xs font-medium text-m3-on-surface-variant">Status message</label>
                <input
                  type="text"
                  value={statusText}
                  onChange={e => setStatusText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { handleSaveStatus(); setShowProfilePopover(false) } }}
                  placeholder="What's on your mind?"
                  className="w-full rounded-lg bg-m3-surface-container px-3 py-2 text-sm text-m3-on-surface placeholder-m3-outline transition-colors focus:bg-m3-surface-container-high focus:outline-none dark:bg-m3-surface-container-high dark:focus:bg-m3-surface-container-highest"
                />
              </div>

              {/* Presence selector */}
              <div className="border-t border-m3-outline-variant px-5 py-3 dark:border-m3-outline-variant">
                <label className="mb-2 block text-xs font-medium text-m3-on-surface-variant">Presence</label>
                <div className="flex gap-2">
                  {(['online', 'unavailable', 'offline'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => handleSetPresence(p)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        currentPresence === p
                          ? 'bg-m3-primary-container text-m3-primary ring-1 ring-m3-primary/30'
                          : 'bg-m3-surface-container text-m3-on-surface-variant hover:bg-m3-surface-container-high'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${
                        p === 'online' ? 'bg-green-500' : p === 'unavailable' ? 'bg-amber-500' : 'bg-gray-400'
                      }`} />
                      {p === 'online' ? 'Online' : p === 'unavailable' ? 'Away' : 'Offline'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-m3-outline-variant dark:border-m3-outline-variant">
                <button
                  onClick={() => { onProfileClick(); setShowProfilePopover(false) }}
                  className="flex w-full items-center gap-3 px-5 py-3 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container first:rounded-t-none last:rounded-b-2xl dark:hover:bg-m3-surface-container-high"
                >
                  <Pencil className="h-4 w-4 text-m3-on-surface-variant" />
                  Edit profile
                </button>
              </div>
            </div>
          )}
        </div>
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

      {/* Filter chips */}
      {!searchFilter && (
        <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto no-scrollbar">
          {([
            { key: 'all' as const, label: 'All' },
            { key: 'unread' as const, label: 'Unread', count: unreadCount },
            { key: 'direct' as const, label: 'Direct' },
            { key: 'groups' as const, label: 'Groups' },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setRoomFilter(f.key)}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                roomFilter === f.key
                  ? 'bg-m3-primary text-white'
                  : 'bg-m3-surface-container text-m3-on-surface-variant hover:bg-m3-surface-container-high dark:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-highest'
              }`}
            >
              {f.label}{f.count && f.count > 0 ? ` (${f.count})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Search tabs — when searching */}
      {searchFilter.trim().length >= 1 && (
        <div className="flex gap-0 border-b border-m3-outline-variant px-4">
          <button
            onClick={() => setSearchTab('conversations')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              searchTab === 'conversations'
                ? 'border-b-2 border-m3-primary text-m3-primary'
                : 'text-m3-on-surface-variant hover:text-m3-on-surface'
            }`}
          >
            Conversations
          </button>
          <button
            onClick={() => setSearchTab('messages')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              searchTab === 'messages'
                ? 'border-b-2 border-m3-primary text-m3-primary'
                : 'text-m3-on-surface-variant hover:text-m3-on-surface'
            }`}
          >
            Messages {isSearchingMessages && '...'}
          </button>
        </div>
      )}

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

        {/* Show rooms when not searching OR when on "conversations" tab */}
        {(!searchFilter.trim() || searchTab === 'conversations') && (activeRooms.length === 0 && !showArchived && !(searchFilter.trim() && archivedRooms.length > 0)) ? (
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
        ) : (!searchFilter.trim() || searchTab === 'conversations') ? (
          <div>
            {activeRooms.map(room => (
              <RoomListItem
                key={room.roomId}
                room={room}
                isActive={activeRoom?.roomId === room.roomId}
                onClick={() => handleSelectRoom(room)}
                onArchive={(e) => handleArchive(e, room)}
                onDelete={(e) => handleLeave(e, room)}
                onMarkAsRead={(e) => handleMarkAsRead(e, room)}
                avatarUrl={getOtherMemberAvatar(room)}
                presence={getOtherMemberPresence(room)}
              />
            ))}
          </div>
        ) : null}

        {/* Archived section — collapsible in chat list */}
        {(!searchFilter.trim() || searchTab === 'conversations') && archivedRooms.length > 0 && (
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

        {/* Message search results — only in messages tab */}
        {searchFilter.trim().length >= 3 && searchTab === 'messages' && (
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
  onMarkAsRead,
  avatarUrl,
  presence,
}: {
  room: MatrixRoom
  isActive: boolean
  onClick: () => void
  onArchive: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onMarkAsRead: (e: React.MouseEvent) => void
  avatarUrl: string | null
  presence: 'online' | 'offline' | 'away' | null
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const lastMsgPreview = room.lastMessage
    ? room.lastMessage.substring(0, 60) + (room.lastMessage.length > 60 ? '...' : '')
    : 'No messages yet'

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    if (!contextMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
        className={`group relative flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-all duration-150 active:scale-[0.99] ${
          isActive
            ? 'bg-m3-primary-container/40 dark:bg-m3-surface-container-high'
            : 'hover:bg-m3-surface-container active:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-high/60 dark:active:bg-m3-surface-container-highest'
        }`}
      >
        <Avatar
          src={avatarUrl}
          name={room.name}
          size="lg"
          status={presence}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className={`truncate text-[16px] md:text-[15px] ${room.unreadCount > 0 ? 'font-semibold text-m3-on-surface' : 'font-normal text-m3-on-surface'}`}>
              {room.name}
            </span>
            {room.lastMessageTs > 0 && (
              <span className={`ml-2 flex-shrink-0 text-xs ${room.unreadCount > 0 ? 'font-medium text-m3-primary' : 'text-m3-on-surface-variant'}`}>
                {formatDistanceToNow(new Date(room.lastMessageTs), { addSuffix: false })}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <p className={`truncate text-[14px] md:text-[13px] ${room.unreadCount > 0 ? 'font-medium text-m3-on-surface dark:text-m3-on-surface-variant' : 'text-m3-on-surface-variant'}`}>
              {room.lastSenderName && <span className="text-m3-on-surface-variant">{room.lastSenderName}: </span>}
              {lastMsgPreview}
            </p>
            <div className="ml-2 flex items-center gap-1.5">
              {room.encrypted && (
                <Lock className="h-3 w-3 flex-shrink-0 text-m3-on-surface-variant" />
              )}
              {room.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-m3-primary px-1.5 text-[11px] font-bold text-white">
                  {room.unreadCount > 99 ? '99+' : room.unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-52 rounded-xl border border-m3-outline-variant bg-white py-1.5 shadow-xl animate-scale-in dark:border-m3-outline-variant dark:bg-m3-surface-container"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={(e) => { onArchive(e); setContextMenu(null) }}
            className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
          >
            {room.isArchived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            onClick={(e) => { onDelete(e); setContextMenu(null) }}
            className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
          >
            Delete
          </button>
          {room.unreadCount > 0 && (
            <button
              onClick={(e) => { onMarkAsRead(e); setContextMenu(null) }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-m3-on-surface transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high"
            >
              Mark as read
            </button>
          )}
        </div>
      )}
    </>
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
