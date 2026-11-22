# FRIDAY 2.0 — AI Desktop Companion for Windows 🤖⚡

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(64--bit)-0078D6.svg?style=flat-square&logo=windows)](https://microsoft.com)
[![Framework](https://img.shields.io/badge/Architecture-Electron%2034%20%2B%20React%2019-61DAFB.svg?style=flat-square&logo=react)](https://electronjs.org)
[![AI Engine](https://img.shields.io/badge/AI-Google%20Gemini%202.5%20%7C%203.1-4285F4.svg?style=flat-square&logo=google)](https://aistudio.google.com)
[![STT Engine](https://img.shields.io/badge/STT-Groq%20Whisper%20%7C%20VoiceFlow-F55036.svg?style=flat-square)](https://groq.com)
[![Neural TTS](https://img.shields.io/badge/TTS-Sonex%20Cloned%20%7C%20Edge%20Neural-00C7B7.svg?style=flat-square)](https://sonexlabs.com)
[![Tests](https://img.shields.io/badge/Tests-58%20Suites%20%7C%20453%20Passed-success.svg?style=flat-square)](https://github.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

**FRIDAY 2.0** is an intelligent, low-latency, personal desktop companion for Windows engineered with an animated **Pet-First Architecture** and a robust **Hybrid Voice Architecture (V2)**. Floating transparently on your desktop, FRIDAY combines sub-second conversational intelligence, real-time speech interruption, DSP background noise suppression, acoustic echo cancellation, universal Win32 desktop typing automation, and local hardware control into an efficient, privacy-first desktop application.

---

## 🏛️ System Architecture

```
                                  ┌────────────────────────┐
                                  │   PHYSICAL MICROPHONE  │
                                  └───────────┬────────────┘
                                              │ 16kHz PCM Stream
                                              ▼
                        ┌──────────────────────────────────────────────┐
                        │       CENTRAL AUDIO CAPTURE HOST             │
                        │   • Single microphone owner (No duplicates)  │
                        │   • Windows WASAPI / DirectInput backend     │
                        │   • Unthrottled background audio loop        │
                        └─────────────────────┬────────────────────────┘
                                              │
                                              ▼
                        ┌──────────────────────────────────────────────┐
                        │      DSP AUDIO PREPROCESSING PIPELINE        │
                        │   1. Spectral Gating Noise Suppression       │
                        │   2. Dynamic Noise-Floor & Transient Filter  │
                        │   3. Software Acoustic Echo Cancellation     │
                        │   4. Speech Turn Boundary & Pause Detector   │
                        └─────────────────────┬────────────────────────┘
                                              │
                                              ▼
                        ┌──────────────────────────────────────────────┐
                        │        VOICE REQUEST CONTROLLER              │
                        │   • Atomic In-Flight Turn ID Tracking        │
                        │   • Cascade AbortController on Barge-In      │
                        │   • Zero Race-Condition State Transitions    │
                        └──────────────┬──────────────┬────────────────┘
                                       │              │
                    [<20ms Local Intent]              [Complex LLM Reasoning]
                                       │              │
                                       ▼              ▼
                        ┌────────────────────────┐ ┌────────────────────────┐
                        │ FAST LOCAL ROUTER      │ │ HYBRID AI PIPELINE     │
                        │ • CoreAudio Volume     │ │ • Groq Whisper Turbo   │
                        │ • WMI Display Light    │ │ • Google Gemini Flash  │
                        │ • User32 Window Snap   │ │ • Context & Tools      │
                        │ • 150+ App Launcher    │ └──────────┬─────────────┘
                        └──────────────┬─────────┘            │
                                       │                      ▼
                                       │           ┌────────────────────────┐
                                       │           │ NEURAL TTS CASCADE     │
                                       │           │ 1. Sonex Cloned Voice  │
                                       │           │ 2. Murf AI Studio      │
                                       │           │ 3. ElevenLabs          │
                                       │           │ 4. Edge Neural Engine  │
                                       └───────────┴──────────┬─────────────┘
                                                              │
                                                              ▼
                        ┌──────────────────────────────────────────────┐
                        │          PRESENTATION & AUTOMATION           │
                        │  • Desktop Pet: Transparent Canvas & States  │
                        │  • TypeFlow: Win32 SendInput Unicode Typing  │
                        │  • SQLite Memory: Persistent User Facts      │
                        └──────────────────────────────────────────────┘
```

---

## 🚀 Core Capabilities

### 1. 🎙️ Hybrid Voice Architecture V2 & Clean Speech Pipeline
- **Single Microphone Owner**: Eliminates duplicate audio streams and race conditions by isolating microphone capture inside an unthrottled central audio host.
- **DSP Noise Suppression**: Real-time spectral gating removes fan hum, keyboard clatter, and steady background noise without degrading voice clarity.
- **Software Acoustic Echo Cancellation (AEC)**: Reference energy mask blocks FRIDAY's own speakers from looping into speech recognition while allowing natural user barge-in.
- **Dynamic Speech Turn Boundary Detection**: Protects trailing syllables and tolerates natural mid-sentence pauses (up to 1,200ms) before finalizing speech turns.
- **Instant Speech Interruption (Barge-In)**: Intercepts user speech while FRIDAY is talking to immediately halt TTS audio playback, cancel in-flight token streams via `AbortController`, and pivot to the new request.
- **Custom Cloned Neural Voice**: Integrated with Sonex Labs (Panini model) using a custom reference voice, with automated resilient fallback to Murf AI, ElevenLabs, and Microsoft Edge Neural TTS.

### 2. 🐾 Pet-First Companion & Reactive Expressions
- **Zero-Flicker Floating Companion**: A hardware-accelerated, transparent desktop pet ($180\times 136\text{px}$) that docks seamlessly across multiple monitors.
- **State-Synchronized Expressions**: Dynamic emotional states (`smile`, `thinking`, `happy`, `surprised`, `sleepy`, `not-happy`) reactive to listening, thinking, speaking, and interruption events.
- **Presentation Layer Decoupling**: The Desktop Pet operates as a pure visual and interactive controller, delegating audio streams and execution to the background core.

### 3. ⌨️ TypeFlow & VoiceFlow (Universal Text Automation)
- **Universal Win32 SendInput Injection**: Types text, multiline scripts, and code directly into any focused Windows application (VS Code, Notepad, terminal, browser address bars, and web editors).
- **Desktop & Focus Safety**: Attaches thread input (`AttachThreadInput`), restores iconic windows, and handles input targets safely without stealing focus.
- **AI Dictation Modes**: Transcribe and format speech instantly across 5 purpose-built modes: `Natural`, `Professional`, `Concise`, `Code`, and `Verbatim`.
- **Credential Safeguard Gate**: Automatically detects password fields and proctored examination windows to abort automated keystroke injection.

### 4. ⚡ Fast Local Intent Engine (<20ms Latency)
High-frequency system commands execute directly against native C++/Windows COM APIs without cloud roundtrips:
- **Audio & Mute Control**: Adjusts master audio levels and toggles mutes via Windows CoreAudio `IAudioEndpointVolume`.
- **Display Brightness**: Regulates monitor backlight levels directly via WMI ACPI brightness methods.
- **Window Snapping**: Splits screens, snaps left/right, centers, minimizes, or maximizes windows via `user32.dll`.
- **150+ App Launcher & Terminator**: Instantly launches and terminates native Windows applications.
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
| **Voice & DSP** | Web Audio API, Spectral Subtraction, Software AEC, Groq Whisper Turbo |
| **Neural TTS** | Sonex Labs Panini (Cloned Voice), Murf AI, ElevenLabs, Edge Neural TTS |
| **LLM & Reasoning** | Google Gemini API (2.5 Flash / 3.1 Pro) |
| **Native Systems** | Win32 API (`user32.dll`, `kernel32.dll`), CoreAudio COM, WMI, Python 3.12 |
| **Local Storage** | SQLite WASM (`sql.js`) with atomic file flushes |
| **Quality & Tests** | Vitest (58 test suites, 453 automated tests, 100% pass rate) |

---

## ⚙️ Configuration (.env)

Create a `.env` file in the project root:

```env
# Gemini API Key (Required for conversational intelligence)
GEMINI_API_KEY=your_gemini_api_key_here

# Groq Whisper (Required for <200ms speech-to-text)
GROQ_API_KEY=your_groq_api_key_here

# Custom Cloned Voice (Sonex Labs)
SONEX_API_KEY=your_sonex_api_key_here
SONEX_VOICE_ID=your_cloned_voice_id_here

# Optional Fallback Voice Providers
MURF_API_KEY=your_murf_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

---

## 📥 Getting Started

### Prerequisites
- Windows 10 or 11 (64-bit)
- Node.js 20+ and Python 3.10+
- Valid API keys for Gemini, Groq, and voice providers

### Installation & Development
```powershell
# Clone the repository
git clone https://github.com/charanx1234/voice-agent.git
cd voice-agent

# Install dependencies
npm install

# Run the full automated test suite (58 suites / 453 tests)
npm test

# Start in local development mode
npm run dev
```

### Production Build & Packaging
```powershell
# Compile TypeScript services and build Vite frontend
npm run build

# Package unpacked application and official Windows NSIS Setup installer
npm run package:win
```
The compiled outputs are generated in `dist-release/`:
- **Windows Setup Installer**: `dist-release/FRIDAY Setup 1.0.1.exe`
- **Portable Unpacked App**: `dist-release/win-unpacked/FRIDAY.exe`

---

## 📁 System Paths (Windows)

- **Application Binary**: `%LOCALAPPDATA%\Programs\FRIDAY\FRIDAY.exe`
- **Application Config**: `%APPDATA%\friday-ai-companion\.env`
- **Memory & Storage**: `%APPDATA%\friday-ai-companion\friday_memory.db`
- **Application Logs**: `%APPDATA%\friday-ai-companion\logs\`

---

## 🛡️ License

This project is licensed under the **MIT License**.
