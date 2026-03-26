'use client'

import DOMPurify from 'dompurify'

// Shared DOMPurify config — restrict to safe subset of HTML
const PURIFY_CONFIG_FORMATTED = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'del', 's', 'strike', 'code', 'pre', 'br', 'p', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'sup', 'sub', 'hr', 'mx-reply'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'data-mx-color', 'data-mx-bg-color', 'class'],
  ADD_ATTR: ['target'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'svg', 'math', 'foreignobject', 'annotation-xml'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style', 'xlink:href'],
  ALLOW_DATA_ATTR: false,
}

const PURIFY_CONFIG_PLAIN = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'del', 's', 'code', 'pre', 'br', 'a', 'blockquote', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'svg', 'math', 'foreignobject', 'annotation-xml'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style'],
  ALLOW_DATA_ATTR: false,
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderRichContent(content: string, formattedContent: string | null): string {
  // If Matrix HTML formatted_body is available, sanitize and use it
  if (formattedContent) {
    return DOMPurify.sanitize(formattedContent, PURIFY_CONFIG_FORMATTED)
  }

  // Parse markdown from plain text
  let html = escapeHtml(content)

  // Code blocks (```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
  // Italic (*text* or _text_)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
  // Strikethrough (~~text~~)
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
  // Links (auto-detect URLs)
  html = html.replace(
    /(?<!")https?:\/\/[^\s<]+/g,
    '<a href="$&" target="_blank" rel="noopener noreferrer">$&</a>'
  )

  return DOMPurify.sanitize(html, PURIFY_CONFIG_PLAIN)
}

/** Highlight search term in HTML string — only highlights text outside of tags */
export function applySearchHighlight(html: string, term: string): string {
  if (!term || term.length < 2) return html
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  // Split by HTML tags to avoid highlighting inside tags/attributes
  return html.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag
    return text.replace(regex, '<mark class="rounded-sm bg-yellow-300/80 text-inherit dark:bg-yellow-500/40">$1</mark>')
  })
}

// Matches strings that contain only emoji (including skin tone modifiers, ZWJ sequences, keycap sequences, flags)
const EMOJI_ONLY_RE = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Regional_Indicator}{2}|[\u200d\uFE0F]|\d\uFE0F?\u20E3)+$/u

export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim()
  // Up to ~12 emoji characters to avoid huge text on long strings
  return trimmed.length > 0 && trimmed.length <= 30 && EMOJI_ONLY_RE.test(trimmed)
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<]+/)
  return match ? match[0] : null
}

/**
 * Extract the clean display name, stripping any Matrix ID disambiguation
 * that the SDK appends (e.g. "Łukasz (@signal_xxx:server.com)" → "Łukasz").
 */
export function parseDisplayName(senderName: string, senderId: string): { displayName: string; matrixId: string | null } {
  // If name contains " (@user:server)", strip it
  const match = senderName.match(/^(.+?)\s*\(@[^)]+\)$/)
  if (match) {
    return { displayName: match[1].trim(), matrixId: senderId }
  }
  // If name is just the raw Matrix ID, show it shortened
  if (senderName === senderId || senderName.startsWith('@')) {
    const localpart = senderId.replace(/^@/, '').split(':')[0]
    // Show clean localpart, full ID as subtitle
    return { displayName: localpart, matrixId: senderId }
  }
  // Clean name — hide Matrix ID for bridge users (signal_, telegram_, etc.) since it's just noise
  return { displayName: senderName, matrixId: null }
}
