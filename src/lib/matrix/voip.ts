'use client'

import { createNewMatrixCall, CallEvent } from 'matrix-js-sdk'
import type { MatrixCall } from 'matrix-js-sdk'
import { CallState, CallType, CallErrorCode } from 'matrix-js-sdk/lib/webrtc/call'
import { CallFeedEvent } from 'matrix-js-sdk/lib/webrtc/callFeed'
import { CallEventHandlerEvent } from 'matrix-js-sdk/lib/webrtc/callEventHandler'
import { getMatrixClient, getAvatarUrl } from './client'
import { useCallStore } from '@/stores/call-store'
import type { CallInfo } from '@/stores/call-store'

let currentCall: MatrixCall | null = null

// Tested against matrix-js-sdk 41.1.0 — peerConn is a private property.
const SDK_PEER_CONN_FIELD = 'peerConn'

function assertPeerConnAccessible(call: MatrixCall): RTCPeerConnection | null {
  const pc = (call as any)[SDK_PEER_CONN_FIELD] as RTCPeerConnection | undefined
  if (!pc) {
    // peerConn may not exist yet if called before placeCall/answer — not an error
    return null
  }
  return pc
}

// Public STUN servers used as fallback when homeserver has no TURN
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

/**
 * Ensure the call has usable ICE servers. If TURN servers are present,
 * enforce relay-only policy. Otherwise inject public STUN servers and
 * allow all transport types so the call can still connect.
 */
function enforceRelayIcePolicy(call: MatrixCall): void {
  const pc = assertPeerConnAccessible(call)
  if (!pc) return
  const config = pc.getConfiguration()
  const hasTurnServers = config.iceServers?.some(s =>
    (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u: string) => u.startsWith('turn:') || u.startsWith('turns:'))
  )

  if (hasTurnServers) {
    // TURN available — force relay for privacy
    if (config.iceTransportPolicy !== 'relay') {
      pc.setConfiguration({ ...config, iceTransportPolicy: 'relay' })
    }
  } else {
    // No TURN — inject public STUN servers and allow all transport types
    const hasAnyIceServers = config.iceServers && config.iceServers.length > 0
    if (!hasAnyIceServers) {
      pc.setConfiguration({
        ...config,
        iceServers: FALLBACK_ICE_SERVERS,
        iceTransportPolicy: 'all',
      })
    }
  }
}
let durationInterval: ReturnType<typeof setInterval> | null = null

function clearDurationInterval(): void {
  if (durationInterval) {
    clearInterval(durationInterval)
    durationInterval = null
  }
}

function startDurationTimer(): void {
  clearDurationInterval()
  const startTime = Date.now()
  useCallStore.getState().setDuration(0)
  durationInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    useCallStore.getState().setDuration(elapsed)
  }, 1000)
}

function updateStreamsFromCall(call: MatrixCall): void {
  const store = useCallStore.getState()

  const localFeed = call.localUsermediaFeed
  if (localFeed?.stream) {
    store.setLocalStream(localFeed.stream)
  }

  const remoteFeed = call.remoteUsermediaFeed
  if (remoteFeed?.stream) {
    store.setRemoteStream(remoteFeed.stream)
  }
}

function getOpponentInfo(call: MatrixCall, roomId: string): Pick<CallInfo, 'opponentName' | 'opponentAvatarUrl' | 'opponentUserId'> {
  const client = getMatrixClient()
  const member = call.getOpponentMember()
  const room = client?.getRoom(roomId)

  if (member) {
    return {
      opponentName: member.name || member.userId,
      opponentAvatarUrl: getAvatarUrl(member.getMxcAvatarUrl()) || null,
      opponentUserId: member.userId,
    }
  }

  // Fallback: use room name
  return {
    opponentName: room?.name || roomId,
    opponentAvatarUrl: null,
    opponentUserId: '',
  }
}

