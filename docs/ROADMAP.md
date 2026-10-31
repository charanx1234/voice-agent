# FRIDAY — Architecture Assessment & Phased Roadmap

Written after inspecting the codebase at commit `9943acc`. This is the living plan for the
"Advanced Intelligence and Capability" upgrade.

## 1. Current architecture (already built)

```
FRIDAY.exe (Electron, single process tree — no sidecar backend)
├── Main process (the backend)
│   ├── memoryService       SQLite via sql.js: memories + rolling transcript
│   ├── remindersService    SQLite: reminders, scheduler, Windows toast
│   ├── geminiService       Gemini chat + tool loop + model fallback
│   ├── toolRegistry        notes, memory, reminders, folder search, web,
│   │                       app launcher, dashboard output
│   ├── neuralVoiceService  Edge neural TTS + Gemini TTS fallback
│   ├── dashboardBus        visual artifacts → renderer
│   └── logger              file logging in userData/logs
├── Preload (contextBridge) typed IPC surface
└── Renderer (React)        robot, transcript, dashboard, settings
```

Single-instance lock, graceful shutdown, file-only logging in packaged builds.

## 2. Feature matrix

| Area | Status | Notes |
|---|---|---|
| Long-term memory (store, extract, retrieve) | **Done** | Gemini extraction ≤3/turn, dedupe by subject/embedding, SQLite |
| Memory view / edit / delete | **Done** | Memory panel |
| Semantic retrieval | **Done** | gemini-embedding-001 + keyword + recency |
| Memory relationships | **Partial → improved** | related-memory expansion added in this phase |
| Conversation context | **Partial → improved** | transcript persisted; situation brief + mode detection added |
| Voice accents (US/UK/IN, F/M, preview, persistence) | **Done** | 25 English neural voices |
| Opinion / debate mode | **Done → strengthened** | persona sections for argument analysis |
| Screen understanding | **Missing** | deferred: needs consent UX + privacy review |
| Coding workspace (read/analyse/propose) | **Partial** | folder search + dashboard exist; file write/proposal deferred |
| System health monitor | **Added this phase** | CPU/RAM/disk/battery/network/temp |
| Desktop control | **Partial** | allow-listed app launch exists; window/system control deferred |
| Task manager | **Added this phase** | priorities, due dates, completion |
| Smart notes | **Partial** | notes + search exist; categories deferred |
| Research mode | **Added this phase** | multi-query research with sources |
| Document intelligence (PDF/DOCX/XLSX) | **Missing** | deferred: adds parsing deps, needs its own test pass |
| Multi-model selection | **Partial** | model per request already configurable; UI deferred |
| Workflow automation / briefings | **Missing** | architecture ready (tools + scheduler) |

## 3. Response quality (the core request)

A free-tier model cannot be turned into a frontier model by prompting. What *can* be improved,
and what was implemented:

1. **Adaptive depth** — the persona now decides between a one-line answer, a technical
   explanation, a structured comparison or a discussion, based on the question.
2. **Situation brief** — mode detection (casual / technical / educational / serious / debate),
   topic tracking and follow-up awareness are computed locally per turn and injected, so the
   model does not re-ask what it already knows.
3. **Reasoning discipline** — the persona instructs: identify the real intent, surface
   constraints, consider one alternative, check for contradiction, then answer. Conclusions
   and evidence only; no private chain-of-thought is exposed.
4. **Debate quality** — central argument, assumptions, strongest counterpoint, willingness to
   change position, and an explicit ban on manufacturing arguments to look clever.
5. **Retrieval quality** — related memories are pulled in via embedding similarity, so the model
   sees connected context rather than isolated facts.
6. **Model routing** — existing fallback chain retained; a per-task model setting is a small
   follow-up (`modelName` is already stored and read per request).

## 4. Costs / limits

| Component | Free allowance | Cost if exceeded |
|---|---|---|
| Gemini chat (`gemini-3.5-flash-lite` / `2.5-flash`) | free tier on the project key | per-token billing |
| Gemini embeddings `gemini-embedding-001` | free tier | negligible per 1k memories |
| Edge neural TTS | free, no key (unofficial endpoint) | n/a — falls back to Gemini/system |
| Gemini TTS fallback | key quota | per-character |
| `systeminformation` (local) | free | none |

No paid API was added.

## 5. Phased plan

**Phase 1 — intelligence (this change)**
- situation brief + mode detection, persona reasoning/debate/adaptive-depth, related-memory
  retrieval, tests.

**Phase 2 — desktop intelligence (this change, partial)**
- system health monitor (read-only, no permissions).
- coding workspace stays read-only: folder search + dashboard output; file mutation is deferred.

**Phase 3 — productivity (this change, partial)**
- task manager with priorities and due dates.
- notes categories deferred.

**Phase 4 — research / documents (this change, partial)**
- research mode with multiple queries and source dedupe.
- document parsing deferred (PDF/DOCX/XLSX need parser dependencies and a dedicated test pass).

**Phase 5 — deferred by design**
- screen understanding, desktop control, destructive file operations: each needs an explicit
  consent UI and a privacy review; shipping them unreviewed would violate the privacy rules in
  the brief.
- multi-model UI, workflow automation, daily briefings: the service layout already supports them.

## 6. Decisions taken autonomously

- No new paid provider. Edge TTS remains primary.
- No screenshot/recording capability until an on-screen indicator and a disabled-by-default
  toggle exist.
- No file mutation tools until a propose-diff → approve → apply flow exists.
- `systeminformation` chosen over WMI/PowerShell polling: pure JS, no native build, one dependency.
