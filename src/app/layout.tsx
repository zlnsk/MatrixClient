import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { AuthProvider } from '@/components/providers/auth-provider'
import { RealtimeProvider } from '@/components/providers/realtime-provider'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import './globals.css'

export const metadata: Metadata = {
  title: 'szept — Secure Messaging',
  description: 'End-to-end encrypted messaging powered by the Matrix protocol',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'szept',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  interactiveWidget: 'resizes-content',
  viewportFit: 'cover',
  themeColor: '#131318',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark h-dvh">
      <body className="h-dvh overflow-hidden antialiased" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <RealtimeProvider>
                {children}
              </RealtimeProvider>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
        <script
          dangerouslySetInnerHTML={{
            __html: [
              // Inject PWA manifest as blob URL to avoid reverse proxy (Pangolin) CORS issues.
              // The proxy redirects /manifest.webmanifest through its auth layer which lacks
              // CORS headers, breaking the manifest fetch. A blob URL is local — no network request.
              `(function(){var m=${JSON.stringify(JSON.stringify({
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
              }))};var b=new Blob([m],{type:'application/manifest+json'});var l=document.createElement('link');l.rel='manifest';l.href=URL.createObjectURL(b);document.head.appendChild(l)})()`,
              // Register service worker
              `if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(function(){})`,
            ].join(';'),
          }}
        />
      </body>
    </html>
  )
}
