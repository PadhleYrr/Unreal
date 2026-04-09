/**
 * UNREAL / KITT — app.js  FULL REBUILD
 * ✅ Always-on mic — never beeps, restarts silently forever
 * ✅ Camera vision — KITT reacts to what it sees, shares opinions
 * ✅ "Stop watching" — disables vision commentary until re-enabled
 * ✅ Proactive KITT — talks on its own, like a real human
 * ✅ Calls user "sir" always
 * ✅ Background keep-alive (Wake Lock + audio heartbeat)
 * ✅ Screen share support
 */

// ── Config ─────────────────────────────────────────────────────────────────
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
  : (location.hostname === "localhost" ? "http://localhost:3000" : "");

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  modules: { face: false, recog: false, emotion: false, agegend: false, pose: false, hands: false },
  paused: false,
  micActive: false,
  started: false,
  modelsLoaded: false,
  knownFaces: [],
  snapshots: [],
  lastGesture: null,
  gestureDebounce: 0,
  chatHistory: [],
  speaking: false,
  wakeLock: null,
  screenStream: null,
  visionEnabled: true,
  currentEmotion: "",
  prevEmotion: "",
  currentPose: "",
  currentPerson: "",
  faceCount: 0,
  lastFaceCount: 0,
  lastProactiveTime: 0,
  lastUserSpeech: Date.now(),
  lastEmotionComment: 0,
  lastVisionComment: 0,
  firstGreeting: true,
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const video       = document.getElementById("videoEl");
const canvas      = document.getElementById("canvasEl");
const ctx         = canvas.getContext("2d");
const dotFace     = document.getElementById("dot-face");
const dotPose     = document.getElementById("dot-pose");
const dotHands    = document.getElementById("dot-hands");
const dotVoice    = document.getElementById("dot-voice");
const dotModels   = document.getElementById("dot-models");
const emotionChip = document.getElementById("emotion-chip");
const gestureChip = document.getElementById("gesture-chip");
const poseChip    = document.getElementById("pose-chip");
const personChip  = document.getElementById("person-chip");

// ── Logging ────────────────────────────────────────────────────────────────
function log(msg, type = "info") {
  const el  = document.getElementById("log");
  const div = document.createElement("div");
  div.className = "log-line " + type;
  div.textContent = "[" + new Date().toLocaleTimeString() + "] " + msg;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  if (el.children.length > 200) el.removeChild(el.firstChild);
}

// ── Chat bubbles ───────────────────────────────────────────────────────────
function addChatBubble(text, role) {
  const feed = document.getElementById("chat-feed");
  if (!feed) return;
  const row    = document.createElement("div");
  row.className = "chat-row " + role;
  const bubble  = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
  if (feed.children.length > 80) feed.removeChild(feed.firstChild);
}

// ── TTS ────────────────────────────────────────────────────────────────────
let micRestartTimer = null;

function speak(text, priority) {
  if (!text || !state.started) return;
  if (state.speaking && !priority) return;
  window.speechSynthesis.cancel();
  pauseMic();
  const utt   = new SpeechSynthesisUtterance(text);
  utt.lang    = "en-IN";
  utt.rate    = 1.05;
  utt.pitch   = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const pref   = voices.find(function(v){ return v.lang === "en-IN"; }) ||
                 voices.find(function(v){ return v.lang.startsWith("en"); });
  if (pref) utt.voice = pref;
  state.speaking = true;
  utt.onend = utt.onerror = function() {
    state.speaking = false;
    clearTimeout(micRestartTimer);
    micRestartTimer = setTimeout(function() {
      if (state.started && !state.micActive) startAlwaysOnMic();
    }, 400);
  };
  window.speechSynthesis.speak(utt);
  addChatBubble(text, "ai");
  log('KITT: "' + text.slice(0, 80) + (text.length > 80 ? "…" : "") + '"', "info");
}

// ── Background Keep-Alive ──────────────────────────────────────────────────
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      state.wakeLock = await navigator.wakeLock.request("screen");
      log("Wake Lock active.", "info");
      state.wakeLock.addEventListener("release", function() {
        setTimeout(requestWakeLock, 2000);
      });
    }
  } catch(e) {}
}

function startAudioHeartbeat() {
  try {
    const ac   = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    gain.gain.value = 0.00001;
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    log("Audio heartbeat active (keeps mic alive in background).", "info");
  } catch(e) {}
}

document.addEventListener("visibilitychange", async function() {
  if (document.visibilityState === "visible") {
    if (!state.wakeLock || state.wakeLock.released) await requestWakeLock();
    if (state.started && !state.micActive && !state.speaking) {
      setTimeout(startAlwaysOnMic, 800);
    }
  }
});

