'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore, type MatrixRoom } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'
import { NewChatModal } from './new-chat-modal'
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
} from 'lucide-react'

interface SidebarProps {
  onSettingsClick: () => void
  onChatSelect: () => void
}

export function Sidebar({ onSettingsClick, onChatSelect }: SidebarProps) {
  const user = useAuthStore(s => s.user)
  const { rooms, loadRooms, setActiveRoom, activeRoom, markAsRead, archiveRoom, unarchiveRoom } = useChatStore()
  const [searchFilter, setSearchFilter] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (user) loadRooms()
  }, [user, loadRooms])

  const handleSelectRoom = useCallback(async (room: MatrixRoom) => {
    setActiveRoom(room)
    await markAsRead(room.roomId)
    onChatSelect()
  }, [setActiveRoom, markAsRead, onChatSelect])

  const activeRooms = rooms.filter(room =>
    !room.isArchived && room.name.toLowerCase().includes(searchFilter.toLowerCase())
  )
  const archivedRooms = rooms.filter(room =>
    room.isArchived && room.name.toLowerCase().includes(searchFilter.toLowerCase())
  )

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
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            onClick={onSettingsClick}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
            title="Settings"
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
            type="text"
            placeholder="Search rooms..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
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
      <div className="flex-1 overflow-y-auto px-2">
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
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onRoomCreated={(roomId) => {
            const room = rooms.find(r => r.roomId === roomId)
            if (room) handleSelectRoom(room)
          }}
        />
      )}
    </>
  )
}

function RoomListItem({
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
      className={`group flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all ${
        isActive
          ? 'bg-indigo-50 shadow-md shadow-indigo-100/50 dark:bg-gray-800 dark:shadow-black/20'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
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
      <div className="flex flex-col items-center gap-1">
        {!room.isDirect && (
          <Hash className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        )}
        {room.encrypted && (
          <Lock className="h-3 w-3 flex-shrink-0 text-green-500" />
        )}
        <button
          onClick={onArchive}
          className="hidden rounded p-0.5 text-gray-400 transition-colors hover:text-indigo-500 group-hover:block"
          title={room.isArchived ? 'Unarchive' : 'Archive'}
        >
          {room.isArchived ? (
            <ArchiveRestore className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </button>
  )
}
