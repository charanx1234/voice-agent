# FRIDAY 2.0 — AI Desktop Companion for Windows 🤖⚡

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(64--bit)-0078D6.svg?style=flat-square&logo=windows)](https://microsoft.com)
[![Framework](https://img.shields.io/badge/Architecture-Electron%2034%20%2B%20React%2019-61DAFB.svg?style=flat-square&logo=react)](https://electronjs.org)
[![AI Engine](https://img.shields.io/badge/AI-Google%20Gemini%20Flash%20%2F%20Pro-4285F4.svg?style=flat-square&logo=google)](https://aistudio.google.com)
[![STT Engine](https://img.shields.io/badge/STT-Groq%20Whisper%20%2F%20Faster--Whisper-F55036.svg?style=flat-square)](https://groq.com)
[![Tests](https://img.shields.io/badge/Tests-57%20Suites%20%7C%20440%20Passed-success.svg?style=flat-square)](https://github.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

**FRIDAY 2.0** is an AI-powered personal desktop assistant for Windows engineered with a **Pet-First Architecture**. Living directly on your screen as a responsive floating companion, FRIDAY combines sub-second conversational voice intelligence, real-time speech interruption, universal desktop text injection, and local hardware automation into a lightweight, standalone desktop application.

---

## 🏛️ System Architecture

```
                               ┌──────────────────────────────────────────────┐
                               │             USER INPUT CHANNELS              │
                               │  Voice Audio  │  Desktop Pet  │  Hotkeys / UI│
                               └──────────────────────┬───────────────────────┘
                                                      │
                                                      ▼
                       ┌─────────────────────────────────────────────────────────────┐
                       │              VOICE COORDINATOR & STATE MUTEX                │
                       │   Turn Mutex: IDLE ➔ LISTENING ➔ PROCESSING ➔ SPEAKING     │
                       │   Real-Time Barge-In: Audio Interruption & Context Abort    │
                       └──────────────┬───────────────────────────────┬──────────────┘
                                      │                               │
                      [High-Frequency Local Intent]            [Complex Reasoning]
                                      │                               │
                                      ▼                               ▼
                       ┌─────────────────────────────┐ ┌─────────────────────────────┐
                       │   FAST LOCAL INTENT ROUTER  │ │    HYBRID LLM PIPELINE      │
                       │   (<20ms Native Execution)  │ │   Groq Whisper (<200ms STT) │
                       │   • CoreAudio Master Volume │ │   Gemini 2.5 Flash / Pro    │
                       │   • WMI Display Brightness  │ │   Neural Edge / Gemini TTS  │
                       │   • User32 Window Manager   │ └──────────────┬──────────────┘
                       │   • 150+ App Launcher/Close │                │
                       └──────────────┬──────────────┘                │
                                      │                               │
                                      ▼                               ▼
                       ┌─────────────────────────────────────────────────────────────┐
                       │                     EXECUTION ENGINES                       │
                       │  • TypeFlow: Win32 SendInput Unicode Keyboard Insertion     │
                       │  • QuickTools: Clipboard Shield, Snippets, File Organizer   │
                       │  • SQLite WASM: Conversation Memory & Context Persistence   │
                       └─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Core Capabilities

### 1. 🐾 Pet-First Companion & Reactive Expressions
- **Zero-Flicker Floating Companion**: A hardware-accelerated, transparent desktop pet ($180\times 136\text{px}$) that docks unobtrusively on any monitor.
- **Multimodal State Synchronization**: Expresses real-time emotions (`smile`, `thinking`, `happy`, `surprised`, `sleepy`, `not-happy`) synchronized across audio analysis and state transitions.
- **Subtle Listening Feedback**: Minimalist visual feedback during audio capture—free of distracting overlays or text clutter.

### 2. 🎙️ High-Speed Voice Pipeline & Natural Barge-In
- **Atomic Turn Mutex**: Strictly sequences inputs (`IDLE` $\rightarrow$ `LISTENING` $\rightarrow$ `PROCESSING` $\rightarrow$ `SPEAKING`), preventing request collision and audio stutter.
- **Instant Speech Interruption (Barge-In)**: Speak at any time while FRIDAY is talking to immediately halt TTS audio playback, cancel in-flight token streams, and redirect attention to your new prompt.
- **Ultra-Fast Transcription (<200ms)**: Sub-second audio processing powered by Groq Whisper (`whisper-large-v3-turbo`) with automated fallback to Gemini.
- **Bilingual Code-Switching**: Native conversational understanding across Telugu-English mixed dialect (*"Chrome open chey"*, *"DSP songs play chey"*, *"Volume 40 percent pettu"*), English, and Hinglish.
- **Acoustic Clap-to-Wake (`clap-clap`)**: Physical two-clap impulse detector for completely hands-free activation.

### 3. ⌨️ TypeFlow & VoiceFlow (Universal Text Automation)
- **Universal Win32 SendInput Injection**: Types text, multiline blocks, and indented code directly into any focused Windows application (Notepad, VS Code, Chrome, Edge search bars, terminal, and browser editors).
- **Desktop & Focus Management**: Attaches thread input (`AttachThreadInput`), restores iconic windows, and acquires input target handles safely without stealing unintended focus.
- **AI Dictation Modes**: Transcribe and reformat speech on the fly with 5 purpose-built modes: `Natural`, `Professional`, `Concise`, `Code`, and `Verbatim`.
- **Credential Safeguard Gate**: Automatically detects password inputs and proctored examination windows to abort automated injection.

### 4. ⚡ Fast Local Intent Engine (<20ms Latency)
High-frequency system commands run directly in native C++/Windows COM APIs without cloud roundtrips:
- **Audio & Mute Control**: Adjusts master audio levels and toggle mutes via Windows CoreAudio `IAudioEndpointVolume`.
- **Display Backlight**: Regulates monitor backlight levels directly via WMI ACPI brightness methods.
- **Window Snapping**: Splits screens, snaps left/right, centers, minimizes, or maximizes windows via `user32.dll`.
- **150+ App Launcher & Terminator**: Instantly launches and closes native Windows applications.
- **Media Keys & Weather**: Direct control for Spotify and YouTube, alongside cached local weather via Open-Meteo.

### 5. 🗂️ Productivity Suite & Memory Persistence
- **Privacy-Shielded Clipboard**: Local clipboard history with automated redaction of sensitive credentials, API keys, and tokens.
- **Smart Text Snippets**: Instant text expansion triggered by customizable shortcuts (e.g., `;mail`, `;notes`) with dynamic template variables (`{name}`, `{date}`).
- **Desktop & Downloads Organizer**: Categorizes clutter into structured folders with built-in conflict resolution and 1-click restore/undo.
- **Persistent Memory Engine**: SQLite WASM database with Write-Ahead Logging (WAL) retaining conversation facts, user preferences, and reminders across reboots.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Runtime & Core** | Electron 34, Node.js 24, TypeScript |
| **Frontend UI** | React 19, Vite, Tailwind CSS, Lucide Icons |
| **AI & Voice** | Google Gemini API (2.5 Flash / 3.1 Pro), Groq Whisper Turbo, Edge Neural TTS, ElevenLabs |
| **Native Systems** | Win32 API (`user32.dll`, `kernel32.dll`), CoreAudio COM, WMI, Python 3.12 |
| **Local Storage** | SQLite WASM (`sql.js`) with atomic file flushes |
| **Testing** | Vitest (57 test suites, 440 automated tests, 100% pass rate) |

---

## 📥 Getting Started

### Prerequisites
- Windows 10 or 11 (64-bit)
- Node.js 20+ and Python 3.10+
- Google Gemini API Key (saved in `.env`)

### Installation & Development
```powershell
# Clone the repository
git clone https://github.com/charanx1234/voice-agent.git
cd voice-agent

# Install dependencies
npm install

# Run all test suites
npm test

# Start in development mode
npm run dev
```

### Production Build & Packaging
```powershell
# Compile TypeScript and build Vite bundle
npm run build

# Package unpacked application and official Windows NSIS Installer
npx electron-builder --win
```
The compiled binaries are generated in `dist-release/`:
- **Standalone Installer**: `dist-release/FRIDAY Setup 1.0.1.exe`
- **Portable Distribution**: `dist-release/win-unpacked/FRIDAY.exe`

---

## 📁 System Paths

- **Application Binary**: `%LOCALAPPDATA%\Programs\FRIDAY\FRIDAY.exe`
- **Memory & Storage**: `%APPDATA%\friday-ai-companion\friday_memory.db`
- **Application Logs**: `%APPDATA%\friday-ai-companion\logs\`

---

## 🛡️ License

This project is licensed under the **MIT License**.