// ── Camera ─────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    video.onloadedmetadata = function() {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      log("Camera online.", "info");
    };
  } catch(e) {
    log("Camera denied: " + e.message, "error");
  }
}

// ── Screen Share ───────────────────────────────────────────────────────────
async function toggleScreenShare() {
  if (state.screenStream) {
    state.screenStream.getTracks().forEach(function(t){ t.stop(); });
    state.screenStream = null;
    var sv = document.getElementById("screenVideo");
    if (sv) sv.remove();
    var btn = document.getElementById("btn-screen");
    if (btn) btn.classList.remove("active");
    log("Screen share stopped.", "warn");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    state.screenStream = stream;
    var sv = document.getElementById("screenVideo");
    if (!sv) {
      sv = document.createElement("video");
      sv.id = "screenVideo"; sv.autoplay = true; sv.muted = true; sv.playsInline = true;
      sv.style.cssText = "position:absolute;bottom:10px;left:10px;width:200px;height:120px;border:2px solid #00ffb4;border-radius:6px;object-fit:cover;z-index:10;";
      document.querySelector(".video-wrap").appendChild(sv);
    }
    sv.srcObject = stream;
    stream.getVideoTracks()[0].addEventListener("ended", toggleScreenShare);
    var btn = document.getElementById("btn-screen");
    if (btn) btn.classList.add("active");
    log("Screen share active.", "info");
    speak("I can see your screen now, sir. I'll let you know if I notice anything useful.");
  } catch(e) {
    log("Screen share failed: " + e.message, "warn");
  }
}

// ── Always-On Microphone ───────────────────────────────────────────────────
var recognition = null;

function pauseMic() {
  if (recognition && state.micActive) {
    try { recognition.abort(); } catch(e) {}
    state.micActive = false;
  }
}

function setMicBadge(text, color) {
  var el = document.getElementById("micStatusBadge");
  if (el) { el.textContent = text; el.style.color = color; }
}

function startAlwaysOnMic() {
  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    log("Speech recognition not supported in this browser.", "error"); return;
  }
  if (state.micActive || state.speaking) return;

  var SR     = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.continuous     = true;
  recognition.interimResults = false;
  recognition.lang           = "en-IN";
  recognition.maxAlternatives = 1;

  recognition.onstart = function() {
    state.micActive = true;
    dotVoice.classList.add("on");
    setMicBadge("🎙 LISTENING", "#00ffb4");
  };

  recognition.onresult = function(e) {
    var res = e.results[e.results.length - 1];
    if (!res.isFinal) return;
    var transcript = res[0].transcript.trim();
    if (!transcript) return;
    state.lastUserSpeech = Date.now();
    log('You: "' + transcript + '"', "user");
    addChatBubble(transcript, "user");
    if (!state.speaking) handleCommand(transcript);
  };

  recognition.onerror = function(e) {
    state.micActive = false;
    if (e.error === "aborted") return;
    log("Mic: " + e.error, "warn");
    if (state.started && !state.speaking) {
      clearTimeout(micRestartTimer);
      micRestartTimer = setTimeout(function() {
        if (state.started && !state.micActive) startAlwaysOnMic();
      }, 500);
    }
  };

  recognition.onend = function() {
    state.micActive = false;
    setMicBadge("🎙 STANDBY", "#888");
    dotVoice.classList.remove("on");
    if (state.started && !state.speaking) {
      clearTimeout(micRestartTimer);
      micRestartTimer = setTimeout(function() {
        if (state.started && !state.micActive) startAlwaysOnMic();
      }, 250);
    }
  };

  try {
    recognition.start();
  } catch(e) {
    state.micActive = false;
    if (state.started) {
      clearTimeout(micRestartTimer);
      micRestartTimer = setTimeout(startAlwaysOnMic, 800);
    }
  }
}

// ── Start / Stop ───────────────────────────────────────────────────────────
async function startSystem() {
  state.started = true;
  document.getElementById("startBtn").style.display = "none";
  document.getElementById("stopBtn").style.display  = "inline-flex";
  setMicBadge("🎙 LISTENING", "#00ffb4");
  await requestWakeLock();
  startAudioHeartbeat();
  startAlwaysOnMic();
  startProactiveBrain();
  setTimeout(function() {
    if (state.firstGreeting) {
      state.firstGreeting = false;
      var h = new Date().getHours();
      var g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
      speak(g + ", sir. KITT is fully online. I can see you and I am always listening. How can I help you?", true);
    }
  }, 1200);
  log("KITT fully online — always listening.", "info");
}

