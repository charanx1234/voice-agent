# FRIDAY 2.0 — Adaptive Conversational Desktop Companion & Intelligent Memory System 🤖🧠⚡

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(64--bit)-0078D6.svg?style=flat-square&logo=windows)](https://microsoft.com)
[![Framework](https://img.shields.io/badge/Architecture-Electron%2034%20%2B%20React%2019-61DAFB.svg?style=flat-square&logo=react)](https://electronjs.org)
[![Intelligent Memory](https://img.shields.io/badge/Memory%20Architecture-FIMA%20V1%20(Context--Aware)-10B981.svg?style=flat-square)](src/services/memory)
[![Adaptive Intelligence](https://img.shields.io/badge/Intelligence-ACI%20V1%20(Adaptive%20Conversational)-8A2BE2.svg?style=flat-square)](src/services/ai/aci)
[![Hardware Engine](https://img.shields.io/badge/Hardware%20Engine-Intel%20AI%20Boost%20NPU%20%7C%20OpenVINO-0071C5.svg?style=flat-square&logo=intel)](https://www.intel.com)
[![Cloud AI Engine](https://img.shields.io/badge/AI%20Providers-Gemini%202.5%2F3.1%20%7C%20Claude%203.5%20%7C%20OpenAI-4285F4.svg?style=flat-square)](src/services/ai/providers)
[![STT Engine](https://img.shields.io/badge/STT-Groq%20Whisper%20Turbo%20%7C%20VoiceFlow-F55036.svg?style=flat-square)](https://groq.com)
[![Neural TTS](https://img.shields.io/badge/TTS-Sonex%20Cloned%20%7C%20Murf%20%7C%20ElevenLabs%20%7C%20Edge-00C7B7.svg?style=flat-square)](https://sonexlabs.com)
[![Tests](https://img.shields.io/badge/Tests-62%20Suites%20%7C%20543%20Passed%20(100%25)-success.svg?style=flat-square)](tests)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

**FRIDAY 2.0** is an enterprise-grade, context-aware, personal AI desktop companion engineered for Windows 10/11. Built with **Adaptive Conversational Intelligence (ACI V1)** and the **FRIDAY Intelligent Memory Architecture (FIMA V1)**, FRIDAY understands what information is worth remembering, what should remain temporary, when memories contradict or supersede previous facts, and how to maintain continuity across complex engineering projects.

Floating transparently on your desktop with an interactive **Pet-First Architecture**, FRIDAY seamlessly couples sub-second local automation with cloud cognitive reasoning, real-time speech interruption (barge-in), DSP spectral noise gating, acoustic echo cancellation, universal Win32 desktop typing injection (**TypeFlow**), unthrottled speech streaming (**VoiceFlow**), and hardware-accelerated local neural inference using **Intel OpenVINO** on modern **Intel AI Boost NPUs**, **Intel Arc GPUs**, and CPUs.

---

## 🏛️ Master System Architecture

```
                                      ┌────────────────────────┐
                                      │   PHYSICAL MICROPHONE  │
                                      └───────────┬────────────┘
                                                  │ 16kHz PCM Audio Stream
                                                  ▼
                            ┌──────────────────────────────────────────────┐
                            │       CENTRAL AUDIO CAPTURE HOST             │
                            │   • Single microphone owner (Zero races)     │
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
                       [<20ms Fast Intent] │              │ [Conversational & Multi-Turn Tasks]
                                           ▼              ▼
                        ┌──────────────────────┐   ┌────────────────────────────────────────────┐
                        │ FAST LOCAL ROUTER    │   │   ADAPTIVE CONVERSATIONAL INTELLIGENCE     │
                        │ • CoreAudio Volume   │   │   (ACI V1 Master Controller)               │
                        │ • WMI Display Light  │   │   • Multi-Turn Context Understanding       │
                        │ • User32 Window Snap │   │   • Multi-Label Emotional Signal Analyzer  │
                        │ • 150+ App Launcher  │   │   • 4-Tier Adaptive Personality Engine     │
                        │ • Media & Weather    │   │   • 5-Tier Response Depth Engine (D0-D4)   │
                        └──────────┬───────────┘   │   • Conversational Strategy Engine         │
                                   │               │   • Tone Controller & Delivery Synthesizer │
                                   │               │   • User Feedback Learner & Quality Guard  │
                                   │               └─────────────────────┬──────────────────────┘
                                   │                                     │
                                   │                                     ▼
                                   │                       ┌────────────────────────────┐
                                   │                       │     COGNITIVE ENGINE       │
                                   │                       │ • Complexity Router (L0-L3)│
                                   │                       │ • 3-Layer Context Engine   │
                                   │                       │ • Multi-Provider Dispatch  │
                                   │                       └─────────────┬──────────────┘
                                   │                                     │
                                   │                                     ▼
                                   │                       ┌────────────────────────────┐
                                   │                       │    FIMA V1 MEMORY SYSTEM   │
                                   │                       │ • Memory Intelligence Gate │
                                   │                       │ • Project Memory Profiles  │
                                   │                       │ • Conflict Resolution      │
                                   │                       │ • Context Builder (Budget) │
                                   │                       │ • Embedded SQLite WASM     │
                                   │                       └─────────────┬──────────────┘
                                   │                                     │
                                   │                                     ▼
                                   │                       ┌────────────────────────────┐
                                   │                       │     MODEL EXECUTION        │
                                   │                       │ • Google Gemini 2.5 / 3.1  │
                                   │                       │ • Anthropic Claude 3.5     │
                                   │                       │ • OpenAI / OpenRouter      │
                                   │                       └─────────────┬──────────────┘
                                   │                                     │
                                   │                                     ▼
                                   │                       ┌────────────────────────────┐
                                   │                       │ HARDWARE ACCELERATION      │
                                   │                       │ Intel OpenVINO 2026.4.1    │
                                   │                       │ • Intel AI Boost NPU       │
                                   │                       │ • Intel Arc GPU            │
                                   │                       │ • Resilient CPU Fallback   │
                                   │                       └─────────────┬──────────────┘
                                   │                                     │
                                   │                                     ▼
                                   │                       ┌────────────────────────────┐
                                   │                       │ NEURAL TTS CASCADE         │
                                   │                       │ 1. Sonex Cloned Voice      │
                                   │                       │ 2. Murf AI Studio          │
                                   │                       │ 3. ElevenLabs Multi-Voice  │
                                   │                       │ 4. Edge Neural Engine      │
                                   └───────────────────────┴─────────────┬──────────────┘
                                                                         │
                                                                         ▼
                                                           ┌────────────────────────────┐
                                                           │ REAL-TIME PET COMPANION    │
                                                           │ • Lip-Sync Amplitude Mouth │
                                                           │ • 14 Parametric Face Emotes│
                                                           │ • Sub-Pixel Drag & Snap    │
                                                           └────────────────────────────┘
```

---

## 🧠 FIMA V1: FRIDAY Intelligent Memory Architecture

FRIDAY 2.0 incorporates **FIMA V1**, a memory architecture inspired by human cognition. The objective is **not** to record every raw transcript line, but to remember the **right** information, maintain project continuity across conversations, detect contradictions, and retrieve context under strict token budgets.

```
                              ┌───────────────────────────────────┐
                              │     User / Assistant Exchange     │
                              └─────────────────┬─────────────────┘
                                                │
                                                ▼
                              ┌───────────────────────────────────┐
                              │     MEMORY INTELLIGENCE GATE      │
                              │         (memoryGate.ts)           │
                              └───────┬───────┬───────┬───────────┘
                                      │       │       │
              ┌───────────────────────┘       │       └────────────────────────┐
              ▼                               ▼                                ▼
       ┌──────────────┐              ┌────────────────┐              ┌──────────────────┐
       │    IGNORE    │              │   TEMPORARY    │              │       SAVE       │
       │  • Greetings │              │ • In-progress  │              │ • Preferences    │
       │  • Numbers   │              │ • Debug steps  │              │ • Instructions   │
       │  • Punct     │              │ • 24h Expiry   │              │ • Project facts  │
       │  • Fast-path │              │ (Working Mem)  │              │ (Long-Term Mem)  │
       └──────┬───────┘              └────────┬───────┘              └────────┬─────────┘
              │                               │                               │
              ▼                               ▼                               ▼
       ┌──────────────┐              ┌────────────────┐              ┌──────────────────┐
       │ Activity Log │              │ Status = Temp  │              │ Conflict Checker │
       │  (Ignored)   │              │ In memories.db │              │(memoryConflict)  │
       └──────────────┘              └────────────────┘              └────────┬─────────┘
                                                                              │
                                      ┌───────────────────────────────────────┴──────────────────┐
                                      ▼                                                          ▼
                               ┌──────────────┐                                           ┌──────────────┐
                               │  OVERWRITE   │                                           │PENDING_REVIEW│
                               │ Explicit fix │                                           │Unverified or │
                               │ Marks older  │                                           │  Contested   │
                               │  superseded  │                                           │  Intentions  │
                               └──────────────┘                                           └──────────────┘
```

### 1. The Four Confirmed Architectural Decisions
1. **Automatic Intelligent Saving:** Useful, durable personal information, communication preferences, and architecture facts are automatically recognized and persisted without nagging the user for manual confirmation on every statement.
2. **Automatic Lifecycle & Conflict Resolution:** Outdated memories are superseded when newer verified information arrives. Explicit corrections (`"actually, that changed"`) supersede older records immediately while preserving history in `memory_history`. Planned changes (`"I plan to migrate"`) are never conflated with completed implementations.
3. **Dedicated Project Memory:** Full project-specific knowledge bases track architecture, design decisions, tech stacks, implementation progress, verified milestones, and failed attempts across independent projects.
4. **Complete Memory Center Dashboard:** A complete interface provides semantic search, multi-axis filtering, project management, audit history, transparent activity logs, and one-click data purge and export.

### 2. Five Cognitive Memory Categories
- **Working Memory:** Active conversation state, in-flight tasks, and temporary troubleshooting steps (configured with 24h automatic expiration).
- **Long-Term Memory:** Durable communication preferences, personal details, identity, and standing behavioral instructions.
- **Project Memory:** System dependencies, architectural decisions, feature completion statuses (`proposed`, `planned`, `in_progress`, `implemented`, `verified`, `failed`), and issue logs.
- **Episodic Memory:** Meaningful past events, previous debugging sessions, attempted solutions, and lessons learned.
- **Semantic Memory:** Concept relationships, entity linkages, and technical facts extracted from meaningful sessions.

### 3. Database Durability & Zero External Dependencies
- **Engine:** Pure WebAssembly SQLite (`sql.js`) running in-memory with debounced atomic write-through (`temp_file` + rename).
- **Embedded:** Zero native C++ node-gyp rebuild dependencies — operates out-of-the-box inside Electron ASAR or unpacked bundles.
- **Schema Migrations:** Managed strictly through `PRAGMA user_version = 2` with additive `ALTER TABLE` operations to guarantee zero user data loss across updates.

---

## 🖥️ Memory Center Dashboard (5 Tabs)

Access the full Memory Center by clicking the **Brain** icon on FRIDAY's desktop control bar:

1. **📊 Overview:** Live diagnostic stat cards showing Active Memories, Dedicated Projects, Working/Temporary items, Outdated/Superseded records, Pending Review items, and 24h Activity count, alongside category distribution pills.
2. **🔍 Explorer:** Hybrid semantic vector search + keyword matching with multi-axis filtering (Category, Status, Project) and sort controls. Includes an expandable **Audit Trail** view displaying version history and change rationale.
3. **📁 Projects:** Project profiles tracking Name, Description, Objectives, Tech Stack badges, and current Status (`in_progress`, `verified`, etc.) with one-click filtering to linked memories.
4. **⚡ Activity Log:** Transparent, real-time audit feed detailing every memory operation (`saved`, `updated`, `merged`, `archived`, `conflict_detected`, `retrieved`, `ignored`) with exact human-readable reasons.
5. **🔒 Privacy & Control:** Full user sovereignty: toggle automatic extraction, download complete memory backups in JSON, purge outdated records, or clear temporary working context.

---

## ⚡ ACI V1: Adaptive Conversational Intelligence

FRIDAY 2.0 features the **ACI V1** engine, which dynamically controls persona, tone, response depth, and conversational strategy on every dialogue turn:

| Component | Responsibility |
|---|---|
| **Context Understanding** | Analyzes multi-turn dialogue, task status, cognitive fatigue, and urgency |
| **Emotional Signal Analyzer** | Multi-label affective classifier recognizing 6 primary user moods |
| **Adaptive Personality Engine** | 4 presentation modes: Professional, Warm Assistant, Sarcastic/Witty, Focused Minimalist |
| **Response Depth Engine** | 5 discrete tiers: D0 (Minimal, 1-3 words) to D4 (Deep Architectural Breakdown) |
| **Strategy & Tone Controller** | Determines optimal delivery mode: Coaching, Direct Execution, Collaborative, or Empathetic |
| **User Feedback Learner** | Continuously learns from implicit corrections and feedback signals |

---

## 🎙️ VoiceFlow & TypeFlow Subsystems

### VoiceFlow: Continuous Speech Pipeline
- **Latency:** End-to-end response times under 250ms when utilizing Groq Whisper Turbo.
- **Barge-In Interruption:** Speaks and listens concurrently; automatically cascades `AbortController` cancellation across STT and TTS upon user speech detection.
- **DSP Audio Gate:** Real-time WebAudio spectral subtraction filter, AGC (Automatic Gain Control), and software acoustic echo suppression.

### TypeFlow: Universal Windows Desktop Automation
- **Win32 Input Injection:** Injects formatted text, snippets, and LLM completions directly into active Windows applications (VS Code, Notepad, Word, Slack, Teams) via native SendInput hooks.
- **Smart Formatting:** Automatically handles indentation, variable capitalization, and code blocks matching target editor context.

---

## 🚀 Getting Started

### Prerequisites
- **Operating System:** Windows 10 or 11 (64-bit)
- **Runtime:** Node.js 20.x or 22.x, Python 3.10+ (for Cognitive Engine & OpenVINO)
- **Recommended Hardware:** Intel Core Ultra (Meteor Lake / Arrow Lake) with Intel AI Boost NPU, or any x64 CPU with 8GB+ RAM

### 1. Clone & Install Dependencies
```powershell
git clone https://github.com/charanx1234/voice-agent.git
cd voice-agent
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the project root:
```env
# Cloud AI Providers (at least one required)
GEMINI_API_KEY=your_gemini_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Speech Services (Optional / Fallbacks)
GROQ_API_KEY=your_groq_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
SONEX_API_KEY=your_sonex_api_key_here
```

### 3. Run in Development Mode
```powershell
npm run dev:electron
```

### 4. Build & Package for Windows
To compile the TypeScript services, Vite renderer, and package a production Windows installer (`NSIS` + unpacked):
```powershell
npm run package:win
```
The output executable will be created in `dist-release/win-unpacked/FRIDAY.exe`.

---

## 🧪 Comprehensive Verification Suite

FRIDAY maintains strict regression verification across all subsystems. Run all test suites:

```powershell
# Run FIMA V1 Memory Suite + Original Memory Tests
npx vitest run tests/fimaArchitecture.test.ts tests/memory.test.ts

# Run Entire Test Suite (62 Suites, 540+ Tests)
npm test
```

### Verified Test Matrix:
- ✅ **Memory Classification:** Greetings ignored, temporary debug tasks preserved in working memory, explicit requests given top priority.
- ✅ **Conflict Resolution:** Corrections supersede outdated memories; planned changes do not overwrite verified implementations.
- ✅ **Lifecycle Management:** Expired temporary memories transitioned to `outdated`; duplicates merged with history preservation.
- ✅ **Project Memory:** Multi-project isolation; context builder prioritizes active project tech stack and architecture.
- ✅ **Cognitive Engine:** L0 fast-path execution (<20ms); L1–L3 model complexity routing; token budget enforcement.
- ✅ **Voice & TypeFlow:** Audio pipeline DSP, spectral gating, barge-in abort cascade, Win32 keystroke injection.

---

## 📄 License & Attribution

This project is licensed under the MIT License. Built with ❤️ for intelligent, transparent, and respectful personal desktop AI assistance.
