# szept

Secure messaging client powered by the [Matrix](https://matrix.org) protocol. Built with Next.js 16, React 19, and the official Matrix JS SDK.

## Features

- **End-to-end encryption** — E2EE via `matrix-sdk-crypto-wasm`
- **Voice/video calls** — WebRTC-based VoIP through Matrix
- **PWA** — Installable on mobile and desktop with offline support
- **Link previews** — Rich URL previews inline in chat
- **Voice messages** — Record and send audio with WebM→OGG conversion
- **Room directory** — Browse and join public rooms
- **Dark theme** — Dark-first UI with Tailwind CSS

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (standalone output) |
| UI | React 19, Tailwind CSS 4, Lucide icons |
| State | Zustand |
| Protocol | matrix-js-sdk, matrix-sdk-crypto-wasm |
| Security | CSP headers, DOMPurify, COOP/COEP |

## Getting Started

```bash
npm install
npm run dev
```

Set your Matrix homeserver in the login screen — no `.env` file required.

## Build

```bash
npm run build
npm start
```

Produces a standalone Node.js server. The build version is derived automatically from `package.json` version + git SHA, or override with `BUILD_VERSION` env var.

## Project Structure

```
src/
├── app/            # Next.js app router (pages, API routes, layout)
├── components/
│   ├── chat/       # Chat UI (messages, input, sidebar, calls, settings)
│   ├── providers/  # Auth, realtime sync, theme providers
│   └── ui/         # Shared UI components (avatar, error boundary)
├── lib/
│   ├── matrix/     # Matrix client, media handling, VoIP
│   └── audio/      # WebM→OGG audio conversion
└── stores/         # Zustand stores (auth, chat, call state)
```

## License

Private
