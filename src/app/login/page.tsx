'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react'
import { HOMESERVER_URL } from '@/lib/matrix/client'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { signIn } = useAuthStore()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await signIn(username, password)
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in')
    } finally {
      setIsLoading(false)
    }
  }

  // Extract homeserver domain for display
  const homeserverDomain = new URL(HOMESERVER_URL).hostname

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-96 bg-gradient-to-b from-indigo-900/20 to-transparent" />

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-2xl">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/25">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="mt-4 text-3xl font-bold text-white">Matrix Client</h1>
            <p className="mt-2 text-sm text-gray-400">
              Sign in to <span className="text-indigo-400">{homeserverDomain}</span>
            </p>
          </div>

          {/* Homeserver info */}
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-900/50">
              <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-300">Homeserver</p>
              <p className="text-xs text-gray-500">{HOMESERVER_URL}</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-900/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                Username
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="username"
                  required
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 py-3 pl-8 pr-4 text-sm text-white placeholder-gray-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <p className="mt-1 text-xs text-gray-600">
                e.g. lca for @lca:{homeserverDomain}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 pr-11 text-sm text-white placeholder-gray-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
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
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-600">
          <Shield className="h-3 w-3" />
          <span>Matrix protocol - End-to-end encrypted</span>
        </div>
      </div>
    </div>
  )
}
