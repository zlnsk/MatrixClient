/**
 * Play a short notification chime using the Web Audio API.
 * No external audio file needed — synthesises a pleasant two-tone ping.
 */

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

export function playNotificationSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return

  // Resume context if suspended (browsers require user gesture first)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  const now = ctx.currentTime

  // Two-tone chime: C6 → E6
  const frequencies = [1047, 1319]
  const duration = 0.12
  const gap = 0.08

  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.value = freq

    const start = now + i * (duration + gap)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.15, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(start)
    osc.stop(start + duration)
  })
}