function attachCallListeners(call: MatrixCall): void {
  const store = useCallStore.getState()

  call.on(CallEvent.State, (state: CallState, _oldState: CallState) => {
    const s = useCallStore.getState()

    switch (state) {
      case CallState.Ringing:
        s.setStatus('ringing')
        break
      case CallState.InviteSent:
        s.setStatus('ringing')
        break
      case CallState.Connecting:
      case CallState.CreateOffer:
      case CallState.CreateAnswer:
      case CallState.WaitLocalMedia:
        s.setStatus('connecting')
        break
      case CallState.Connected:
        s.setStatus('connected')
        startDurationTimer()
        updateStreamsFromCall(call)
        break
      case CallState.Ended:
        endCallCleanup()
        break
    }
  })

  call.on(CallEvent.FeedsChanged, () => {
    updateStreamsFromCall(call)
  })

  call.on(CallEvent.Hangup, () => {
    endCallCleanup()
  })

  call.on(CallEvent.Error, (error: any) => {
    console.error('Call error:', error)
    endCallCleanup()
  })
}

// Quality presets — configurable via localStorage
export interface CallQualityPreset {
  label: string
  width: number
  height: number
  frameRate: number
  videoBitrate: number  // bps
  audioBitrate: number  // bps
}

export const QUALITY_PRESETS: Record<string, CallQualityPreset> = {
  low: { label: 'Low (360p)', width: 640, height: 360, frameRate: 20, videoBitrate: 400_000, audioBitrate: 48_000 },
  standard: { label: 'Standard (480p)', width: 640, height: 480, frameRate: 24, videoBitrate: 800_000, audioBitrate: 64_000 },
  hd: { label: 'HD (720p)', width: 1280, height: 720, frameRate: 30, videoBitrate: 2_500_000, audioBitrate: 128_000 },
  fullhd: { label: 'Full HD (1080p)', width: 1920, height: 1080, frameRate: 30, videoBitrate: 5_000_000, audioBitrate: 128_000 },
}

export function getDefaultQuality(): string {
  if (typeof window === 'undefined') return 'standard'
  return localStorage.getItem('szept_call_quality') || 'standard'
}

export function setDefaultQuality(preset: string): void {
  localStorage.setItem('szept_call_quality', preset)
}

/**
 * Apply HD quality constraints to the call's local video/audio tracks
 * and boost bitrate via RTCRtpSender parameters.
 */
async function applyQualityPreset(call: MatrixCall, isVideo: boolean, presetKey: string): Promise<void> {
  const preset = QUALITY_PRESETS[presetKey] || QUALITY_PRESETS.standard
  const localFeed = call.localUsermediaFeed
  if (!localFeed?.stream) return

  if (isVideo) {
    const videoTrack = localFeed.stream.getVideoTracks()[0]
    if (videoTrack) {
      try {
        await videoTrack.applyConstraints({
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.frameRate },
        })
      } catch (e) {
        console.warn('Could not apply video constraints:', e)
      }
    }
  }

  const audioTrack = localFeed.stream.getAudioTracks()[0]
  if (audioTrack) {
    try {
      await audioTrack.applyConstraints({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 },
      })
    } catch (e) {
      console.warn('Could not apply audio constraints:', e)
    }
  }

  const pc = assertPeerConnAccessible(call)
  if (!pc) return
  for (const sender of pc.getSenders()) {
    const params = sender.getParameters()
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}]
    }
    if (sender.track?.kind === 'video') {
      params.encodings[0].maxBitrate = preset.videoBitrate
    } else if (sender.track?.kind === 'audio') {
      params.encodings[0].maxBitrate = preset.audioBitrate
    }
    try {
      await sender.setParameters(params)
    } catch (e) {
      console.warn('Could not set sender bitrate:', e)
    }
  }
}

// Legacy wrappers
async function applyHdConstraints(call: MatrixCall, isVideo: boolean): Promise<void> {
  await applyQualityPreset(call, isVideo, 'hd')
}

/**
 * Remove HD constraints — revert to standard quality.
 */
async function applyStandardConstraints(call: MatrixCall, isVideo: boolean): Promise<void> {
  await applyQualityPreset(call, isVideo, getDefaultQuality())
}

/**
 * Toggle HD quality on the current call.
 */
export async function toggleHdQuality(): Promise<void> {
  if (!currentCall) return
  const store = useCallStore.getState()
  const newHd = !store.hdQuality
  store.setHdQuality(newHd)

  const isVideo = store.callInfo?.isVideo ?? false
  if (newHd) {
    await applyHdConstraints(currentCall, isVideo)
  } else {
    await applyStandardConstraints(currentCall, isVideo)
  }
}

