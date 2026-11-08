# FRIDAY — Personal AI Assistant 🤖

**FRIDAY** is an intelligent personal AI desktop companion for Windows, powered by **Google Gemini** with a **Pet-First Architecture**, native multilingual Indian voice conversation capabilities, hardware-level voice isolation for noisy environments, an interactive 2D animated desktop character, and an **ultra-lightweight energy-efficient performance engine**.

In FRIDAY, **the Desktop Pet IS FRIDAY** — the primary, everyday face and interaction point. The Desktop Pet is 100% self-sufficient: it captures microphone input, listens for hands-free wake words ("Hey Friday"), performs desktop tasks, and speaks responses with live lip-sync animation even when the main Dashboard window is completely closed.

---

## 🌟 Key Features

### 1. Pet-First Architecture 🐾
- **The Desktop Pet is the Primary Interface**:
  - The floating Desktop Pet stays on your screen as a lightweight, non-intrusive companion. Clicking the pet smoothly expands its sleek glass companion card without cluttering your desktop.
  - **Self-Sufficient Voice Input & Output**:
    - Tap the microphone button or the character to talk directly to the pet.
    - Speaks answers out loud with synchronized real-time mouth lip-sync animation driven by the actual audio waveform.
    - **Fully Independent**: When the main dashboard is closed, the pet seamlessly takes over audio capture and hands-free listening.
  - **Dynamic Smart Resizing**: The pet floats compactly (200×220) and smoothly expands to an interactive companion interface (380×580) on click or when "Hey Friday" wakes it.
  - **Personality Mode Switcher**: Switch immediately between **Simple** (succinct), **Moderate** (helpful), and **Roast** (witty banter) modes right from the pet header.
  - **Quick Capability Tools**: One-click access to Screen Understanding (capture & analyze), Web Reader, Quick Notes, Reminders, and Audio Mute.
  - **In-Pet Action Confirmations**: When desktop tasks require confirmation (e.g. launching an app), an interactive confirmation card appears right on the pet interface with **[Allow]** and **[Deny]** buttons.
  - **Single Unified Brain**: One memory database, one conversation history, and one shared capability registry. The pet never runs a stripped-down chatbot; it shares 100% of FRIDAY's tools, memory, and backend intelligence.

---

### 2. Ultra-Lightweight & Energy-Efficient Performance Engine ⚡
FRIDAY is engineered to run seamlessly on modern laptops (such as Intel Core Ultra / Intel Arc) without causing laptop heating, excessive fan noise, or battery drain:
- **DirectComposition & Intel Arc GPU Hardware Acceleration**:
  - Replaces software CPU rasterization with DirectComposition zero-copy GPU acceleration (`enable-gpu-rasterization`, `enable-zero-copy`). CSS drop-shadows and SVG transforms are rendered natively in GPU shaders at 0% CPU cost.
- **Zero-Subprocess Native System Monitoring**:
  - Built exclusively on native Node.js C++ `os` APIs. Completely eliminates continuous background `wmic.exe` and `powershell.exe` child process spawning. Polling automatically pauses when no active UI listener is registered.
- **Silence-Gated Audio & Wake-Word Pipeline**:
  - Precalculated DSP frequency bin boundaries (`binVocalStart`, `binFricativeStart`) and energy-gated analysis skip cadence processing during silence.
  - Microphone input level IPC broadcasts are throttled during quiet room conditions, preventing unnecessary background React re-renders.
- **Throttled Lip-Sync & Visuals**:
  - Audio analyser frame loop is capped at 30 FPS.
  - DOM visualizer rendering is automatically suspended when the dashboard is hidden or minimized.
- **Standby Resource Targets**:
  - Idle CPU usage: **< 1.5%**
  - Standby RAM: **< 300–350 MB**
  - Background Python processes: **0** (Pure Electron / Node.js architecture)

---

