# FRIDAY — Personal AI Assistant 🤖

**FRIDAY** is an intelligent personal AI desktop companion for Windows, powered by **Google Gemini** with a **Pet-First Architecture**, native multilingual Indian voice conversation capabilities, advanced microphone voice isolation for noisy environments, and an interactive 2D animated desktop character.

In FRIDAY, **the Desktop Pet IS FRIDAY** — the primary, everyday face and interaction point. The dashboard runs seamlessly in the background hosting the audio pipeline, wake-word detection, and agent tools, while you interact directly with the floating desktop companion.

---

## 🌟 Key Features

### 1. Pet-First Architecture 🐾
- **The Pet is the Main Interface**:
  - The floating Desktop Pet is your primary companion. Clicking the pet expands its sleek translucent glass companion card without cluttering your screen.
  - Full feature access: Voice conversations, text typing input bar, real-time live transcription, streaming AI responses with one-click copy, and notifications.
  - **Dynamic Smart Resizing**: The pet floats compactly (200×220) and smoothly expands to an interactive companion interface (380×580) on click or when "Hey Friday" wakes it.
  - **Personality Mode Switcher**: Switch immediately between **Simple** (succinct), **Moderate** (helpful), and **Roast** (witty banter) modes right from the pet header.
  - **Quick Capability Tools**: One-click access to Screen Understanding (capture & analyze), Web Reader, Quick Notes, Reminders, and Audio Mute.
  - **Optional Dashboard**: Closing the dashboard window merely hides it in the background; FRIDAY, the pet, wake-word detection, and memory services continue uninterrupted.
  - **Single Unified Architecture**: One AI brain, one memory database, one conversation history, and one shared capability registry. The pet never runs a simplified chatbot; it shares 100% of FRIDAY's tools and backend intelligence.

### 2. Robust Universal Audio Pipeline & Voice Isolation 🎙️
FRIDAY includes a production-grade, lossless linear PCM audio pipeline with hardware-level voice isolation:
- **Direct Linear PCM -> 16kHz Mono WAV Engine**:
  - Raw audio is captured directly as uncompressed 32-bit float PCM buffers via Web Audio API, downsampled via linear interpolation, and encoded with a standard 44-byte RIFF WAVE header.
  - Slicing and pre-roll buffers (350ms of audio) operate directly on raw sample arrays without container corruption or missing codec headers.
  - Compatible universally with Gemini Multimodal Audio, Whisper, and Web Audio without relying on container re-muxing.
- **Dedicated Audio Processing Graph**:
  - **High-Pass Filter** (85 Hz – 110 Hz): Eliminates low-frequency desk thumps, air conditioner hum, and fan drone.
  - **Low-Pass Filter** (3400 Hz – 3800 Hz): Suppresses high-frequency hiss, keyboard chatter, and mouse clicks.
  - **Peaking Vocal Presence Filter** (1.6 kHz, +3.5 dB boost): Enhances human voice formant intelligibility.
  - **Dynamics Compressor & AGC Limiter** (6:1 to 10:1 compression, 3ms attack): Normalizes quiet whispers and prevents digital clipping on loud speech.
  - **Software Ducking & Acoustic Echo Cancellation (AEC)**: Attenuates incoming microphone audio while FRIDAY is speaking so FRIDAY never triggers itself through speakers, while still allowing natural user barge-in interruptions.
- **9-State Lifecycle State Machine**:
  - Formal, verified transitions: `IDLE` → `LISTENING` → `SPEECH_DETECTED` → `PROCESSING_AUDIO` → `TRANSCRIBING` → `TRANSCRIPT_RECEIVED` → `THINKING` → `SPEAKING` → `ERROR`.
  - Every transition corresponds to a verified pipeline operation; no fake indicators or unhandled hanging states.
- **Adaptive Listening Modes**:
  - **Quiet Room**: Balanced speech enhancement with normal sensitivity and lowest processing overhead.
  - **Noisy Environment**: Stronger noise suppression, adaptive noise gate (1.6× ambient floor), and higher compressor ratio for rooms with fans, background TV, or multiple voices.
  - **Very Noisy Environment**: Maximum available suppression and conservative command validation. FRIDAY requests repetition when speech is genuinely drowned by noise rather than guessing.
- **Dynamic Adaptive Voice Activity Detection (VAD)**:
  - Continuously tracks the ambient noise floor using real-time exponential smoothing.
  - Dynamically raises start and end thresholds when room noise increases, eliminating premature cut-offs and lost first words.
  - Extended silence hysteresis accommodates natural pauses during bilingual code-switching.
- **Multilingual Telugu-English-Hinglish Recognition**:
  - Preserves natural code-switching: *"Friday, Chrome open chey and Java tutorials search chey"*, *"Spotify lo music play chey"*, *"Naaku tomorrow college ki vellali"*, *"Ee error enti, can you explain?"*.
  - Strictly preserves English technical vocabulary, app names, website domains, and programming terms without forced translation.
  - Retains Telugu colloquial verbs and case markers (`chey`, `chudu`, `pettandi`, `vellali`, `raayi`, `teeyi`, `entha`, `cheppu`, `lo`, `ki`, `naaku`, `enti`) and Hindi verbs (`karo`, `kholo`, `chalao`, `band karo`).
