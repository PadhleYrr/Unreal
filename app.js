/**
 * UNREAL — app.js  (fully rebuilt)
 * FIX 1: Camera uses video-only — audio:false — so mic stays free for Web Speech API
 * FIX 2: Real action execution engine — opens apps, plays music, searches, etc.
 * FIX 3: Groq key read lazily via getGroqKey() — no parse-time race
 * FIX 4: Voice + camera work simultaneously
 */

// ── Config (lazy read — no parse-time race) ───────────────────────────────
function getGroqKey() {
  if (typeof UNREAL_CONFIG !== "undefined" && UNREAL_CONFIG.GROQ_API_KEY &&
      UNREAL_CONFIG.GROQ_API_KEY.trim() !== "" &&
      UNREAL_CONFIG.GROQ_API_KEY !== "your_groq_api_key_here")
    return UNREAL_CONFIG.GROQ_API_KEY.trim();
  return "";
}
const GROQ_MODEL = "llama-3.3-70b-versatile";
const MCP_BASE = (typeof UNREAL_CONFIG !== "undefined" && UNREAL_CONFIG.RENDER_NODE_URL)
  ? UNREAL_CONFIG.RENDER_NODE_URL
  : (typeof location !== "undefined" && location.hostname === "localhost" ? "http://localhost:3000" : "");

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  modules: { face: false, recog: false, emotion: false, agegend: false, pose: false, hands: false },
  paused: false,
  voiceOn: false,
  modelsLoaded: false,
  knownFaces: [],
  snapshots: [],
  lastGesture: null,
  gestureDebounce: 0,
  chatHistory: [],
  speaking: false,
};

// ── DOM refs ──────────────────────────────────────────────────────────────
const video    = document.getElementById("videoEl");
const canvas   = document.getElementById("canvasEl");
const ctx      = canvas.getContext("2d");
const dotFace  = document.getElementById("dot-face");
const dotPose  = document.getElementById("dot-pose");
const dotHands = document.getElementById("dot-hands");
const dotVoice = document.getElementById("dot-voice");
const dotModels= document.getElementById("dot-models");
const emotionChip = document.getElementById("emotion-chip");
const gestureChip = document.getElementById("gesture-chip");
const poseChip    = document.getElementById("pose-chip");
const personChip  = document.getElementById("person-chip");

// ── Logging ───────────────────────────────────────────────────────────────
function log(msg, type = "info") {
  const el  = document.getElementById("log");
  const div = document.createElement("div");
  div.className = `log-line ${type}`;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  if (el.children.length > 200) el.removeChild(el.firstChild);
}