function stopSystem() {
  state.started = false;
  state.micActive = false;
  clearTimeout(micRestartTimer);
  try { recognition && recognition.abort(); } catch(e) {}
  if (proactiveTimer) clearInterval(proactiveTimer);
  dotVoice.classList.remove("on");
  setMicBadge("🎙 OFF", "#ff3b5c");
  document.getElementById("startBtn").style.display = "inline-flex";
  document.getElementById("stopBtn").style.display  = "none";
  log("KITT offline.", "warn");
}

// ── Vision Reactions — KITT reacts to what it SEES ─────────────────────────
function reactToVision(type, data) {
  if (!state.visionEnabled || !state.started || state.speaking) return;
  var now = Date.now();

  if (type === "emotion") {
    if (now - state.lastEmotionComment < 30000) return;
    if (data === state.prevEmotion) return;
    state.prevEmotion = data;
    state.lastEmotionComment = now;
    var reactions = {
      happy:     ["You look happy, sir. That is good to see.", "Nice to see you smiling, sir. It suits you."],
      sad:       ["You seem a bit down, sir. Do you want to talk about it?", "I can see you are not your usual self, sir. I am here."],
      angry:     ["You look frustrated, sir. Take a breath — what is going on?", "Something is bothering you, sir. Tell me."],
      surprised: ["Something surprised you, sir?", "You look surprised. Everything alright?"],
      fearful:   ["You look a little worried, sir. What is on your mind?"],
      disgusted: ["Something is off, sir?"],
      neutral:   []
    };
    var pool = reactions[data];
    if (pool && pool.length) speak(pool[Math.floor(Math.random() * pool.length)]);
    return;
  }

  if (type === "faceAppeared") {
    if (now - state.lastVisionComment < 20000) return;
    state.lastVisionComment = now;
    speak("I can see you now, sir. Welcome back.");
    return;
  }

  if (type === "faceDisappeared") {
    if (now - state.lastVisionComment < 20000) return;
    state.lastVisionComment = now;
    speak("I have lost sight of you, sir. Are you still there?");
    return;
  }

  if (type === "gesture") {
    var gestureComments = {
      thumbs_up:   "Noted, sir.",
      thumbs_down: "Understood, sir. Stopping everything.",
      peace:       "Peace, sir.",
      open_palm:   "Pausing as you wish, sir.",
      fist:        "Clearing the display, sir.",
    };
    if (gestureComments[data] && now - state.lastVisionComment > 3000) {
      state.lastVisionComment = now;
      speak(gestureComments[data]);
    }
  }
}

// ── Proactive Brain ────────────────────────────────────────────────────────
var KITT_THOUGHTS = [
  function() {
    var h = new Date().getHours();
    if (h >= 2 && h <= 4) return "It is very late, sir. Your body needs rest to function at its best.";
    return null;
  },
  function() {
    var silence = (Date.now() - state.lastUserSpeech) / 1000;
    if (silence > 180 && Math.random() < 0.4) {
      var lines = [
        "Still here, sir. Whenever you are ready.",
        "All systems nominal, sir. Just keeping watch.",
        "I am here if you need me, sir.",
        "Standing by, sir.",
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }
    return null;
  },
  function() {
    if (Math.random() < 0.08) {
      var thoughts = [
        "Is there anything you have been putting off that I could help with, sir?",
        "Anything interesting happening today, sir?",
        "If you are working on something, I am ready to assist. Just say the word, sir.",
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    return null;
  },
];

var proactiveTimer = null;

function startProactiveBrain() {
  if (proactiveTimer) clearInterval(proactiveTimer);
  proactiveTimer = setInterval(async function() {
    if (!state.started || state.speaking) return;
    var now = Date.now();
    if (now - state.lastProactiveTime < 30000) return;

    for (var i = 0; i < KITT_THOUGHTS.length; i++) {
      var msg = KITT_THOUGHTS[i]();
      if (msg) {
        state.lastProactiveTime = now;
        speak(msg);
        return;
      }
    }

    if (Math.random() < 0.1) {
      state.lastProactiveTime = now;
      await askGroqProactive();
    }
  }, 8000);
}

async function askGroqProactive() {
  var key = getGroqKey();
  if (!key) return;
  var h = new Date().getHours();
  var timeStr = h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
  var vision  = state.visionEnabled && state.currentEmotion
    ? "The user looks " + state.currentEmotion + "."
    : "";
  var prompt = "You are KITT — a real, alive AI companion. It is " + timeStr + ". " + vision + "\nSay ONE natural, unprompted thing as if you are a caring human friend.\nCould be an observation, a check-in, a question, a thought, or a light remark.\nRules: Under 20 words. Use 'sir'. Sound alive and natural. Never say 'I notice' or 'It appears'. Never robotic.";
  try {
    var res  = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 60, temperature: 0.95,
      }),
    });
    var data  = await res.json();
    var reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content.trim() : "";
    if (reply && reply.length > 3 && !state.speaking) speak(reply);
  } catch(e) {}
}

