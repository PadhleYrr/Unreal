# ⚡ UNREAL — Ultimate AI System

> Vision. Voice. Automation. Code. All in one.

The combined best of three projects — computer vision from AhhhShyt, voice pipeline from SAGAR-TAMANG/FRIDAY, and automation capabilities from danyQe/FRIDAY — merged into a single unstoppable system.

---

## 🏆 What Makes UNREAL Different

| Feature | AhhhShyt | danyQe/FRIDAY | SAGAR FRIDAY | ⚡ UNREAL |
|---|:---:|:---:|:---:|:---:|
| Face Detection (MediaPipe) | ✅ | ❌ | ❌ | ✅ |
| Face Recognition (enroll/name) | ✅ | ❌ | ❌ | ✅ |
| Emotion Detection | ✅ | ✅ | ❌ | ✅ |
| Age & Gender Estimation | ✅ | ✅ | ❌ | ✅ |
| Pose / Body Tracking | ✅ | ❌ | ❌ | ✅ |
| Hand Landmark Tracking | ✅ | ❌ | ❌ | ✅ |
| Hand Gesture Commands (8) | ✅ | ❌ | ❌ | ✅ |
| Snapshot Capture + Export | ✅ | ❌ | ❌ | ✅ |
| Indian-English STT (Sarvam) | ❌ | ❌ | ✅ | ✅ |
| Real-time Voice (LiveKit) | ❌ | ❌ | ✅ | ✅ |
| Premium TTS (OpenAI nova) | ❌ | ❌ | ✅ | ✅ |
| Gemini 2.5 Flash LLM | ❌ | ❌ | ✅ | ✅ |
| Modular MCP Tool Server | ❌ | ❌ | ✅ | ✅ |
| Web Scraping (Selenium + BS4) | ❌ | ✅ | ❌ | ✅ |
| PDF Summarisation | ❌ | ✅ | ❌ | ✅ |
| YouTube Summarisation | ❌ | ✅ | ❌ | ✅ |
| WhatsApp Message + Call | ❌ | ✅ | ❌ | ✅ |
| Spotify Control | ❌ | ✅ | ❌ | ✅ |
| Python Code Execution | ❌ | ✅ | ❌ | ✅ |
| Multi-language Code Writing | ❌ | ✅ | ❌ | ✅ |
| GUI Automation (PyAutoGUI) | ❌ | ✅ | ❌ | ✅ |
| System Commands (shutdown etc.) | ❌ | ✅ | ❌ | ✅ |
| Translation (40+ languages) | ❌ | ✅ | ❌ | ✅ |
| World News Feed | ❌ | ❌ | ✅ | ✅ |
| System Info | ❌ | ❌ | ✅ | ✅ |
| Runs fully in browser | ✅ | ❌ | ❌ | ✅ |
| Mobile app (Capacitor) | ✅ | ❌ | ❌ | ✅ |
| MongoDB face persistence | ✅ | ❌ | ❌ | ✅ |
| CI/CD (GitHub Actions) | ✅ | ❌ | ❌ | ✅ |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  BROWSER (Frontend)                     │
│  index.html + app.js                                    │
│  MediaPipe FaceMesh / Pose / Hands  ←── Vision layer   │
│  face-api.js (recognize, emotion, age/gender)           │
│  Web Speech API (STT fallback)                          │
│  8 hand gesture → command mappings                      │
└──────────────────┬──────────────────────────────────────┘
                   │ REST / WebSocket
┌──────────────────▼──────────────────────────────────────┐
│                NODE.JS SERVER (server.js)               │
│  Express + MongoDB  ←── face storage, snapshots, logs   │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼───────┐   ┌─────────▼─────────────────────────┐
│  LiveKit Room │   │  PYTHON MCP SERVER (server.py)    │
│  Voice Agent  │   │  FastMCP over SSE (:8000)         │
│  (agent_      │   │  Tools registered:                │
│   unreal.py)  │   │  • web_scrape / search_web        │
│               │   │  • summarise_pdf / youtube         │
│  STT: Sarvam  │   │  • play_music / play_youtube      │
│  LLM: Gemini  │◄──│  • send_whatsapp / call_whatsapp  │
│  TTS: OpenAI  │   │  • execute_code / write_program   │
│               │   │  • control_gui / open_application │
└───────────────┘   │  • translate / get_datetime       │
                    │  • shutdown / restart / sleep      │
                    │  • get_world_news / get_system_info│
                    └───────────────────────────────────┘
                                    │
                    ┌───────────────▼──────────────────┐
                    │            STORAGE               │
                    │  MongoDB  │  IndexedDB  │ Files  │
                    └──────────────────────────────────┘