// ── Chat display ──────────────────────────────────────────────────────────
function addChatBubble(text, role) {
  const feed = document.getElementById("chat-feed");
  if (!feed) return;
  const row = document.createElement("div");
  row.className = `chat-row ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
  if (feed.children.length > 60) feed.removeChild(feed.firstChild);
}

// ── Config check ──────────────────────────────────────────────────────────
function checkConfig() {
  if (!getGroqKey()) {
    log("⚠ Open config.js and paste your GROQ_API_KEY to enable AI.", "warn");
  } else {
    log("Groq AI ready ✓", "info");
  }
}

// ── Camera — VIDEO ONLY, no audio (keeps mic free for Speech API) ─────────
async function startCamera() {
  try {
    // CRITICAL FIX: audio: false — so the browser mic stays available for Web Speech API
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      log("Camera online.");
    };
  } catch (e) {
    log("Camera access denied: " + e.message, "error");
  }
}

// ── face-api models ───────────────────────────────────────────────────────
const MODEL_URL = "https://vladmandic.github.io/face-api/model";

async function loadModels() {
  log("Loading vision models…", "warn");
  try {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    ]);
    state.modelsLoaded = true;
    dotModels.classList.add("on");
    log("Vision models ready.", "info");
    await loadSavedFaces();
  } catch (e) {
    log("Model load failed: " + e.message, "error");
  }
}

async function loadSavedFaces() {
  try {
    const res  = await fetch(MCP_BASE + "/api/faces");
    const data = await res.json();
    state.knownFaces = data.map(f => ({
      name: f.name,
      descriptor: new Float32Array(Object.values(f.descriptor)),
    }));
    log(`Loaded ${state.knownFaces.length} known face(s).`);
  } catch {
    log("Running without face DB (offline mode).", "warn");
  }
}

// ── Module toggle ─────────────────────────────────────────────────────────
function toggleModule(mod) {
  state.modules[mod] = !state.modules[mod];
  const btn = document.getElementById(`btn-${mod}`);
  if (btn) btn.classList.toggle("active", state.modules[mod]);
  if (["face","recog","emotion","agegend"].includes(mod))
    dotFace.classList.toggle("on", state.modules.face || state.modules.recog || state.modules.emotion || state.modules.agegend);
  if (mod === "pose")  dotPose.classList.toggle("on", state.modules.pose);
  if (mod === "hands") dotHands.classList.toggle("on", state.modules.hands);
  log(`${mod} ${state.modules[mod] ? "ON" : "OFF"}.`);
}

function stopAll() {
  Object.keys(state.modules).forEach(m => { state.modules[m] = false; });
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
  [dotFace, dotPose, dotHands].forEach(d => d.classList.remove("on"));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  log("All modules stopped.");
}

function clearAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  emotionChip.textContent = "— emotion";
  gestureChip.textContent = "— gesture";
  poseChip.textContent    = "— pose";
  personChip.textContent  = "— person";
}

// ── Face Enrollment ───────────────────────────────────────────────────────
async function enrollFace() {
  const name = document.getElementById("enrollName").value.trim();
  if (!name) return log("Enter a name first.", "warn");
  if (!state.modelsLoaded) return log("Models not loaded yet.", "warn");
  try {
    const det = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks().withFaceDescriptor();
    if (!det) return log("No face detected.", "warn");
    const descriptor = Array.from(det.descriptor);
    state.knownFaces.push({ name, descriptor: new Float32Array(descriptor) });
    await fetch(MCP_BASE + "/api/faces", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, descriptor }),
    });
    log(`Face enrolled: ${name}`, "info");
  } catch (e) { log("Enrollment error: " + e.message, "error"); }
}

async function forgetFace() {
  const name = document.getElementById("enrollName").value.trim();
  if (!name) return log("Enter a name to forget.", "warn");
  state.knownFaces = state.knownFaces.filter(f => f.name !== name);
  try { await fetch(MCP_BASE + `/api/faces/${encodeURIComponent(name)}`, { method: "DELETE" }); } catch {}
  log(`Forgot face: ${name}`);
}

// ── Snapshot ──────────────────────────────────────────────────────────────
function captureSnapshot() {
  const snap = document.createElement("canvas");
  snap.width = video.videoWidth; snap.height = video.videoHeight;
  snap.getContext("2d").drawImage(video, 0, 0);
  const dataURL = snap.toDataURL("image/png");
  state.snapshots.push({ ts: Date.now(), data: dataURL });
  log(`Snapshot saved (${state.snapshots.length} total).`);
}

function downloadSnapshots() {
  state.snapshots.forEach((s, i) => {
    const a = document.createElement("a");
    a.href = s.data; a.download = `unreal_snap_${i+1}.png`; a.click();
  });
}

function exportData() {
  const logs = Array.from(document.getElementById("log").children).map(l => l.textContent).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([logs], { type: "text/plain" }));
  a.download = "unreal_log.txt"; a.click();
}

// ── TTS ───────────────────────────────────────────────────────────────────
function speak(text) {
  if (!text) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "en-IN"; utt.rate = 1.05; utt.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const pref = voices.find(v => v.lang === "en-IN") || voices.find(v => v.lang.startsWith("en"));
  if (pref) utt.voice = pref;
  state.speaking = true;
  utt.onend = utt.onerror = () => { state.speaking = false; };
  window.speechSynthesis.speak(utt);
  log(`UNREAL: "${text.slice(0, 90)}${text.length > 90 ? "…" : ""}"`, "info");
}

// ══════════════════════════════════════════════════════════════════════════
// ── ACTION ENGINE — actually executes commands like a real assistant ──────
// ══════════════════════════════════════════════════════════════════════════

function executeAction(cmd) {
  const c = cmd.toLowerCase().trim();

  // ── YouTube Music / Spotify / Music ──────────────────────────────────
  if (c.includes("play") && (c.includes("youtube music") || c.includes("yt music"))) {
    const query = c.replace(/play|on youtube music|on yt music/gi, "").trim();
    window.open(`https://music.youtube.com/search?q=${encodeURIComponent(query)}`, "_blank");
    return `Searching YouTube Music for "${query}", boss.`;
  }
  if (c.includes("play") && c.includes("spotify")) {
    const query = c.replace(/play|on spotify/gi, "").trim();
    window.open(`https://open.spotify.com/search/${encodeURIComponent(query)}`, "_blank");
    return `Opening Spotify for "${query}", boss.`;
  }
  if (c.includes("play") && (c.includes("youtube") || c.includes("video"))) {
    const query = c.replace(/play|on youtube|video/gi, "").trim();
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, "_blank");
    return `Searching YouTube for "${query}", boss.`;
  }
  if (c.match(/^play\s+.+/) && !c.includes("open")) {
    const query = c.replace(/^play\s+/, "").trim();
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, "_blank");
    return `Searching YouTube for "${query}", boss.`;
  }

  // ── Open apps / websites ──────────────────────────────────────────────
  const appMap = {
    "youtube":       "https://www.youtube.com",
    "youtube music": "https://music.youtube.com",
    "instagram":     "https://www.instagram.com",
    "facebook":      "https://www.facebook.com",
    "twitter":       "https://www.twitter.com",
    "x":             "https://www.x.com",
    "whatsapp":      "https://web.whatsapp.com",
    "telegram":      "https://web.telegram.org",
    "gmail":         "https://mail.google.com",
    "google mail":   "https://mail.google.com",
    "google maps":   "https://maps.google.com",
    "maps":          "https://maps.google.com",
    "google":        "https://www.google.com",
    "amazon":        "https://www.amazon.in",
    "flipkart":      "https://www.flipkart.com",
    "netflix":       "https://www.netflix.com",
    "github":        "https://www.github.com",
    "reddit":        "https://www.reddit.com",
    "spotify":       "https://open.spotify.com",
    "wikipedia":     "https://www.wikipedia.org",
    "chatgpt":       "https://chat.openai.com",
    "calculator":    "https://www.google.com/search?q=calculator",
    "weather":       "https://www.google.com/search?q=weather+today",
    "news":          "https://news.google.com",
    "translate":     "https://translate.google.com",
    "drive":         "https://drive.google.com",
    "docs":          "https://docs.google.com",
    "sheets":        "https://sheets.google.com",
    "meet":          "https://meet.google.com",
    "zoom":          "https://zoom.us",
  };
  if (c.startsWith("open ") || c.startsWith("launch ") || c.startsWith("go to ")) {
    const target = c.replace(/^(open|launch|go to)\s+/, "").trim();
    for (const [key, url] of Object.entries(appMap)) {
      if (target.includes(key)) {
        window.open(url, "_blank");
        return `Opening ${key}, boss.`;
      }
    }
    // Generic URL or search
    if (target.includes(".com") || target.includes(".in") || target.includes(".org")) {
      window.open(`https://${target.replace(/^https?:\/\//, "")}`, "_blank");
      return `Opening ${target}, boss.`;
    }
    window.open(`https://www.google.com/search?q=${encodeURIComponent(target)}`, "_blank");
    return `Searching for ${target}, boss.`;
  }

  // ── Search ────────────────────────────────────────────────────────────
  if (c.startsWith("search ") || c.startsWith("google ") || c.startsWith("look up ")) {
    const query = c.replace(/^(search|google|look up)\s+/, "").trim();
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank");
    return `Searching for "${query}", boss.`;
  }
  if (c.startsWith("search youtube ") || c.startsWith("youtube search ")) {
    const query = c.replace(/^(search youtube|youtube search)\s+/, "").trim();
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, "_blank");
    return `Searching YouTube for "${query}", boss.`;
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────
  if (c.includes("whatsapp") && (c.includes("send") || c.includes("message"))) {
    window.open("https://web.whatsapp.com", "_blank");
    return "Opening WhatsApp Web. You can send the message from there, boss.";
  }
  if (c.includes("whatsapp") && c.includes("call")) {
    window.open("https://web.whatsapp.com", "_blank");
    return "Opening WhatsApp Web for the call, boss.";
  }

  // ── Maps / Navigation ─────────────────────────────────────────────────
  if (c.includes("navigate to") || c.includes("directions to") || c.includes("take me to")) {
    const dest = c.replace(/navigate to|directions to|take me to/gi, "").trim();
    window.open(`https://maps.google.com/maps?q=${encodeURIComponent(dest)}`, "_blank");
    return `Opening navigation to ${dest}, boss.`;
  }
  if (c.includes("weather")) {
    const loc = c.replace(/weather|in|at|for|today|tomorrow/gi, "").trim();
    window.open(`https://www.google.com/search?q=weather+${encodeURIComponent(loc || "today")}`, "_blank");
    return `Pulling up weather${loc ? " for " + loc : ""}, boss.`;
  }

  // ── Timer / Alarm ─────────────────────────────────────────────────────
  const timerMatch = c.match(/set\s+(?:a\s+)?(?:timer|alarm)\s+(?:for\s+)?(\d+)\s*(second|minute|hour|min|sec|hr)/i);
  if (timerMatch) {
    const num = parseInt(timerMatch[1]);
    const unit = timerMatch[2].toLowerCase();
    let ms = num * 1000;
    if (unit.startsWith("min")) ms = num * 60000;
    if (unit.startsWith("hour") || unit === "hr") ms = num * 3600000;
    const label = `${num} ${unit}${num !== 1 ? "s" : ""}`;
    setTimeout(() => {
      speak(`Timer done, boss. ${label} is up.`);
      log(`⏰ Timer: ${label} complete.`, "warn");
    }, ms);
    return `Timer set for ${label}, boss.`;
  }

  // ── Time / Date ───────────────────────────────────────────────────────
  if (c.includes("what time") || c.includes("current time") || c === "time") {
    const t = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return `It's ${t}, boss.`;
  }
  if (c.includes("what date") || c.includes("today's date") || c === "date") {
    const d = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return `Today is ${d}, boss.`;
  }

  // ── Screenshot / Snapshot ─────────────────────────────────────────────
  if (c.includes("screenshot") || c.includes("capture") || c.includes("snapshot")) {
    captureSnapshot();
    return "Snapshot captured, boss.";
  }

  // ── Vision toggles via voice ──────────────────────────────────────────
  if (c.includes("face detection") || c.includes("start face")) { toggleModule("face"); return "Face detection toggled, boss."; }
  if (c.includes("recognize") || c.includes("who is this"))     { toggleModule("recog"); return "Face recognition toggled, boss."; }
  if (c.includes("emotion"))                                     { toggleModule("emotion"); return "Emotion detection toggled, boss."; }
  if (c.includes("age") && c.includes("gender"))                 { toggleModule("agegend"); return "Age and gender toggled, boss."; }
  if (c.includes("pose") || c.includes("body tracking"))         { toggleModule("pose"); return "Pose tracking toggled, boss."; }
  if (c.includes("hand tracking") || c.includes("track hands"))  { toggleModule("hands"); return "Hand tracking toggled, boss."; }
  if (c.includes("stop all"))  { stopAll(); return "All modules stopped, boss."; }
  if (c.includes("pause"))     { state.paused = true; return "Paused, boss."; }
  if (c.includes("resume"))    { state.paused = false; return "Resumed, boss."; }

  const saveMatch = c.match(/save face as (.+)/);
  if (saveMatch) { document.getElementById("enrollName").value = saveMatch[1]; enrollFace(); return `Saving face as ${saveMatch[1]}, boss.`; }
  const forgetMatch = c.match(/forget (.+)/);
  if (forgetMatch) { document.getElementById("enrollName").value = forgetMatch[1]; forgetFace(); return `Forgot ${forgetMatch[1]}, boss.`; }

  // ── Translate ─────────────────────────────────────────────────────────
  if (c.startsWith("translate ")) {
    const query = c.replace(/^translate\s+/, "");
    window.open(`https://translate.google.com/?text=${encodeURIComponent(query)}`, "_blank");
    return `Opening translation for "${query}", boss.`;
  }

  // ── News ──────────────────────────────────────────────────────────────
  if (c.includes("news") || c.includes("headlines")) {
    window.open("https://news.google.com", "_blank");
    return "Opening Google News, boss.";
  }

  return null; // nothing matched — send to Groq
}

