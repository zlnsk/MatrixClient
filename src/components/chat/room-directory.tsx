'use client'

import { useState } from 'react'
import { getMatrixClient } from '@/lib/matrix/client'
import { useChatStore } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'
import { Search, Globe, Loader2, Users, Lock, Hash } from 'lucide-react'

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
      <div className="relative flex h-[600px] w-full max-w-2xl animate-slide-in flex-col overflow-hidden rounded-2xl border border-m3-outline-variant bg-m3-surface-container-lowest shadow-2xl dark:border-m3-outline-variant dark:bg-m3-surface-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-m3-outline-variant p-4 dark:border-m3-outline-variant">
          <Globe className="h-5 w-5 text-m3-primary" />
          <h2 className="text-lg font-bold text-m3-on-surface dark:text-m3-on-surface">Room Directory</h2>
        </div>

        {/* Search */}
        <div className="border-b border-m3-outline-variant p-4 dark:border-m3-outline-variant">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-m3-outline" />
              <input
                type="text"
                placeholder="Search public rooms..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchRooms()}
                className="w-full rounded-lg border border-m3-outline-variant bg-m3-surface-container-low py-2.5 pl-10 pr-4 text-sm text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
              />
            </div>
            <button
              onClick={searchRooms}
              disabled={isLoading}
              className="rounded-lg bg-m3-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-m3-primary disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-m3-error">{error}</p>}
        </div>

        {/* Room list */}
        <div className="flex-1 overflow-y-auto p-2">
          {!hasSearched ? (
            <div className="flex h-full items-center justify-center text-m3-outline">
              <p className="text-sm">Search for public rooms to browse</p>
            </div>
          ) : rooms.length === 0 && !isLoading ? (
            <div className="flex h-full items-center justify-center text-m3-outline">
              <p className="text-sm">No rooms found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {rooms.map(room => (
                <div key={room.roomId} className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-m3-surface-container-low dark:hover:bg-m3-surface-container-high/50">
                  <Avatar src={room.avatarUrl} name={room.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-m3-on-surface dark:text-m3-on-surface">{room.name}</p>
                      <Hash className="h-3 w-3 flex-shrink-0 text-m3-outline" />
                    </div>
                    {room.alias && <p className="truncate text-xs text-m3-primary">{room.alias}</p>}
                    {room.topic && <p className="mt-0.5 truncate text-xs text-m3-on-surface-variant dark:text-m3-outline">{room.topic}</p>}
                    <div className="mt-1 flex items-center gap-3 text-xs text-m3-outline">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{room.memberCount}</span>
                    </div>
                  </div>
                  {joinedRoomIds.has(room.roomId) ? (
                    <span className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Joined</span>
                  ) : (
                    <button
                      onClick={() => joinRoom(room.roomId)}
                      disabled={joiningRoom === room.roomId}
                      className="rounded-lg bg-m3-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-m3-primary disabled:opacity-50"
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
