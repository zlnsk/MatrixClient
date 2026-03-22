'use client'

import { useAuthStore } from '@/stores/auth-store'
import { Avatar } from '@/components/ui/avatar'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { getHomeserverUrl, getHomeserverDomain, restoreFromRecoveryKey, deleteOtherDevice, getMatrixClient, generateSecurityKey } from '@/lib/matrix/client'
import { DotGrid } from '@/components/ui/dot-grid'
import {
  LogOut,
  User,
  Shield,
  Loader2,
  Server,
  Key,
  CheckCircle,
  Pencil,
  Camera,
  Monitor,
  ShieldPlus,
  Copy,
  Check,
} from 'lucide-react'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { user, signOut, updateProfile } = useAuthStore()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [activeSection, setActiveSection] = useState<'profile' | 'security'>('profile')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [newDisplayName, setNewDisplayName] = useState(user?.displayName || '')
  const [isSavingName, setIsSavingName] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [devices, setDevices] = useState<{deviceId: string, displayName: string | null, lastSeenIp: string | null, lastSeenTs: number}[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [deletingDevice, setDeletingDevice] = useState<string | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [isGeneratingKey, setIsGeneratingKey] = useState(false)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [generateKeyPassword, setGenerateKeyPassword] = useState('')
  const [generateKeyError, setGenerateKeyError] = useState<string | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)

  const handleDeleteDevice = async (deviceId: string) => {
    if (!deletePassword.trim()) {
      setDeviceError('Password is required to sign out a session')
      return
    }
    setDeletingDevice(deviceId)
    setDeviceError(null)
    try {
      await deleteOtherDevice(deviceId, deletePassword)
      setShowDeleteConfirm(null)
      setDeletePassword('')
      await loadDevices()
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'Failed to sign out session')
    } finally {
      setDeletingDevice(null)
    }
  }

  useEffect(() => {
    if (activeSection === 'security') {
      loadDevices()
    }
  }, [activeSection])

  const loadDevices = async () => {
    const client = getMatrixClient()
    if (!client) return
    setLoadingDevices(true)
    try {
      const response = await client.getDevices()
      setDevices((response.devices || []).map((d: any) => ({
        deviceId: d.device_id,
        displayName: d.display_name || null,
        lastSeenIp: d.last_seen_ip || null,
        lastSeenTs: d.last_seen_ts || 0,
      })))
    } catch (err) {
      console.error('Failed to load devices:', err)
    } finally {
      setLoadingDevices(false)
    }
  }

  const handleSaveDisplayName = async () => {
    if (!newDisplayName.trim() || newDisplayName.trim() === user?.displayName) {
      setIsEditingName(false)
      return
    }
    setIsSavingName(true)
    setProfileError(null)
    try {
      const client = getMatrixClient()
      if (!client) throw new Error('Not connected')
      await client.setDisplayName(newDisplayName.trim())
      updateProfile({ displayName: newDisplayName.trim() })
      setIsEditingName(false)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update display name')
    } finally {
      setIsSavingName(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingAvatar(true)
    setProfileError(null)
    try {
      const client = getMatrixClient()
      if (!client) throw new Error('Not connected')
      const uploadResponse = await client.uploadContent(file, {
        name: file.name,
        type: file.type,
      })
      const mxcUrl = uploadResponse.content_uri
      await client.setAvatarUrl(mxcUrl)
      const httpUrl = client.mxcUrlToHttp(mxcUrl) || undefined
      updateProfile({ avatarUrl: httpUrl })
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to upload avatar')
    } finally {
      setIsUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    await signOut()
    router.push('/login')
  }

  const homeserverDomain = getHomeserverDomain() || 'unknown'

  const sections = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Shield },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex h-[500px] w-full max-w-2xl animate-slide-in overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
        <DotGrid />
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
            <p className="mt-3 px-3 text-[10px] text-gray-400 dark:text-gray-600 select-all">
              v{process.env.NEXT_PUBLIC_BUILD_VERSION}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 capitalize dark:text-white">{activeSection}</h3>
          </div>

          {activeSection === 'profile' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar
                    src={user?.avatarUrl}
                    name={user?.displayName || 'U'}
                    size="lg"
                  />
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-indigo-600 p-1 text-white transition-colors hover:bg-indigo-500 dark:border-gray-900"
                    title="Change avatar"
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Camera className="h-3 w-3" />
                    )}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>
                <div className="flex-1">
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newDisplayName}
                        onChange={e => setNewDisplayName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveDisplayName()
                          if (e.key === 'Escape') setIsEditingName(false)
                        }}
                        autoFocus
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      <button
                        onClick={handleSaveDisplayName}
                        disabled={isSavingName}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {isSavingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                      </button>
                      <button
                        onClick={() => { setIsEditingName(false); setNewDisplayName(user?.displayName || '') }}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.displayName}</p>
                      <button
                        onClick={() => { setNewDisplayName(user?.displayName || ''); setIsEditingName(true) }}
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                        title="Change display name"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">{user?.userId}</p>
                </div>
              </div>

              {profileError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                  {profileError}
                </div>
              )}

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
                <p className="mt-1 font-mono text-xs text-gray-500">{getHomeserverUrl() || 'Not connected'}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">User ID</h4>
                <p className="mt-1 font-mono text-xs text-gray-500">{user?.userId}</p>
              </div>

              {/* Generate Security Key */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldPlus className="h-4 w-4 text-gray-500" />
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Security Key</h4>
                </div>
                {generatedKey ? (
                  <div className="space-y-3">
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      Cross-signing and key backup are set up. Save this security key — you'll need it to verify new sessions.
                    </p>
                    <div className="relative rounded-lg border border-indigo-200 bg-white p-3 font-mono text-xs text-gray-900 break-all dark:border-indigo-800 dark:bg-gray-900 dark:text-white">
                      {generatedKey}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedKey)
                          setKeyCopied(true)
                          setTimeout(() => setKeyCopied(false), 2000)
                        }}
                        className="absolute top-2 right-2 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
                        title="Copy to clipboard"
                      >
                        {keyCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-red-500 dark:text-red-400">
                      Store this key securely. If you lose it, you won't be able to decrypt message history on new devices.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">
                      Set up cross-signing and key backup for this account. This generates a security key that other sessions can use to verify and decrypt messages.
                    </p>
                    <input
                      type="password"
                      value={generateKeyPassword}
                      onChange={e => { setGenerateKeyPassword(e.target.value); setGenerateKeyError(null) }}
                      placeholder="Account password (required for signing)"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 placeholder-gray-400 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                    />
                    {generateKeyError && (
                      <p className="text-xs text-red-500">{generateKeyError}</p>
                    )}
                    <button
                      onClick={async () => {
                        if (!generateKeyPassword.trim()) {
                          setGenerateKeyError('Password is required')
                          return
                        }
                        setIsGeneratingKey(true)
                        setGenerateKeyError(null)
                        try {
                          const key = await generateSecurityKey(generateKeyPassword)
                          setGeneratedKey(key)
                          setGenerateKeyPassword('')
                        } catch (err) {
                          setGenerateKeyError(err instanceof Error ? err.message : 'Failed to generate security key')
                        } finally {
                          setIsGeneratingKey(false)
                        }
                      }}
                      disabled={isGeneratingKey || !generateKeyPassword.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {isGeneratingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldPlus className="h-3.5 w-3.5" />}
                      {isGeneratingKey ? 'Setting up...' : 'Generate Security Key'}
                    </button>
                  </div>
                )}
              </div>

              {/* Recovery Key Restore */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
                <div className="flex items-center gap-2 mb-3">
                  <Key className="h-4 w-4 text-gray-500" />
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Key Backup Recovery</h4>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Enter your security key or passphrase to decrypt messages sent before this device logged in.
                  You can find it in another Matrix client (e.g. Element) under Settings &gt; Security &gt; Encryption.
                </p>
                <textarea
                  value={recoveryKey}
                  onChange={e => { setRecoveryKey(e.target.value); setRestoreError(null); setRestoreResult(null) }}
                  placeholder="Security key (EsTC j9gP noRq ...) or passphrase..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-900 placeholder-gray-400 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                />
                {restoreError && (
                  <p className="mt-2 text-xs text-red-500">{restoreError}</p>
                )}
                {restoreResult && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {restoreResult}
                  </div>
                )}
                <button
                  onClick={async () => {
                    if (!recoveryKey.trim()) return
                    setIsRestoring(true)
                    setRestoreError(null)
                    setRestoreResult(null)
                    try {
                      await restoreFromRecoveryKey(recoveryKey)
                      setRestoreResult('Device verified and keys restored')
                      setRecoveryKey('')
                    } catch (err) {
                      setRestoreError(err instanceof Error ? err.message : 'Failed to restore keys')
                    } finally {
                      setIsRestoring(false)
                    }
                  }}
                  disabled={isRestoring || !recoveryKey.trim()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                  {isRestoring ? 'Restoring keys...' : 'Restore from Recovery Key'}
                </button>
              </div>

              {/* Active Sessions */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
                <div className="flex items-center gap-2 mb-3">
                  <Monitor className="h-4 w-4 text-gray-500" />
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Sessions</h4>
                </div>
                {loadingDevices ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {devices.map(device => {
                      const isCurrent = device.deviceId === getMatrixClient()?.getDeviceId()
                      const isConfirming = showDeleteConfirm === device.deviceId
                      return (
                        <div key={device.deviceId} className={`rounded-lg p-2 ${isCurrent ? 'bg-green-50 dark:bg-green-900/20' : ''}`}>
                          <div className="flex items-center gap-3">
                            <Monitor className={`h-4 w-4 flex-shrink-0 ${isCurrent ? 'text-green-500' : 'text-gray-400'}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {device.displayName || device.deviceId}
                                {isCurrent && <span className="ml-1.5 text-xs text-green-600 dark:text-green-400">(this device)</span>}
                              </p>
                              <p className="text-xs text-gray-400">
                                {device.deviceId}
                                {device.lastSeenTs ? ` · Last seen ${new Date(device.lastSeenTs).toLocaleDateString()}` : ''}
                              </p>
                            </div>
                            {!isCurrent && !isConfirming && (
                              <button
                                onClick={() => { setShowDeleteConfirm(device.deviceId); setDeviceError(null); setDeletePassword('') }}
                                className="flex-shrink-0 rounded px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                Sign out
                              </button>
                            )}
                          </div>
                          {isConfirming && (
                            <div className="mt-2 ml-7 space-y-2">
                              <p className="text-xs text-gray-500">Enter your account password to sign out this session:</p>
                              <input
                                type="password"
                                value={deletePassword}
                                onChange={e => { setDeletePassword(e.target.value); setDeviceError(null) }}
                                onKeyDown={e => { if (e.key === 'Enter') handleDeleteDevice(device.deviceId) }}
                                placeholder="Account password"
                                autoFocus
                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                              />
                              {deviceError && <p className="text-xs text-red-500">{deviceError}</p>}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleDeleteDevice(device.deviceId)}
                                  disabled={deletingDevice === device.deviceId}
                                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                                >
                                  {deletingDevice === device.deviceId ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                                  Confirm sign out
                                </button>
                                <button
                                  onClick={() => { setShowDeleteConfirm(null); setDeletePassword(''); setDeviceError(null) }}
                                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
