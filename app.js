/**
 * UNREAL — app.js
 * Vision : MediaPipe FaceMesh + Pose + Hands + face-api.js
 * Voice  : Web Speech API (STT) + Gemini API (LLM) + speechSynthesis (TTS)
 * Zero external voice services. Everything runs in the browser.
 */

// ── Config ────────────────────────────────────────────────────────────────
// Keys are read from config.js (UNREAL_CONFIG). Fill that file in — no server needed.
let GEMINI_API_KEY = (typeof UNREAL_CONFIG !== "undefined") ? UNREAL_CONFIG.GOOGLE_API_KEY : "";
const GEMINI_MODEL = "gemini-2.0-flash";
const MCP_BASE     = (typeof UNREAL_CONFIG !== "undefined" && UNREAL_CONFIG.RENDER_NODE_URL)
  ? UNREAL_CONFIG.RENDER_NODE_URL
  : (window.location.hostname === "localhost" ? "http://localhost:3000" : "");

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  modules:   { face: false, recog: false, emotion: false, agegend: false, pose: false, hands: false },
  paused:    false,
  voiceOn:   false,
  modelsLoaded: false,
  knownFaces: [],
  snapshots:  [],
  lastGesture: null,
  gestureDebounce: 0,
  chatHistory: [],   // { role: "user"|"model", parts: [{text}] }
  speaking: false,
};

// ── DOM ───────────────────────────────────────────────────────────────────
const video    = document.getElementById("videoEl");
const canvas   = document.getElementById("canvasEl");
const ctx      = canvas.getContext("2d");

const dotFace   = document.getElementById("dot-face");
const dotPose   = document.getElementById("dot-pose");
const dotHands  = document.getElementById("dot-hands");
const dotVoice  = document.getElementById("dot-voice");
const dotModels = document.getElementById("dot-models");

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
  if (el.children.length > 120) el.removeChild(el.firstChild);
}

// ── Validate config ───────────────────────────────────────────────────────
function checkConfig() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "your_google_api_key_here" || GEMINI_API_KEY.trim() === "") {
    log("⚠ Open config.js and paste your GOOGLE_API_KEY to enable voice AI.", "warn");
    speak("Add your Google API key to config dot js to enable voice.");
  } else {
    log("Gemini ready ✓", "info");
  }
}

// ── Camera ────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
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

// ── face-api.js models ────────────────────────────────────────────────────
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

// ── Saved Faces ───────────────────────────────────────────────────────────
async function loadSavedFaces() {
  try {
    const res  = await fetch("/api/faces");
    const data = await res.json();
    state.knownFaces = data.map(f => ({
      name:       f.name,
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
  if (mod === "pose")  dotPose.classList.toggle("on",  state.modules.pose);
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
  log("Display cleared.");
}

// ── Face Enrollment ───────────────────────────────────────────────────────
async function enrollFace() {
  const name = document.getElementById("enrollName").value.trim();
  if (!name) return log("Enter a name first.", "warn");
  if (!state.modelsLoaded) return log("Models not loaded yet.", "warn");

  try {
    const det = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!det) return log("No face detected for enrollment.", "warn");

    const descriptor = Array.from(det.descriptor);
    state.knownFaces.push({ name, descriptor: new Float32Array(descriptor) });

    await fetch("/api/faces", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name, descriptor }),
    });
    log(`Face enrolled: ${name}`, "info");
  } catch (e) {
    log("Enrollment error: " + e.message, "error");
  }
}

async function forgetFace() {
  const name = document.getElementById("enrollName").value.trim();
  if (!name) return log("Enter a name to forget.", "warn");
  state.knownFaces = state.knownFaces.filter(f => f.name !== name);
  try { await fetch(`/api/faces/${encodeURIComponent(name)}`, { method: "DELETE" }); } catch {}
  log(`Forgot face: ${name}`);
}

// ── Snapshot ──────────────────────────────────────────────────────────────
function captureSnapshot() {
  const snap = document.createElement("canvas");
  snap.width  = video.videoWidth;
  snap.height = video.videoHeight;
  snap.getContext("2d").drawImage(video, 0, 0);
  const dataURL = snap.toDataURL("image/png");
  state.snapshots.push({ ts: Date.now(), data: dataURL });
  log(`Snapshot saved (${state.snapshots.length} total).`);
}

