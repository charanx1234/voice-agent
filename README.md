# FRIDAY — AI Desktop Companion 🤖✨

**FRIDAY** is a friendly, intelligent, and expressive Windows desktop AI companion powered by **Google Gemini** with native multilingual Indian voice conversation capabilities and a 2D animated robot character.

FRIDAY understands and speaks **Telugu (తెలుగు)**, **Indian English**, **Hindi (हिन्दी)**, **Tamil (தமிழ்)**, and **Kannada (ಕನ್ನಡ)**, responds naturally with lip-synced mouth animations and audio waveforms, and performs real tasks on your PC with your permission.

---

## 🌟 Key Features

### 1. Expressive 2D Robot Character
- **Sleek Cyber Aesthetic**: Deep charcoal & metallic black chassis with glowing cyan accents (`#00e5ff`).
- **Reactive Eyes**: Expressive rounded eyes that spontaneously blink, widen when attentive, scan when thinking, and show gentle alert in error states.
- **Audio-Driven Lip-Sync**: The LED mouth bars dynamically oscillate and stretch in real-time according to the actual audio frequency amplitude (`AudioAnalyser` Web Audio API) during speech playback.
- **Visual State Machine**: Seamless transitions across `idle`, `listening`, `thinking`, `speaking`, `interrupted`, and `error`.
- **Instant Barge-in / Interruption**: Clicking on FRIDAY or tapping the microphone button instantly halts ongoing speech and returns FRIDAY to listening mode.

### 2. Multilingual Indian Voice Assistant
- **Supported Languages**:
  - **Telugu (తెలుగు)**: `te-IN` (Native script, natural conversational phrasing, and Telugu-English code-switching)
  - **English (India)**: `en-IN` (Friendly, clear Indian English conversational responses)
  - **Hindi (हिन्दी)**: `hi-IN` (Devanagari script and natural conversational Hindi)
  - **Tamil (தமிழ்)**: `ta-IN` (Tamil script and polite responses)
  - **Kannada (ಕನ್ನಡ)**: `kn-IN` (Kannada script and conversational phrases)
  - **English (US)**: `en-US`
- **Voice Pipeline**:
  - **Input**: Microphone audio capture with real-time waveform visualization, sending audio to Gemini Multimodal Audio understanding.
  - **Output**: Neural text-to-speech with a **female voice** — Microsoft Edge neural voices (free, no key) such as `en-IN-NeerjaExpressiveNeural`, `te-IN-ShrutiNeural`, `hi-IN-SwaraNeural`, `ta-IN-PallaviNeural`, `kn-IN-SapnaNeural` and `en-US-AriaNeural`.
  - **Fallback chain**: Edge neural → Gemini TTS (`gemini-2.5-flash-preview-tts`, warm female `Kore`) → installed system voice, preferring female voices so it never drops to a male default.
  - **Natural delivery**: speech is split into sentence chunks, synthesized in a pipeline (the next chunk is generated while the current one plays), with adjustable speed, **pitch (−3…+3 semitones)** and volume. Markdown, code fences and URLs are cleaned before speaking.
  - **Real lip-sync**: the robot's mouth is driven by the analysed audio waveform, not a simulated animation.
  - **Barge-in**: talking over FRIDAY (or tapping the mic/robot) cancels synthesis mid-sentence and starts listening immediately.

### 3. Controlled Agent Capabilities (Useful Work)
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
  - Strict allowlist of safe desktop applications: **Notepad**, **Calculator**, **Paint**, **File Explorer**, and **Command Prompt**.
  - Asks for explicit user permission via an interactive modal before launching. Never executes arbitrary shell strings.