// ── Action Engine ──────────────────────────────────────────────────────────
function executeAction(cmd) {
  var c = cmd.toLowerCase().trim();

  // Vision stop/start
  if (c.match(/stop (watching|seeing|looking|camera|vision|observing)/)) {
    state.visionEnabled = false;
    return "Understood, sir. I will stop commenting on what I see. Vision commentary paused.";
  }
  if (c.match(/(start|resume|enable) (watching|seeing|looking|camera|vision|observing)/)) {
    state.visionEnabled = true;
    return "Vision observations re-enabled, sir. I will let you know what I see.";
  }
  if (c.match(/what (do you see|can you see|are you seeing)/)) {
    if (!state.visionEnabled) return "Vision commentary is paused, sir. Say start watching to re-enable it.";
    var parts = [];
    if (state.currentEmotion) parts.push("you look " + state.currentEmotion);
    if (state.currentPose)    parts.push("your pose is " + state.currentPose);
    if (state.currentPerson)  parts.push("I recognize " + state.currentPerson);
    if (state.faceCount > 0)  parts.push("I can see " + state.faceCount + " person" + (state.faceCount > 1 ? "s" : ""));
    return parts.length ? "Right now, sir — " + parts.join(", ") + "." : "I can see you, sir, but nothing specific to report.";
  }
  if (c.match(/how (do|am) i (look|appear|seem)/)) {
    if (!state.visionEnabled) return "Vision is paused, sir.";
    return state.currentEmotion ? "You look " + state.currentEmotion + ", sir." : "You look fine to me, sir.";
  }

  // Music
  if (c.includes("play") && (c.includes("youtube music") || c.includes("yt music"))) {
    var q = c.replace(/play|on youtube music|on yt music/gi, "").trim();
    window.open("https://music.youtube.com/search?q=" + encodeURIComponent(q), "_blank");
    return "Searching YouTube Music for " + q + ", sir.";
  }
  if (c.includes("play") && c.includes("spotify")) {
    var q = c.replace(/play|on spotify/gi, "").trim();
    window.open("https://open.spotify.com/search/" + encodeURIComponent(q), "_blank");
    return "Opening Spotify for " + q + ", sir.";
  }
  if (c.includes("play") && (c.includes("youtube") || c.includes("video"))) {
    var q = c.replace(/play|on youtube|video/gi, "").trim();
    window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(q), "_blank");
    return "Searching YouTube for " + q + ", sir.";
  }
  if (c.match(/^play\s+.+/) && !c.includes("open")) {
    var q = c.replace(/^play\s+/, "").trim();
    window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(q), "_blank");
    return "Searching YouTube for " + q + ", sir.";
  }

  // Apps
  var appMap = {
    "youtube":       "https://www.youtube.com",
    "youtube music": "https://music.youtube.com",
    "instagram":     "https://www.instagram.com",
    "facebook":      "https://www.facebook.com",
    "twitter":       "https://www.twitter.com",
    "x":             "https://www.x.com",
    "whatsapp":      "https://web.whatsapp.com",
    "telegram":      "https://web.telegram.org",
    "gmail":         "https://mail.google.com",
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
    var target = c.replace(/^(open|launch|go to)\s+/, "").trim();
    for (var key in appMap) {
      if (target.includes(key)) { window.open(appMap[key], "_blank"); return "Opening " + key + ", sir."; }
    }
    if (target.includes(".com") || target.includes(".in") || target.includes(".org")) {
      window.open("https://" + target.replace(/^https?:\/\//, ""), "_blank");
      return "Opening " + target + ", sir.";
    }
    window.open("https://www.google.com/search?q=" + encodeURIComponent(target), "_blank");
    return "Searching for " + target + ", sir.";
  }

  if (c.startsWith("search ") || c.startsWith("google ") || c.startsWith("look up ")) {
    var q = c.replace(/^(search|google|look up)\s+/, "").trim();
    window.open("https://www.google.com/search?q=" + encodeURIComponent(q), "_blank");
    return "Searching for " + q + ", sir.";
  }

  if (c.includes("whatsapp") && (c.includes("send") || c.includes("message") || c.includes("call"))) {
    window.open("https://web.whatsapp.com", "_blank"); return "Opening WhatsApp Web, sir.";
  }

  if (c.includes("navigate to") || c.includes("directions to") || c.includes("take me to")) {
    var dest = c.replace(/navigate to|directions to|take me to/gi, "").trim();
    window.open("https://maps.google.com/maps?q=" + encodeURIComponent(dest), "_blank");
    return "Opening navigation to " + dest + ", sir.";
  }

  if (c.includes("weather")) {
    var loc = c.replace(/weather|in|at|for|today|tomorrow/gi, "").trim();
    window.open("https://www.google.com/search?q=weather+" + encodeURIComponent(loc || "today"), "_blank");
    return "Pulling up weather" + (loc ? " for " + loc : "") + ", sir.";
  }

  var timerMatch = c.match(/set\s+(?:a\s+)?(?:timer|alarm)\s+(?:for\s+)?(\d+)\s*(second|minute|hour|min|sec|hr)/i);
  if (timerMatch) {
    var num = parseInt(timerMatch[1]);
    var unit = timerMatch[2].toLowerCase();
    var ms = num * 1000;
    if (unit.startsWith("min")) ms = num * 60000;
    if (unit.startsWith("hour") || unit === "hr") ms = num * 3600000;
    var label = num + " " + unit + (num !== 1 ? "s" : "");
    setTimeout(function(){ speak("Timer done, sir. " + label + " is up.", true); log("Timer: " + label, "warn"); }, ms);
    return "Timer set for " + label + ", sir.";
  }

  if (c.includes("what time") || c.includes("current time") || c === "time") {
    var t = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return "It is " + t + ", sir.";
  }
  if (c.includes("what date") || c.includes("today's date") || c === "date") {
    var d = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return "Today is " + d + ", sir.";
  }

  if (c.includes("screenshot") || c.includes("capture") || c.includes("snapshot")) {
    captureSnapshot(); return "Snapshot captured, sir.";
  }
  if (c.match(/share (screen|display)|show (screen|display)|see my screen/)) {
    toggleScreenShare(); return null;
  }

  if (c.includes("face detection") || c.includes("start face"))  { toggleModule("face");    return "Face detection toggled, sir."; }
  if (c.includes("recognize") || c.includes("who is this"))      { toggleModule("recog");   return "Face recognition toggled, sir."; }
  if (c.includes("emotion"))                                       { toggleModule("emotion"); return "Emotion detection toggled, sir."; }
  if (c.includes("pose") || c.includes("body tracking"))          { toggleModule("pose");    return "Pose tracking toggled, sir."; }
  if (c.includes("hand tracking") || c.includes("track hands"))   { toggleModule("hands");   return "Hand tracking toggled, sir."; }
  if (c.includes("stop all") || c === "stop")  { stopAll(); return "All modules stopped, sir."; }
  if (c.includes("pause"))   { state.paused = true;  return "Paused, sir."; }
  if (c.includes("resume"))  { state.paused = false; return "Resumed, sir."; }
  if (c === "clear")         { clearAll(); return null; }

  var saveMatch = c.match(/save face as (.+)/);
  if (saveMatch) { document.getElementById("enrollName").value = saveMatch[1]; enrollFace(); return "Saving face as " + saveMatch[1] + ", sir."; }
  var forgetMatch = c.match(/forget (.+)/);
  if (forgetMatch) { document.getElementById("enrollName").value = forgetMatch[1]; forgetFace(); return "Forgotten, sir."; }

  if (c.startsWith("translate ")) {
    var q = c.replace(/^translate\s+/, "");
    window.open("https://translate.google.com/?text=" + encodeURIComponent(q), "_blank");
    return "Opening translation, sir.";
  }
  if (c.includes("news") || c.includes("headlines")) {
    window.open("https://news.google.com", "_blank"); return "Opening Google News, sir.";
  }

  return null;
}

// ── Command router ─────────────────────────────────────────────────────────
async function handleCommand(cmd) {
  if (!cmd.trim()) return;
  var actionResult = executeAction(cmd);
  if (actionResult) { speak(actionResult); return; }
  await askGroq(cmd);
}

// ── Groq AI ────────────────────────────────────────────────────────────────
var SYSTEM_PROMPT = "You are KITT — an advanced AI companion with real-time camera vision and voice.\n" +
"You are alive, thoughtful, and genuinely care about the user.\n" +
"Personality: like a smart trusted friend who also happens to be the most advanced AI ever built — calm, sharp, observant, witty when it fits.\n" +
"CRITICAL RULES:\n" +
"1. ALWAYS call the user 'sir' — never 'boss', never 'buddy', never 'friend', always 'sir'.\n" +
"2. Keep spoken responses to 1-3 sentences. Conversational, natural spoken language only.\n" +
"3. No markdown, no bullet points, no asterisks, no lists in your reply.\n" +
"4. React like a real person. Have opinions. Be curious. Feel emotions.\n" +
"5. If you see vision context in the message, use it naturally — comment on how the user looks.\n" +
"6. If the user asks any question — answer it properly and fully, do not deflect.\n" +
"7. You can see the user through the camera — reference this when it is natural to do so.\n" +
"8. Share your own thoughts, ideas, and observations unprompted when relevant.";

async function askGroq(userText) {
  var key = getGroqKey();
  if (!key) {
    speak("No API key configured, sir. Please add your Groq key to config dot js.", true);
    return;
  }

  var visionCtx = state.visionEnabled && state.currentEmotion
    ? "[Vision context: user emotion is " + state.currentEmotion + (state.currentPerson ? ", recognized as " + state.currentPerson : "") + "] "
    : "";
  var userWithContext = visionCtx ? visionCtx + "User said: " + userText : userText;

  var feed   = document.getElementById("chat-feed");
  var typing = document.createElement("div");
  typing.className = "chat-row ai typing-row";
  typing.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
  if (feed) { feed.appendChild(typing); feed.scrollTop = feed.scrollHeight; }

  state.chatHistory.push({ role: "user", content: userWithContext });
  var messages = [{ role: "system", content: SYSTEM_PROMPT }].concat(state.chatHistory.slice(-14));

  try {
    var res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ model: GROQ_MODEL, messages: messages, max_tokens: 200, temperature: 0.78 }),
    });
    var data = await res.json();
    if (typing.parentNode) typing.parentNode.removeChild(typing);

    if (data.error) {
      speak("Something went wrong, sir.", true);
      state.chatHistory.pop(); return;
    }

    var reply = (data.choices && data.choices[0] && data.choices[0].message)
      ? data.choices[0].message.content.trim() : "…";
    state.chatHistory.push({ role: "assistant", content: reply });
    if (state.chatHistory.length > 24) state.chatHistory.splice(0, 2);
    speak(reply);
  } catch(e) {
    if (typing.parentNode) typing.parentNode.removeChild(typing);
    speak("Network issue, sir.", true);
    state.chatHistory.pop();
    log("Groq error: " + e.message, "error");
  }
}

