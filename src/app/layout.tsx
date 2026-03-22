import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { AuthProvider } from '@/components/providers/auth-provider'
import { RealtimeProvider } from '@/components/providers/realtime-provider'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import './globals.css'

export const metadata: Metadata = {
  title: 'szept — Secure Messaging',
  description: 'End-to-end encrypted messaging powered by the Matrix protocol',
  manifest: '/manifest.json',
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
            __html: `if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{})`,
          }}
        />
      </body>
    </html>
  )
}
