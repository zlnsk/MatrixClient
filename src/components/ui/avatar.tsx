'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchCachedThumbnail } from '@/lib/matrix/media'

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  status?: 'online' | 'offline' | 'away' | null
}

const sizeMap = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
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

/**
 * Detect simple placeholder/icon avatars like Signal's default dashed-circle.
 * Very strict: only flags images with ≤2 distinct color buckets (real photos
 * always have many more, even at 16x16). Also detects very small images
 * (< 5x5 pixels) which are often transparent placeholders.
 *
 * Previous threshold of 4 was too aggressive — real avatars with limited palettes
 * (cartoon-style, logos, dark photos) could be incorrectly flagged as placeholders.
 */
function isPlaceholderImage(img: HTMLImageElement): boolean {
  try {
    // Very small images are likely placeholders
    if (img.naturalWidth < 5 || img.naturalHeight < 5) return true

    const canvas = document.createElement('canvas')
    const s = 16
    canvas.width = s
    canvas.height = s
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, s, s)
    const { data } = ctx.getImageData(0, 0, s, s)

    // Check if mostly transparent (alpha < 50 for > 90% of pixels)
    let transparentPixels = 0
    const totalPixels = s * s
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 50) transparentPixels++
    }
    if (transparentPixels > totalPixels * 0.9) return true

    // Bucket each pixel's RGB into a 4x4x4 grid (64 possible buckets)
    const buckets = new Set<number>()
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 50) continue // skip transparent
      buckets.add(((data[i] >> 6) << 4) | ((data[i + 1] >> 6) << 2) | (data[i + 2] >> 6))
      if (buckets.size > 2) return false // real photo — bail early
    }
    return true
  } catch {
    return false
  }
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

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (isPlaceholderImage(e.currentTarget)) {
      setImgError(true)
    }
  }, [])

  const displayUrl = blobUrl

  return (
    <div className="relative flex-shrink-0">
      {displayUrl && !imgError ? (
        <img
          src={displayUrl}
          alt={name}
          className={`${sizeMap[size]} rounded-full object-cover`}
          onLoad={handleLoad}
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
