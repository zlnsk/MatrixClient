'use client'

import { useEffect, useRef } from 'react'

const DOT_SPACING = 22
const DOT_BASE_RADIUS = 0.7
const DOT_MAX_RADIUS = 1.8
const INFLUENCE_RADIUS = 100

export function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let cols = 0
    let rows = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(canvas.offsetWidth / DOT_SPACING) + 1
      rows = Math.ceil(canvas.offsetHeight / DOT_SPACING) + 1
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const isDark = () => document.documentElement.classList.contains('dark')

    const draw = () => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const dark = isDark()

      const baseAlpha = dark ? 0.12 : 0.15
      const activeAlpha = dark ? 0.5 : 0.45

      const offsetX = (w - (cols - 1) * DOT_SPACING) / 2
      const offsetY = (h - (rows - 1) * DOT_SPACING) / 2

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = offsetX + col * DOT_SPACING
          const y = offsetY + row * DOT_SPACING

          const dx = x - mx
          const dy = y - my
          const dist = Math.sqrt(dx * dx + dy * dy)
          const t = Math.max(0, 1 - dist / INFLUENCE_RADIUS)

          const radius = DOT_BASE_RADIUS + (DOT_MAX_RADIUS - DOT_BASE_RADIUS) * t * t
          const alpha = baseAlpha + (activeAlpha - baseAlpha) * t * t

          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fillStyle = dark
            ? `rgba(148, 163, 184, ${alpha})`
            : `rgba(100, 116, 139, ${alpha})`
          ctx.fill()
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    resize()
    draw()

    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  )
}
