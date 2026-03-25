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

/**
 * Apply HD quality constraints to the call's local video/audio tracks
 * and boost bitrate via RTCRtpSender parameters.
 */
async function applyHdConstraints(call: MatrixCall, isVideo: boolean): Promise<void> {
  const localFeed = call.localUsermediaFeed
  if (!localFeed?.stream) return

  // Upgrade video track constraints to HD
  if (isVideo) {
    const videoTrack = localFeed.stream.getVideoTracks()[0]
    if (videoTrack) {
      try {
        await videoTrack.applyConstraints({
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        })
      } catch (e) {
        console.warn('Could not apply HD video constraints:', e)
      }
    }
  }

  // Boost audio quality
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
      console.warn('Could not apply HD audio constraints:', e)
    }
  }

  // Boost max bitrate via RTCRtpSender
  const pc = assertPeerConnAccessible(call)
  if (!pc) return
  for (const sender of pc.getSenders()) {
    const params = sender.getParameters()
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}]
    }
    if (sender.track?.kind === 'video') {
      params.encodings[0].maxBitrate = 2_500_000 // 2.5 Mbps
    } else if (sender.track?.kind === 'audio') {
      params.encodings[0].maxBitrate = 128_000 // 128 kbps
    }
    try {
      await sender.setParameters(params)
    } catch (e) {
      console.warn('Could not set sender bitrate:', e)
    }
  }
}

/**
 * Remove HD constraints — revert to standard quality.
 */
async function applyStandardConstraints(call: MatrixCall, isVideo: boolean): Promise<void> {
  const localFeed = call.localUsermediaFeed
  if (!localFeed?.stream) return

  if (isVideo) {
    const videoTrack = localFeed.stream.getVideoTracks()[0]
    if (videoTrack) {
      try {
        await videoTrack.applyConstraints({
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 },
        })
      } catch (e) {
        console.warn('Could not revert video constraints:', e)
      }
    }
  }

  const pc = assertPeerConnAccessible(call)
  if (!pc) return
  for (const sender of pc.getSenders()) {
    const params = sender.getParameters()
    if (!params.encodings || params.encodings.length === 0) continue
    if (sender.track?.kind === 'video') {
      params.encodings[0].maxBitrate = 800_000 // 800 kbps
    } else if (sender.track?.kind === 'audio') {
      params.encodings[0].maxBitrate = 64_000 // 64 kbps
    }
    try {
      await sender.setParameters(params)
    } catch (e) {
      console.warn('Could not revert sender bitrate:', e)
    }
  }
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
    // Apply relay policy after peerConn is created by placeCall
    enforceRelayIcePolicy(call)
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
  // Don't enforce relay here — peerConn may not exist yet.
  // It will be applied after answerCall().
}

/**
 * Answer an incoming call.
 */
export async function answerCall(): Promise<void> {
  if (!currentCall) return

  try {
    useCallStore.getState().setStatus('connecting')
    await currentCall.answer()
    enforceRelayIcePolicy(currentCall)
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
