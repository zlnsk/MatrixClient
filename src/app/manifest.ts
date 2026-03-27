import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Messages — Secure Messaging',
    short_name: 'Messages',
    description: 'End-to-end encrypted messaging powered by the Matrix protocol',
    start_url: '/matrixclient/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1f1f1f',
    theme_color: '#1f1f1f',
    categories: ['social', 'communication'],
    icons: [
      { src: '/matrixclient/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/matrixclient/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/matrixclient/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