```

---

## 📁 Project Structure

```
UNREAL/
├── index.html              ← Vision UI (browser, no install needed)
├── app.js                  ← MediaPipe + face-api + gesture + voice logic
├── server.js               ← Node.js + Express + MongoDB face API
├── package.json
│
├── server.py               ← FastMCP server entry point (uv run unreal_server)
├── agent_unreal.py         ← LiveKit voice agent (uv run unreal_voice)
├── pyproject.toml
│
├── unreal/
│   ├── config.py           ← All env vars
│   ├── tools/
│   │   ├── __init__.py     ← Registers all tools
│   │   └── automation.py   ← All 20+ MCP tools
│   ├── prompts/__init__.py ← summarise, explain_code, write_code
│   └── resources/__init__.py
│
├── programs/               ← Generated code files saved here
├── documents/              ← PDFs go here for summarisation
├── photos/                 ← Face photo database
│
├── .env.example
├── .gitignore
└── .github/workflows/
    └── deploy.yml          ← Auto deploy on push to main
```

---

## ✋ Hand Gesture Commands

| Gesture | Action |
|---|---|
| ✌️ Peace | Face Detection ON/OFF |
| 👍 Thumbs Up | Face Recognition |
| 👎 Thumbs Down | Stop All |
| ✋ Open Palm | Pause / Resume |
| 👊 Fist | Clear Display |
| ☝️ Point | Pose Tracking |
| 🤙 Call Me | Toggle Voice |
| 🤏 Pinch | Capture Snapshot |

---

## 🎙️ Voice Commands

```
Vision
  "start face detection"         → FaceMesh ON
  "recognize" / "who is this"    → face recognition
  "emotion"                      → emotion detection
  "age gender"                   → age & gender
  "pose" / "track hands"         → body/hand tracking
  "capture" / "snapshot"         → save to IndexedDB
  "save face as [name]"          → enroll person
  "forget [name]"                → remove from DB

Automation (via voice agent)
  "search [query]"               → web scrape
  "summarise [url/filename]"     → PDF or YouTube summary
  "play [song] on spotify"       → Spotify control
  "play [video] on youtube"      → YouTube playback
  "send whatsapp to [contact]"   → WhatsApp message
  "call [contact] on whatsapp"   → WhatsApp voice call
  "translate [text] to [lang]"   → translate any text
  "news today"                   → world headlines
  "write a python script for…"   → code generation
  "execute code"                 → run last written code
  "shutdown" / "restart"         → system power commands
  "stop" / "pause" / "clear"     → control
```

---

## 🚀 Quick Start

### Prerequisites
- Python ≥ 3.11
- Node.js ≥ 20
- [`uv`](https://github.com/astral-sh/uv) — `pip install uv`
- Windows (for PyAutoGUI, WhatsApp desktop, Spotify)
- LiveKit Cloud account (free tier works)

### Setup

```bash
# 1. Clone
git clone https://github.com/your-username/UNREAL.git
cd UNREAL

# 2. Python deps
uv sync

# 3. Node deps
npm install

# 4. Environment
cp .env.example .env
# Fill in your API keys
```

### Run (3 terminals)

```bash
# Terminal 1 — MCP Tool Server
uv run unreal_server

# Terminal 2 — Voice Agent
uv run unreal_voice

# Terminal 3 — Frontend
npm start
```

Open `http://localhost:3000` → allow camera + mic → **UNREAL is live.**

For vision-only (no Python needed), just open `index.html` directly in Chrome/Edge.

---

## 🔑 Environment Variables

| Variable | Purpose |
|---|---|
| `GOOGLE_API_KEY` | Gemini 2.5 Flash LLM |
| `OPENAI_API_KEY` | TTS (nova voice) |
| `SARVAM_API_KEY` | Indian-English STT |
| `LIVEKIT_URL` | Real-time voice room |
| `LIVEKIT_API_KEY` | LiveKit auth |
| `LIVEKIT_API_SECRET` | LiveKit auth |
| `MONGODB_URI` | Face + log persistence |
| `SUPABASE_URL` | Ticketing (optional) |
| `SUPABASE_API_KEY` | Supabase auth (optional) |

---

## 🛠️ Tech Stack

**Vision Layer** — MediaPipe FaceMesh, Pose, Hands · face-api.js · Web Speech API · Capacitor

**Voice Layer** — LiveKit Agents · Sarvam Saaras v3 (STT) · Gemini 2.5 Flash (LLM) · OpenAI TTS nova

**Automation Layer** — FastMCP · PyAutoGUI · Selenium + BeautifulSoup · PyPDF2 · youtube-transcript-api · pywhatkit · deep-translator · google-genai

**Infrastructure** — Node.js + Express · MongoDB · GitHub Actions · Render + Vercel · uv

---

## 🔗 Built From

| Project | Contribution |
|---|---|
| [AhhhShyt](https://github.com/PadhleYrr/AhhhShyt) | Vision layer — face, pose, hands, gestures, mobile, CI/CD |
| [danyQe/FRIDAY](https://github.com/danyQe/FRIDAY) | Automation — scraping, PDF, YouTube, WhatsApp, code exec, GUI |
| [SAGAR-TAMANG/FRIDAY](https://github.com/SAGAR-TAMANG/friday-tony-stark-demo) | Voice pipeline — LiveKit, Sarvam, Gemini 2.5, OpenAI TTS, MCP |

---

*UNREAL — not just an assistant. A system.*