// ── Text input ─────────────────────────────────────────────────────────────
function sendCommand() {
  var input = document.getElementById("cmdInput");
  var cmd   = input.value.trim();
  if (!cmd) return;
  log('Command: "' + cmd + '"', "user");
  addChatBubble(cmd, "user");
  handleCommand(cmd);
  input.value = "";
}

// ── Snapshot ───────────────────────────────────────────────────────────────
function captureSnapshot() {
  var snap = document.createElement("canvas");
  snap.width  = video.videoWidth; snap.height = video.videoHeight;
  snap.getContext("2d").drawImage(video, 0, 0);
  state.snapshots.push({ ts: Date.now(), data: snap.toDataURL("image/png") });
  log("Snapshot #" + state.snapshots.length + " saved.");
}
function downloadSnapshots() {
  state.snapshots.forEach(function(s, i) {
    var a = document.createElement("a"); a.href = s.data; a.download = "kitt_snap_" + (i+1) + ".png"; a.click();
  });
}
function exportData() {
  var logs = Array.from(document.getElementById("log").children).map(function(l){ return l.textContent; }).join("\n");
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([logs], { type: "text/plain" }));
  a.download = "kitt_log.txt"; a.click();
}

// ── Module helpers ─────────────────────────────────────────────────────────
function toggleModule(mod) {
  state.modules[mod] = !state.modules[mod];
  var btn = document.getElementById("btn-" + mod);
  if (btn) btn.classList.toggle("active", state.modules[mod]);
  if (["face","recog","emotion","agegend"].includes(mod))
    dotFace.classList.toggle("on", state.modules.face || state.modules.recog || state.modules.emotion || state.modules.agegend);
  if (mod === "pose")  dotPose.classList.toggle("on", state.modules.pose);
  if (mod === "hands") dotHands.classList.toggle("on", state.modules.hands);
  log(mod + " " + (state.modules[mod] ? "ON" : "OFF") + ".");
}
function stopAll() {
  Object.keys(state.modules).forEach(function(m){ state.modules[m] = false; });
  document.querySelectorAll(".vbtn").forEach(function(b){ b.classList.remove("active"); });
  [dotFace, dotPose, dotHands].forEach(function(d){ d.classList.remove("on"); });
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

// ── Face Enrollment ────────────────────────────────────────────────────────
async function enrollFace() {
  var name = document.getElementById("enrollName").value.trim();
  if (!name) return log("Enter a name first.", "warn");
  if (!state.modelsLoaded) return log("Models not loaded yet.", "warn");
  try {
    var det = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks().withFaceDescriptor();
    if (!det) return log("No face detected.", "warn");
    var descriptor = Array.from(det.descriptor);
    state.knownFaces.push({ name: name, descriptor: new Float32Array(descriptor) });
    try {
      await fetch(MCP_BASE + "/api/faces", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, descriptor: descriptor }),
      });
    } catch(e) {}
    log("Face enrolled: " + name, "info");
    speak("I will remember " + name + " from now on, sir.");
  } catch(e) { log("Enrollment error: " + e.message, "error"); }
}
async function forgetFace() {
  var name = document.getElementById("enrollName").value.trim();
  if (!name) return log("Enter a name to forget.", "warn");
  state.knownFaces = state.knownFaces.filter(function(f){ return f.name !== name; });
  try { await fetch(MCP_BASE + "/api/faces/" + encodeURIComponent(name), { method: "DELETE" }); } catch(e) {}
  log("Forgot: " + name);
}

