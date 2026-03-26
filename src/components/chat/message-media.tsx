'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Play, Pause } from 'lucide-react'

export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-pointer animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-label="Image preview — click anywhere to close"
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
    </div>,
    document.body
  )
}

/** Custom inline voice/audio player that works inside colored bubbles */
export function VoicePlayer({ src, isOwn, duration: durationMs }: { src: string; isOwn: boolean; duration?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(() => (durationMs ? durationMs / 1000 : 0))

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => {
      if (a.duration && isFinite(a.duration)) {
        setProgress(a.currentTime / a.duration)
        setDuration(a.duration)
      }
    }
    const onEnd = () => { setPlaying(false); setProgress(0) }
    const onLoaded = () => { if (a.duration && isFinite(a.duration)) setDuration(a.duration) }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('ended', onEnd)
    a.addEventListener('loadedmetadata', onLoaded)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('ended', onEnd)
      a.removeEventListener('loadedmetadata', onLoaded)
    }
  }, [])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play(); setPlaying(true) }
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    a.currentTime = ratio * a.duration
    setProgress(ratio)
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const textColor = isOwn ? 'text-white' : 'text-m3-on-surface dark:text-m3-on-surface'
  const subColor = isOwn ? 'text-white/70' : 'text-m3-on-surface-variant dark:text-m3-outline'
  const barBg = isOwn ? 'bg-white/30' : 'bg-m3-outline-variant dark:bg-m3-outline'
  const barFg = isOwn ? 'bg-white' : 'bg-m3-primary dark:bg-m3-primary'

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button onClick={toggle} className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-m3-surface-container hover:bg-m3-surface-container-high dark:bg-m3-surface-container-highest dark:hover:bg-m3-outline-variant'} transition-colors`}>
        {playing
          ? <Pause className={`h-4 w-4 ${textColor}`} />
          : <Play className={`h-4 w-4 ${textColor} ml-0.5`} />
        }
      </button>
      <div className="flex flex-1 flex-col gap-1">
        <div className={`h-1 w-full cursor-pointer rounded-full ${barBg}`} onClick={seek}>
          <div className={`h-full rounded-full ${barFg} transition-all`} style={{ width: `${progress * 100}%` }} />
        </div>
        <span className={`text-[11px] ${subColor}`}>
          {playing ? fmt(progress * duration) : fmt(duration)}
        </span>
      </div>
    </div>
  )
}
