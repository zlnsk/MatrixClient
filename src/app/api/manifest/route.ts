import { NextResponse } from 'next/server'

export function GET() {
  const manifest = {
    name: 'szept — Secure Messaging',
    short_name: 'szept',
    description: 'End-to-end encrypted messaging powered by the Matrix protocol',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#131318',
    theme_color: '#131318',
    categories: ['social', 'communication'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
