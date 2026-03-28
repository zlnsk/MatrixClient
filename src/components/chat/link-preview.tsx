'use client'

import { useState, useEffect } from 'react'
import { getMatrixClient } from '@/lib/matrix/client'
import { ExternalLink } from 'lucide-react'

// Session-scoped in-memory cache for link previews — prevents redundant
// homeserver requests when the same URL appears multiple times or the
// component remounts during scrolling.
const PREVIEW_CACHE_MAX = 200
const previewCache = new Map<string, {
  title?: string
  description?: string
  imageUrl?: string
  siteName?: string
} | null>()

// If the server returns 403 (url previews disabled), stop requesting entirely
let serverSupportsPreview = true

interface LinkPreviewProps {
  url: string
}

export function LinkPreview({ url }: LinkPreviewProps) {
  const [preview, setPreview] = useState<{
    title?: string
    description?: string
    imageUrl?: string
    siteName?: string
  } | null>(() => previewCache.get(url) ?? null)
  const [error, setError] = useState(false)

  useEffect(() => {
    // If already cached, use it immediately
    if (previewCache.has(url)) {
      const cached = previewCache.get(url)!
      setPreview(cached)
      if (!cached) setError(true)
      return
    }

    let cancelled = false

    async function fetchPreview() {
      try {
        const client = getMatrixClient()
        if (!client || !serverSupportsPreview) return

        // Matrix provides a URL preview API
        const data = await client.getUrlPreview(url, Date.now())
        if (cancelled) return

        if (data) {
          let imageUrl: string | undefined
          if (data['og:image'] && typeof data['og:image'] === 'string') {
            // og:image might be an mxc URL if the server cached it
            if (data['og:image'].startsWith('mxc://')) {
              imageUrl = client.mxcUrlToHttp(data['og:image']) || undefined
            } else {
              imageUrl = data['og:image']
            }
          }

          const result = {
            title: data['og:title'] as string | undefined,
            description: data['og:description'] as string | undefined,
            imageUrl,
            siteName: data['og:site_name'] as string | undefined,
          }
          previewCache.set(url, result)
          if (previewCache.size > PREVIEW_CACHE_MAX) {
            const first = previewCache.keys().next()
            if (!first.done) previewCache.delete(first.value)
          }
          setPreview(result)
        } else {
          previewCache.set(url, null)
        }
      } catch (err: any) {
        // If server returns 403, it doesn't support URL previews — stop all future requests
        if (err?.httpStatus === 403 || err?.errcode === 'M_FORBIDDEN') {
          serverSupportsPreview = false
        }
        previewCache.set(url, null)
        if (!cancelled) setError(true)
      }
    }

    fetchPreview()
    return () => { cancelled = true }
  }, [url])

  if (error || !preview || (!preview.title && !preview.description)) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block overflow-hidden rounded-xl border border-m3-outline-variant/30 bg-m3-surface-container-low/50 shadow-sm transition-all duration-150 hover:shadow-md hover:bg-m3-surface-container dark:border-m3-outline-variant/30 dark:bg-m3-surface-container-high/40 dark:hover:bg-m3-surface-container-high dark:shadow-none dark:hover:shadow-none"
    >
      {preview.imageUrl && (
        <img
          src={preview.imageUrl}
          alt=""
          className="h-32 w-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className="px-3 py-2.5">
        {preview.siteName && (
          <p className="mb-0.5 flex items-center gap-1 text-xs text-m3-outline">
            <ExternalLink className="h-3 w-3" />
            {preview.siteName}
          </p>
        )}
        {preview.title && (
          <p className="text-sm font-semibold text-m3-on-surface dark:text-m3-on-surface line-clamp-2">{preview.title}</p>
        )}
        {preview.description && (
          <p className="mt-1 text-xs text-m3-on-surface-variant dark:text-m3-outline line-clamp-2">{preview.description}</p>
        )}
      </div>
    </a>
  )
}
