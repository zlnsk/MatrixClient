'use client'

import { useEffect, useRef, useState } from 'react'
import { useCallStore } from '@/stores/call-store'
import {
  answerCall,
  rejectCall,
  hangupCall,
  toggleAudioMute,
  toggleVideoMute,
} from '@/lib/matrix/voip'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Maximize,
  Minimize,
  X,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const parts: string[] = []
  if (hrs > 0) parts.push(String(hrs).padStart(2, '0'))
  parts.push(String(mins).padStart(2, '0'))
  parts.push(String(secs).padStart(2, '0'))
  return parts.join(':')
}

export function CallOverlay() {
  const {
    callInfo,
    status,
    audioMuted,
    videoMuted,
    localStream,
    remoteStream,
    duration,
    isFullscreen,
    setIsFullscreen,
  } = useCallStore()

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  // Handle fullscreen changes
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [setIsFullscreen])

  if (!callInfo || status === 'idle') return null

  const isVideo = callInfo.isVideo
  const isIncoming = callInfo.isIncoming
  const isRinging = status === 'ringing'
  const isConnected = status === 'connected'
  const isEnded = status === 'ended'

  const handleToggleFullscreen = () => {
    if (!overlayRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      overlayRef.current.requestFullscreen()
    }
  }

  const statusText = isRinging
    ? isIncoming ? 'Incoming call...' : 'Ringing...'
    : status === 'connecting'
      ? 'Connecting...'
      : isConnected
        ? formatDuration(duration)
        : isEnded
          ? 'Call ended'
          : ''

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <div className="relative flex h-full w-full max-h-screen flex-col items-center justify-center">
        {/* Remote video (full background) */}
        {isVideo && remoteStream && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* When no remote video, show avatar */}
        {(!isVideo || !remoteStream) && (
          <div className="flex flex-col items-center gap-4">
            <Avatar
              src={callInfo.opponentAvatarUrl}
              name={callInfo.opponentName}
              size="lg"
            />
            <h2 className="text-2xl font-bold text-white">
              {callInfo.opponentName}
            </h2>
            <p className="text-lg text-gray-300">
              {isVideo ? 'Video Call' : 'Voice Call'}
            </p>
          </div>
        )}

        {/* Status indicator */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2">
          <div className="rounded-full bg-black/60 px-6 py-2 text-center backdrop-blur-sm">
            {isVideo && remoteStream && (
              <p className="text-sm font-medium text-white">{callInfo.opponentName}</p>
            )}
            <p className={`text-sm ${isRinging && isIncoming ? 'animate-pulse text-green-400' : 'text-gray-300'}`}>
              {statusText}
            </p>
          </div>
        </div>

        {/* Local video (picture-in-picture) */}
        {isVideo && localStream && (
          <div className="absolute top-20 right-6 h-36 w-28 overflow-hidden rounded-xl border-2 border-white/20 shadow-lg sm:h-48 sm:w-36">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover mirror"
              style={{ transform: 'scaleX(-1)' }}
            />
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-4">
            {/* Incoming call: accept/reject */}
            {isRinging && isIncoming && (
              <>
                <button
                  onClick={rejectCall}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-110 hover:bg-red-500"
                  title="Reject"
                >
                  <PhoneOff className="h-7 w-7" />
                </button>
                <button
                  onClick={answerCall}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition-transform hover:scale-110 hover:bg-green-500"
                  title="Accept"
                >
                  <Phone className="h-7 w-7" />
                </button>
              </>
            )}

            {/* Active call or outgoing ringing: mute controls + hangup */}
            {(!isRinging || !isIncoming) && !isEnded && (
              <>
                {/* Audio mute */}
                <button
                  onClick={toggleAudioMute}
                  className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 ${
                    audioMuted
                      ? 'bg-white text-gray-900'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                  title={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {audioMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </button>

                {/* Video mute (only for video calls) */}
                {isVideo && (
                  <button
                    onClick={toggleVideoMute}
                    className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 ${
                      videoMuted
                        ? 'bg-white text-gray-900'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                    title={videoMuted ? 'Turn on camera' : 'Turn off camera'}
                  >
                    {videoMuted ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                  </button>
                )}

                {/* Fullscreen toggle */}
                <button
                  onClick={handleToggleFullscreen}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-white shadow-lg transition-transform hover:scale-110 hover:bg-white/30"
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize className="h-6 w-6" /> : <Maximize className="h-6 w-6" />}
                </button>

                {/* Hang up */}
                <button
                  onClick={hangupCall}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-110 hover:bg-red-500"
                  title="Hang up"
                >
                  <PhoneOff className="h-7 w-7" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