// ── Main command router ───────────────────────────────────────────────────
async function handleCommand(cmd) {
  if (!cmd.trim()) return;
  addChatBubble(cmd, "user");

  const actionResult = executeAction(cmd);
  if (actionResult) {
    speak(actionResult);
    addChatBubble(actionResult, "ai");
    return;
  }

  // Fall through to Groq AI for everything else
  await askGroq(cmd);
}

// ── Groq AI ───────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are UNREAL — the most advanced AI assistant.
You combine real-time computer vision, voice, and automation.
Personality: calm, sharp, trusted operator. Like Jarvis.
Tone: concise. "On it, boss." Not "I will now proceed to execute your request."
Rules:
1. Keep spoken responses to 1-3 sentences. Plain spoken sentences only.
2. No bullet points, no markdown, no asterisks in your reply.
3. If asked to open an app or play something, say you're doing it (the system handles the actual action).
4. Greeting on first message: "UNREAL online. What do you need, boss?"`;

async function askGroq(userText) {
  const GROQ_API_KEY = getGroqKey();
  if (!GROQ_API_KEY) {
    const msg = "No API key configured, boss. Add your GROQ_API_KEY to config dot js.";
    speak(msg); addChatBubble(msg, "ai"); return;
  }

  // Show typing indicator
  const feed = document.getElementById("chat-feed");
  const typing = document.createElement("div");
  typing.className = "chat-row ai typing-row";
  typing.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
  if (feed) feed.appendChild(typing);

  state.chatHistory.push({ role: "user", content: userText });
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...state.chatHistory];

  try {
    const res  = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: 150, temperature: 0.7 }),
    });
    const data = await res.json();
    if (typing.parentNode) typing.parentNode.removeChild(typing);

    if (data.error) {
      const msg = "API error: " + data.error.message;
      log(msg, "error"); speak("Something went wrong, boss."); addChatBubble(msg, "ai");
      state.chatHistory.pop(); return;
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || "…";
    state.chatHistory.push({ role: "assistant", content: reply });
    if (state.chatHistory.length > 20) state.chatHistory.splice(0, 2);
    speak(reply);
    addChatBubble(reply, "ai");
  } catch (e) {
    if (typing.parentNode) typing.parentNode.removeChild(typing);
    log("Groq fetch error: " + e.message, "error");
    speak("Network issue, boss."); addChatBubble("Network issue, boss.", "ai");
    state.chatHistory.pop();
  }
}

// ── Text command ──────────────────────────────────────────────────────────
function sendCommand() {
  const input = document.getElementById("cmdInput");
  const cmd = input.value.trim();
  if (!cmd) return;
  log(`Command: "${cmd}"`, "user");
  handleCommand(cmd);
  input.value = "";
}

// ── Voice (Web Speech API) ────────────────────────────────────────────────
let recognition = null;

function toggleVoice() {
  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    return log("Web Speech API not supported in this browser.", "error");
  }
  if (state.voiceOn) {
    recognition?.stop();
    state.voiceOn = false;
    dotVoice.classList.remove("on");
    document.getElementById("voiceBtn").classList.remove("recording");
    log("Voice OFF.");
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.continuous     = true;
  recognition.interimResults = false;
  recognition.lang           = "en-IN";

  recognition.onresult = e => {
    const transcript = e.results[e.results.length - 1][0].transcript.trim();
    log(`Voice: "${transcript}"`, "user");
    if (!state.speaking) handleCommand(transcript);
  };
  recognition.onerror = e => {
    log("Speech error: " + e.error, "error");
    // Auto-restart on non-fatal errors
    if (e.error === "no-speech" && state.voiceOn) setTimeout(() => { try { recognition.start(); } catch {} }, 300);
  };
  recognition.onend = () => { if (state.voiceOn) { try { recognition.start(); } catch {} } };

  recognition.start();
  state.voiceOn = true;
  dotVoice.classList.add("on");
  document.getElementById("voiceBtn").classList.add("recording");
  log("Voice ON — listening…");

  if (state.chatHistory.length === 0) {
    askGroq("(system: first activation — greet the user in one short sentence)");
  }
}

// ── Gesture Detection ─────────────────────────────────────────────────────
function detectGesture(landmarks) {
  const tip = i => landmarks[i];
  const up  = i => tip(i).y < tip(i - 2).y;
  const index = up(8), middle = up(12), ring = up(16), pinky = up(20);
  const thumbUp   = tip(4).y < tip(2).y && !index && !middle && !ring && !pinky;
  const thumbDown = tip(4).y > tip(2).y && !index && !middle && !ring && !pinky;
  const peace     = index && middle && !ring && !pinky;
  const fist      = !index && !middle && !ring && !pinky;
  const openPalm  = index && middle && ring && pinky;
  const point     = index && !middle && !ring && !pinky;
  const callMe    = index && !middle && !ring && pinky;
  const pinchGes  = tip(4).y > tip(8).y - 0.04 && tip(4).y < tip(8).y + 0.04 && !middle && !ring && !pinky;
  if (thumbUp)   return "thumbs_up";
  if (thumbDown) return "thumbs_down";
  if (peace)     return "peace";
  if (openPalm)  return "open_palm";
  if (fist)      return "fist";
  if (point)     return "point";
  if (callMe)    return "call_me";
  if (pinchGes)  return "pinch";
  return null;
}

function handleGesture(gesture) {
  if (!gesture || gesture === state.lastGesture) return;
  const now = Date.now();
  if (now - state.gestureDebounce < 1500) return;
  state.gestureDebounce = now;
  state.lastGesture = gesture;
  gestureChip.textContent = gesture.replace("_", " ");
  log(`Gesture: ${gesture}`, "info");
  switch (gesture) {
    case "peace":      toggleModule("face"); break;
    case "thumbs_up":  toggleModule("recog"); break;
    case "thumbs_down": stopAll(); break;
    case "open_palm":  state.paused = !state.paused; log(state.paused ? "Paused." : "Resumed."); break;
    case "fist":       clearAll(); break;
    case "point":      toggleModule("pose"); break;
    case "call_me":    toggleVoice(); break;
    case "pinch":      captureSnapshot(); break;
  }
}

// ── MediaPipe ─────────────────────────────────────────────────────────────
let faceMesh, handsMP, poseMP;

function setupMediaPipe() {
  faceMesh = new FaceMesh({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
  faceMesh.setOptions({ maxNumFaces: 4, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  faceMesh.onResults(onFaceMeshResults);

  handsMP = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  handsMP.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
  handsMP.onResults(onHandsResults);

  poseMP = new Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
  poseMP.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  poseMP.onResults(onPoseResults);

  log("MediaPipe ready.");
}

function onFaceMeshResults(results) {
  if (!results.multiFaceLandmarks) return;
  if (state.modules.face) {
    results.multiFaceLandmarks.forEach(lm => {
      drawConnectors(ctx, lm, FACEMESH_TESSELATION, { color: "rgba(0,255,200,0.08)", lineWidth: 0.5 });
      drawConnectors(ctx, lm, FACEMESH_FACE_OVAL,   { color: "rgba(0,255,200,0.4)",  lineWidth: 1 });
    });
  }
}

function onHandsResults(results) {
  if (!results.multiHandLandmarks) return;
  results.multiHandLandmarks.forEach(lm => {
    if (state.modules.hands) {
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: "rgba(123,94,167,0.7)", lineWidth: 2 });
      drawLandmarks(ctx, lm, { color: "#7b5ea7", lineWidth: 1, radius: 3 });
    }
    handleGesture(detectGesture(lm));
  });
}

function onPoseResults(results) {
  if (!results.poseLandmarks || !state.modules.pose) return;
  drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: "rgba(255,170,0,0.6)", lineWidth: 2 });
  drawLandmarks(ctx, results.poseLandmarks, { color: "#ffaa00", lineWidth: 1, radius: 3 });
  poseChip.textContent = "pose active";
}

// ── face-api loop ─────────────────────────────────────────────────────────
async function runFaceApi() {
  if (!state.modelsLoaded || state.paused) return;
  const anyFaceMode = state.modules.face || state.modules.recog || state.modules.emotion || state.modules.agegend;
  if (!anyFaceMode) return;
  try {
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
    let task = faceapi.detectAllFaces(video, opts).withFaceLandmarks();
    if (state.modules.recog || state.modules.emotion || state.modules.agegend)
      task = task.withFaceDescriptors().withFaceExpressions().withAgeAndGender();
    const detections = await task;
    if (!detections.length) return;
    const dims = { width: video.videoWidth, height: video.videoHeight };
    const resized = faceapi.resizeResults(detections, dims);
    resized.forEach(det => {
      const { box } = det.detection;
      if (state.modules.face) {
        ctx.strokeStyle = "#00ffc8"; ctx.lineWidth = 1.5;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      }
      if (state.modules.recog && det.descriptor && state.knownFaces.length) {
        const matcher = new faceapi.FaceMatcher(
          state.knownFaces.map(f => new faceapi.LabeledFaceDescriptors(f.name, [f.descriptor]))
        );
        const match = matcher.findBestMatch(det.descriptor);
        const label = match.label !== "unknown" ? `${match.label} (${Math.round((1 - match.distance) * 100)}%)` : "unknown";
        personChip.textContent = label;
        ctx.fillStyle = "#00ffc8"; ctx.font = "12px monospace";
        ctx.fillText(label, box.x, box.y - 6);
      }
      if (state.modules.emotion && det.expressions) {
        const top = Object.entries(det.expressions).sort((a, b) => b[1] - a[1])[0];
        emotionChip.textContent = `${top[0]} ${(top[1] * 100).toFixed(0)}%`;
      }
      if (state.modules.agegend && det.age != null) {
        const tag = `${det.gender} ~${Math.round(det.age)}y`;
        ctx.fillStyle = "#7b5ea7"; ctx.font = "11px monospace";
        ctx.fillText(tag, box.x, box.y + box.height + 14);
      }
    });
  } catch {}
}

// ── Render loop ───────────────────────────────────────────────────────────
async function renderLoop() {
  if (!state.paused && video.readyState === 4) {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.modules.face || state.modules.recog || state.modules.emotion || state.modules.agegend)
      await faceMesh?.send({ image: video });
    if (state.modules.hands) await handsMP?.send({ image: video });
    if (state.modules.pose)  await poseMP?.send({ image: video });
    await runFaceApi();
  }
  requestAnimationFrame(renderLoop);
}

// ── Boot ──────────────────────────────────────────────────────────────────
(async () => {
  log("UNREAL booting…", "info");
  checkConfig();
  await startCamera();
  setupMediaPipe();
  const poll = setInterval(() => {
    if (typeof faceapi !== "undefined") { clearInterval(poll); loadModels(); }
  }, 500);
  renderLoop();
  log("System ready. All modules standby.", "info");
})();