### 4. Long-Term Memory (SQLite + Semantic Search)
FRIDAY remembers what matters between sessions, not every word you say:
- **Curated memories, not a transcript dump**: after each exchange, Gemini extracts at most three durable details — your name, city, job, preferences, standing instructions, and ongoing projects. Small talk, one-off questions, and secrets (passwords, OTPs, card numbers) are explicitly excluded.
- **Local SQLite database**: memories live in `friday_memory.db` in your AppData directory, with an atomic write path and automatic recovery if the file is ever damaged. No cloud sync, no external service.
- **Semantic retrieval**: every memory is embedded with `gemini-embedding-001`; each new question is embedded too and matched by cosine similarity combined with keyword overlap, recency, and importance. Only the most relevant memories (plus your core instructions) are injected into the prompt — never the whole database.
- **Survives restarts**: the conversation itself is persisted in the same database, capped at 200 messages and 30 days, so FRIDAY picks up mid-conversation after a restart while long-term memory stays permanent.
- **You stay in control**: open the brain icon to view, search, add, edit, or delete any memory, and switch automatic remembering off entirely.
- **Graceful degradation**: if the embedding API is unreachable, a local hashed embedding keeps search working offline; if extraction fails, an offline rule-based extractor still catches explicit "remember that…" requests.

### 5. Light & Dark Themes
- **Light**: cream background (`#F8F4E7`) with burgundy (`#722F37`) accents.
- **Dark**: pure black (`#000000`) with white text and accents — strictly monochrome, no colour at all, including status states.
- **Auto by default**: follows the Windows light/dark setting live. Manual override lives in Settings → Appearance (`Auto` / `Light` / `Dark`).
- Existing installs that had a fixed dark theme are migrated to `Dark` so nothing changes unexpectedly.

### 6. Voice Reminders & Live Dashboard
- **Reminders from natural speech**: *"remind me to call mom at 6"*, *"in 20 minutes"*, *"tomorrow at 9"* — created immediately in the same turn and confirmed out loud. No separate reminders screen or form.
- Reminders persist in SQLite and fire as a Windows toast (plus a spoken announcement) even across restarts; overdue ones are delivered when the app next opens.
- **Dashboard beside the voice chat**: when a request produces something visual — code, a document, plan, list or table — the window widens and a dashboard pane appears with the full content. Voice never pauses: you can keep talking, ask for changes, and watch the pane update live.
- The dashboard also lists active reminders, with a one-click "done" action.

### 7. Privacy & Security
- **Strict IPC Isolation**: Electron runs with `contextIsolation: true` and `nodeIntegration: false`. The renderer only interacts through a restricted, strongly typed bridge (`window.fridayAPI`).
- **Zero API Key Leakage**: Keys are never hardcoded or tracked in Git. The API key is stored safely in your local Windows AppData directory or loaded from `.env` in development, and is always masked (`AIza...9xQ`) in UI and logs.
- **User Confirmation Required**: Sensitive actions (opening apps, searching folders) prompt you for approval with an Allow/Deny modal.
- **Locked-Down Window Surface**: A strict Content-Security-Policy, blocked `<webview>` embedding, blocked in-app navigation, and a microphone-only permission handler keep the renderer from reaching anything it should not.
- **Scoped File Search**: Project search never follows symlinks or junctions, so an approved folder cannot be used as a bridge to files outside it.
- **Resilient Model Routing**: If a configured Gemini model is retired or returns not-found, FRIDAY falls back through known-good models — and never re-runs a tool call while switching models.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Desktop Application** | Electron 34 |
| **Frontend UI** | React 19 + TypeScript + Vite |
| **Icons & Design** | Lucide React + Custom CSS Animations + SVG |
| **AI Brain** | Google Gemini API (`gemini-2.5-flash` / `gemini-1.5-flash`) |
| **Long-Term Memory** | SQLite via `sql.js` (WASM, no native rebuild) + Gemini embeddings (`gemini-embedding-001`) |
| **Audio & Voice** | Web Audio API (`AudioContext`, `AnalyserNode`), SpeechSynthesis, MediaRecorder |
| **Local Storage** | JSON Store in Electron `app.getPath('userData')`, SQLite memory database |
| **Packaging** | Electron Builder (Windows Portable & Installer) |

---

## 📋 System Requirements

