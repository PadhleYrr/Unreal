# UNREAL — Complete Deploy Guide
## GitHub + Render + GitHub Pages + Android APK

Everything deploys from **one GitHub push**. No CLI. No local builds.

---

## Step 1 — Push to GitHub

1. Go to **github.com** → New repository → name it `UNREAL` → Create
2. Open terminal in the UNREAL folder:
```bash
git init
git add .
git commit -m "UNREAL initial commit"
git remote add origin https://github.com/YOUR_USERNAME/UNREAL.git
git push -u origin main
```

---

## Step 2 — Get all your API keys

| Key | Where | Time |
|---|---|---|
| `GOOGLE_API_KEY` | aistudio.google.com → Get API Key | 1 min |
| `SARVAM_API_KEY` | dashboard.sarvam.ai → API Keys | 1 min |
| `LIVEKIT_URL` | cloud.livekit.io → New Project → Settings → Keys | 1 min |
| `LIVEKIT_API_KEY` | Same LiveKit page | — |
| `LIVEKIT_API_SECRET` | Same LiveKit page | — |
| `MONGODB_URI` | cloud.mongodb.com → Free M0 cluster → Connect | 2 min |

---

## Step 3 — Deploy backend to Render

1. Go to **render.com** → Sign up with GitHub
2. Click **New → Blueprint**
3. Connect your `UNREAL` GitHub repo
4. Render reads `render.yaml` and creates **3 services automatically**:
   - `unreal-node` — Node.js face API (Web Service)
   - `unreal-mcp` — Python MCP tool server (Web Service)
   - `unreal-voice-agent` — Voice agent (Background Worker)
5. For each service, go to **Environment** tab and add these keys:

**unreal-node:**
```
MONGODB_URI = your_mongodb_uri
PORT = 3000
```

**unreal-mcp:**
```
GOOGLE_API_KEY = your_key
SARVAM_API_KEY = your_key
```

**unreal-voice-agent:**
```
GOOGLE_API_KEY  = your_key
SARVAM_API_KEY  = your_key
LIVEKIT_URL     = wss://your-project.livekit.cloud
LIVEKIT_API_KEY = your_key
LIVEKIT_API_SECRET = your_key
MCP_SERVER_URL  = https://unreal-mcp.onrender.com/sse
```

> After `unreal-mcp` deploys, copy its URL from the Render dashboard
> and paste it as `MCP_SERVER_URL` in the voice agent service.

6. Click **Deploy** — all 3 services go live

---

## Step 4 — Enable GitHub Pages (frontend)

1. Go to your GitHub repo → **Settings → Pages**
2. Under **Source** → select **GitHub Actions**
3. Push any change to `main` (or re-run the workflow)
4. Your frontend will be live at:
   `https://YOUR_USERNAME.github.io/UNREAL`

### Add GitHub Secret for the MCP URL:
1. Repo → **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `RENDER_MCP_URL`
4. Value: `https://unreal-mcp.onrender.com/sse`

---

## Step 5 — Get your Android APK

1. Go to your GitHub repo → **Actions** tab
2. Click **Build Android APK** → latest run
3. Scroll down to **Artifacts** → click **UNREAL-debug-APK**
4. Download and install the APK on your phone

> Enable "Install from unknown sources" in Android settings first.

---

## What auto-deploys on every push

| What | Where | Trigger |
|---|---|---|
| Frontend | GitHub Pages | push to main |
| Node face API | Render | push to main |
| MCP tool server | Render | push to main |
| Voice agent | Render (Background Worker) | push to main |
| Android APK | GitHub Actions artifact | push to main |

---

## Final URLs

After everything is deployed you'll have:

```
Frontend:    https://YOUR_USERNAME.github.io/UNREAL
Node API:    https://unreal-node.onrender.com
MCP Server:  https://unreal-mcp.onrender.com
Voice Agent: running on Render background worker (no URL — connects to LiveKit)
APK:         download from GitHub Actions → Artifacts
```

---

## Render free tier note

Render free web services **sleep after 15 minutes** of no traffic.
The Background Worker (voice agent) **never sleeps**.

To keep the MCP server awake, add this URL to a free uptime monitor:
- **uptimerobot.com** → New Monitor → HTTP → paste `https://unreal-mcp.onrender.com`
- Pings every 5 minutes → keeps it awake forever, free