### 3. Robust Universal Audio Pipeline & Voice Isolation 🎙️
FRIDAY includes a production-grade, lossless linear PCM audio pipeline with hardware-level voice isolation:
- **Direct Linear PCM -> 16kHz Mono WAV Engine**:
  - Raw audio is captured directly as uncompressed 32-bit float PCM buffers via Web Audio API, downsampled via linear interpolation, and encoded with a standard 44-byte RIFF WAVE header.
  - Pre-roll buffers (350ms) prevent clipped first words during voice activity onset.
  - Universally compatible with Gemini Multimodal Audio, Groq Whisper, and Web Audio.
- **Dedicated Audio Processing Graph**:
  - **High-Pass Filter** (85 Hz – 110 Hz): Cuts low-frequency desk thumps, AC rumble, and fan drone.
  - **Low-Pass Filter** (3400 Hz – 3800 Hz): Suppresses high-frequency hiss, keyboard clatter, and mouse clicks.
  - **Peaking Vocal Presence Filter** (1.6 kHz, +3.5 dB boost): Enhances human voice formant intelligibility.
  - **Dynamics Compressor & AGC Limiter** (6:1 to 10:1 compression, 3ms attack): Normalizes quiet whispers and prevents digital clipping.
  - **Software Ducking & Acoustic Echo Cancellation (AEC)**: Attenuates incoming microphone audio while FRIDAY is speaking to prevent self-triggering, while still enabling smooth user barge-in interruptions.
- **Lifecycle State Machine**:
  - Verified transitions: `IDLE` → `LISTENING` → `SPEECH_DETECTED` → `PROCESSING_AUDIO` → `TRANSCRIBING` → `TRANSCRIPT_RECEIVED` → `THINKING` → `SPEAKING` → `ERROR`.
  - No fake indicators or unhandled hanging states.
- **Dynamic Adaptive Voice Activity Detection (VAD)**:
  - Continuously tracks ambient noise floor using real-time exponential smoothing.
  - Dynamically raises start and end thresholds in noisy environments, eliminating premature cut-offs.
  - Extended silence hysteresis accommodates natural pauses during bilingual code-switching.
- **Multilingual Telugu-English-Hinglish Recognition**:
  - Preserves natural conversational code-switching: *"Friday, Chrome open chey and Java tutorials search chey"*, *"Spotify lo music play chey"*, *"Naaku tomorrow college ki vellali"*, *"Ee error enti, can you explain?"*.
  - Retains Telugu colloquial verbs and case markers (`chey`, `chudu`, `pettandi`, `vellali`, `raayi`, `teeyi`, `entha`, `cheppu`, `lo`, `ki`, `naaku`, `enti`) and Hindi verbs (`karo`, `kholo`, `chalao`, `band karo`).

---

### 4. Real-Time Resource & Voice Diagnostics Panel 📊
Click the **Activity Pulse icon** in the bottom Control Bar of the dashboard to open the diagnostic suite:
- **Resource Performance**: Total CPU %, RAM footprint (MB), process count, and per-process breakdown (Main, Renderer, GPU, Utility) sampled via kernel metrics (`app.getAppMetrics()`) with 0 subprocesses.
- **Hardware Status**: Confirms Intel Arc DirectComposition GPU acceleration, 0 Python processes, and low-power local wake-word engine.
- **Audio Pipeline Metrics**: Microphone device label, permission state, track state (`live`/`muted`), live input levels, ambient noise floor, buffer size (KB), STT model & latency, exact recognized transcript, and error logs.

---

### 5. Expressive 2D Robot Character & Desktop Pet
- **Sleek Cyber Aesthetic**: Deep charcoal & metallic black chassis with glowing cyan accents (`#00e5ff`).
- **Reactive Eyes & Blinking**: Expressive rounded eyes that spontaneously blink, widen when attentive, scan when thinking, and show gentle alerts in error states.
- **Audio-Driven Lip-Sync**: LED mouth bars dynamically oscillate and stretch in real-time according to the actual audio frequency amplitude (`AudioAnalyser` Web Audio API) during speech playback.
- **Visual State Machine**: Seamless transitions across `idle`, `listening`, `thinking`, `speaking`, `interrupted`, and `error`.
- **Instant Barge-in / Interruption**: Clicking on FRIDAY or tapping the microphone button instantly halts ongoing speech and returns FRIDAY to listening mode.

