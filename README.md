# FRIDAY — Personal AI Desktop Companion 🤖✨

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(64--bit)-blue.svg?style=for-the-badge&logo=windows)](https://microsoft.com)
[![AI Engine](https://img.shields.io/badge/AI%20Engine-Google%20Gemini%20Flash%20%2F%20Pro-4285F4.svg?style=for-the-badge&logo=google)](https://aistudio.google.com)
[![Desktop Framework](https://img.shields.io/badge/Desktop-Electron%2034%20%2B%20React%2019-61DAFB.svg?style=for-the-badge&logo=react)](https://electronjs.org)
[![Language](https://img.shields.io/badge/Languages-Telugu%20%7C%20English%20%7C%20Hindi%20%7C%20Tamil%20%7C%20Kannada-green.svg?style=for-the-badge)](https://github.com)
[![Tests](https://img.shields.io/badge/Tests-45%20Passed%20(355%20Assertions)-success.svg?style=for-the-badge)](https://github.com)
[![License](https://img.shields.io/badge/License-MIT-orange.svg?style=for-the-badge)](LICENSE)

**FRIDAY** is a modern, ultra-responsive personal AI desktop companion for Windows. Built with a **Pet-First Architecture**, FRIDAY lives directly on your desktop as an interactive floating character that listens, speaks, manages your PC, plays media, takes intelligent notes, and remembers your preferences across restarts.

FRIDAY is a **true standalone Windows desktop application** — install it once and double-click its icon to launch instantly like WhatsApp or Spotify, with **zero PowerShell windows, zero terminals, and no Administrator rights required**.

---

## 🌟 What's New in FRIDAY

### 🔊 Real Windows System Volume & Mute Control
- Controls actual Windows master audio using native Windows CoreAudio COM interfaces (`IMMDeviceEnumerator`, `IAudioEndpointVolume`).
- Set exact percentages (*"Set volume to 50 percent"*), delta adjustments (*"Increase volume by 10"*, *"Reduce volume"*), or instant mute/unmute (*"Mute my laptop"*, *"Unmute"*).
- Verifies and reads back the resulting master volume. Never simulates in-app audio — modifies actual Windows system audio.

### ☀️ Real Laptop Screen Brightness Control
- Controls actual laptop display brightness via Windows Management Instrumentation (WMI / ACPI `WmiMonitorBrightness`).
- Supports exact levels (*"Set brightness to 70 percent"*), incremental adjustments (*"Make my screen dimmer"*, *"Increase brightness"*), and maximum brightness (*"Set brightness to maximum"*).
- Gracefully handles unsupported external desktop monitors without pretending changes succeeded.

### ⏰ System Time, Date & Countdown Intelligence
- Instant local clock awareness with 12-hour and 24-hour time support based on your actual local system timezone.
- Resolves relative future and past time calculations (*"What time will it be in two hours?"*) and countdowns (*"How much time until 6 PM?"*).
- Deterministic $<1\text{ ms}$ zero-cloud local intent execution for lightning-fast responses without unnecessary AI API calls.

### ⛅ Live Weather Information & Forecasts
- Real-time weather and forecasts powered by Open-Meteo geocoding and forecast APIs.
- Queries current conditions, temperature, precipitation probability, humidity, and wind speed (*"Will it rain today?"*, *"What's the weather in Hyderabad?"*, *"Tell me tomorrow's weather"*).
- Built-in 10-minute caching to eliminate unnecessary network traffic; zero background polling.

### 🖱️ Real Windows Mouse Cursor & Button Automation
- Native User32 `mouse_event` / `SetCursorPos` + Windows UI Automation (UIA) tree navigation.
- Move cursor to coordinates, screen anchors (*"Move mouse to top-right corner"*), or accessible buttons and inputs (*"Click the Start button"*).
- Supports single-click, double-click, right-click (including relative *"Right-click here"* at current cursor position), and vertical wheel scrolling (*"Scroll down"*, *"Scroll up"*).
- **Safety Guards**: Automatically intercepts and requires user confirmation before executing potentially destructive actions.

### 👏 Two-Hand Clap Wake Trigger (No Wake Word Required)
- Wake FRIDAY effortlessly by **clapping your hands twice** (`clap-clap`).
- **Acoustic Impulse Engine**: Engineered with physical acoustic discrimination (sharp attack `peak >= 0.35`, crest factor `>= 2.8`, high-frequency presence `1.5 kHz – 8 kHz`, and deliberate human tempo intervals `180ms – 800ms`).
- **Zero False Triggers**: Rejects keyboard typing, mouse clicks, desk thumps, coughs, and ambient speech.
- **Sleep-Gated**: Clap detection only runs when FRIDAY is asleep (`STANDBY`). Once awake, the clap detector suspends automatically so your normal conversation is never interrupted.

### ⏳ 5-Minute Continuous Listening with Auto-Sleep
- Once woken, FRIDAY enters **continuous active listening mode** for **5 minutes**.
- You can speak naturally without repeating any wake words or clapping again between sentences.
- Every time you speak, the inactivity timer resets (`now + 5 minutes`).
- If you step away or go silent for more than 5 minutes, FRIDAY gracefully enters sleep standby. Clapping twice wakes her up immediately.

### 🎵 Direct Auto-Playback on Spotify & YouTube
- **Spotify**: When you say *"Play Believer on Spotify"* or *"Spotify lo DSP songs play chey"*, FRIDAY doesn't just search — it actively commands Spotify (desktop app or web) and starts playing the track directly.
- **YouTube**: Asking *"Play Believer on YouTube"* or *"Search and play Python tutorials on YouTube"* searches YouTube and immediately launches direct video playback.

### 🚀 150+ Native Windows App Launcher
- Fast local intent routing directly launches over **150+ Windows applications**, tools, and games by name:
  - **Productivity**: Chrome, Edge, Brave, VS Code, Notepad, Word, Excel, PowerPoint, File Explorer, Terminal.
  - **Communication**: WhatsApp, Telegram, Discord, Slack, Teams, Zoom.
  - **Media & Gaming**: Spotify, VLC, Steam, Epic Games, Paint, Calculator, Settings, and more.

### 📝 Smart Useful-Information Notes Filter
- FRIDAY's notes engine now intelligently distinguishes between **actionable information** (to-dos, meetings, URLs, project ideas, contact details, groceries) and casual conversational filler.
- Only genuinely useful notes are saved to your indexed JSON and text files in AppData; conversational chatter is safely ignored.

### 💬 Dynamic, Non-Repetitive AI Personality
- FRIDAY uses dynamic rotational prompting and conversational memory so that replies to similar questions are always fresh, engaging, and motivating.
- You'll never get the same robotic one-liner twice in a row.

### 🖥️ Native Standalone Windows Desktop App
- Operates as a packaged, self-sufficient Windows desktop app installed in `%LOCALAPPDATA%\Programs\FRIDAY`.
- Launches instantly from the Desktop shortcut, OneDrive Desktop, or Windows Start Menu search (`Win` + type `FRIDAY`).
- No visible terminal or background PowerShell processes.
- Automatic internal backend lifecycle management.

---

## 🐾 Pet-First Architecture

In FRIDAY, **the Desktop Pet IS FRIDAY** — the primary everyday interaction point on your screen:
- **Floating 2D Cyber Pet**: Stays smoothly anchored to your desktop with transparent, frameless DirectComposition rendering.
- **100% Self-Sufficient**: The pet window handles its own audio stream, microphone capture, clap detection, speech recognition, and lip-sync speech synthesis even when the main Dashboard window is closed.
- **Dynamic Expanding Glass Card**: Click the pet to expand its sleek interactive interface (380×580) with full conversation history, personality controls, and quick action buttons.
- **Real-Time Lip-Sync & Synchronized Expressions**: Reactive eyes that blink, scan, and express emotions (neutral, curious, listening, excited, thinking, speaking, sleepy, alert) perfectly synchronized across the pet and dashboard.
- **Unified Single Brain**: The pet and dashboard share the same SQLite memory database, conversation history, and tool capabilities.

---

## ⚡ Performance & Efficiency (Fan & Battery Friendly)

Engineered specifically for quiet operation on modern laptops (including Intel Core Ultra / Intel Arc and AMD Ryzen):
- **DirectComposition Hardware Acceleration**: Uses native GPU rasterization for transforms and shadows, eliminating CPU rendering spikes.
- **Zero Background Subprocesses**: System telemetry is sampled directly via native C++ Node.js OS bindings without spawning continuous background `wmic.exe` or `powershell.exe` workers.
- **Silence-Gated DSP Loop**: Audio analysis skips cadence calculations when silence is detected, throttling IPC events and preventing unnecessary React re-renders.
- **Standby Resource Targets**:
  - **Idle CPU**: `< 1.5%`
  - **Standby RAM**: `< 300–350 MB`
  - **External Background Processes**: `0`

---

## 🎙️ Audio Pipeline & Voice Isolation

- **16 kHz 32-Bit Linear PCM -> Mono WAV**: Uncompressed studio-grade audio capture with 350ms pre-roll buffers to prevent cut-off first syllables.
- **Multi-Stage Acoustic Filtering**:
  - **High-Pass Filter (85 Hz – 110 Hz)**: Eliminates desk vibrations, fan hum, and air conditioner drone.
  - **Low-Pass Filter (3400 Hz – 3800 Hz)**: Suppresses hiss, mouse clicks, and keyboard clatter.
  - **Peaking Vocal Boost (+3.5 dB @ 1.6 kHz)**: Sharpens speech intelligibility.
  - **Dynamics Compressor & AGC**: Balances quiet whispers and loud voices cleanly.
  - **Software Ducking & Acoustic Echo Cancellation (AEC)**: Suppresses speaker feedback while allowing instant user barge-in interruptions.
- **Multilingual Support**:
  - **Telugu (తెలుగు)**: Fluent native script and colloquial Telugu-English (*Tenglish*) code-switching.
  - **English (India & US)**: Clear, expressive conversational voice synthesis.
  - **Hindi (हिन्दी)**: Fluent conversational Hindi and *Hinglish*.
  - **Tamil (தமிழ்) & Kannada (ಕನ್ನಡ)**: Regional neural voice playback.

---

## 🧠 Persistent Long-Term Memory (SQLite + Vector Search)

- **Curated Memories**: Gemini automatically extracts durable facts (preferences, names, projects, guidelines) after conversations.
- **Local SQLite Store**: Saved atomically in `%APPDATA%\friday-ai-companion\friday_memory.db`.
- **Semantic Embeddings**: Embedded with `gemini-embedding-001` for cosine similarity and keyword retrieval.
- **100% Private**: All memory lives locally on your hard drive.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Runtime & Shell** | Electron 34 + Node.js 24 |
| **Frontend Framework** | React 19 + TypeScript + Vite |
| **Styling & Icons** | Tailwind CSS + Lucide React + DirectComposition CSS GPU Acceleration |
| **AI Models** | Google Gemini API (`gemini-2.5-flash`, `gemini-3.1-pro-preview`) |
| **Speech-to-Text (STT)** | Groq Whisper + Gemini Multimodal Audio |
| **Text-to-Speech (TTS)** | Microsoft Edge Neural TTS + ElevenLabs + Gemini TTS |
| **Audio Processing** | Web Audio API (`AudioContext`, Biquad Filters, Dynamics Compressor, Analyser) |
| **Database** | SQLite via `sql.js` (WASM) with WAL persistence |
| **Diagnostics** | Windows Application Event Log + Synchronous Startup Logger |

---

## 🚀 Getting Started

### Prerequisites
- **Windows 10 or 11 (64-bit)**
- **Node.js** (v18, v20, v22, or v24+) & [Git](https://git-scm.com/)
- **Microphone**: Built-in array, USB, or headset microphone
- **Google Gemini API Key**: Free key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### Quick Start Guide

1. **Clone the Repository**:
   ```powershell
   git clone https://github.com/charanx1234/voice-agent.git
   cd voice-agent
   ```

2. **Install Dependencies**:
   ```powershell
   npm install
   ```

3. **Configure Your API Key**:
   Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=AIzaSy...YourKeyHere
   ```
   *(Or enter and save it directly in the in-app Settings panel).*

4. **Compile the App**:
   ```powershell
   npm run build:all
   ```

5. **Register Windows Desktop & Search Shortcuts**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\create-shortcuts.ps1
   ```

6. **Launch FRIDAY**:
   - Double-click the **FRIDAY** shortcut on your Desktop.
   - Or press the **Windows key**, type **`FRIDAY`**, and hit Enter.

---

## 🗣️ How to Interact with FRIDAY

| Action | How to Trigger | What Happens |
|---|---|---|
| **Wake Up** | Clap your hands twice (`clap-clap`) | Wakes FRIDAY silently with a chime & excited expression. Starts 5-minute continuous listening. |
| **System Volume** | *"Set volume to 50 percent"* / *"Mute my laptop"* | Modifies actual Windows master volume via CoreAudio COM interfaces. |
| **Display Brightness** | *"Increase brightness"* / *"Make my screen dimmer"* | Adjusts laptop screen brightness via Windows WMI ACPI monitor methods. |
| **Time & Countdown** | *"What time is it?"* / *"What time in two hours?"* | Returns accurate system time, date, or relative countdowns deterministically. |
| **Live Weather** | *"What's the weather?"* / *"Will it rain today?"* | Fetches real-time temperature, rain probability, and conditions via Open-Meteo. |
| **Mouse Automation** | *"Move mouse to top-right"* / *"Click Start button"* | Real Windows cursor control, single/double/right click, and scroll automation. |
| **Push-to-Talk** | Tap the microphone icon on Pet or Dashboard | Begins instant speech capture. |
| **Continuous Conversation** | Just speak naturally | FRIDAY listens, executes commands, and responds with audio lip-sync. Timer auto-resets every turn. |
| **Barge-In / Interrupt** | Start speaking while FRIDAY talks, or tap mic | Immediately halts FRIDAY's voice output and listens to your new instruction. |
| **Sleep / Standby** | Remain silent for 5 minutes (or say *"Go to sleep"*) | FRIDAY enters low-power standby mode. Clapping twice wakes her back up. |
| **Toggle Desktop Pet** | Right-click the system tray icon → *Toggle Desktop Pet* | Shows or hides the floating character. |

---

## 🧪 Testing & Quality Assurance

FRIDAY includes comprehensive automated test suites covering all audio pipelines, clap detector logic, memory persistence, local intent execution, hardware control, and UI state machines:

```powershell
npm test
```

```
✓ Test Files  45 passed (45)
✓ Tests       355 passed (355)
```

---

## 📁 Application File Locations

- **Installed App**: `%LOCALAPPDATA%\Programs\FRIDAY\`
- **Startup Diagnostics**: `%APPDATA%\friday-ai-companion\logs\startup.log`
- **Application Logs**: `%APPDATA%\friday-ai-companion\logs\friday-YYYY-MM-DD.log`
- **Memory Database**: `%APPDATA%\friday-ai-companion\friday_memory.db`
- **Reminders Database**: `%APPDATA%\friday-ai-companion\friday_reminders.db`
- **Saved Notes**: `%APPDATA%\friday-ai-companion\notes\`

---

## 🛡️ License

This project is licensed under the **MIT License**. Built with ❤️ for advanced desktop AI companion and multimodal voice interaction.
