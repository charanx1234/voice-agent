# FRIDAY — Personal AI Desktop Companion 🤖✨

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(64--bit)-blue.svg?style=for-the-badge&logo=windows)](https://microsoft.com)
[![AI Engine](https://img.shields.io/badge/AI%20Engine-Google%20Gemini%20Flash%20%2F%20Pro-4285F4.svg?style=for-the-badge&logo=google)](https://aistudio.google.com)
[![Desktop Framework](https://img.shields.io/badge/Desktop-Electron%2034%20%2B%20React%2019-61DAFB.svg?style=for-the-badge&logo=react)](https://electronjs.org)
[![Language](https://img.shields.io/badge/Languages-Telugu%20%7C%20English%20%7C%20Hindi%20%7C%20Tamil%20%7C%20Kannada-green.svg?style=for-the-badge)](https://github.com)
[![Tests](https://img.shields.io/badge/Tests-Passed%20100%25-success.svg?style=for-the-badge)](https://github.com)
[![License](https://img.shields.io/badge/License-MIT-orange.svg?style=for-the-badge)](LICENSE)

**FRIDAY** is a high-speed personal AI desktop companion for Windows. Built with a **Pet-First Architecture**, FRIDAY lives directly on your desktop as an interactive floating character that listens, speaks, manages your PC, plays media, organizes files, snaps windows, expands text snippets, manages workspaces, and remembers your preferences across restarts.

FRIDAY is a **true standalone Windows desktop application** installed at `%LOCALAPPDATA%\Programs\FRIDAY`. You can launch it directly from your Desktop shortcut or Start Menu with **zero PowerShell windows, zero terminals, and no Administrator permissions required**.

---

## ⚡ Speed & Latency Optimizations

FRIDAY is engineered for sub-second, real-time desktop responsiveness:
- **Fast Local Intent Engine (<20ms)**: High-frequency desktop commands (launching apps, closing apps, setting volume, screen brightness, window controls, and time queries) run locally without cloud API latency.
- **Optimized Gemini Latency**: Tool schemas sent to Gemini are streamlined, cutting ~3,500 redundant tokens from requests to reduce AI first-token latency from ~5s down to sub-second speeds.
- **Single Unified Notes Backend**: QuickNotes and the main Dashboard use a unified storage store (`notesStore.ts`), keeping notes in sync across the Desktop Pet, QuickTools UI, and voice pipeline.
- **Zero-Freeze Window & File I/O**: Window snapping acts directly on foreground handles, and file indexing is scoped with depth limits to guarantee that the Electron event loop never freezes.

---

## 📋 Comprehensive Catalog of Features — What Can FRIDAY Do?

### 1. 🗂️ Quick Actions (Desktop & File Organization)
- **Automatic Organization**: Scans loose files on your Desktop, Downloads, or custom folders and organizes them into categorized folders (`Documents`, `Images`, `Screenshots`, `Videos`, `Audio`, `Archives`, `Code`, `Executables`).
- **Duplicate File Detection**: Finds exact duplicate files using size heuristics and cryptographic SHA-256 hashing.
- **Safety First**: Non-destructive by design — always presents a before-and-after preview before executing, resolves collisions automatically (`file (1).pdf`), and includes **1-Click Undo / Restore**.

### 2. 📋 Privacy-Shielded Clipboard History
- **Searchable Clipboard Archive**: Keeps track of recently copied text and links locally.
- **Pin & Star**: Favorite your most important snippets to keep them pinned at the top.
- **Sensitive Data Protection**: Automatically detects and strips passwords, API keys, tokens, credit card patterns, and authorization headers from the clipboard log.
- **1-Click Re-Copy & Instant Search**: Filter through previous clippings in milliseconds.

### 3. ✂️ Smart Text Snippets (Instant Expansion)
- **Shortcut Trigger**: Expand frequently typed phrases using custom prefixes (e.g. `;mail`, `;phone`, `;intro`, `;meeting`).
- **Dynamic Variable Injection**: Automatically fills placeholders: `{name}`, `{date}`, `{time}`, and `{subject}`.
- **Safe Insertion**: Inserts text directly through the Windows clipboard and synthetic keystroke events without global keylogger hooks.

### 4. 🪟 Intelligent Window Manager
- **Side-by-Side Arrangement**: Split two applications across your monitor (e.g., *"Put Chrome on the left and VS Code on the right"*).
- **Single Window Snapping**: Snap the active window or a named application to the left or right half of the screen.
- **Maximize, Minimize, Restore & Center**: Control window states hands-free using voice or quick UI clicks.
- **Native User32 Execution**: Snaps foreground windows in milliseconds without recompiling C# on every command.

### 5. 📝 Unified Quick Notes & Ideas
- **Instant Voice Capture**: Capture notes or brainstorming ideas on the fly (*"Friday, remember this note: ... "* or *"Save this as an idea: ..."*).
- **Categorization & Tags**: Organize notes into `Work`, `Personal`, `Ideas`, `Study`, `Coding`, and `General`.
- **Pin Important Notes**: Toggle pins so priority items stay highlighted.
- **Complete Synchronization**: Any note created via voice, the Desktop Pet, QuickTools UI, or the Dashboard is immediately accessible everywhere.

### 6. 🏷️ Batch File Renamer
- **Batch Pattern Transformation**: Rename dozens of files simultaneously with custom prefixes, suffixes, sequential numbering (`001`, `002`), date stamps, or string find-and-replace.
- **Extension Safety**: Protects file extensions from accidental overwriting or corruption.
- **Conflict Previews & Full Undo**: Previews every renamed file before applying changes; provides a 1-click restore mechanism to revert files back to their original names.

### 7. 🔎 Natural Language File Finder
- **Conversational File Queries**: Search files across your Desktop, Downloads, and Documents (*"Find my latest PDF"*, *"Find Java files modified yesterday"*).
- **Fast Local Search**: High-performance metadata queries without uploading private filenames or folder structures to the cloud.
- **Direct Actions**: Open matched files or their containing folders directly in Windows File Explorer.

### 8. 💻 Temporary Workspaces (Presets)
- **One-Command Setup**: Launch multiple applications and layouts with a single phrase (*"Start coding mode"*, *"Open study workspace"*, *"Focus mode"*).
- **Customizable Configurations**: Create presets specifying target apps, folders, and window positions.
- **Controlled Delays**: Launches applications with staggered delays to prevent system resource spikes.

### 9. 📥 Dedicated Downloads Organiser
- **Categorized Downloads Clean-Up**: Scans `%USERPROFILE%\Downloads` and categorizes files into Documents, Images, Videos, Audio, Archives, and Installers.
- **Interactive Move Review**: Inspect proposed file locations with the ability to exclude specific files.
- **Safe Collisions & Restoration**: Moves files without data loss and maintains an undo history.

### 10. 📸 Screenshot Assistant & Vision Intelligence
- **Flexible Capture**: Capture the entire monitor, active window, or a selected region.
- **Direct Clipboard & Disk Save**: Automatically saves to Pictures/Screenshots and copies to your clipboard.
- **Multimodal AI Analysis**: Ask FRIDAY questions about what's currently on your screen (requires Gemini vision).

### 11. 🔊 Real Windows Master Volume & Mute Control
- **True System Control**: Controls actual Windows master audio via CoreAudio COM interfaces (`IMMDeviceEnumerator`, `IAudioEndpointVolume`).
- **Exact & Relative Levels**: *"Set volume to 50 percent"*, *"Increase volume by 15"*, *"Volume up"*, *"Mute my laptop"*, *"Unmute"*.

### 12. ☀️ Real Laptop Screen Brightness Control
- **WMI ACPI Display Control**: Directly controls laptop backlight brightness.
- **Precise Adjustments**: *"Set brightness to 70 percent"*, *"Make screen dimmer"*, *"Increase brightness"*, *"Max brightness"*.

### 13. 🚀 150+ Native Windows App Launcher & Window Closer
- **Multilingual Support**: Supports English, Telugu, and Hinglish.
  - **English**: *"Open Chrome"*, *"Launch VS Code"*, *"Close Notepad"*, *"Quit Spotify"*.
  - **Telugu**: *"Chrome open chey"*, *"Spotify teeyi"*, *"Notepad close chey"*, *"Calculator chalu chey"*.
  - **Hinglish**: *"Chrome kholo"*, *"Notepad band karo"*, *"Spotify chalao"*.

### 14. 🖱️ Windows Mouse & Cursor Automation
- **Anchor Movements**: *"Move mouse to top-right corner"*, *"Move mouse to center"*.
- **Click Actions**: Single-click, double-click, and right-click at the current position.
- **Scrolling**: Vertical mouse scrolling (*"Scroll down"*, *"Scroll up"*).

### 15. ⏰ System Time, Date & Countdowns
- **Local Clock Accuracy**: Real-time evaluation based on system timezone.
- **Future/Past Offsets**: *"What time will it be in two hours?"*, *"How much time until 6 PM?"*, *"Today's date"*.

### 16. ⛅ Live Weather & Forecasts
- **Current & Forecast Data**: Real-time conditions powered by Open-Meteo geocoding.
- **Natural Language Queries**: *"What's the weather?"*, *"Will it rain today?"*, *"Weather in Hyderabad"*, *"Tomorrow's weather"*.

### 17. 🎵 Direct Media Playback (Spotify & YouTube)
- **Spotify Direct Play**: *"Play Starboy on Spotify"* or *"Spotify lo DSP songs play chey"*.
- **YouTube Direct Play**: *"Play Believer on YouTube"* or *"Search Python tutorials on YouTube"*.
- **Media Keys**: Play/pause, next track, and rewind.

### 18. 👏 Two-Hand Acoustic Clap-to-Wake (`clap-clap`)
- **Hands-Free Activation**: Wake FRIDAY by clapping your hands twice.
- **Physical Acoustic Engine**: Strict impulse checks (sharp attack, crest factor `>= 2.8`, high frequencies `1.5 kHz – 8 kHz`, tempo `180ms – 800ms`) reject keyboard typing, desk knocks, and speech.
- **5-Minute Continuous Listening**: Stays awake for 5 minutes after being triggered. The timer resets every time you speak.

---

## 🧪 Testing Guide — How to Test Every Feature Properly

Use this checklist to test each capability via **Voice** (or by typing into the Desktop Pet / Dashboard chat input):

### 1. Test System & Hardware Controls
| Action | What to Say / Type | Expected Result |
|---|---|---|
| **Volume (Exact)** | `Set volume to 40 percent` | Windows master volume slider moves to 40% and FRIDAY confirms. |
| **Volume (Delta)** | `Increase volume by 10` | Volume increases to 50%. |
| **Volume (Mute)** | `Mute my laptop` | Windows audio is muted. |
| **Volume (Unmute)** | `Unmute` | Windows audio is restored. |
| **Brightness** | `Set brightness to 80 percent` | Laptop screen brightness adjusts to 80%. |
| **Time Query** | `What time is it?` | FRIDAY speaks the current local time in <20ms. |
| **Date Query** | `What is today's date?` | FRIDAY replies with the full weekday, month, and year. |
| **Countdown** | `How much time until 10 PM?` | Calculates exact hours and minutes remaining. |
| **Weather** | `What's the weather today?` | Returns live temperature, wind speed, and precipitation. |

### 2. Test Multilingual App Launch & Close
| Language | Command | Expected Result |
|---|---|---|
| **English Launch** | `Open Notepad` | Notepad launches immediately. |
| **Telugu Launch** | `Chrome open chey` | Google Chrome opens. |
| **Hinglish Launch** | `Calculator kholo` | Windows Calculator opens. |
| **English Close** | `Close Notepad` | Notepad window closes cleanly. |
| **Telugu Close** | `Chrome close chey` | Chrome window closes. |

### 3. Test Window Manager
| Action | What to Say / Type | Expected Result |
|---|---|---|
| **Side by Side** | `Put Chrome on the left and Notepad on the right` | Snaps Chrome to the left 50% and Notepad to the right 50%. |
| **Snap Left** | `Snap this window to the left` | Snaps current active window to the left half. |
| **Snap Right** | `Snap this window to the right` | Snaps current active window to the right half. |
| **Maximize** | `Maximize window` | Expands current window to fill screen. |
| **Minimize** | `Minimize window` | Minimizes current active window. |

### 4. Test Quick Notes & Ideas
| Action | What to Say / Type | Expected Result |
|---|---|---|
| **Save Note** | `Remember this note: Buy milk and finish report` | Saves note under "General" and confirms. |
| **Save Idea** | `Save this as an idea: Build an offline voice LLM` | Saves note tagged with `#idea` under "Ideas". |
| **List Notes** | `Show my notes` | Lists your recent saved notes. |
| **UI Verification** | Open QuickTools modal → *Quick Notes* tab | Note appears with pin, edit, and delete options. |

### 5. Test QuickTools Productivity Suite (UI & Shortcuts)
1. **Open QuickTools**: Click the **QuickTools (⚡)** icon on the Control Bar or Desktop Pet.
2. **Quick Actions Tab**:
   - Click **Preview Desktop Cleanup**. Review categorized files.
   - Click **Find Duplicates** to detect identical files.
   - Click **Organize** to move files, then test **Undo** to restore them to their original location.
3. **Clipboard History Tab**:
   - Copy any sentence (`Ctrl + C`). It appears immediately in the history.
   - Click the **Star** icon to pin it.
   - Type in the search box to filter your clippings.
   - Click **Copy** to restore it to your Windows clipboard.
4. **Smart Text Snippets Tab**:
   - Click **New Snippet**, enter trigger `;test` and replacement `Hello {name}, today is {date}!`.
   - Click the **Insert** button or copy preview to verify dynamic replacement.
5. **Batch Renamer Tab**:
   - Choose `Desktop` or `Downloads`, enter prefix `Project_`, and check **Add Number**.
   - Click **Generate Preview** to view before/after filenames.
   - Click **Apply Rename**, then verify files. Click **Undo** to restore original names.
6. **File Finder Tab**:
   - Type `pdf` or `report` and press Enter. Matches appear with file size, modified date, and an **Open Folder** button.
7. **Workspaces Tab**:
   - Click **Launch** next to *Coding Mode*. VS Code, Terminal, and Chrome launch with staggered delays.

### 6. Test Media & Hands-Free Triggers
| Action | How to Test | Expected Result |
|---|---|---|
| **Clap to Wake** | Clap hands twice (`clap-clap`) while FRIDAY is on Standby | FRIDAY plays wake chime, opens eyes, and listens continuously. |
| **Spotify Direct** | Say `Play Believer on Spotify` | Opens Spotify and starts playback. |
| **YouTube Direct** | Say `Play lofi music on YouTube` | Opens YouTube and starts playing video. |
| **Media Controls** | Say `Pause music`, then `Resume music`, then `Next song` | Sends native media key events to Windows. |

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
| **Hardware APIs** | Windows CoreAudio COM, WMI ACPI Brightness, User32 / Shell32 native APIs |

---

## 🚀 Running and Packaging

```powershell
# Run in development mode
npm run dev

# Run all test suites
npm test

# Build production TypeScript & Vite bundle
npm run build

# Package standalone Windows release (.exe & unpacked installer)
npm run package:win
```

---

## 📁 Key Directories & File Paths

- **Installed App**: `%LOCALAPPDATA%\Programs\FRIDAY\FRIDAY.exe`
- **Application Data & SQLite Storage**: `%APPDATA%\friday-ai-companion\`
- **Notes Storage**: `%APPDATA%\friday-ai-companion\notes\`
- **Startup Diagnostics**: `%APPDATA%\friday-ai-companion\logs\startup.log`
- **Application Logs**: `%APPDATA%\friday-ai-companion\logs\friday-YYYY-MM-DD.log`

---

## 🛡️ License

This project is licensed under the **MIT License**. Built with ❤️ for next-generation Windows desktop AI companion and multimodal voice interaction.
