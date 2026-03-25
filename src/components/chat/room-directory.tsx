'use client'

import { useState } from 'react'
import { getMatrixClient } from '@/lib/matrix/client'
import { useChatStore } from '@/stores/chat-store'
import { Avatar } from '@/components/ui/avatar'
import { Search, Loader2, Users, Hash, ArrowLeft } from 'lucide-react'

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

  const client = getMatrixClient()
  const joinedRoomIds = new Set((client?.getRooms() || []).filter(r => r.getMyMembership() === 'join').map(r => r.roomId))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-m3-surface animate-fade-in safe-area-pad">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-m3-outline-variant bg-white px-2 py-2 dark:border-m3-outline-variant dark:bg-m3-surface-container md:px-4">
        <button onClick={onClose} className="rounded-full p-2 text-m3-on-surface-variant transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-base font-medium text-m3-on-surface dark:text-m3-on-surface">Room Directory</h2>
      </div>

      {/* Search bar */}
      <div className="border-b border-m3-outline-variant px-4 py-3 dark:border-m3-outline-variant md:px-6">
        <div className="mx-auto flex max-w-lg gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-m3-outline" />
            <input
              type="text"
              placeholder="Search public rooms..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchRooms()}
              autoFocus
              className="w-full rounded-2xl border border-m3-outline-variant/40 bg-white py-2.5 pl-10 pr-4 text-sm text-m3-on-surface placeholder-m3-outline shadow-sm transition-all focus:border-m3-primary/40 focus:shadow-md focus:outline-none dark:border-m3-outline-variant/20 dark:bg-m3-surface-container dark:text-m3-on-surface dark:placeholder-m3-outline"
            />
          </div>
          <button
            onClick={searchRooms}
            disabled={isLoading}
            className="rounded-full bg-m3-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-m3-primary/90 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </button>
        </div>
        {error && <p className="mx-auto mt-2 max-w-lg text-xs text-m3-error">{error}</p>}
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg">
          {!hasSearched ? (
            <div className="flex h-64 items-center justify-center">
              <p className="text-sm text-m3-outline dark:text-m3-on-surface-variant">Search for public rooms to browse</p>
            </div>
          ) : rooms.length === 0 && !isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <p className="text-sm text-m3-outline dark:text-m3-on-surface-variant">No rooms found</p>
            </div>
          ) : (
            <div className="divide-y divide-m3-outline-variant dark:divide-m3-outline-variant">
              {rooms.map(room => (
                <div key={room.roomId} className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-m3-surface-container dark:hover:bg-m3-surface-container-high">
                  <Avatar src={room.avatarUrl} name={room.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-m3-on-surface dark:text-m3-on-surface">{room.name}</p>
                      <Hash className="h-3 w-3 flex-shrink-0 text-m3-outline" />
                    </div>
                    {room.alias && <p className="truncate text-xs text-m3-primary">{room.alias}</p>}
                    {room.topic && <p className="mt-0.5 truncate text-xs text-m3-on-surface-variant dark:text-m3-outline">{room.topic}</p>}
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-m3-outline">
                      <Users className="h-3 w-3" />{room.memberCount}
                    </div>
                  </div>
                  {joinedRoomIds.has(room.roomId) ? (
                    <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Joined</span>
                  ) : (
                    <button
                      onClick={() => joinRoom(room.roomId)}
                      disabled={joiningRoom === room.roomId}
                      className="rounded-full bg-m3-primary px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-m3-primary/90 disabled:opacity-50"
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
