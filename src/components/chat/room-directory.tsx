'use client'

import { useState } from 'react'
import { getMatrixClient } from '@/lib/matrix/client'
import { useChatStore } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'
import { Search, Globe, Loader2, Users, Lock, Hash } from 'lucide-react'
import { DotGrid } from '@/components/ui/dot-grid'

interface RoomDirectoryProps {
  onClose: () => void
  onRoomJoined: (roomId: string) => void
}

interface PublicRoom {
  roomId: string
  name: string
  topic: string | null
  avatarUrl: string | null
  memberCount: number
  worldReadable: boolean
  guestCanJoin: boolean
  alias: string | null
}

export function RoomDirectory({ onClose, onRoomJoined }: RoomDirectoryProps) {
  const { loadRooms } = useChatStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [rooms, setRooms] = useState<PublicRoom[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [joiningRoom, setJoiningRoom] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  const searchRooms = async () => {
    const client = getMatrixClient()
    if (!client) return

    setIsLoading(true)
    setError('')
    setHasSearched(true)
    try {
      const response = await client.publicRooms({
        limit: 50,
        filter: searchTerm.trim() ? { generic_search_term: searchTerm.trim() } : undefined,
      })

      setRooms(
        (response.chunk || []).map((r: any) => ({
          roomId: r.room_id,
          name: r.name || r.canonical_alias || r.room_id,
          topic: r.topic || null,
          avatarUrl: r.avatar_url ? client.mxcUrlToHttp(r.avatar_url, 48, 48, 'crop') : null,
          memberCount: r.num_joined_members || 0,
          worldReadable: r.world_readable || false,
          guestCanJoin: r.guest_can_join || false,
          alias: r.canonical_alias || null,
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rooms')
    } finally {
      setIsLoading(false)
    }
  }

  const joinRoom = async (roomId: string) => {
    const client = getMatrixClient()
    if (!client) return

    setJoiningRoom(roomId)
    try {
      await client.joinRoom(roomId)
      loadRooms()
      onRoomJoined(roomId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room')
    } finally {
      setJoiningRoom(null)
    }
  }

  // Check if user is already in a room
  const client = getMatrixClient()
  const joinedRoomIds = new Set((client?.getRooms() || []).filter(r => r.getMyMembership() === 'join').map(r => r.roomId))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex h-[600px] w-full max-w-2xl animate-slide-in flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
        <DotGrid />
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-800">
          <Globe className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Room Directory</h2>
        </div>

        {/* Search */}
        <div className="border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search public rooms..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchRooms()}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
              />
            </div>
            <button
              onClick={searchRooms}
              disabled={isLoading}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>

        {/* Room list */}
        <div className="flex-1 overflow-y-auto p-2">
          {!hasSearched ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              <p className="text-sm">Search for public rooms to browse</p>
            </div>
          ) : rooms.length === 0 && !isLoading ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              <p className="text-sm">No rooms found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {rooms.map(room => (
                <div key={room.roomId} className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <Avatar src={room.avatarUrl} name={room.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{room.name}</p>
                      <Hash className="h-3 w-3 flex-shrink-0 text-gray-400" />
                    </div>
                    {room.alias && <p className="truncate text-xs text-indigo-400">{room.alias}</p>}
                    {room.topic && <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{room.topic}</p>}
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{room.memberCount}</span>
                    </div>
                  </div>
                  {joinedRoomIds.has(room.roomId) ? (
                    <span className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Joined</span>
                  ) : (
                    <button
                      onClick={() => joinRoom(room.roomId)}
                      disabled={joiningRoom === room.roomId}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {joiningRoom === room.roomId ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Join'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