- **Real-Time Development Diagnostic Panel**:
  - Click the **Activity pulse icon** in the bottom Control Bar to open the real-time diagnostics overlay.
  - Displays selected microphone hardware, track status (`live`/`muted`), live input audio level meter with clipping warnings, ambient noise floor, buffer size (KB), STT model & latency, exact recognized transcript, Gemini AI status, and error logs.
- **Confidence & Uncertainty Handling**:
  - Never invents words or hallucinates desktop actions to compensate for audio noise.
  - Silence and ambient noise return cleanly to standby without fake transcripts.
  - Cut-off speech (e.g. *"Friday, open..."*) is recognized as incomplete, and FRIDAY asks *"Which application would you like me to open?"* instead of guessing an application.

### 3. Expressive 2D Robot Character & Desktop Pet
- **Sleek Cyber Aesthetic**: Deep charcoal & metallic black chassis with glowing cyan accents (`#00e5ff`).
- **Reactive Eyes**: Expressive rounded eyes that spontaneously blink, widen when attentive, scan when thinking, and show gentle alert in error states.
- **Audio-Driven Lip-Sync**: The LED mouth bars dynamically oscillate and stretch in real-time according to the actual audio frequency amplitude (`AudioAnalyser` Web Audio API) during speech playback.
- **Visual State Machine**: Seamless transitions across `idle`, `listening`, `thinking`, `speaking`, `interrupted`, and `error`.
- **Instant Barge-in / Interruption**: Clicking on FRIDAY or tapping the microphone button instantly halts ongoing speech and returns FRIDAY to listening mode.
- **Floating Desktop Pet**: Can detach into a lightweight transparent desktop companion synchronized with the dashboard voice coordinator.

### 3. Multilingual Indian Voice Assistant
- **Supported Languages**:
  - **Telugu (తెలుగు)**: `te-IN` (Native script, natural conversational phrasing, and Telugu-English code-switching)
  - **English (India)**: `en-IN` (Friendly, clear Indian English conversational responses)
  - **Hindi (हिन्दी)**: `hi-IN` (Devanagari script and natural conversational Hindi)
  - **Tamil (தமிழ்)**: `ta-IN` (Tamil script and polite responses)
  - **Kannada (ಕನ್ನಡ)**: `kn-IN` (Kannada script and conversational phrases)
  - **English (US)**: `en-US`
- **Voice Pipeline**:
  - **Input**: Microphone audio capture with real-time waveform visualization, sending audio to Gemini Multimodal Audio understanding.
  - **Output**: Neural text-to-speech across **three English accents** — American (17 voices), British (5) and Indian (3) — each with female and male options, plus native voices for Telugu, Hindi, Tamil and Kannada.
  - **Accent & voice selection**: Settings → Voice lets you pick the accent, choose a specific female or male neural voice, audition it with **Play Sample**, and adjust speed, pitch and volume. The choice is saved locally and restored on the next launch.
  - **Fallback chain**: Edge neural → Gemini TTS (`gemini-2.5-flash-preview-tts`, warm female `Kore`) → installed system voice, preferring female voices so it never drops to a male default.
  - **Natural delivery**: Speech is split into sentence chunks and synthesized in an asynchronous pipeline with adjustable speed, **pitch (−3…+3 semitones)** and volume.

### 4. Controlled Agent Capabilities (Useful Work)
FRIDAY distinguishes between answering questions and executing actions, and never pretends a task was finished without verifying it:
- **Tool A — Notes**:
  - Create notes via voice or text (e.g., *"Save a note called Grocery with milk and eggs"*).
  - List existing notes, search notes by keyword, or ask FRIDAY to read a note aloud.
  - Notes are saved in both indexed JSON and plain `.txt` files in your user AppData directory so you can edit them directly in Notepad!
- **Tool B — Project-Folder Search**:
  - Search files and text contents exclusively within **user-approved folders** (added via native Windows folder picker).
  - Never scans unauthorized system files or entire hard drives.
- **Tool C — Web Research**:
  - Searches live web data and references, providing clickable source links and separating sourced facts from general model explanations.
- **Tool D — Application Shortcuts**:
  - Fast local intent routing for safe desktop applications: **Chrome**, **Spotify**, **Notepad**, **Calculator**, **Paint**, **File Explorer**, and **Command Prompt**.
  - Understands natural commands in English and Telugu (*"Chrome open chey"*, *"Spotify lo music play chey"*, *"sound penchu"*, *"sound thagginchu"*, *"mute chey"*).

### 5. Long-Term Memory (SQLite + Semantic Search)
FRIDAY remembers what matters between sessions, not every word you say:
- **Curated memories, not a transcript dump**: After each exchange, Gemini extracts at most three durable details — your name, city, job, preferences, standing instructions, and ongoing projects. Small talk, one-off questions, and secrets (passwords, OTPs, card numbers) are explicitly excluded.
- **Local SQLite database**: Memories live in `friday_memory.db` in your AppData directory, with an atomic write path and automatic recovery if the file is ever damaged.
- **Semantic retrieval**: Every memory is embedded with `gemini-embedding-001`; each new question is matched by cosine similarity combined with keyword overlap, recency, and importance.
- **Survives restarts**: The conversation itself is persisted in the same database, capped at 200 messages and 30 days.

