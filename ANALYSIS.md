# MatrixClient (szept) — Code Analysis & Recommendations

## Overview

**Stack:** Next.js 16 · React 19 · TypeScript (strict) · Zustand · matrix-js-sdk · matrix-sdk-crypto-wasm (Rust E2EE)
**Size:** ~10,400 LOC across 32 TypeScript/TSX files
**Architecture:** App Router (Next.js 16) with Zustand stores, Matrix SDK wrapper layer, and PWA support

## Strengths

- **Security-first design** — SSRF protection on homeserver resolution, DOMPurify for XSS, HSTS with preload, relay-only ICE for VoIP privacy, idle session timeout (8h)
- **Full end-to-end encryption** via Rust WASM backend with cross-signing, SSSS, key backup, and encrypted media decryption with SHA-256 hash verification
- **Clean separation of concerns** — UI components, Zustand state stores (`auth-store`, `chat-store`, `call-store`), and Matrix SDK integration layer (`lib/matrix/`)
- **Optimistic UI** — Messages appear instantly with retry queue via MatrixScheduler and exponential backoff
- **PWA with offline support** — Service worker caches app shell, installable on mobile and desktop
- **Type safety** — Full TypeScript strict mode, explicit interfaces for all data models

## Recommendations

### Critical

#### 1. Add Test Coverage

**Current state:** Zero test files exist — no Jest, Vitest, or any test runner configured.

**Risk:** High probability of silent regressions in E2EE crypto flows, Matrix sync processing, session restore logic, and SSRF protection.

**Recommended actions:**
- Add Vitest (or Jest) with React Testing Library
- **Priority 1:** Unit tests for `lib/matrix/client.ts` — login, session restore, crypto init, logout
- **Priority 2:** Unit tests for `lib/matrix/media.ts` — decryption, LRU cache eviction, thumbnail fallback
- **Priority 3:** Integration tests for API routes — matrix-proxy SSRF validation, homeserver resolution
- **Priority 4:** Component tests for `message-input.tsx`, `message-bubble.tsx`, `sidebar.tsx`

#### 2. Fix localStorage vs sessionStorage Discrepancy

**Current state:** `SECURITY.md` claims session tokens use `sessionStorage`, but the code stores them in `localStorage['matrix_session']` as plaintext JSON.

**Risk:** Any XSS bypass could exfiltrate access tokens from localStorage (persists across tabs/sessions).

**Recommended actions:**
- Either update the code to use `sessionStorage` (more secure, but requires re-login on tab close)
- Or encrypt tokens at rest and update `SECURITY.md` to accurately reflect the implementation

#### 3. Add CSP Nonce Middleware

**Current state:** `next.config.ts` and `SECURITY.md` reference per-request CSP nonces, but no `middleware.ts` exists to generate them.

**Recommended action:** Create a Next.js middleware that generates a cryptographic nonce per request and injects it into the `Content-Security-Policy` `script-src` directive.

### High Priority

#### 4. Remove SDK Internal Access

**File:** `src/lib/matrix/voip.ts`

**Current state:** Uses `@ts-expect-error` to access the private `peerConn` property on `MatrixCall` for relay-only ICE policy and HD bitrate control.

**Risk:** Silent breakage on matrix-js-sdk upgrades.

**Recommended actions:**
- Pin `matrix-js-sdk` to exact version in `package.json`
- Add a runtime assertion that `peerConn` exists (fail loudly instead of silently)
- File upstream issue/PR for public API access to RTCPeerConnection

#### 5. Reduce Suppressed Logging

**File:** `src/lib/matrix/client.ts`

**Current state:** 40+ regex patterns suppress console warnings/errors. This hides legitimate crypto errors alongside expected SDK noise.

**Recommended actions:**
- Move suppression behind a `SUPPRESS_CRYPTO_NOISE` env flag (enabled by default in production)
- Log suppressed messages at `debug` level instead of discarding entirely
- Periodically review patterns — some may no longer be relevant

#### 6. Refactor Realtime Provider

**File:** `src/components/providers/realtime-provider.tsx`