---

### 6. Multilingual Indian Voice Assistant
- **Supported Languages**:
  - **Telugu (తెలుగు)**: `te-IN` (Native script, natural conversational phrasing, and Telugu-English code-switching)
  - **English (India)**: `en-IN` (Friendly, clear Indian English conversational responses)
  - **Hindi (हिन्दी)**: `hi-IN` (Devanagari script and natural conversational Hindi)
  - **Tamil (தமிழ்)**: `ta-IN` (Tamil script and polite responses)
  - **Kannada (ಕನ್ನಡ)**: `kn-IN` (Kannada script and conversational phrases)
  - **English (US)**: `en-US`
- **Voice Pipeline**:
  - **Input**: Microphone audio capture with real-time waveform visualization, sending audio to Gemini Multimodal Audio and Groq Whisper STT.
  - **Output**: Neural text-to-speech across American, British, and Indian accents with female and male options, plus native voices for Telugu, Hindi, Tamil, and Kannada.
  - **Fallback chain**: Edge neural → Gemini TTS (`gemini-2.5-flash-preview-tts`) → installed system voices.

---

### 7. Controlled Agent Capabilities (Useful Work)
FRIDAY distinguishes between answering questions and executing actions, and verifies task completion:
- **Tool A — Notes**:
  - Create notes via voice or text (e.g., *"Save a note called Grocery with milk and eggs"*).
  - List existing notes, search notes by keyword, or ask FRIDAY to read a note aloud.
  - Notes are saved in both indexed JSON and plain `.txt` files in your user AppData directory so you can edit them directly in Notepad.
- **Tool B — Project-Folder Search**:
  - Search files and text contents exclusively within **user-approved folders** (added via native Windows folder picker).
  - Never scans unauthorized system files or entire hard drives.
- **Tool C — Web Research**:
  - Searches live web data and references, providing clickable source links and separating sourced facts from general model explanations.
- **Tool D — Application Shortcuts & Desktop Control**:
  - Fast local intent routing for safe desktop applications: **Chrome**, **Spotify**, **Notepad**, **Calculator**, **Paint**, **File Explorer**, and **Command Prompt**.
  - Natural voice control: *"Chrome open chey"*, *"Spotify lo music play chey"*, *"sound penchu"*, *"sound thagginchu"*, *"mute chey"*.

---

### 8. Long-Term Memory (SQLite + Semantic Search)
- **Curated memories**: After each exchange, Gemini extracts at most three durable details — name, city, preferences, standing instructions, and ongoing projects. Small talk and credentials are never stored.
- **Local SQLite database**: Memories live in `friday_memory.db` in your AppData directory with atomic writes and automatic recovery.
- **Semantic retrieval**: Every memory is embedded with `gemini-embedding-001` and retrieved via cosine similarity and keyword matching.
- **Survives restarts**: Conversations are persisted and restored automatically across restarts.

---

### 9. Privacy & Security
- **Strict IPC Isolation**: Electron runs with `contextIsolation: true` and `nodeIntegration: false`. The renderer communicates strictly through a sandboxed, type-safe IPC bridge (`window.fridayAPI`).
- **Zero API Key Leakage**: Keys are never hardcoded or tracked in Git. The API key is stored safely in your local Windows AppData directory or loaded from `.env`, and is always masked (`AIza...9xQ`) in the UI and logs.
- **User Confirmation Required**: Sensitive actions prompt you for approval with an Allow/Deny modal.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Desktop Application** | Electron 34 (Hardware-accelerated DirectComposition) |
| **Frontend UI** | React 19 + TypeScript + Vite |
| **Icons & Design** | Lucide React + Custom CSS GPU-Promoted Animations + SVG |
| **AI Providers** | Google Gemini API (`gemini-3.1-pro-preview` / `gemini-2.5-flash`), Anthropic Claude, OpenAI-compatible |
| **Speech-to-Text (STT)** | Groq Whisper + Gemini Multimodal Audio |
| **Text-to-Speech (TTS)** | Microsoft Edge Neural TTS + ElevenLabs + Gemini TTS |
| **Audio Processing** | Web Audio API (`AudioContext`, `BiquadFilterNode`, `DynamicsCompressorNode`, `AnalyserNode`), WebRTC AEC/AGC/NoiseSuppression |
| **Long-Term Memory** | SQLite via `sql.js` (WASM) + Gemini embeddings (`gemini-embedding-001`) |
| **Local Storage** | JSON Store in Electron `app.getPath('userData')`, SQLite memory database |
| **Packaging** | Electron Builder |

