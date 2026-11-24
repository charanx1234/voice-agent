# FRIDAY 2.0 — Adaptive Conversational Desktop Companion 🤖⚡

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(64--bit)-0078D6.svg?style=flat-square&logo=windows)](https://microsoft.com)
[![Framework](https://img.shields.io/badge/Architecture-Electron%2034%20%2B%20React%2019-61DAFB.svg?style=flat-square&logo=react)](https://electronjs.org)
[![Adaptive Intelligence](https://img.shields.io/badge/Intelligence-ACI%20V1%20(Adaptive%20Conversational)-8A2BE2.svg?style=flat-square)](src/services/ai/aci)
[![Hardware Engine](https://img.shields.io/badge/Hardware%20Engine-Intel%20AI%20Boost%20NPU%20%7C%20OpenVINO-0071C5.svg?style=flat-square&logo=intel)](https://www.intel.com)
[![Cloud AI Engine](https://img.shields.io/badge/AI%20Providers-Gemini%202.5%20%7C%20Claude%20%7C%20OpenAI-4285F4.svg?style=flat-square)](src/services/ai/providers)
[![STT Engine](https://img.shields.io/badge/STT-Groq%20Whisper%20Turbo%20%7C%20VoiceFlow-F55036.svg?style=flat-square)](https://groq.com)
[![Neural TTS](https://img.shields.io/badge/TTS-Sonex%20Cloned%20%7C%20Murf%20%7C%20Edge%20Neural-00C7B7.svg?style=flat-square)](https://sonexlabs.com)
[![Tests](https://img.shields.io/badge/Tests-61%20Suites%20%7C%20502%20Passed%20(100%25)-success.svg?style=flat-square)](tests)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

**FRIDAY 2.0** is an enterprise-grade, context-aware, personal AI desktop companion engineered for Windows 10/11. Powered by **Adaptive Conversational Intelligence (ACI V1)**, FRIDAY automatically adapts her personality, tone, emotional responsiveness, response depth, and conversational strategy on every turn according to user intent, conversational history, and expressed emotional cues.

Floating transparently on your desktop with an interactive **Pet-First Architecture**, FRIDAY seamlessly couples sub-second local automation with cloud cognitive reasoning, real-time speech interruption (barge-in), DSP spectral noise gating, acoustic echo cancellation, universal Win32 desktop typing injection, and hardware-accelerated local neural inference using **Intel OpenVINO** on modern **Intel AI Boost NPUs**, **Intel Arc GPUs**, and CPUs.

---

## 🏛️ Master Architecture Overview

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
                               │                       │ • Persistent SQLite Memory │
                               │                       │ • Multi-Provider Dispatch  │
                               │                       └─────────────┬──────────────┘
                               │                                     │
                               │                                     ▼
                               │                       ┌────────────────────────────┐
                               │                       │     MODEL EXECUTION        │
                               │                       │ • Google Gemini 2.5 / 3.1  │
                               │                       │ • Anthropic Claude 3.5     │
                               │                       │ • OpenAI / OpenRouter / Lcl│
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
                        ┌───────────────────────────────────────────────────────────┐
                        │              PRESENTATION & DESKTOP AUTOMATION            │
                        │  • Desktop Pet: Transparent Canvas & Synced Expressions   │
                        │  • Electron Dashboard: Side Pane Diagnostics & Memory     │
                        │  • TypeFlow: Win32 SendInput Unicode Keystroke Injection  │
                        │  • VoiceFlow: Local Whisper AI Speech Dictation & Paste   │
                        │  • Safe Telemetry & Sanitized Developer Diagnostics       │
                        └───────────────────────────────────────────────────────────┘
```

---

## 🧠 Adaptive Conversational Intelligence (ACI V1)

ACI V1 upgrades FRIDAY from a static conversational agent into an **adaptive intelligence system** that dynamically tailors its communication style without requiring duplicate model calls or losing reasoning depth.

### 1. Structured Conversation Policy
Every turn produces an atomic, immutable, and context-aware `ConversationPolicy`:

```json
{
  "intent": "debugging",
  "context": "resolving_issue_or_debugging",
  "task": "resolving_issue_or_debugging",
  "category": "debugging",
  "interactionMode": "troubleshooting",
  "emotion_signals": ["frustration", "uncertainty"],
  "emotion_confidence": 0.88,
  "primary_emotion": "frustration",
  "personality": "moderate",
  "personality_source": "automatic",
  "tone": "calm_supportive",
  "response_depth": "D2",
  "strategy": "step_by_step",
  "language": "auto",
  "verbosity": "normal",
  "safety_override": false
}
```

### 2. The Nine ACI Sub-Engines

| Component | Responsibility & Architecture |
|---|---|
| **Context Understanding Engine** | Tracks multi-turn conversational intent, ongoing tasks, project context, and interaction modes (`casual_chatting`, `learning`, `researching`, `troubleshooting`, `brainstorming`, `executing_tasks`). Follow-up queries (e.g. *"What about the drivers?"*) inherit context rather than resetting to general chat. |
| **Emotional Signal Analyzer** | Detects multi-label emotional signals (`neutrality`, `excitement`, `happiness`, `frustration`, `confusion`, `sadness`, `stress`, `curiosity`, `uncertainty`) with numerical confidence (0.0–1.0). Prioritizes explicit first-person declarations over inferred cues. Never pathologizes or diagnoses conditions. |
| **Adaptive Personality Engine** | Preserves all three personality modes (`Simple`, `Moderate`, `Roast`). Automatically softens roast mode to supportive/calm delivery during frustration, sadness, or high stress. Follows strict priority: `Manual Override` > `In-turn Instruction` > `Automatic Contextual Transition` > `Default Setting`. |
| **Adaptive Response Depth Engine** | Enforces 5 depth tiers (`D0 Minimal`, `D1 Brief`, `D2 Normal`, `D3 Detailed`, `D4 Deep`) based on the core axiom: *"Provide the shortest complete answer."* Greetings receive D0/D1; complex research receives structured D3/D4. Correctness and safety are never sacrificed for brevity. |
| **Conversational Strategy Engine** | Selects optimal interaction strategy: `direct_answer`, `explanation`, `step_by_step`, `clarification`, `listening_acknowledgement`, `brainstorming`, `research_analysis`, `task_execution`, or `follow_up_assistance`. Prevents turning emotional venting into unwanted lectures. |
| **Tone Controller** | Synthesizes natural spoken and written tone (`warm_friendly`, `calm_supportive`, `direct_concise`, `playful_witty`, `patient_encouraging`, `analytical_objective`, `gentle_reassuring`, `respectful_serious`). |
| **Response Quality Controller** | Validates generated text, strips robotic preambles (*"Certainly!", "As an AI..."*), deduplicates repeated paragraphs, repairs unclosed code fences, and guarantees that D0/D1 length limits are respected without discarding essential code or facts. |
| **User Feedback Learner** | Detects explicit user feedback (*"Too long", "Explain more", "Keep it simple", "Be serious", "Don't roast"*), immediately adapts the active policy, and safely persists permanent preferences to `settingsStore` while ensuring transient moods are never stored as permanent traits. |
| **Developer Diagnostics** | Emits telemetry covering classification latencies, detected cues, policy decisions, and feedback adjustments via IPC channel `friday:aci-get-diagnostics`. Zero storage of private audio, messages, or API keys. |

---

## 🚀 Native Windows Capabilities

### 1. 🎙️ Hybrid Voice Architecture V2
- **Single Microphone Ownership**: Eliminates duplicate audio capture loops by routing hardware microphone access through an unthrottled central audio host.
- **DSP Clean Speech Pipeline**: Real-time spectral gating removes background fan noise and keyboard clatter while software Acoustic Echo Cancellation (AEC) prevents speaker feedback.
- **Instant Barge-In Interruption**: User speech detected during TTS playback immediately halts audio output, aborts in-flight token generation via `AbortController`, and pivots to the new command in $<25\text{ms}$.
- **Bilingual Telugu-English Support**: Fluid code-switching with natural Telugu syntax and English technical vocabulary preservation (`te-IN`, `en-IN`).

### 2. ⚡ Intel OpenVINO Hardware Intelligence Engine
- **Intel AI Boost NPU Acceleration**: Compiles OpenVINO IR models with persistent `.blob` caching in `.cache/openvino_cache/`. Warm NPU inference completes in **$\sim$4.2ms**.
- **Automated Fallback Ladder**: `Intel AI Boost NPU` $\to$ `Intel Arc GPU` $\to$ `Multi-threaded CPU`. Zero user-facing interruptions if NPU workload limits are reached.
- **Safe Tensor Normalization**: Automatically converts dynamic shapes to static tensors required by hardware NPUs and normalizes data types from float64 to float32.

### 3. 🐾 Pet-First Architecture & Synced Expressions
- **Floating Desktop Companion**: Hardware-accelerated, transparent desktop overlay ($180\times 136\text{px}$) with seamless multi-monitor docking.
- **State-Synchronized Expressions**: Expressions (`smile`, `happy`, `sad`, `angry`, `sarcastic`, `not-happy`, `thinking`, `sleepy`, `laugh`) mirror the active `ConversationPolicy` and robot state in real time across both dashboard and pet windows.

### 4. ⌨️ TypeFlow & VoiceFlow Automation
- **Universal Win32 SendInput Injection**: Types text, multiline scripts, and code directly into any focused application (VS Code, Notepad, terminal, browser address bar).
- **Focus & Safety Protection**: Attaches thread input (`AttachThreadInput`), restores iconic windows, and detects password input fields to prevent accidental injection into sensitive fields.
- **VoiceFlow Speech Dictation**: Local Whisper transcription across 5 specialized modes: `Natural`, `Professional`, `Concise`, `Code`, and `Verbatim`.

### 5. ⚡ Fast Local Intent Engine ($<20\text{ms}$)
- **Master Audio & Mute Control**: Adjusts volume levels via Windows CoreAudio `IAudioEndpointVolume`.
- **Display Backlight**: Modulates monitor brightness via WMI ACPI brightness methods.
- **Window Snapping**: Left/right split, maximize, minimize, and restore via `user32.dll`.
- **150+ App Launcher**: Launches and terminates native desktop applications without browser redirection.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Runtime & Shell** | Electron 34, Node.js 24, TypeScript 5.7, Win32 C++ Addons |
| **Frontend UI** | React 19, Vite 6, Tailwind CSS, Lucide Icons |
| **Conversational AI (ACI V1)** | Context Understanding, Emotional Analysis, Adaptive Personality, Response Depth (D0-D4) |
| **Cognitive Engine** | L0-L3 Adaptive Complexity Router, 3-Layer Context Engine, Token Budgeter |
| **Hardware Acceleration** | Intel OpenVINO 2026.4.1 (Intel AI Boost NPU, Intel Arc GPU, CPU Fallback) |
| **Speech & Audio DSP** | Web Audio API, Spectral Gating, Software AEC, Groq Whisper Turbo |
| **Neural TTS Cascade** | Sonex Labs Panini (Cloned Voice), Murf AI, ElevenLabs, Microsoft Edge Neural |
| **Cloud LLM Providers** | Google Gemini (2.5 Flash / 3.1 Pro), Anthropic Claude 3.5, OpenAI, OpenRouter |
| **Local Storage** | SQLite WASM (`sql.js`) with Write-Ahead Logging (WAL) and atomic file flushes |
| **Testing & Quality** | Vitest (TypeScript/Electron) + Python `unittest` (Hardware/OpenVINO), **100% Pass Rate** |

---

## ⚙️ Configuration (.env)

Create a `.env` file in the project root:

```env
# Google Gemini (Primary Conversational Intelligence)
GEMINI_API_KEY=your_gemini_api_key_here

# Groq Whisper Turbo (<200ms Cloud Speech-to-Text)
GROQ_API_KEY=your_groq_api_key_here

# Sonex Labs Neural Voice (Custom Cloned Voice)
SONEX_API_KEY=your_sonex_api_key_here
SONEX_VOICE_ID=your_cloned_voice_id_here

# Optional Fallback Voice Providers
MURF_API_KEY=your_murf_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Anthropic / OpenAI Providers (Optional)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

---

## 📥 Getting Started

### Prerequisites
- **OS**: Windows 10 or 11 (64-bit)
- **Node.js**: v20+ / npm v10+
- **Python**: 3.12+ (for OpenVINO Hardware Engine and VoiceFlow backends)
- **Processor**: Modern Intel CPU (Intel Core Ultra recommended for NPU acceleration)

### 1. Installation
```powershell
# Clone repository
git clone https://github.com/charanx1234/voice-agent.git
cd voice-agent

# Install Node.js frontend and Electron dependencies
npm install

# Install Hardware Intelligence Engine dependencies (OpenVINO, NumPy, psutil)
pip install -r requirements-hardware.txt
```

### 2. Running Automated Tests
```powershell
# Run the complete TypeScript & ACI V1 unit and regression suites
npm test

# Run the Python Hardware Intelligence & Cognitive Engine test suite
python -m unittest discover -s tests
```

### 3. Development Mode
```powershell
# Launch FRIDAY with Vite hot-reloading and Electron devtools
npm run dev
```

### 4. Production Build & Packaging
```powershell
# Compile Electron TypeScript backend and Vite React frontend
npm run build

# Package standalone executable and official Windows NSIS installer
npm run package:win
```

Build outputs are generated in `dist-release/`:
- **Windows Setup Installer**: `dist-release/FRIDAY Setup 1.0.1.exe`
- **Portable Unpacked App**: `dist-release/win-unpacked/FRIDAY.exe`

### 5. Desktop Shortcut Registration
```powershell
# Register FRIDAY on Desktop and Start Menu as a native Windows application
powershell -ExecutionPolicy Bypass -File .\create-shortcuts.ps1
```

---

## 🔬 Hardware Verification Example (NPU)

Verify Intel AI Boost NPU execution directly from PowerShell:

```powershell
python -c "
from cognitive_engine.hardware.hardware_router import HardwareTaskRouter, DevicePreference
from cognitive_engine.hardware.reference_models import ReferenceModelFactory

router = HardwareTaskRouter()
model = ReferenceModelFactory.create_tiny_test_model()

# Execute inference on NPU
res = router.execute_workload(model, 'FridayNPUTest', {'input': [[1.0, 2.0, 3.0, 4.0]]}, override_preference=DevicePreference.NPU)

print('Actual Device:', res.actual_device)
print('Inference Latency:', round(res.inference_latency_ms, 2), 'ms')
print('Output Tensor:', res.outputs)
router.shutdown()
"
```
**Expected Output:**
```text
Actual Device: NPU
Inference Latency: 4.21 ms
Output Tensor: {'Result_6': [[2.0, 4.0, 6.0, 8.0]]}
```

---

## 📁 System Paths (Windows)

- **Application Binary**: `%LOCALAPPDATA%\Programs\FRIDAY\FRIDAY.exe`
- **Application Config**: `%APPDATA%\friday-ai-companion\.env`
- **Memory Database**: `%APPDATA%\friday-ai-companion\friday_memory.db`
- **OpenVINO Model Cache**: `%USERPROFILE%\.cache\openvino_cache\`
- **Application Logs**: `%APPDATA%\friday-ai-companion\logs\`

---

## 🛡️ License

This project is licensed under the **MIT License**.