**Current state:** Single ~300+ LOC `useEffect` attaching 15+ event listeners. Difficult to maintain, debug, and test.

**Recommended actions:**
- Extract into composable hooks: `useTimelineSync()`, `useTypingIndicators()`, `useCallSetup()`, `useReadReceipts()`
- Each hook manages its own listener lifecycle
- Compose hooks in the provider component

### Medium Priority

#### 7. Server-Side Rate Limiting

**File:** `src/app/login/page.tsx`

**Current state:** Login rate limiting uses module-scope variables (`failedAttempts`, `lockoutUntil`). A page refresh resets the counter.

**Recommended actions:**
- Move rate limiting to `sessionStorage` at minimum
- Better: implement server-side rate limiting in the API proxy (per-IP throttling)

#### 8. Add Error Monitoring

**Current state:** No error reporting service (Sentry, LogRocket, etc.). Silent production failures — especially crypto init errors and sync failures — go unnoticed.

**Recommended action:** Integrate Sentry (or equivalent) with focus on:
- Crypto initialization failures
- Sync errors and connection drops
- Unhandled promise rejections

#### 9. Validate Proxy Path Segments

**File:** `src/app/api/matrix-proxy/[...path]/route.ts`

**Current state:** Homeserver URLs are validated against SSRF, but proxied path segments are not validated against an allowlist.

**Recommended action:** Add allowlist for Matrix API path prefixes (`/_matrix/client/`, `/_matrix/media/`, `/_matrix/key/`).

#### 10. Docker Improvements

**File:** `Dockerfile`

**Current state:** Multi-stage build with non-root user (good), but missing health check and `.dockerignore`.

**Recommended actions:**
- Add `HEALTHCHECK CMD curl -f http://localhost:3000/ || exit 1`
- Add `.dockerignore` excluding `.git/`, `node_modules/`, `.next/`, `*.md`

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Browser / PWA                         │
│  Next.js 16 App Router + React 19                       │
├─────────────────────────────────────────────────────────┤
│  Providers                                               │
│  ├── ThemeProvider (dark theme)                          │
│  ├── AuthProvider (session restore)                     │
│  └── RealtimeProvider (Matrix sync + events)            │
├─────────────────────────────────────────────────────────┤
│  Zustand Stores                                          │
│  ├── useAuthStore (session, idle timeout)                │
│  ├── useChatStore (rooms, messages, typing)              │
│  └── useCallStore (WebRTC state)                        │
├─────────────────────────────────────────────────────────┤
│  Matrix Integration (lib/matrix/)                        │
│  ├── client.ts (SDK wrapper, crypto, sync)              │
│  ├── media.ts (authenticated media, LRU cache)          │
│  └── voip.ts (WebRTC calls, relay-only ICE)             │
├─────────────────────────────────────────────────────────┤
│  API Routes (server-side)                                │
│  ├── /api/matrix-proxy/[...path] (CORS proxy)           │
│  └── /api/resolve-homeserver (discovery + SSRF check)   │
└─────────────────────────────────────────────────────────┘
```

## File Reference

| Module | Path | LOC | Responsibility |
|--------|------|-----|----------------|
| Matrix Client | `src/lib/matrix/client.ts` | ~720 | SDK wrapper, auth, crypto, sync |
| VoIP | `src/lib/matrix/voip.ts` | ~430 | WebRTC calls, ICE policy, HD quality |
| Media | `src/lib/matrix/media.ts` | ~265 | Authenticated media, LRU cache, decryption |
| Auth Store | `src/stores/auth-store.ts` | ~200 | Session lifecycle, idle timeout |
| Chat Store | `src/stores/chat-store.ts` | ~600 | Rooms, messages, invites, typing |
| Realtime | `src/components/providers/realtime-provider.tsx` | ~350 | Event listeners, sync, notifications |
| CORS Proxy | `src/app/api/matrix-proxy/[...path]/route.ts` | ~200 | Server-side proxy with SSRF protection |
| Audio Convert | `src/lib/audio/webm-to-ogg.ts` | ~300 | WebM→OGG remuxing (no re-encoding) |