---

## 📋 System Requirements

- **Operating System**: Windows 10 or Windows 11 (64-bit)
- **Processor**: Intel Core Ultra / Intel Core / AMD Ryzen (Hardware GPU acceleration supported)
- **Node.js**: Version 18, 20, 22, or 24+ installed ([Download Node.js](https://nodejs.org/))
- **Microphone**: Built-in, headset, or USB microphone
- **Google Gemini API Key**: Free key from [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## 🚀 Getting Started

### Step 1: Clone or Navigate to the Project
```powershell
cd C:\25r11a6760\FRIDAY
```

### Step 2: Install Dependencies
```powershell
npm install
```

### Step 3: Configure Your API Key
You can configure your key in either of two ways:
- **Through the UI**: Start FRIDAY, open Settings, paste your API key, and click **Save Changes**.
- **Using `.env`**: Copy `.env.example` to `.env` and set `GEMINI_API_KEY=AIzaSy...YourKey`.

### Step 4: Run FRIDAY
```powershell
npm start
```
*(Starts FRIDAY in Pet-First mode with the floating desktop companion).*

To launch with the full Dashboard open immediately:
```powershell
npx electron dist-electron/main/index.js --dashboard
```

To run in development mode with live hot-reloading:
```powershell
npm run dev:electron
```

### Step 5: Create Windows Desktop & Search Shortcuts
Generate native Windows desktop and Start Menu search shortcuts anytime:
```powershell
powershell -ExecutionPolicy Bypass -File .\create-shortcuts.ps1
```
*After running, press the **Windows key**, type **`FRIDAY`**, and hit Enter to launch.*

---

## 🗣️ How to Talk with FRIDAY

1. **Hands-Free Standby ("Hey Friday")**:
   - Keep hands-free enabled in Settings.
   - Say *"Hey Friday"* or *"Friday"* to wake the assistant instantly.
   - Works seamlessly even when the dashboard window is closed!
2. **Push-to-Talk (Desktop Pet or Dashboard)**:
   - Click the **Microphone** button on the Desktop Pet or Dashboard.
   - Speak in English, Telugu, Hindi, Tamil, Kannada, or mixed Tenglish:
     - *"Friday, Chrome open chey and Java tutorials search chey"*
     - *"Spotify lo music play chey"*
     - *"Can you open Notepad and take notes?"*
     - *"నమస్కారం ఫ్రైడే! ఈ రోజు వాతావరణం ఎలా ఉంది?"*
   - Tap the mic button again (or let the adaptive VAD detect end-of-speech).
3. **Interrupting FRIDAY (Barge-In)**:
   - If FRIDAY is speaking, speaking out loud or clicking the mic/character instantly halts playback.

---

## 🧪 Automated Testing

FRIDAY includes 38 comprehensive test suites with **303 unit and integration tests** covering the Pet-First architecture, performance optimizations, audio pipeline, linear PCM to 16kHz WAV encoding, adaptive VAD, local intent execution, memory persistence, and tool safety:

```powershell
npm test
```

All 38 test suites pass cleanly:
```
 Test Files  38 passed (38)
      Tests  303 passed (303)
```

---

## 📦 Packaging for Windows

To compile and package the production Windows standalone installer / executable:
```powershell
npm run package:win
```

---

## 🛡️ License

MIT License. Built with ❤️ for advanced desktop AI assistant and voice interaction development.
