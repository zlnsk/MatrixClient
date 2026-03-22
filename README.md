# Matrix Client

Probably the best-looking Matrix client out there.

Born out of frustration — after years of searching for a Matrix client that's both **truly secure** and **genuinely beautiful**, and never finding one, I built it myself. Matrix Client delivers Element-level end-to-end encryption wrapped in a modern, clean interface that's actually a pleasure to use.

## Why I Built This

Every Matrix client I tried was either rock-solid on security but painful to look at, or visually decent but cutting corners somewhere. I wanted both — no compromises. So here it is: a fully open-source Matrix client where security and design are both first-class citizens.

**Don't trust me — verify it yourself.** The entire codebase is open source. Clone it, read it, paste it into any AI engine or security scanner. You'll see it's built with the same encryption standards as Element, but with a UI that doesn't make you want to close the app.

## What Makes It Different

- **Beautiful by default** — Polished interface with smooth animations, elegant message bubbles, proper shadows and transitions. Dark mode that actually looks good. No tweaking required.
- **Element-level security** — Full end-to-end encryption via the Matrix protocol. Cross-signing, device verification, encrypted media — everything you'd expect from a serious secure messenger.
- **Dead simple** — No learning curve. If you've used any modern messenger, you already know how to use this.
- **Signal Bridge included** — Want to keep using Signal but consolidate your chats? Hook up the Signal bridge and access your Signal conversations directly from Matrix Client.
- **Multi-platform** — Web app, desktop app (Tauri), and Android app.

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
- Signal bridge support
- Dark mode
- Desktop app (Tauri)
- Android app

## Tech Stack

- **Frontend**: Next.js, React 19, TypeScript, Tailwind CSS
- **Matrix SDK**: matrix-js-sdk with Rust crypto (WASM)
- **Backend**: Supabase
- **State Management**: Zustand
- **Desktop**: Tauri
- **Android**: Native WebView wrapper

## Getting Started

### Prerequisites

- Node.js 18+
- A Matrix homeserver (e.g., Synapse, Conduit, or any Matrix-compatible server)
- A Supabase project

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
   Fill in your Supabase URL, anon key, and Matrix server domain.

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

### Desktop App (Tauri)

```bash
npm run tauri build
```

## Signal Bridge

To use Signal alongside Matrix, set up [mautrix-signal](https://docs.mau.fi/bridges/go/signal/) on your Matrix homeserver. Once configured, your Signal conversations will appear as rooms in Matrix Client — fully encrypted, just like native Matrix chats.

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

## License

Open source. Free to use, modify, and distribute.