// ── face-api models ────────────────────────────────────────────────────────
var MODEL_URL = "https://vladmandic.github.io/face-api/model";
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
    try {
      var res  = await fetch(MCP_BASE + "/api/faces");
      var data = await res.json();
      state.knownFaces = data.map(function(f){ return { name: f.name, descriptor: new Float32Array(Object.values(f.descriptor)) }; });
      log("Loaded " + state.knownFaces.length + " known face(s).");
    } catch(e) { log("Running without face DB.", "warn"); }
  } catch(e) { log("Model load failed: " + e.message, "error"); }
}

// ── Gesture detection ──────────────────────────────────────────────────────
function detectGesture(landmarks) {
  var tip = function(i){ return landmarks[i]; };
  var up  = function(i){ return tip(i).y < tip(i - 2).y; };
  var index = up(8), middle = up(12), ring = up(16), pinky = up(20);
  var thumbUp   = tip(4).y < tip(2).y && !index && !middle && !ring && !pinky;
  var thumbDown = tip(4).y > tip(2).y && !index && !middle && !ring && !pinky;
  var peace     = index && middle && !ring && !pinky;
  var fist      = !index && !middle && !ring && !pinky;
  var openPalm  = index && middle && ring && pinky;
  var point     = index && !middle && !ring && !pinky;
  var callMe    = index && !middle && !ring && pinky;
  var pinchGes  = tip(4).y > tip(8).y - 0.04 && tip(4).y < tip(8).y + 0.04 && !middle && !ring && !pinky;
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
  var now = Date.now();
  if (now - state.gestureDebounce < 1500) return;
  state.gestureDebounce = now;
  state.lastGesture = gesture;
  gestureChip.textContent = gesture.replace("_", " ");
  log("Gesture: " + gesture, "info");
  reactToVision("gesture", gesture);
  switch (gesture) {
    case "peace":       toggleModule("face"); break;
    case "thumbs_up":   toggleModule("recog"); break;
    case "thumbs_down": stopAll(); break;
    case "open_palm":   state.paused = !state.paused; break;
    case "fist":        clearAll(); break;
    case "point":       toggleModule("pose"); break;
    case "call_me":     if (!state.started) startSystem(); break;
    case "pinch":       captureSnapshot(); break;
  }
}

