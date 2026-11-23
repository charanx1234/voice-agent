# FRIDAY 2.0 — AI Desktop Companion for Windows 🤖⚡

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(64--bit)-0078D6.svg?style=flat-square&logo=windows)](https://microsoft.com)
[![Framework](https://img.shields.io/badge/Architecture-Electron%2034%20%2B%20React%2019-61DAFB.svg?style=flat-square&logo=react)](https://electronjs.org)
[![Hardware Engine](https://img.shields.io/badge/Hardware%20Engine-Intel%20AI%20Boost%20NPU%20%7C%20OpenVINO-0071C5.svg?style=flat-square&logo=intel)](https://www.intel.com)
[![AI Engine](https://img.shields.io/badge/AI-Google%20Gemini%202.5%20%7C%203.1-4285F4.svg?style=flat-square&logo=google)](https://aistudio.google.com)
[![STT Engine](https://img.shields.io/badge/STT-Groq%20Whisper%20%7C%20VoiceFlow-F55036.svg?style=flat-square)](https://groq.com)
[![Neural TTS](https://img.shields.io/badge/TTS-Sonex%20Cloned%20%7C%20Edge%20Neural-00C7B7.svg?style=flat-square)](https://sonexlabs.com)
[![Tests](https://img.shields.io/badge/Tests-60%20Suites%20%7C%20482%20Passed-success.svg?style=flat-square)](https://github.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

**FRIDAY 2.0** is an intelligent, low-latency, personal desktop companion for Windows engineered with an animated **Pet-First Architecture**, a robust **Hybrid Voice Architecture (V2)**, and a dedicated **Hardware Intelligence Engine**. Floating transparently on your desktop, FRIDAY combines sub-second conversational intelligence, real-time speech interruption, DSP background noise suppression, acoustic echo cancellation, universal Win32 desktop typing automation, native system automation, and local neural acceleration using **Intel OpenVINO** on the **Intel AI Boost NPU**, integrated **Intel Arc GPU**, and CPU.

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
                    [<20ms Local Intent]              [Conversational & AI Tasks]
                                       │              │
                                       ▼              ▼
                        ┌────────────────────────┐ ┌──────────────────────────────────────┐
                        │ FAST LOCAL ROUTER      │ │     COGNITIVE ENGINE & ROUTER        │
                        │ • CoreAudio Volume     │ │ • L0: Instant (<20ms Local Rules)    │
                        │ • WMI Display Light    │ │ • L1: Standard (Gemini Flash Stream) │
                        │ • User32 Window Snap   │ │ • L2: Deep Reasoning (Gemini Pro)    │
                        │ • 150+ App Launcher    │ └──────────┬───────────────────────────┘
                        └──────────────┬─────────┘            │
                                       │                      ▼
                                       │           ┌──────────────────────────────────────┐
                                       │           │     HARDWARE INTELLIGENCE ENGINE     │
                                       │           │   Intel OpenVINO 2026.4 Execution    │
                                       │           │   • Intel AI Boost NPU (Primary)     │
                                       │           │   • Intel Arc GPU (Secondary)        │
                                       │           │   • CPU Resilient Fallback           │
                                       │           │   • Safe Static Tensor Verification  │
                                       │           └──────────┬───────────────────────────┘
                                       │                      │
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
                        │  • Hardware Diagnostic Telemetry & IPC       │
                        └──────────────────────────────────────────────┘
```

---

## 🚀 Core Capabilities

### 1. 🧠 Hardware Intelligence Engine & Intel AI Boost NPU Integration
FRIDAY features a dedicated hardware acceleration engine built on **Intel OpenVINO 2026.4.1**, tailored for modern Intel processors (such as the Intel Core Ultra 5 125H with Intel AI Boost NPU and Intel Arc GPU):
- **Verified Hardware Detection**: Identifies physical devices, runtime driver versions (`NPU: 32.0.100.4512`, `GPU: 32.0.101.8132`), and queries actual OpenVINO device plugins (`CPU`, `GPU`, `NPU`).
- **Central Hardware Task Router**: Intelligently routes local AI workloads according to an automated fallback ladder (`NPU -> GPU -> CPU`). Configurable preferences allow forced or automatic device selection (`auto`, `npu`, `gpu`, `cpu`).
- **Resilient Fallback Ladder**: If the NPU is unavailable, busy, or encounters an incompatible operator/dynamic shape, inference falls back seamlessly to the Intel Arc GPU, and ultimately to the CPU with zero user disruption.
- **Sub-Millisecond Warm Inference**: Compiles OpenVINO IR models with persistent `.blob` caching in `.cache/openvino_cache/`. Warm inference executes in **~4ms** on the Intel AI Boost NPU.
- **Safe Precision & Tensor Normalization**: Automatically validates static tensor shapes required by NPU architectures and normalizes input data types (e.g. converting 64-bit float inputs into standard 32-bit floats).
- **Individual Workload Assessment**: Evaluates local tasks (Wake-word, Acoustic VAD, Noise Suppression, Local Speech Recognition, and Language Identification) on device while strictly maintaining cloud integrations (Google Gemini, OpenRouter) for complex conversational reasoning without spoofing NPU execution.
- **Sanitized Developer Diagnostics**: Exposes comprehensive runtime telemetry (target device, actual execution device confirmed by runtime properties, latency, RSS memory, compilation times, and fallback history) while strictly protecting user privacy (zero logging of private messages, API keys, or raw audio).

### 2. 🎙️ Hybrid Voice Architecture V2 & Clean Speech Pipeline
- **Single Microphone Owner**: Eliminates duplicate audio streams and race conditions by isolating microphone capture inside an unthrottled central audio host.
- **DSP Noise Suppression**: Real-time spectral gating removes fan hum, keyboard clatter, and steady background noise without degrading voice clarity.
- **Software Acoustic Echo Cancellation (AEC)**: Reference energy mask blocks FRIDAY's own speakers from looping into speech recognition while allowing natural user barge-in.
- **Dynamic Speech Turn Boundary Detection**: Protects trailing syllables and tolerates natural mid-sentence pauses (up to 1,200ms) before finalizing speech turns.
- **Instant Speech Interruption (Barge-In)**: Intercepts user speech while FRIDAY is talking to immediately halt TTS audio playback, cancel in-flight token streams via `AbortController`, and pivot to the new request.
- **Custom Cloned Neural Voice**: Integrated with Sonex Labs (Panini model) using a custom reference voice, with automated resilient fallback to Murf AI, ElevenLabs, and Microsoft Edge Neural TTS.

### 3. 🐾 Pet-First Companion & Reactive Expressions
- **Zero-Flicker Floating Companion**: A hardware-accelerated, transparent desktop pet ($180\times 136\text{px}$) that docks seamlessly across multiple monitors.
- **State-Synchronized Expressions**: Dynamic emotional states (`smile`, `thinking`, `happy`, `surprised`, `sleepy`, `not-happy`) reactive to listening, thinking, speaking, and interruption events.
- **Presentation Layer Decoupling**: The Desktop Pet operates as a pure visual and interactive controller, delegating audio streams and execution to the background core.

### 4. ⌨️ TypeFlow & VoiceFlow (Universal Text Automation)
- **Universal Win32 SendInput Injection**: Types text, multiline scripts, and code directly into any focused Windows application (VS Code, Notepad, terminal, browser address bars, and web editors).
- **Desktop & Focus Safety**: Attaches thread input (`AttachThreadInput`), restores iconic windows, and handles input targets safely without stealing focus.
- **AI Dictation Modes**: Transcribe and format speech instantly across 5 purpose-built modes: `Natural`, `Professional`, `Concise`, `Code`, and `Verbatim`.
- **Credential Safeguard Gate**: Automatically detects password fields and proctored examination windows to abort automated keystroke injection.

### 5. ⚡ Fast Local Intent Engine (<20ms Latency)
High-frequency system commands execute directly against native C++/Windows COM APIs without cloud roundtrips:
- **Audio & Mute Control**: Adjusts master audio levels and toggles mutes via Windows CoreAudio `IAudioEndpointVolume`.
- **Display Brightness**: Regulates monitor backlight levels directly via WMI ACPI brightness methods.
- **Window Snapping**: Splits screens, snaps left/right, centers, minimizes, or maximizes windows via `user32.dll`.
- **150+ App Launcher & Terminator**: Instantly launches and terminates native Windows applications.
- **Media Keys & Weather**: Direct control for Spotify and YouTube, alongside cached local weather via Open-Meteo.

### 6. 🗂️ Productivity Suite & Memory Persistence
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
| **Hardware Engine** | Intel OpenVINO 2026.4.1, Intel AI Boost NPU, Intel Arc GPU, CPU Fallback |
| **Cognitive Engine** | Multi-Tier Reasoning (L0 Instant, L1 Standard, L2 Deep), JSON-RPC stdio Daemon |
| **Voice & DSP** | Web Audio API, Spectral Subtraction, Software AEC, Groq Whisper Turbo |
| **Neural TTS** | Sonex Labs Panini (Cloned Voice), Murf AI, ElevenLabs, Edge Neural TTS |
| **LLM & Cloud AI** | Google Gemini API (2.5 Flash / 3.1 Pro), OpenRouter |
| **Native Systems** | Win32 API (`user32.dll`, `kernel32.dll`), CoreAudio COM, WMI, Python 3.12 |
| **Local Storage** | SQLite WASM (`sql.js`) with atomic file flushes |
| **Quality & Tests** | Vitest (Electron/TypeScript) + Python `unittest` (Hardware/OpenVINO), 100% Pass Rate |

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
- Node.js 20+ and Python 3.12+
- Valid API keys for Gemini, Groq, and voice providers
- Intel Core Ultra processor recommended for Intel AI Boost NPU acceleration

### 1. Installation & Environment Setup
```powershell
# Clone the repository
git clone https://github.com/charanx1234/voice-agent.git
cd voice-agent

# Install Node.js frontend and Electron dependencies
npm install

# Install Hardware Intelligence Engine dependencies (OpenVINO, NumPy, psutil)
pip install -r requirements-hardware.txt
```

### 2. Running Automated Tests
```powershell
# Run the complete TypeScript & Electron test suite (Vitest)
npm test

# Run the Python Hardware Intelligence & Cognitive Engine test suite
python -m unittest discover -s tests
```

### 3. Development Mode
```powershell
# Start FRIDAY in development mode with hot reload
npm run dev
```

### 4. Production Build & Packaging
```powershell
# Compile TypeScript services and Vite renderer
npm run build

# Package unpacked application and official Windows NSIS Setup installer
npm run package:win
```
The compiled outputs are generated in `dist-release/`:
- **Windows Setup Installer**: `dist-release/FRIDAY Setup 1.0.1.exe`
- **Portable Unpacked App**: `dist-release/win-unpacked/FRIDAY.exe`

---

## 🔬 Hardware Verification Example (NPU)

You can verify actual NPU acceleration directly from the command line using the Python test harness:

```powershell
python -c "
from cognitive_engine.hardware.hardware_router import HardwareTaskRouter, DevicePreference
from cognitive_engine.hardware.reference_models import ReferenceModelFactory

router = HardwareTaskRouter()
model = ReferenceModelFactory.create_tiny_test_model()

# Execute on NPU
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
- **Memory & Storage**: `%APPDATA%\friday-ai-companion\friday_memory.db`
- **OpenVINO Model Cache**: `%USERPROFILE%\.cache\openvino_cache\`
- **Application Logs**: `%APPDATA%\friday-ai-companion\logs\`

---

## 🛡️ License

This project is licensed under the **MIT License**.
