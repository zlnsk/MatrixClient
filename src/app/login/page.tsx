'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { resolveHomeserver } from '@/lib/matrix/client'
import { Shield, Eye, EyeOff, Loader2, Server } from 'lucide-react'

export default function LoginPage() {
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const { signIn } = useAuthStore()
  const router = useRouter()

  const handleServerBlur = useCallback(async () => {
    const s = server.trim()
    if (!s) {
      setResolvedUrl(null)
      return
    }
    setIsResolving(true)
    try {
      const url = await resolveHomeserver(s)
      setResolvedUrl(url)
    } catch {
      setResolvedUrl(null)
    } finally {
      setIsResolving(false)
    }
  }, [server])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const s = server.trim()
    if (!s) {
      setError('Please enter a homeserver address')
      return
    }

    setIsLoading(true)
    try {
      const homeserverUrl = resolvedUrl || await resolveHomeserver(s)
      await signIn(username, password, homeserverUrl)
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in')
    } finally {
      setIsLoading(false)
    }
  }

  const serverDomain = server.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || null

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-m3-surface px-4 dark:bg-m3-surface">

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-m3-outline-variant bg-m3-surface-container-lowest p-8 shadow-xl dark:border-m3-outline-variant dark:bg-m3-surface-container">
          {/* Logo — inline SVG of szept icon */}
          <div className="mb-8 flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6359dc] shadow-lg shadow-[#6359dc]/25">
              <svg width="36" height="36" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M138 62 L83 62 L83 450 L138 450" stroke="white" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M374 62 L429 62 L429 450 L374 450" stroke="white" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="198" cy="178" r="21" fill="white"/>
                <circle cx="256" cy="178" r="21" fill="white"/>
                <circle cx="314" cy="178" r="21" fill="white"/>
                <circle cx="198" cy="256" r="21" fill="white" opacity="0.55"/>
                <circle cx="256" cy="256" r="32" fill="white"/>
                <circle cx="314" cy="256" r="21" fill="white" opacity="0.55"/>
                <circle cx="198" cy="334" r="21" fill="white" opacity="0.25"/>
                <circle cx="256" cy="334" r="21" fill="white" opacity="0.42"/>
                <circle cx="314" cy="334" r="21" fill="white" opacity="0.25"/>
              </svg>
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-m3-on-surface dark:text-m3-on-surface">szept</h1>
            <p className="mt-2 text-sm text-m3-on-surface-variant dark:text-m3-on-surface-variant">
              Sign in to any Matrix homeserver
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            {error && (
              <div className="rounded-lg border border-m3-error/20 bg-m3-error-container px-4 py-3 text-sm text-m3-error dark:border-m3-error/30 dark:bg-m3-error-container dark:text-m3-error">
                {error}
              </div>
            )}

            {/* Homeserver */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-on-surface-variant">
                Homeserver
              </label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-m3-outline" />
                <input
                  type="text"
                  value={server}
                  onChange={e => { setServer(e.target.value); setResolvedUrl(null) }}
                  onBlur={handleServerBlur}
                  placeholder="matrix.org"
                  required
                  className="w-full rounded-lg border border-m3-outline-variant bg-m3-surface-container-low py-3 pl-10 pr-4 text-sm text-m3-on-surface placeholder-m3-outline transition-colors focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                />
                {isResolving && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-m3-outline" />
                )}
              </div>
              {resolvedUrl && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                  {resolvedUrl}
                </p>
              )}
            </div>

            {/* Username */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-on-surface-variant">
                Username
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-m3-on-surface-variant">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="username"
                  required
                  autoComplete="username"
                  className="w-full rounded-lg border border-m3-outline-variant bg-m3-surface-container-low py-3 pl-8 pr-4 text-sm text-m3-on-surface placeholder-m3-outline transition-colors focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                />
              </div>
              {serverDomain && (
                <p className="mt-1 text-xs text-m3-on-surface-variant">
                  e.g. user for @user:{serverDomain}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-m3-on-surface-variant dark:text-m3-on-surface-variant">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-m3-outline-variant bg-m3-surface-container-low px-4 py-3 pr-11 text-sm text-m3-on-surface placeholder-m3-outline transition-colors focus:border-m3-primary focus:outline-none focus:ring-1 focus:ring-m3-primary dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-m3-outline hover:text-m3-on-surface-variant dark:text-m3-outline dark:hover:text-m3-on-surface-variant"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-m3-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-m3-primary/90 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        {/* Security badge */}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-m3-on-surface-variant">
          <Shield className="h-3 w-3" />
          <span>End-to-end encrypted via Matrix protocol</span>
        </div>
      </div>
    </div>
  )
}
