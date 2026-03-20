'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useTheme } from '@/components/providers/theme-provider'
import { Avatar } from '@/components/ui/avatar'
import { useRouter } from 'next/navigation'
import {
  X,
  Sun,
  Moon,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  LogOut,
  User,
  Shield,
  Keyboard,
  Palette,
  Loader2,
  Camera,
} from 'lucide-react'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { user, preferences, updateProfile, updatePreferences, signOut } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [activeSection, setActiveSection] = useState<'profile' | 'appearance' | 'notifications' | 'security'>('profile')

  const handleSaveProfile = async () => {
    if (!displayName.trim()) return
    setIsSaving(true)
    try {
      await updateProfile({ display_name: displayName.trim() })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    await signOut()
    router.push('/login')
  }

  const sections = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'appearance' as const, label: 'Appearance', icon: Palette },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'security' as const, label: 'Security', icon: Shield },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-[600px] w-full max-w-2xl animate-slide-in overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        {/* Left nav */}
        <div className="w-48 flex-shrink-0 border-r border-gray-800 bg-gray-900 p-4">
          <h2 className="mb-4 text-lg font-bold text-white">Settings</h2>
          <nav className="space-y-1">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  activeSection === s.id
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-300'
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
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-900/20"
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
            <h3 className="text-lg font-bold text-white capitalize">{activeSection}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {activeSection === 'profile' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar
                    src={user?.avatar_url}
                    name={user?.display_name || 'U'}
                    size="lg"
                  />
                  <button className="absolute bottom-0 right-0 rounded-full bg-indigo-600 p-1.5 text-white shadow-lg hover:bg-indigo-500">
                    <Camera className="h-3 w-3" />
                  </button>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{user?.display_name}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Email</label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2.5 text-sm text-gray-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Status</label>
                <div className="flex gap-2">
                  {(['online', 'away', 'offline'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => updateProfile({ status: s })}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                        user?.status === s
                          ? 'border-indigo-500 bg-indigo-900/20 text-indigo-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${
                        s === 'online' ? 'bg-green-500' : s === 'away' ? 'bg-yellow-500' : 'bg-gray-500'
                      }`} />
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={isSaving || displayName.trim() === user?.display_name}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save changes
              </button>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-sm font-medium text-gray-300">Theme</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => { if (theme !== 'dark') toggleTheme() }}
                    className={`flex flex-1 flex-col items-center gap-3 rounded-xl border p-4 transition-colors ${
                      theme === 'dark'
                        ? 'border-indigo-500 bg-indigo-900/20'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <Moon className={`h-6 w-6 ${theme === 'dark' ? 'text-indigo-400' : 'text-gray-400'}`} />
                    <span className={`text-sm ${theme === 'dark' ? 'text-indigo-300' : 'text-gray-400'}`}>Dark</span>
                  </button>
                  <button
                    onClick={() => { if (theme !== 'light') toggleTheme() }}
                    className={`flex flex-1 flex-col items-center gap-3 rounded-xl border p-4 transition-colors ${
                      theme === 'light'
                        ? 'border-indigo-500 bg-indigo-900/20'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <Sun className={`h-6 w-6 ${theme === 'light' ? 'text-indigo-400' : 'text-gray-400'}`} />
                    <span className={`text-sm ${theme === 'light' ? 'text-indigo-300' : 'text-gray-400'}`}>Light</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-3 block text-sm font-medium text-gray-300">Font size</label>
                <div className="flex gap-3">
                  {(['small', 'medium', 'large'] as const).map(size => (
                    <button
                      key={size}
                      onClick={() => updatePreferences({ font_size: size })}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm capitalize transition-colors ${
                        preferences?.font_size === size
                          ? 'border-indigo-500 bg-indigo-900/20 text-indigo-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="space-y-4">
              <SettingsToggle
                icon={preferences?.notifications_enabled ? Bell : BellOff}
                label="Push notifications"
                description="Get notified about new messages"
                enabled={preferences?.notifications_enabled ?? true}
                onChange={v => updatePreferences({ notifications_enabled: v })}
              />
              <SettingsToggle
                icon={preferences?.sound_enabled ? Volume2 : VolumeX}
                label="Sound effects"
                description="Play sounds for new messages"
                enabled={preferences?.sound_enabled ?? true}
                onChange={v => updatePreferences({ sound_enabled: v })}
              />
              <SettingsToggle
                icon={Keyboard}
                label="Enter to send"
                description="Press Enter to send messages, Shift+Enter for new line"
                enabled={preferences?.enter_to_send ?? true}
                onChange={v => updatePreferences({ enter_to_send: v })}
              />
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-green-800/50 bg-green-900/20 p-4">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-green-300">End-to-end encryption active</p>
                    <p className="mt-1 text-xs text-green-400/70">
                      All messages are encrypted using AES-256-GCM. Your encryption keys are stored securely and never leave your device.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-800/50 p-4">
                <h4 className="text-sm font-medium text-gray-300">Server</h4>
                <p className="mt-1 text-xs text-gray-500">lukasz.com (Matrix Synapse)</p>
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-800/50 p-4">
                <h4 className="text-sm font-medium text-gray-300">Session ID</h4>
                <p className="mt-1 font-mono text-xs text-gray-500">
                  {user?.id?.substring(0, 8)}...{user?.id?.substring(user.id.length - 8)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsToggle({
  icon: Icon,
  label,
  description,
  enabled,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  enabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-800/50 p-4">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-300">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          enabled ? 'bg-indigo-600' : 'bg-gray-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}