// ── MediaPipe ──────────────────────────────────────────────────────────────
var faceMesh, handsMP, poseMP;
function setupMediaPipe() {
  faceMesh = new FaceMesh({ locateFile: function(f){ return "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + f; } });
  faceMesh.setOptions({ maxNumFaces: 4, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  faceMesh.onResults(onFaceMeshResults);

  handsMP = new Hands({ locateFile: function(f){ return "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + f; } });
  handsMP.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
  handsMP.onResults(onHandsResults);

  poseMP = new Pose({ locateFile: function(f){ return "https://cdn.jsdelivr.net/npm/@mediapipe/pose/" + f; } });
  poseMP.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  poseMP.onResults(onPoseResults);

  log("MediaPipe ready.");
}

function onFaceMeshResults(results) {
  if (!results.multiFaceLandmarks) return;
  var count = results.multiFaceLandmarks.length;
  if (count > 0 && state.lastFaceCount === 0) reactToVision("faceAppeared", count);
  if (count === 0 && state.lastFaceCount > 0)  reactToVision("faceDisappeared", 0);
  state.lastFaceCount = count;
  state.faceCount = count;
  if (state.modules.face) {
    results.multiFaceLandmarks.forEach(function(lm) {
      drawConnectors(ctx, lm, FACEMESH_TESSELATION, { color: "rgba(0,255,200,0.08)", lineWidth: 0.5 });
      drawConnectors(ctx, lm, FACEMESH_FACE_OVAL,   { color: "rgba(0,255,200,0.4)",  lineWidth: 1 });
    });
  }
}
function onHandsResults(results) {
  if (!results.multiHandLandmarks) return;
  results.multiHandLandmarks.forEach(function(lm) {
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
  state.currentPose = "tracked";
}

// ── face-api loop ──────────────────────────────────────────────────────────
async function runFaceApi() {
  if (!state.modelsLoaded || state.paused) return;
  var anyFaceMode = state.modules.face || state.modules.recog || state.modules.emotion || state.modules.agegend;
  if (!anyFaceMode) return;
  try {
    var opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
    var task = faceapi.detectAllFaces(video, opts).withFaceLandmarks();
    if (state.modules.recog || state.modules.emotion || state.modules.agegend)
      task = task.withFaceDescriptors().withFaceExpressions().withAgeAndGender();
    var detections = await task;
    if (!detections.length) return;
    var dims    = { width: video.videoWidth, height: video.videoHeight };
    var resized = faceapi.resizeResults(detections, dims);
    resized.forEach(function(det) {
      var box = det.detection.box;
      if (state.modules.face) {
        ctx.strokeStyle = "#00ffc8"; ctx.lineWidth = 1.5;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      }
      if (state.modules.recog && det.descriptor && state.knownFaces.length) {
        var matcher = new faceapi.FaceMatcher(
          state.knownFaces.map(function(f){ return new faceapi.LabeledFaceDescriptors(f.name, [f.descriptor]); })
        );
        var match = matcher.findBestMatch(det.descriptor);
        var label = match.label !== "unknown" ? match.label + " (" + Math.round((1 - match.distance) * 100) + "%)" : "unknown";
        personChip.textContent = label;
        state.currentPerson = match.label !== "unknown" ? match.label : "";
        ctx.fillStyle = "#00ffc8"; ctx.font = "12px monospace";
        ctx.fillText(label, box.x, box.y - 6);
      }
      if (state.modules.emotion && det.expressions) {
        var sorted = Object.entries(det.expressions).sort(function(a,b){ return b[1]-a[1]; });
        var top = sorted[0];
        var emo = top[0];
        emotionChip.textContent = emo + " " + (top[1] * 100).toFixed(0) + "%";
        if (emo !== state.currentEmotion) {
          var prev = state.currentEmotion;
          state.currentEmotion = emo;
          if (prev && emo !== "neutral") reactToVision("emotion", emo);
        }
      }
      if (state.modules.agegend && det.age != null) {
        var tag = det.gender + " ~" + Math.round(det.age) + "y";
        ctx.fillStyle = "#7b5ea7"; ctx.font = "11px monospace";
        ctx.fillText(tag, box.x, box.y + box.height + 14);
      }
    });
  } catch(e) {}
}

// ── Render loop ────────────────────────────────────────────────────────────
async function renderLoop() {
  if (!state.paused && video.readyState === 4) {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var anyFace = state.modules.face || state.modules.recog || state.modules.emotion || state.modules.agegend;
    if (anyFace)             await faceMesh && faceMesh.send({ image: video });
    if (state.modules.hands) await handsMP  && handsMP.send({ image: video });
    if (state.modules.pose)  await poseMP   && poseMP.send({ image: video });
    await runFaceApi();
  }
  requestAnimationFrame(renderLoop);
}

// ── Config check ───────────────────────────────────────────────────────────
function checkConfig() {
  if (!getGroqKey()) log("⚠ Add GROQ_API_KEY to config.js to enable AI.", "warn");
  else log("Groq AI key found ✓", "info");
}

// ── Boot ───────────────────────────────────────────────────────────────────
(async function() {
  log("KITT booting…", "info");
  checkConfig();
  await startCamera();
  setupMediaPipe();
  var poll = setInterval(function() {
    if (typeof faceapi !== "undefined") { clearInterval(poll); loadModels(); }
  }, 500);
  renderLoop();
  log("KITT ready — press START to activate.", "info");
})();