### 6. Light & Dark Themes
- **Light**: Cream background (`#F8F4E7`) with burgundy (`#722F37`) accents.
- **Dark**: Pure black (`#000000`) with white text and accents — strictly monochrome, no color at all.
- **Auto by default**: Follows the Windows light/dark setting live. Manual override lives in Settings → Appearance.

### 7. Voice Reminders & Live Dashboard
- **Natural speech reminders**: *"remind me to call mom at 6"*, *"in 20 minutes"*, *"tomorrow at 9"* — created immediately in the same turn and confirmed out loud.
- Reminders persist in SQLite and fire as a Windows toast (plus a spoken announcement) even across restarts.
- **Dashboard beside the voice chat**: When a request produces something visual — code, a document, plan, list or table — the window widens and a dashboard pane appears with the full content.

### 8. Privacy & Security
- **Strict IPC Isolation**: Electron runs with `contextIsolation: true` and `nodeIntegration: false`. The renderer only interacts through a restricted, strongly typed bridge (`window.fridayAPI`).
- **Zero API Key Leakage**: Keys are never hardcoded or tracked in Git. The API key is stored safely in your local Windows AppData directory or loaded from `.env` in development, and is always masked (`AIza...9xQ`) in UI and logs.
- **User Confirmation Required**: Sensitive actions prompt you for approval with an Allow/Deny modal.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Desktop Application** | Electron 34 |
| **Frontend UI** | React 19 + TypeScript + Vite |
| **Icons & Design** | Lucide React + Custom CSS Animations + SVG |
| **AI Brain** | Google Gemini API (`gemini-3.1-flash-lite` / `gemini-2.5-flash`) |
| **Audio Processing** | Web Audio API (`AudioContext`, `BiquadFilterNode`, `DynamicsCompressorNode`, `AnalyserNode`), WebRTC AEC/AGC/NoiseSuppression |
| **Long-Term Memory** | SQLite via `sql.js` (WASM) + Gemini embeddings (`gemini-embedding-001`) |
| **Local Storage** | JSON Store in Electron `app.getPath('userData')`, SQLite memory database |
| **Packaging** | Electron Builder + Native C# Launcher |

---

## 📋 System Requirements

- **Operating System**: Windows 10 or Windows 11 (64-bit)
- **Node.js**: Version 18, 20, 22, or 24+ installed ([Download Node.js](https://nodejs.org/))
- **Microphone**: Any built-in, headset, or USB microphone
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

### Step 3: Configure Your Google Gemini API Key
You can configure your key in either of two easy ways:
- **Through the UI**: Start FRIDAY, open Settings, paste your API key, and click **Save Changes**.
- **Using `.env`**: Copy `.env.example` to `.env` and set `GEMINI_API_KEY=AIzaSy...YourKey`.

### Step 4: Run FRIDAY
```powershell
npm start
```

### Step 5: Create a Desktop Shortcut
A native Windows desktop shortcut can be generated anytime:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\create_shortcut.ps1
```
This places a `FRIDAY.lnk` shortcut with the custom FRIDAY icon directly onto your desktop.

---

## 🗣️ How to Talk with FRIDAY

1. **Hands-Free Standby ("Hey Friday")**:
   - Keep hands-free enabled in Settings.
   - Say *"Hey Friday"* or *"Friday"* to wake the assistant instantly.
   - Standby remains 100% silent — zero random wake-ups or unwanted audio prompts.
2. **Push-to-Talk**:
   - Click the central **Microphone** button.
   - Speak in English, Telugu, Hindi, Tamil, Kannada, or mixed Tenglish:
     - *"Friday, Chrome open chey and Java tutorials search chey"*
     - *"Spotify lo music play chey"*
     - *"Can you open Notepad and take notes?"*
     - *"నమస్కారం ఫ్రైడే! ఈ రోజు వాతావరణం ఎలా ఉంది?"*
   - Tap the button again (or let the adaptive VAD detect natural end-of-speech).
3. **Interrupting FRIDAY (Barge-In)**:
   - If FRIDAY is speaking and you speak or click the mic/character, FRIDAY stops speaking immediately.

---

## 🧪 Automated Testing

FRIDAY includes 37 test suites with 278 unit and integration tests covering the Pet-First architecture, capability registry, audio filtering, linear PCM to 16kHz WAV encoding, adaptive VAD, local intent execution, memory persistence, speaker verification, and tool safety:

```powershell
cd C:\25r11a6760\FRIDAY; npm test
```

All 37 test suites pass cleanly:
```
 Test Files  37 passed (37)
      Tests  278 passed (278)
```

---

## 📦 Building the Windows Package

To compile and package the production Windows executable:
```powershell
npm run package:win
```

---

## 🛡️ License

MIT License. Built with ❤️ for advanced desktop AI assistant and voice interaction development.
