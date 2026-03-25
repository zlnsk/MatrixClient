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

// --- Call ringing sounds ---

let ringInterval: ReturnType<typeof setInterval> | null = null

/**
 * Play a repeating incoming call ringtone.
 * Two-bar chime pattern that repeats every 3 seconds.
 */
export function startIncomingRing(): void {
  stopRinging()
  playIncomingChime() // play immediately
  ringInterval = setInterval(playIncomingChime, 3000)
}

function playIncomingChime(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  const now = ctx.currentTime
  // Rising three-note chime, played twice with a pause
  const pattern = [
    { freq: 784, start: 0, dur: 0.15 },    // G5
    { freq: 988, start: 0.18, dur: 0.15 },  // B5
    { freq: 1175, start: 0.36, dur: 0.22 }, // D6
    { freq: 784, start: 0.8, dur: 0.15 },   // G5
    { freq: 988, start: 0.98, dur: 0.15 },  // B5
    { freq: 1175, start: 1.16, dur: 0.22 }, // D6
  ]

  for (const note of pattern) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = note.freq
    const t = now + note.start
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, t + note.dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + note.dur)
  }
}

/**
 * Play a repeating outgoing ringback tone (the sound you hear while waiting).
 * Classic phone-style double beep, repeating every 4 seconds.
 */
export function startOutgoingRingback(): void {
  stopRinging()
  playRingbackTone()
  ringInterval = setInterval(playRingbackTone, 4000)
}

function playRingbackTone(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  const now = ctx.currentTime
  // Standard ringback: 440Hz + 480Hz dual tone, 2s on / 4s off
  for (let i = 0; i < 2; i++) {
    const start = now + i * 0.6
    for (const freq of [440, 480]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.06, start + 0.02)
      gain.gain.setValueAtTime(0.06, start + 0.4)
      gain.gain.linearRampToValueAtTime(0, start + 0.45)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.5)
    }
  }
}

/**
 * Stop any ringing sound (incoming or outgoing).
 */
export function stopRinging(): void {
  if (ringInterval) {
    clearInterval(ringInterval)
    ringInterval = null
  }
}

/**
 * Play a subtle "seen" confirmation sound — a short soft click.
 */
export function playSeenSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.value = 1568 // G6

  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.08, now + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.06)
}
