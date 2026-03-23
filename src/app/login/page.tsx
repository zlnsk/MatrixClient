'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { resolveHomeserver } from '@/lib/matrix/client'
import { Shield, Eye, EyeOff, Loader2, Server, CheckCircle, AlertCircle } from 'lucide-react'

// Rate limiting state (module-level so it persists across re-renders)
let failedAttempts = 0
let lockoutUntil = 0

function mapLoginError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('M_FORBIDDEN') || msg.includes('Invalid password') || msg.includes('403'))
    return 'Incorrect username or password'
  if (msg.includes('M_USER_DEACTIVATED'))
    return 'This account has been deactivated'
  if (msg.includes('M_LIMIT_EXCEEDED'))
    return 'Too many requests — please wait and try again'
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_'))
    return 'Cannot reach the homeserver — check the address and your connection'
  if (msg.includes('M_UNKNOWN_TOKEN'))
    return 'Session expired — please sign in again'
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED'))
    return 'Homeserver not found — check the address'
  return 'Sign-in failed. Please check your credentials and try again.'
}

const MAX_INPUT_LENGTH = 512

type LoginStep = 'idle' | 'resolving' | 'authenticating' | 'syncing' | 'done' | 'error'

const STEP_LABELS: Record<LoginStep, string> = {
  idle: '',
  resolving: 'Resolving homeserver...',
  authenticating: 'Authenticating...',
  syncing: 'Starting sync...',
  done: 'Connected!',
  error: 'Sign-in failed',
}

