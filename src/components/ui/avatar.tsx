'use client'

import { useState, useEffect } from 'react'
import { fetchCachedThumbnail } from '@/lib/matrix/media'

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  status?: 'online' | 'offline' | 'away' | null
}

const sizeMap = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

const statusSizeMap = {
  sm: 'h-2.5 w-2.5 right-0 bottom-0',
  md: 'h-3 w-3 right-0 bottom-0',
  lg: 'h-3.5 w-3.5 right-0.5 bottom-0.5',
}

const statusColorMap = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  offline: 'bg-gray-500',
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getAvatarColor(name: string) {
  const colors = [
    'bg-indigo-600',
    'bg-purple-600',
    'bg-pink-600',
    'bg-rose-600',
    'bg-orange-600',
    'bg-amber-600',
    'bg-emerald-600',
    'bg-teal-600',
    'bg-cyan-600',
    'bg-blue-600',
  ]
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

function InitialsFallback({ name, size }: { name: string; size: 'sm' | 'md' | 'lg' }) {
  return (
    <div
      className={`${sizeMap[size]} ${getAvatarColor(name)} flex items-center justify-center rounded-full font-medium text-white`}
    >
      {getInitials(name)}
    </div>
  )
}

export function Avatar({ src, name, size = 'md', status }: AvatarProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (!src) {
      setBlobUrl(null)
      return
    }

    // If it's an MXC URL, fetch via authenticated endpoint
    if (src.startsWith('mxc://')) {
      let cancelled = false
      fetchCachedThumbnail(src, 96, 96)
        .then(url => {
          if (!cancelled) {
            setBlobUrl(url)
            setImgError(false)
          }
        })
        .catch(() => {
          if (!cancelled) setImgError(true)
        })
      return () => { cancelled = true }
    }

    // For non-MXC URLs (blob:, data:, https:), use directly
    setBlobUrl(src)
    setImgError(false)
  }, [src])

  const displayUrl = blobUrl

  return (
    <div className="relative flex-shrink-0">
      {displayUrl && !imgError ? (
        <img
          src={displayUrl}
          alt={name}
          className={`${sizeMap[size]} rounded-full object-cover`}
          onError={() => setImgError(true)}
        />
      ) : (
        <InitialsFallback name={name} size={size} />
      )}
      {status && (
        <span
          className={`absolute ${statusSizeMap[size]} ${statusColorMap[status]} rounded-full border-2 border-m3-surface-container-lowest dark:border-m3-surface-container`}
        />
      )}
    </div>
  )
}