function downloadSnapshots() {
  state.snapshots.forEach((s, i) => {
    const a    = document.createElement("a");
    a.href     = s.data;
    a.download = `unreal_snap_${i + 1}.png`;
    a.click();
  });
}

function exportData() {
  const logs = Array.from(document.getElementById("log").children).map(l => l.textContent).join("\n");
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(new Blob([logs], { type: "text/plain" }));
  a.download = "unreal_log.txt";
  a.click();
}

// ── TTS — speechSynthesis ─────────────────────────────────────────────────
function speak(text) {
  if (!text || state.speaking) return;
  window.speechSynthesis.cancel();
  const utt   = new SpeechSynthesisUtterance(text);
  utt.lang    = "en-IN";
  utt.rate    = 1.08;
  utt.pitch   = 1.0;
  // Prefer a local Indian-English voice if available
  const voices = window.speechSynthesis.getVoices();
  const pref   = voices.find(v => v.lang === "en-IN") ||
                 voices.find(v => v.lang.startsWith("en"));
  if (pref) utt.voice = pref;

  state.speaking = true;
  utt.onend = utt.onerror = () => { state.speaking = false; };
  window.speechSynthesis.speak(utt);
  log(`UNREAL: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`, "info");
}

// ── Gemini API ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are UNREAL — the most advanced AI system ever built.
You combine real-time computer vision, full voice pipeline, and complete automation.
Personality: calm, sharp, occasionally dry. Trusted operator — not a chatbot.
Tone: "On it, boss." Not: "I will now proceed to execute your request."
Rules:
1. Keep spoken responses to 2-4 sentences max.
2. No bullet points or markdown in your reply — plain spoken sentences only.
3. If you don't know something, say so briefly.
Greeting: If this is the first message, start with "UNREAL online. What do you need, boss?"`;

async function askGemini(userText) {
  if (!GEMINI_API_KEY) {
    speak("No API key configured, boss. Add GOOGLE_API_KEY to your environment.");
    return;
  }

  // Build conversation history
  state.chatHistory.push({ role: "user", parts: [{ text: userText }] });

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: state.chatHistory,
    generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
  };

  try {
    const res  = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const data = await res.json();

    if (data.error) {
      log("Gemini error: " + data.error.message, "error");
      speak("Something went wrong on my end, boss.");
      state.chatHistory.pop(); // remove failed user turn
      return;
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "…";
    state.chatHistory.push({ role: "model", parts: [{ text: reply }] });

    // Keep history manageable — last 20 turns
    if (state.chatHistory.length > 20) state.chatHistory.splice(0, 2);

    speak(reply);
  } catch (e) {
    log("Gemini fetch error: " + e.message, "error");
    speak("Network issue, boss. Check your connection.");
    state.chatHistory.pop();
  }
}

// ── Vision command shortcuts (no need to hit Gemini for these) ────────────
function tryLocalCommand(cmd) {
  if (cmd.includes("start face") || cmd.includes("face detection")) { toggleModule("face"); return true; }
  if (cmd.includes("recognize") || cmd.includes("who is this"))     { toggleModule("recog"); return true; }
  if (cmd.includes("emotion"))                                        { toggleModule("emotion"); return true; }
  if (cmd.includes("age") || cmd.includes("gender"))                 { toggleModule("agegend"); return true; }
  if (cmd.includes("pose") || cmd.includes("body"))                  { toggleModule("pose"); return true; }
  if (cmd.includes("track hands") || cmd.includes("hand track"))     { toggleModule("hands"); return true; }
  if (cmd.includes("capture") || cmd.includes("snapshot"))           { captureSnapshot(); return true; }
  if (cmd.includes("stop all"))                                       { stopAll(); return true; }
  if (cmd.includes("pause") || cmd.includes("resume"))               { state.paused = !state.paused; log(state.paused ? "Paused." : "Resumed."); return true; }
  if (cmd.includes("clear"))                                          { clearAll(); return true; }
  if (cmd.includes("download") || cmd.includes("export"))            { downloadSnapshots(); return true; }
  const saveMatch = cmd.match(/save face as (.+)/);
  if (saveMatch) { document.getElementById("enrollName").value = saveMatch[1]; enrollFace(); return true; }
  const forgetMatch = cmd.match(/forget (.+)/);
  if (forgetMatch) { document.getElementById("enrollName").value = forgetMatch[1]; forgetFace(); return true; }
  return false;
}

// ── Main command router ───────────────────────────────────────────────────
function handleCommand(cmd) {
  const lower = cmd.toLowerCase().trim();
  if (!tryLocalCommand(lower)) {
    // Everything else → Gemini
    askGemini(cmd);
  }
}

// ── Voice Control (Web Speech API) ───────────────────────────────────────
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
    // Don't process while UNREAL is speaking
    if (!state.speaking) handleCommand(transcript);
  };
  recognition.onerror = e => log("Speech error: " + e.error, "error");
  recognition.onend   = () => { if (state.voiceOn) recognition.start(); };

  recognition.start();
  state.voiceOn = true;
  dotVoice.classList.add("on");
  document.getElementById("voiceBtn").classList.add("recording");
  log("Voice ON — listening…");

  // Greet on first activation
  if (state.chatHistory.length === 0) {
    askGemini("(system: first activation — greet the user)");
  }
}

// ── Text command ──────────────────────────────────────────────────────────
function sendCommand() {
  const cmd = document.getElementById("cmdInput").value.trim();
  if (!cmd) return;
  log(`Command: "${cmd}"`, "user");
  handleCommand(cmd);
  document.getElementById("cmdInput").value = "";
}

// ── Gesture Detection ─────────────────────────────────────────────────────
function detectGesture(landmarks) {
  const tip   = i => landmarks[i];
  const up    = i => tip(i).y < tip(i - 2).y;

  const index  = up(8);
  const middle = up(12);
  const ring   = up(16);
  const pinky  = up(20);

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

// ── MediaPipe setup ───────────────────────────────────────────────────────
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
  drawLandmarks(ctx,  results.poseLandmarks, { color: "#ffaa00", lineWidth: 1, radius: 3 });
  poseChip.textContent = "pose active";
}

// ── face-api.js analysis loop ─────────────────────────────────────────────
async function runFaceApi() {
  if (!state.modelsLoaded || state.paused) return;
  const anyFaceMode = state.modules.face || state.modules.recog || state.modules.emotion || state.modules.agegend;
  if (!anyFaceMode) return;

  try {
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
    let task   = faceapi.detectAllFaces(video, opts).withFaceLandmarks();

    if (state.modules.recog || state.modules.emotion || state.modules.agegend) {
      task = task.withFaceDescriptors().withFaceExpressions().withAgeAndGender();
    }

    const detections = await task;
    if (!detections.length) return;

    const dims    = { width: video.videoWidth, height: video.videoHeight };
    const resized = faceapi.resizeResults(detections, dims);

    resized.forEach(det => {
      const { box } = det.detection;

      if (state.modules.face) {
        ctx.strokeStyle = "#00ffc8";
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      }

      if (state.modules.recog && det.descriptor && state.knownFaces.length) {
        const matcher = new faceapi.FaceMatcher(
          state.knownFaces.map(f => new faceapi.LabeledFaceDescriptors(f.name, [f.descriptor]))
        );
        const match = matcher.findBestMatch(det.descriptor);
        const label = match.label !== "unknown" ? `${match.label} (${(1 - match.distance).toFixed(0) * 100 | 0}%)` : "unknown";
        personChip.textContent = label;
        ctx.fillStyle = "#00ffc8";
        ctx.font      = "12px monospace";
        ctx.fillText(label, box.x, box.y - 6);
      }

      if (state.modules.emotion && det.expressions) {
        const top = Object.entries(det.expressions).sort((a, b) => b[1] - a[1])[0];
        emotionChip.textContent = `${top[0]} ${(top[1] * 100).toFixed(0)}%`;
      }

      if (state.modules.agegend && det.age != null) {
        const tag = `${det.gender} ~${Math.round(det.age)}y`;
        ctx.fillStyle = "#7b5ea7";
        ctx.font      = "11px monospace";
        ctx.fillText(tag, box.x, box.y + box.height + 14);
      }
    });
  } catch {}
}

// ── Main render loop ──────────────────────────────────────────────────────
async function renderLoop() {
  if (!state.paused && video.readyState === 4) {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.modules.face || state.modules.recog || state.modules.emotion || state.modules.agegend)
      await faceMesh?.send({ image: video });
    if (state.modules.hands)
      await handsMP?.send({ image: video });
    if (state.modules.pose)
      await poseMP?.send({ image: video });

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
    if (typeof faceapi !== "undefined") {
      clearInterval(poll);
      loadModels();
    }
  }, 500);
  renderLoop();
  log("System ready. All modules standby.", "info");
})();
