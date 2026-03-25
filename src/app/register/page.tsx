'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { resolveHomeserver, startRegistration, submitRegistrationStep, startSync, getUserId, getAvatarUrl } from '@/lib/matrix/client'
import { getMatrixClient } from '@/lib/matrix/client'
import { Eye, EyeOff, Loader2, Server, CheckCircle, AlertCircle, ArrowLeft, ExternalLink, Shield, Check } from 'lucide-react'
import Link from 'next/link'

const MAX_INPUT_LENGTH = 512

type RegStep = 'form' | 'captcha' | 'terms' | 'email' | 'completing' | 'done'

export default function RegisterPage() {
  const [server, setServer] = useState('matrix.org')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<RegStep>('form')
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [regState, setRegState] = useState<any>(null)
  const [termsUrl, setTermsUrl] = useState<string | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const captchaRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Resolve homeserver on blur
  const handleServerBlur = useCallback(async () => {
    const s = server.trim()
    if (!s) { setResolvedUrl(null); return }
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

  // Auto-resolve matrix.org on mount
  useEffect(() => {
    handleServerBlur()
  }, [])

  // Find the simplest registration flow (fewest stages)
  function findBestFlow(flows: any[]): string[] {
    if (!flows || flows.length === 0) return ['m.login.dummy']
    return flows.reduce((best: any, flow: any) =>
      flow.stages.length < best.stages.length ? flow : best
    ).stages
  }

  // Get the next uncompleted stage
  function getNextStage(stages: string[], completed: string[]): string | null {
    return stages.find(s => !completed.includes(s)) || null
  }

  // Process the current UIA stage
  async function processStage(state: any, homeserverUrl: string) {
    const stages = findBestFlow(state.flows)
    const nextStage = getNextStage(stages, state.completed || [])

    if (!nextStage) {
      // All stages done — submit final
      setStep('completing')
      try {
        const result = await submitRegistrationStep(homeserverUrl, username, password, {
          type: 'm.login.dummy',
          session: state.session,
        })
        if (result.done) {
          await finishRegistration()
        }
      } catch (err: any) {
        setError(err.message)
        setStep('form')
        setIsLoading(false)
      }
      return
    }

    switch (nextStage) {
      case 'm.login.recaptcha':
        setStep('captcha')
        loadRecaptcha(state.params?.['m.login.recaptcha']?.public_key, state.session, homeserverUrl)
        break

      case 'm.login.terms':
        // Extract terms URL
        const termsParams = state.params?.['m.login.terms']
        if (termsParams?.policies) {
          const firstPolicy = Object.values(termsParams.policies)[0] as any
          const url = firstPolicy?.en?.url || firstPolicy?.url || (Object.values(firstPolicy || {})?.[0] as any)?.url
          setTermsUrl(url || null)
        }
        setStep('terms')
        setIsLoading(false)
        break

      case 'm.login.email.identity':
        setStep('email')
        setIsLoading(false)
        break

      case 'm.login.dummy':
        // Dummy stage — just submit
        try {
          const result = await submitRegistrationStep(homeserverUrl, username, password, {
            type: 'm.login.dummy',
            session: state.session,
          })
          if (result.done) {
            await finishRegistration()
          } else {
            setRegState(result.state)
            processStage(result.state, homeserverUrl)
          }
        } catch (err: any) {
          setError(err.message)
          setStep('form')
          setIsLoading(false)
        }
        break

      default:
        setError(`Unsupported registration step: ${nextStage}`)
        setStep('form')
        setIsLoading(false)
    }
  }

  // Load Google reCAPTCHA v2
  function loadRecaptcha(siteKey: string | undefined, session: string, homeserverUrl: string) {
    if (!siteKey) {
      setError('Server requires reCAPTCHA but did not provide a site key')
      setStep('form')
      setIsLoading(false)
      return
    }

    // Load the reCAPTCHA script
    const scriptId = 'recaptcha-script'
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoad&render=explicit'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    // Define callback
    ;(window as any).onRecaptchaLoad = () => {
      if (!captchaRef.current) return
      captchaRef.current.innerHTML = ''
      ;(window as any).grecaptcha.render(captchaRef.current, {
        sitekey: siteKey,
        callback: (token: string) => handleCaptchaComplete(token, session, homeserverUrl),
      })
      setIsLoading(false)
    }

    // If script already loaded, render immediately
    if ((window as any).grecaptcha?.render) {
      ;(window as any).onRecaptchaLoad()
    }
  }

  // Handle captcha completion
  async function handleCaptchaComplete(token: string, session: string, homeserverUrl: string) {
    setIsLoading(true)
    try {
      const result = await submitRegistrationStep(homeserverUrl, username, password, {
        type: 'm.login.recaptcha',
        session,
        response: token,
      })
      if (result.done) {
        await finishRegistration()
      } else {
        setRegState(result.state)
        processStage(result.state, homeserverUrl)
      }
    } catch (err: any) {
      setError(err.message)
      setStep('form')
      setIsLoading(false)
    }
  }

  // Handle terms acceptance
  async function handleTermsAccept() {
    if (!regState || !resolvedUrl) return
    setIsLoading(true)
    try {
      const result = await submitRegistrationStep(resolvedUrl, username, password, {
        type: 'm.login.terms',
        session: regState.session,
      })
      if (result.done) {
        await finishRegistration()
      } else {
        setRegState(result.state)
        processStage(result.state, resolvedUrl)
      }
    } catch (err: any) {
      setError(err.message)
      setStep('form')
      setIsLoading(false)
    }
  }

  // Finish registration — start sync and redirect
  async function finishRegistration() {
    setStep('completing')
    try {
      await startSync()
      const client = getMatrixClient()
      const userId = getUserId()
      const matrixUser = client?.getUser(userId!)
      useAuthStore.setState({
        user: {
          userId: userId!,
          displayName: matrixUser?.displayName || userId!,
          avatarUrl: getAvatarUrl(matrixUser?.avatarUrl),
        },
        isAuthenticated: true,
        isLoading: false,
      })
      setStep('done')
      router.push('/')
    } catch (err: any) {
      setError('Account created but failed to start sync: ' + err.message)
      setStep('form')
      setIsLoading(false)
    }
  }

  // Start registration flow
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (!username.trim()) {
      setError('Username is required')
      return
    }

    setIsLoading(true)

    try {
      const homeserverUrl = resolvedUrl || await resolveHomeserver(server.trim())

      // Start UIA flow
      const state = await startRegistration(homeserverUrl)
      setRegState(state)
      setResolvedUrl(homeserverUrl)
      processStage(state, homeserverUrl)
    } catch (err: any) {
      setError(err.message)
      setIsLoading(false)
    }
  }

  const serverDomain = server.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || null

  return (
    <div className="fixed inset-0 flex bg-m3-surface" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] flex-col justify-between bg-[#6359dc] p-12 text-white">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <svg width="28" height="28" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
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
            <span className="text-2xl tracking-tight"><span className="font-light">szept</span> <span className="font-bold">matrix</span></span>
          </div>
          <p className="mt-6 text-lg font-medium leading-relaxed text-white/90">
            Create your Matrix account and start messaging with end-to-end encryption.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Your account works with any Matrix client — Element, FluffyChat, and more.
          </p>
        </div>
        <div className="mt-auto pt-16">
          <div className="grid grid-cols-8 gap-3 opacity-20">
            {Array.from({ length: 32 }).map((_, i) => (
              <div key={i} className="h-2 w-2 rounded-full bg-white" />
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 sm:px-12">
        <div className="w-full max-w-[400px] py-8">
          {/* Mobile logo */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
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
            <h1 className="mt-4 text-3xl tracking-tight text-m3-on-surface"><span className="font-light">szept</span> <span className="font-extrabold">matrix</span></h1>
          </div>

          {/* Desktop heading */}
          <div className="mb-8 hidden lg:block">
            <h1 className="text-3xl font-extrabold tracking-tight text-m3-on-surface">Create account</h1>
            <p className="mt-2 text-sm text-m3-on-surface-variant">
              Register on any Matrix homeserver
            </p>
          </div>

          {/* Mobile heading */}
          <div className="mb-6 lg:hidden text-center">
            <p className="text-sm text-m3-on-surface-variant">
              Create a new Matrix account
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-m3-error/20 bg-m3-error-container px-4 py-3 text-sm text-m3-error dark:border-m3-error/30 dark:bg-m3-error-container animate-slide-in">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step: Registration form */}
          {(step === 'form' || step === 'completing' || step === 'done') && (
            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
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
                    disabled={isLoading}
                    className="w-full rounded-2xl border border-m3-outline-variant/40 bg-white shadow-sm dark:shadow-black/10 py-3.5 pl-11 pr-4 text-sm text-m3-on-surface placeholder-m3-outline transition-all focus:border-m3-primary focus:outline-none focus:ring-2 focus:ring-m3-primary/20 dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline disabled:opacity-50"
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
                    onChange={e => setUsername(e.target.value.slice(0, MAX_INPUT_LENGTH).replace(/[^a-z0-9._=-]/gi, '').toLowerCase())}
                    placeholder="username"
                    maxLength={MAX_INPUT_LENGTH}
                    required
                    disabled={isLoading}
                    autoComplete="off"
                    className="w-full rounded-2xl border border-m3-outline-variant/40 bg-white shadow-sm dark:shadow-black/10 py-3.5 pl-9 pr-4 text-sm text-m3-on-surface placeholder-m3-outline transition-all focus:border-m3-primary focus:outline-none focus:ring-2 focus:ring-m3-primary/20 dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline disabled:opacity-50"
                  />
                </div>
                {serverDomain && username && (
                  <p className="mt-1.5 text-xs text-m3-on-surface-variant">
                    Your full ID: @{username}:{serverDomain}
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
                    placeholder="At least 8 characters"
                    maxLength={MAX_INPUT_LENGTH}
                    required
                    disabled={isLoading}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-m3-outline-variant/40 bg-white shadow-sm dark:shadow-black/10 px-4 py-3.5 pr-12 text-sm text-m3-on-surface placeholder-m3-outline transition-all focus:border-m3-primary focus:outline-none focus:ring-2 focus:ring-m3-primary/20 dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline disabled:opacity-50"
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

              {/* Confirm Password */}
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-m3-on-surface-variant">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                  placeholder="Re-enter password"
                  maxLength={MAX_INPUT_LENGTH}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-m3-outline-variant/40 bg-white shadow-sm dark:shadow-black/10 px-4 py-3.5 text-sm text-m3-on-surface placeholder-m3-outline transition-all focus:border-m3-primary focus:outline-none focus:ring-2 focus:ring-m3-primary/20 dark:border-m3-outline-variant dark:bg-m3-surface-container-high dark:text-m3-on-surface dark:placeholder-m3-outline disabled:opacity-50"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1.5 text-xs text-m3-error">Passwords do not match</p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || !username || !password || password !== confirmPassword}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-m3-primary px-4 py-3.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-m3-primary/90 hover:shadow-md active:shadow-sm disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {step === 'completing' ? 'Setting up...' : 'Creating account...'}
                  </>
                ) : (
                  'Create account'
                )}
              </button>
            </form>
          )}

          {/* Step: reCAPTCHA */}
          {step === 'captcha' && (
            <div className="flex flex-col items-center gap-6">
              <div className="text-center">
                <Shield className="mx-auto h-10 w-10 text-m3-primary" />
                <h2 className="mt-3 text-lg font-medium text-m3-on-surface">Verify you&apos;re human</h2>
                <p className="mt-1 text-sm text-m3-on-surface-variant">
                  Complete the CAPTCHA to continue registration
                </p>
              </div>
              <div ref={captchaRef} className="flex items-center justify-center" />
              {isLoading && <Loader2 className="h-6 w-6 animate-spin text-m3-primary" />}
              <button
                onClick={() => { setStep('form'); setIsLoading(false) }}
                className="text-sm text-m3-on-surface-variant hover:text-m3-on-surface"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Step: Terms of Service */}
          {step === 'terms' && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <Shield className="mx-auto h-10 w-10 text-m3-primary" />
                <h2 className="mt-3 text-lg font-medium text-m3-on-surface">Terms of Service</h2>
                <p className="mt-1 text-sm text-m3-on-surface-variant">
                  You must accept the server&apos;s terms to continue
                </p>
              </div>

              {termsUrl && (
                <a
                  href={termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-2xl border border-m3-outline-variant/40 bg-white px-4 py-3 text-sm font-medium text-m3-primary shadow-sm transition-all hover:shadow-md dark:bg-m3-surface-container-high"
                >
                  <ExternalLink className="h-4 w-4" />
                  Read Terms of Service
                </a>
              )}

              <label className="flex items-center gap-3 rounded-2xl border border-m3-outline-variant/40 bg-white px-4 py-3.5 shadow-sm cursor-pointer dark:bg-m3-surface-container-high">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  className="h-5 w-5 rounded border-m3-outline accent-m3-primary"
                />
                <span className="text-sm text-m3-on-surface">I accept the Terms of Service</span>
              </label>

              <button
                onClick={handleTermsAccept}
                disabled={!termsAccepted || isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-m3-primary px-4 py-3.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-m3-primary/90 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Continue
              </button>

              <button
                onClick={() => { setStep('form'); setIsLoading(false) }}
                className="text-sm text-center text-m3-on-surface-variant hover:text-m3-on-surface"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Step: Email verification (placeholder) */}
          {step === 'email' && (
            <div className="flex flex-col items-center gap-5 text-center">
              <Shield className="h-10 w-10 text-m3-primary" />
              <h2 className="text-lg font-medium text-m3-on-surface">Email Verification Required</h2>
              <p className="text-sm text-m3-on-surface-variant">
                This server requires email verification. Please use{' '}
                <a href="https://app.element.io/#/register" target="_blank" rel="noopener noreferrer" className="font-medium text-m3-primary hover:underline">
                  Element
                </a>{' '}
                to register on this server, then sign in here.
              </p>
              <button
                onClick={() => { setStep('form'); setIsLoading(false) }}
                className="text-sm text-m3-on-surface-variant hover:text-m3-on-surface"
              >
                Go back
              </button>
            </div>
          )}

          {/* Sign in link */}
          <p className="mt-6 text-center text-sm text-m3-on-surface-variant">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-m3-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
