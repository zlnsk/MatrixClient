'use client'

import { useState, useEffect } from 'react'
import { getMatrixClient } from '@/lib/matrix/client'
import { ExternalLink } from 'lucide-react'

interface LinkPreviewProps {
  url: string
}

export function LinkPreview({ url }: LinkPreviewProps) {
  const [preview, setPreview] = useState<{
    title?: string
    description?: string
    imageUrl?: string
    siteName?: string
  } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchPreview() {
      try {
        const client = getMatrixClient()
        if (!client) return

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

          setPreview({
            title: data['og:title'] as string | undefined,
            description: data['og:description'] as string | undefined,
            imageUrl,
            siteName: data['og:site_name'] as string | undefined,
          })
        }
      } catch {
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
      className="mt-2 block max-w-sm overflow-hidden rounded-xl border border-m3-outline-variant bg-m3-surface-container-low shadow-sm transition-colors hover:bg-m3-surface-container dark:border-m3-outline-variant dark:bg-m3-surface-container-high/80 dark:hover:bg-m3-surface-container-high"
    >
      {preview.imageUrl && (
        <img
          src={preview.imageUrl}
          alt=""
          className="h-32 w-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className="p-3">
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