export default function LoginPage() {
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loginStep, setLoginStep] = useState<LoginStep>('idle')
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const { signIn } = useAuthStore()
  const router = useRouter()

  const isLoading = loginStep !== 'idle' && loginStep !== 'error'

  // Auto-focus the server input on mount
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>('input[placeholder="matrix.org"]')
    input?.focus()
  }, [])

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

    // Rate limiting — exponential backoff after failed attempts
    const now = Date.now()
    if (lockoutUntil > now) {
      const secs = Math.ceil((lockoutUntil - now) / 1000)
      setError(`Too many failed attempts. Please wait ${secs}s before trying again.`)
      return
    }

    const s = server.trim()
    if (!s) {
      setError('Please enter a homeserver address')
      return
    }

    try {
      // Step 1: Resolve homeserver
      setLoginStep('resolving')
      const homeserverUrl = resolvedUrl || await resolveHomeserver(s)

      // Step 2: Authenticate
      setLoginStep('authenticating')
      await signIn(username, password, homeserverUrl)
      failedAttempts = 0
      lockoutUntil = 0

      // Step 3: Sync
      setLoginStep('syncing')

      // Step 4: Done
      setLoginStep('done')
      await new Promise(resolve => setTimeout(resolve, 400))
      router.push('/')
    } catch (err) {
      failedAttempts++
      if (failedAttempts >= 3) {
        const delay = Math.min(2000 * Math.pow(2, failedAttempts - 3), 30000)
        lockoutUntil = Date.now() + delay
      }
      setLoginStep('error')
      setError(mapLoginError(err))
      // Reset to idle after showing error
      setTimeout(() => setLoginStep('idle'), 100)
    }
  }

  const serverDomain = server.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || null

  const progressPercent = loginStep === 'resolving' ? 25 : loginStep === 'authenticating' ? 55 : loginStep === 'syncing' ? 85 : loginStep === 'done' ? 100 : 0

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-m3-surface px-4">
      {/* Top progress bar */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-m3-surface-container-high">
          <div
            className="h-full bg-m3-primary transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <div className="relative w-full max-w-md">
        <div className="rounded-3xl border border-m3-outline-variant bg-m3-surface-container-lowest p-8 shadow-xl dark:bg-m3-surface-container">
          {/* Logo */}
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
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-m3-on-surface">szept</h1>
            <p className="mt-1 text-sm text-m3-on-surface-variant">
              Sign in to any Matrix homeserver
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="on">
            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-m3-error/20 bg-m3-error-container px-4 py-3 text-sm text-m3-error dark:border-m3-error/30 dark:bg-m3-error-container animate-slide-in">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Homeserver */}
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-m3-on-surface-variant">
                Homeserver
              </label>
              <div className="relative">
                <Server className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-m3-outline" />
                <input
                  type="text"
                  value={server}
                  onChange={e => { setServer(e.target.value.slice(0, MAX_INPUT_LENGTH)); setResolvedUrl(null) }}
                  onBlur={handleServerBlur}
                  placeholder="matrix.org"
                  maxLength={MAX_INPUT_LENGTH}
                  required
                  className="w-full rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low py-3.5 pl-11 pr-4 text-sm text-m3-on-surface placeholder-m3-outline transition-all focus:border-m3-primary focus:outline-none focus:ring-2 focus:ring-m3-primary/20 dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                />
                {isResolving && (
                  <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-m3-outline" />
                )}
              </div>
              {resolvedUrl && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle className="h-3 w-3" />
                  {resolvedUrl}
                </p>
              )}
            </div>

            {/* Username */}
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-m3-on-surface-variant">
                Username
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-m3-on-surface-variant">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                  placeholder="username"
                  maxLength={MAX_INPUT_LENGTH}
                  required
                  autoComplete="username"
                  className="w-full rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low py-3.5 pl-9 pr-4 text-sm text-m3-on-surface placeholder-m3-outline transition-all focus:border-m3-primary focus:outline-none focus:ring-2 focus:ring-m3-primary/20 dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                />
              </div>
              {serverDomain && (
                <p className="mt-1.5 text-xs text-m3-on-surface-variant">
                  e.g. user for @user:{serverDomain}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-m3-on-surface-variant">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                  placeholder="Enter your password"
                  maxLength={MAX_INPUT_LENGTH}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low px-4 py-3.5 pr-12 text-sm text-m3-on-surface placeholder-m3-outline transition-all focus:border-m3-primary focus:outline-none focus:ring-2 focus:ring-m3-primary/20 dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-m3-outline transition-colors hover:text-m3-on-surface-variant"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-m3-primary px-4 py-3.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-m3-primary/90 hover:shadow-md active:shadow-sm disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {STEP_LABELS[loginStep]}
                </>
              ) : (
                'Sign in'
              )}
            </button>

            {/* Login progress steps */}
            {isLoading && (
              <div className="flex items-center justify-center gap-4 pt-1 animate-fade-in">
                <StepDot active={loginStep === 'resolving'} done={progressPercent > 25} label="Server" />
                <div className="h-px w-6 bg-m3-outline-variant" />
                <StepDot active={loginStep === 'authenticating'} done={progressPercent > 55} label="Auth" />
                <div className="h-px w-6 bg-m3-outline-variant" />
                <StepDot active={loginStep === 'syncing'} done={progressPercent >= 100} label="Sync" />
              </div>
            )}
          </form>
        </div>

        {/* Security badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-m3-on-surface-variant">
          <Shield className="h-3 w-3" />
          <span>End-to-end encrypted via Matrix protocol</span>
        </div>

        {/* Version */}
        <p className="mt-2 text-center text-[10px] text-m3-outline select-all">
          v{process.env.NEXT_PUBLIC_BUILD_VERSION}
        </p>
      </div>
    </div>
  )
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ${
        done ? 'bg-green-500 text-white' : active ? 'bg-m3-primary text-white' : 'bg-m3-surface-container-high text-m3-outline'
      }`}>
        {done ? (
          <CheckCircle className="h-3.5 w-3.5" />
        ) : active ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <div className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </div>
      <span className={`text-[10px] ${active ? 'text-m3-primary font-medium' : done ? 'text-green-600 dark:text-green-400' : 'text-m3-outline'}`}>
        {label}
      </span>
    </div>
  )
}
