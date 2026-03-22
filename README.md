# szept

Probably the best-looking Matrix client out there.

Born out of frustration — after years of searching for a Matrix client that's both **truly secure** and **genuinely beautiful**, and never finding one, I built it myself. szept delivers Element-level end-to-end encryption wrapped in a modern, clean interface that's actually a pleasure to use.

## Why I Built This

Every Matrix client I tried was either rock-solid on security but painful to look at, or visually decent but cutting corners somewhere. I wanted both — no compromises. So here it is: a fully open-source Matrix client where security and design are both first-class citizens.

**Don't trust me — verify it yourself.** The entire codebase is open source. Clone it, read it, paste it into any AI engine or security scanner. You'll see it's built with the same encryption standards as Element, but with a UI that doesn't make you want to close the app.

## What Makes It Different

- **Beautiful by default** — Polished interface with smooth animations, elegant message bubbles, proper shadows and transitions. Dark mode that actually looks good. No tweaking required.
- **Element-level security** — Full end-to-end encryption via the Matrix protocol. Cross-signing, device verification, encrypted media — everything you'd expect from a serious secure messenger.
- **Dead simple** — No learning curve. If you've used any modern messenger, you already know how to use this.
- **Bridge everything** — Connect Signal, WhatsApp, WeChat, Telegram, Discord, iMessage, and more through Matrix bridges. One app for all your conversations.
- **Multi-platform** — Web app and Android app with Material 3 design.

## Features

- End-to-end encrypted messaging (text, images, video, audio, files)
- Voice messages
- Message reactions with emoji (see who reacted)
- Reply, edit, delete, forward, and pin messages
- Read receipts and typing indicators
- Room directory and room creation
- Link previews
- VoIP voice and video calls
- Device verification and cross-signing
- Bridges for Signal, WhatsApp, WeChat, Telegram, Discord, iMessage, and more
- Dark mode
- Android app

## Tech Stack

- **Frontend**: Next.js, React 19, TypeScript, Tailwind CSS
- **Matrix SDK**: matrix-js-sdk with Rust crypto (WASM)
- **State Management**: Zustand
- **Android**: Native WebView wrapper with Material 3 design, haptic feedback, background sync

## Getting Started

### Prerequisites

- Node.js 18+
- A Matrix homeserver (e.g., Synapse, Conduit, or any Matrix-compatible server)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/AverageJoesHosting/MatrixClient.git
   cd MatrixClient
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your environment file:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Matrix server domain.

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

### Building for Production

```bash
npm run build
```

### Android APK

```bash
cd android-app
bash build-apk.sh
```

Transfer the generated `matrix-debug.apk` to your Android device and install it (enable "Install from unknown sources").

## Bridges

One of the biggest advantages of Matrix is bridging — connecting other messaging platforms so all your conversations live in one place. Set up bridges on your Matrix homeserver and access them all through szept:

- **Signal** — [mautrix-signal](https://docs.mau.fi/bridges/go/signal/)
- **WhatsApp** — [mautrix-whatsapp](https://docs.mau.fi/bridges/go/whatsapp/)
- **WeChat** — [mautrix-wechat](https://github.com/duo/mautrix-wechat)
- **Telegram** — [mautrix-telegram](https://docs.mau.fi/bridges/python/telegram/)
- **Discord** — [mautrix-discord](https://docs.mau.fi/bridges/go/discord/)
- **iMessage** — [mautrix-imessage](https://docs.mau.fi/bridges/go/imessage/)
- **Slack** — [mautrix-slack](https://docs.mau.fi/bridges/go/slack/)
- **Instagram** — [mautrix-meta](https://docs.mau.fi/bridges/go/meta/)
- **Facebook Messenger** — [mautrix-meta](https://docs.mau.fi/bridges/go/meta/)

All bridged conversations appear as regular Matrix rooms — fully encrypted, seamless.

## Security

This project takes security seriously:

- **End-to-end encryption** using the Matrix protocol's Olm/Megolm implementation via the official Rust crypto SDK (compiled to WASM)
- **No tracking, no analytics, no telemetry**
- **Fully open source** — every line is auditable
- **HTTPS only** — no cleartext traffic
- **Content Security Policy** headers configured for protection
- **DOMPurify** sanitization on all rendered HTML

The codebase is transparent by design. Scan it, audit it, verify it.

## Contributing

Contributions are welcome. Found a bug or have an idea? Open an issue or submit a pull request.

## Built With

This client was built with the help of [Claude Code](https://claude.ai/code), a lot of patience, and the understanding of my wife.

## License

Open source. Free to use, modify, and distribute.