- **Operating System**: Windows 10 or Windows 11 (64-bit)
- **Node.js**: Version 18, 20, 22, or 24+ installed ([Download Node.js](https://nodejs.org/))
- **Microphone**: Any built-in or USB microphone
- **Google Gemini API Key**: Free key from Google AI Studio

---

## 🚀 Getting Started (Beginner Guide)

### Step 1: Clone or Navigate to the Project
Open PowerShell or Command Prompt:
```powershell
cd C:\25r11a6760
```

### Step 2: Install Dependencies
Run:
```powershell
npm install
```

### Step 3: Configure Your Google Gemini API Key
You can configure your key in either of two easy ways:

#### Option A: Through the FRIDAY Settings UI (Easiest)
1. Start FRIDAY (see Step 4).
2. Click the gear icon (**Settings**) or the orange warning banner at the top.
3. Paste your Gemini API key and click **Save Changes**. You can also click **Test Connection** to immediately verify it!

#### Option B: Using `.env` File
1. Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Open `.env` in Notepad and replace `your_gemini_api_key_here` with your real key:
   ```env
   GEMINI_API_KEY=AIzaSy...YourActualKeyHere
   ```

> 💡 **Where do I get a free Gemini API key?**
> Visit [Google AI Studio](https://aistudio.google.com/app/apikey), sign in with your Google account, and click **Create API Key**. It takes less than 1 minute and includes a free tier!

---

## 🏃 Running FRIDAY

### Run the Application:
To build and launch FRIDAY on your desktop:
```powershell
npm start
```
*FRIDAY will open as a sleek, frameless desktop companion on your screen!*

### Running in Hot-Reload Development Mode:
If you are modifying the React frontend:
```powershell
npm run dev
```

---

## 🗣️ How to Talk with FRIDAY

1. **Voice Conversation**:
   - Click the large central **Microphone** button.
   - The microphone pulses cyan and the status changes to `Listening...`.
   - Speak in your preferred language:
     - **Telugu**: *"నమస్కారం ఫ్రైడే! ఎలా ఉన్నావు?"* or *"ఒక నోట్ సేవ్ చెయ్యి"*
     - **English**: *"Hello FRIDAY, can you help me research quantum computing?"*
     - **Hindi**: *"नमस्ते फ्राइडे! आज का मौसम कैसा है?"*
     - **Tamil**: *"வணக்கம் FRIDAY! எனக்கு உதவி செய்வாயா?"*
     - **Kannada**: *"ನಮಸ್ಕಾರ FRIDAY! ಹೇಗಿದ್ದೀರಾ?"*
   - Click the microphone button again when you finish speaking.
   - FRIDAY enters `Thinking...` mode, processes your query with Gemini, and speaks the answer aloud while animating its robot mouth and audio visualizer!

2. **Typed Chat**:
   - Type any question or command into the bottom text input and press **Enter** or click the send button.

3. **Interrupting FRIDAY (Barge-In)**:
   - If FRIDAY is speaking and you want it to stop, simply tap the robot character or click the microphone button. FRIDAY immediately stops speaking!

4. **Conversation Transcript**:
   - Click the **Chat Bubble** icon in the control bar to slide open the live conversation transcript, view past responses, or clear history.

### 5. If the Microphone Is Not Working
- **Watch the timer**: while recording, the status badge counts up (`Listening… 0:07`). If it counts, audio is being captured.
- **FRIDAY tells you what went wrong.** Permission denials, a missing device, or a microphone held by another app (Zoom, Teams) now produce a specific message in the transcript instead of a silent failure.
- **Silent recordings are caught.** If the mic is muted or muted at the Windows level, FRIDAY says it could not hear anything rather than sending an empty clip.
- **Check Windows permissions**: Settings → Privacy & security → Microphone → enable *"Let desktop apps access your microphone"* and make sure FRIDAY is allowed.
- **Check the input device**: Windows Settings → System → Sound → Input, and confirm the right microphone is selected and its level moves when you speak.
- Recording stops automatically after a double tap guard, and a watchdog prevents the UI hanging on `Thinking...` if the recorder fails to close.

---

## 🧰 Using Agent Tools

### 1. Saving & Managing Notes
- **Voice**: *"FRIDAY, please save a note with title Shopping and content buy milk and vegetables."*
- **Action**: FRIDAY creates the note in your application notes directory.
- **Viewing Notes**: Click **Tools** in the control bar, switch to the **Notes** tab to view, search, or create notes manually.

### 2. Searching Project Folders
- Open **Settings** -> **Approved Project Folders** -> Click **Add Folder** to select your project directory.
- Ask FRIDAY: *"Search my project folder for App.tsx"* or *"Find where handleSendMessage is defined"*.
- FRIDAY will search only inside that approved folder and show matching files and snippets in the transcript!

### 3. Launching Applications
- Ask FRIDAY: *"Open Calculator"* or *"Launch Notepad"*.
- An interactive confirmation prompt will appear asking: *"FRIDAY wants to open Calculator on your computer. Allow or Deny?"*
- Click **Allow** to launch the tool safely.

### 4. Using Long-Term Memory
- Just talk normally. Tell FRIDAY *"I'm Ram, I prefer Telugu replies, and I'm building a desktop AI companion"* — it extracts and stores the durable parts automatically.
- Explicitly ask: *"Remember that my office is on the third floor"* — this works even offline.
- Ask later: *"What am I building?"* or *"Which language should you reply in?"* — the relevant memories are retrieved semantically and used in the answer.
- Click the **brain icon** in the control bar to open the memory panel:
  - **Search** runs a semantic query over stored memories.
  - **Add** stores a memory manually (kind, title, content, importance).
  - **Pencil** edits a memory, **trash** deletes it after confirmation.
  - The toggle switches automatic remembering off while keeping the existing memories.

### 5. Using Reminders and the Dashboard
- Say or type: *"remind me to call mom at 6"* — FRIDAY creates it immediately and confirms aloud; no other screen involved.
- *"What are my reminders?"* lists them; *"mark the call mom reminder as done"* completes one.
- Ask for code or a document: *"write a Python retry helper and show it on the dashboard"* — the dashboard pane opens beside the chat with the full code, and FRIDAY gives a short spoken summary.
- Keep talking while the pane is open: *"add exponential backoff and show it again"* updates the pane in place.
- The window returns to its compact size when you close the dashboard with the ✕.

---

## 🧪 Running the Automated Tests

To run the unit tests for language detection, agent tools, and security boundaries:
```powershell
npm test
```
All tests should pass:
```
 ✓ tests/languages.test.ts (6 tests)
 ✓ tests/security.test.ts (3 tests)
 ✓ tests/agent-tools.test.ts (2 tests)
 ✓ tests/hardening.test.ts (13 tests)
 ✓ tests/memory.test.ts (22 tests)
 ✓ tests/voice.test.ts (9 tests)
 ✓ tests/tts.test.ts (14 tests)
 ✓ tests/logger.test.ts (5 tests)
 ✓ tests/greetings.test.ts (6 tests)
 ✓ tests/reminders.test.ts (10 tests)
 Test Files  10 passed (10)
      Tests  90 passed (90)
```

---

## 📦 Creating the Windows Executable

To produce a production package for Windows:
```powershell
npm run package:win
```

Outputs in `dist-package/`:

| Artefact | Use |
|---|---|
| `FRIDAY Setup 1.0.0.exe` | Per-user installer (no admin). Creates Desktop and Start-menu shortcuts. |
| `win-unpacked\FRIDAY.exe` | Portable build — run directly, no install. |

Both are **GUI-subsystem** executables: launching them from Explorer or a shortcut never opens a console window.

---

## 🪵 Logs & Diagnostics

- Logs are written to `%APPDATA%\friday-ai-companion\logs\friday-YYYY-MM-DD.log` (never printed to a terminal in the installed app).
- Each line carries a timestamp, level (`INFO` / `WARN` / `ERROR`) and source scope.
- Files rotate at 2 MB and the newest 7 are kept.
- **Settings → Diagnostics → Open Logs Folder** opens the folder.
- Only one FRIDAY instance can run at a time: launching it again focuses the existing window instead of starting a second memory/reminder backend.
- On quit, memory and reminders are flushed and their background timers cancelled.

---

## 🌐 Official API Pricing & Documentation

- **Google Gemini API Documentation**: [https://ai.google.dev/docs](https://ai.google.dev/docs)
- **Google Gemini API Pricing**: [https://ai.google.dev/pricing](https://ai.google.dev/pricing)
  - Google Gemini 2.5 Flash and 1.5 Flash offer a generous free tier for personal development.
- **Web Speech API**: Built directly into Windows Chromium at zero cost with offline capabilities.

---

## 🛡️ License

MIT License. Built with ❤️ for desktop AI companion development.


