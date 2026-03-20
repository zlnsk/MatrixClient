'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useTheme } from '@/components/providers/theme-provider'
import { Avatar } from '@/components/ui/avatar'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { HOMESERVER_URL } from '@/lib/matrix/client'
import {
  X,
  Sun,
  Moon,
  LogOut,
  User,
  Shield,
  Palette,
  Loader2,
  Server,
} from 'lucide-react'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { user, signOut } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [activeSection, setActiveSection] = useState<'profile' | 'appearance' | 'security'>('profile')

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    await signOut()
    router.push('/login')
  }

  const homeserverDomain = new URL(HOMESERVER_URL).hostname

  const sections = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'appearance' as const, label: 'Appearance', icon: Palette },
    { id: 'security' as const, label: 'Security', icon: Shield },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-[500px] w-full max-w-2xl animate-slide-in overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        {/* Left nav */}
        <div className="w-48 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">Settings</h2>
          <nav className="space-y-1">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  activeSection === s.id
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-300'
                }`}
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6">
            <button
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              Sign out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900 capitalize dark:text-white">{activeSection}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {activeSection === 'profile' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar
                  src={user?.avatarUrl}
                  name={user?.displayName || 'U'}
                  size="lg"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.displayName}</p>
                  <p className="text-xs text-gray-500">{user?.userId}</p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Homeserver</p>
                    <p className="text-xs text-gray-500">{homeserverDomain}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Matrix User ID</h4>
                <p className="mt-1 font-mono text-xs text-indigo-400">{user?.userId}</p>
              </div>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">Theme</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => { if (theme !== 'dark') toggleTheme() }}
                    className={`flex flex-1 flex-col items-center gap-3 rounded-xl border p-4 shadow-sm transition-colors ${
                      theme === 'dark'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                    }`}
                  >
                    <Moon className={`h-6 w-6 ${theme === 'dark' ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-400'}`} />
                    <span className={`text-sm ${theme === 'dark' ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-400'}`}>Dark</span>
                  </button>
                  <button
                    onClick={() => { if (theme !== 'light') toggleTheme() }}
                    className={`flex flex-1 flex-col items-center gap-3 rounded-xl border p-4 shadow-sm transition-colors ${
                      theme === 'light'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                    }`}
                  >
                    <Sun className={`h-6 w-6 ${theme === 'light' ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-400'}`} />
                    <span className={`text-sm ${theme === 'light' ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-400'}`}>Light</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm dark:border-green-800/50 dark:bg-green-900/20">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">Matrix Protocol</p>
                    <p className="mt-1 text-xs text-green-600/70 dark:text-green-400/70">
                      Connected via the Matrix Client-Server API. Rooms with encryption enabled use Megolm (m.megolm.v1.aes-sha2).
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Homeserver URL</h4>
                <p className="mt-1 font-mono text-xs text-gray-500">{HOMESERVER_URL}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">User ID</h4>
                <p className="mt-1 font-mono text-xs text-gray-500">{user?.userId}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