function endCallCleanup(): void {
  clearDurationInterval()
  const store = useCallStore.getState()
  store.setStatus('ended')

  // Brief delay to show "ended" state, then reset
  setTimeout(() => {
    useCallStore.getState().reset()
  }, 2000)

  currentCall = null
}

/**
 * Place an outgoing call (audio or video) to a room.
 */
export async function placeCall(roomId: string, isVideo: boolean): Promise<void> {
  const client = getMatrixClient()
  if (!client) {
    console.error('Matrix client not initialized')
    return
  }

  if (currentCall) {
    console.warn('A call is already in progress')
    return
  }

  const call = createNewMatrixCall(client, roomId)
  if (!call) {
    console.error('Failed to create call - WebRTC may not be supported')
    return
  }

  currentCall = call

  const opponentInfo = getOpponentInfo(call, roomId)

  useCallStore.getState().setCallInfo({
    callId: call.callId,
    roomId,
    isVideo,
    isIncoming: false,
    ...opponentInfo,
  })
  useCallStore.getState().setStatus('connecting')

  // Attach error listener before placing the call (required by the SDK)
  call.on(CallEvent.Error, (error: any) => {
    console.error('Call error:', error)
    endCallCleanup()
  })

  attachCallListeners(call)

  try {
    if (isVideo) {
      await call.placeVideoCall()
    } else {
      await call.placeVoiceCall()
    }
  } catch (err) {
    console.error('Failed to place call:', err)
    endCallCleanup()
  }
}

/**
 * Handle an incoming call from the CallEventHandler.
 */
export function handleIncomingCall(call: MatrixCall): void {
  if (currentCall) {
    // Already in a call, reject the incoming one
    call.reject()
    return
  }

  currentCall = call
  const roomId = call.roomId
  const isVideo = call.type === CallType.Video
  const opponentInfo = getOpponentInfo(call, roomId)

  useCallStore.getState().setCallInfo({
    callId: call.callId,
    roomId,
    isVideo,
    isIncoming: true,
    ...opponentInfo,
  })
  useCallStore.getState().setStatus('ringing')

  attachCallListeners(call)
  // For incoming calls, peerConn is created when the invite arrives,
  // so we can inject STUN servers before answering.
  enforceRelayIcePolicy(call)
}

/**
 * Answer an incoming call.
 */
export async function answerCall(): Promise<void> {
  if (!currentCall) return

  try {
    useCallStore.getState().setStatus('connecting')
    // Inject STUN servers before answering so ICE uses them from the start
    enforceRelayIcePolicy(currentCall)
    await currentCall.answer()
  } catch (err) {
    console.error('Failed to answer call:', err)
    endCallCleanup()
  }
}

/**
 * Reject an incoming call.
 */
export function rejectCall(): void {
  if (!currentCall) return
  currentCall.reject()
  endCallCleanup()
}

/**
 * Hang up the current call.
 */
export function hangupCall(): void {
  if (!currentCall) return
  currentCall.hangup(CallErrorCode.UserHangup, false)
  endCallCleanup()
}

/**
 * Toggle microphone mute.
 */
export async function toggleAudioMute(): Promise<void> {
  if (!currentCall) return

  const isMuted = currentCall.isMicrophoneMuted()
  await currentCall.setMicrophoneMuted(!isMuted)
  useCallStore.getState().setAudioMuted(!isMuted)
}

/**
 * Toggle video mute.
 */
export async function toggleVideoMute(): Promise<void> {
  if (!currentCall) return

  const isMuted = currentCall.isLocalVideoMuted()
  await currentCall.setLocalVideoMuted(!isMuted)
  useCallStore.getState().setVideoMuted(!isMuted)
}

/**
 * Get the current MatrixCall object.
 */
export function getCurrentCall(): MatrixCall | null {
  return currentCall
}

/**
 * Initialize incoming call listener on the Matrix client.
 * Should be called once after the client starts syncing.
 */
export function setupIncomingCallListener(): (() => void) | undefined {
  const client = getMatrixClient()
  if (!client) return

  const onIncomingCall = (call: MatrixCall) => {
    console.log('Incoming call from:', call.getOpponentMember()?.userId)
    handleIncomingCall(call)
  }

  client.on(CallEventHandlerEvent.Incoming as any, onIncomingCall)

  return () => {
    client.removeListener(CallEventHandlerEvent.Incoming as any, onIncomingCall)
  }
}
