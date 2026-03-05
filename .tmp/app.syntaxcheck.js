// public/js/state.js
var createDefaultGameState = () => ({
  currentRound: 0,
  totalRounds: 4,
  myTeam: [],
  myDraftSlots: [],
  draftActiveSlotIndex: 0,
  draftEntryCount: 0,
  currentScenario: "",
  currentTwist: "",
  allDrafts: {},
  allDraftsList: [],
  allCharactersDrafted: [],
  draftLocked: false,
  votes: {},
  voted: false,
  voteLocked: false,
  currentVoteChoice: null,
  leaderboard: [],
  myFinalTeam: [],
  draftWarnings: {},
  activePackMeta: null
});
var player = { name: "", room: "", ready: false };
var roomState = {
  host: null,
  settings: {},
  players: [],
  messages: [],
  packCatalog: null,
  selectedPackMeta: null,
  categoryRegistry: null,
  categoryVote: null,
  categoryTelemetry: null
};
var gameState = createDefaultGameState();
var activeTimers = [];
function clearTimers() {
  activeTimers.forEach((timerId) => clearInterval(timerId));
  activeTimers.length = 0;
}
function addTimer(timerId) {
  activeTimers.push(timerId);
}
function resetPlayer() {
  player.name = "";
  player.room = "";
  player.ready = false;
}
function resetRoomState() {
  roomState.host = null;
  roomState.settings = {};
  roomState.players = [];
  roomState.messages = [];
  roomState.packCatalog = null;
  roomState.selectedPackMeta = null;
  roomState.categoryRegistry = null;
  roomState.categoryVote = null;
  roomState.categoryTelemetry = null;
}
function resetGameState() {
  Object.assign(gameState, createDefaultGameState());
}
function resetAllState() {
  resetPlayer();
  resetRoomState();
  resetGameState();
  clearTimers();
}

// public/js/ui.js
var scenarioCollapsed = false;
var resultsDetailsOpen = false;
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen2) => screen2.classList.remove("active"));
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add("active");
    document.dispatchEvent(new CustomEvent("screenChanged", { detail: { screenId } }));
    const firstFocusable = screen.querySelector('input, button, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable && !document.activeElement.matches('input[type="text"]')) {
      setTimeout(() => firstFocusable.focus(), 100);
    }
  }
}
function showHelp() {
  showScreen("tutorial");
}
function closeHelp() {
  showScreen("join");
}
function createConfetti() {
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement("div");
    confetti.style.cssText = `
      position: fixed;
      width: 10px;
      height: 10px;
      background: ${["#ff4081", "#00bcd4", "#4caf50", "#ffc107", "#ff9800"][Math.floor(Math.random() * 5)]};
      left: ${Math.random() * 100}%;
      top: -10px;
      z-index: 9999;
      border-radius: 50%;
      pointer-events: none;
      animation: confettiFall ${2 + Math.random() * 1}s linear forwards;
    `;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 3e3);
  }
}
function showToast(message, type = "info", duration = 3e3) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === "error" ? "#ff5252" : type === "warning" ? "#ffc107" : "#00bcd4"};
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideInRight 0.3s ease;
    max-width: 300px;
    word-wrap: break-word;
    font-weight: bold;
  `;
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "\u2715";
  closeBtn.style.cssText = `
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 1.2em;
    margin-left: 10px;
    padding: 0;
  `;
  closeBtn.onclick = () => {
    toast.style.animation = "slideOutRight 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  };
  toast.appendChild(closeBtn);
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "slideOutRight 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
function updateDraftWarning(character, isDuplicate = false) {
  const warningEl = document.getElementById("draftWarning");
  const charInput = document.getElementById("charInput");
  if (!warningEl) return;
  if (isDuplicate) {
    warningEl.className = "draft-warning-modern warning";
    warningEl.textContent = `\u26A0\uFE0F "${character}" is a DUPLICATE! Will auto-fill instead.`;
    warningEl.style.display = "block";
    if (charInput) charInput.style.borderColor = "#ff9800";
  } else {
    warningEl.style.display = "none";
    warningEl.className = "draft-warning-modern";
    if (charInput) charInput.style.borderColor = "#222";
  }
}
function updateAutoFillWarning() {
  const warningEl = document.getElementById("draftWarning");
  if (!warningEl) return;
  if (gameState.myTeam.length === 0) {
    warningEl.className = "draft-warning-modern info";
    warningEl.textContent = "\u2139\uFE0F Time running out! No picks? Random words will fill your team.";
    warningEl.style.display = "block";
  }
}
function updateDraftCounter() {
  const counter = document.getElementById("draftCounter");
  if (counter) {
    const count = Number(gameState.draftEntryCount) || 0;
    counter.textContent = `(${count}/2)`;
    if (count >= 2) {
      counter.classList.add("full");
    } else {
      counter.classList.remove("full");
    }
  }
}
function switchLobbyTab(tabName) {
  document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
  const selectedTab = document.getElementById(`${tabName}Tab`);
  if (selectedTab) selectedTab.classList.add("active");
  const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (selectedBtn) selectedBtn.classList.add("active");
  try {
    window.__activeLobbyTab = tabName;
  } catch (error) {
  }
  document.dispatchEvent(new CustomEvent("lobbyTabChanged", { detail: { tabName } }));
}
function toggleAccordion(header) {
  const accordionItem = header.parentElement;
  const content = accordionItem.querySelector(".accordion-content");
  const icon = header.querySelector(".accordion-icon");
  const isActive = accordionItem.classList.contains("active");
  if (isActive) {
    accordionItem.classList.remove("active");
    content.style.display = "none";
    icon.textContent = "\u25B6";
  } else {
    accordionItem.classList.add("active");
    content.style.display = "block";
    icon.textContent = "\u25BC";
  }
}
function toggleScenario() {
  const scenarioBox = document.getElementById("scenarioBox");
  const icon = document.getElementById("scenarioToggleIcon");
  if (!scenarioBox || !icon) return;
  scenarioCollapsed = !scenarioCollapsed;
  if (scenarioCollapsed) {
    scenarioBox.classList.add("collapsed");
    icon.textContent = "\u25B2";
  } else {
    scenarioBox.classList.remove("collapsed");
    icon.textContent = "\u25BC";
  }
}
function toggleResultsDetails() {
  const details = document.getElementById("resultsDetails");
  const icon = document.getElementById("resultsDetailsIcon");
  if (!details || !icon) return;
  resultsDetailsOpen = !resultsDetailsOpen;
  if (resultsDetailsOpen) {
    details.style.display = "block";
    icon.textContent = "\u25B2";
  } else {
    details.style.display = "none";
    icon.textContent = "\u25BC";
  }
}
function updateLivePicksCount(count) {
  const countEl = document.getElementById("livePicksCount");
  if (countEl) countEl.textContent = count;
}
function updateVoteStatusBadge(status) {
  const badge = document.getElementById("voteStatusBadge");
  if (badge) badge.textContent = status;
}

// public/js/audio/archetypes.js
var ARCHETYPES = Object.freeze({
  NARRATOR: "NARRATOR",
  ANNOUNCER: "ANNOUNCER",
  HEROIC: "HEROIC",
  VILLAIN: "VILLAIN",
  MYSTERIOUS: "MYSTERIOUS",
  CHAOTIC: "CHAOTIC",
  ROBOTIC: "ROBOTIC",
  CORPORATE: "CORPORATE",
  REGAL: "REGAL",
  ANCIENT: "ANCIENT",
  SPOOKY: "SPOOKY",
  CUTE: "CUTE",
  KID_CARTOON: "KID_CARTOON",
  GRUFF: "GRUFF",
  SWEET: "SWEET",
  SCIENTIST: "SCIENTIST",
  WESTERN: "WESTERN",
  PIRATE: "PIRATE",
  SPORTY: "SPORTY",
  ABSURD: "ABSURD",
  MEME: "MEME",
  OBJECT: "OBJECT",
  CREATURE: "CREATURE",
  MONSTER: "MONSTER",
  COSMIC: "COSMIC",
  DETECTIVE: "DETECTIVE",
  COMMANDER: "COMMANDER",
  MAGICAL: "MAGICAL",
  CELEBRITY: "CELEBRITY",
  STEALTHY: "STEALTHY",
  MENTOR: "MENTOR",
  TRICKSTER: "TRICKSTER"
});
var ARCHETYPE_LIST = Object.freeze(Object.values(ARCHETYPES));

// public/js/audio/classifyArchetype.js
function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}
function normalizeText(value = "") {
  try {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  } catch (error) {
    return String(value || "").toLowerCase();
  }
}
function keywordScore(text, terms = []) {
  let score = 0;
  for (let i = 0; i < terms.length; i += 1) {
    if (text.includes(terms[i])) score += 1;
  }
  return score;
}
function mapSpeechStyleToArchetype(style = "") {
  const value = normalizeText(style);
  if (!value) return null;
  if (value.includes("villain")) return ARCHETYPES.VILLAIN;
  if (value.includes("spooky") || value.includes("ghost") || value.includes("whisper")) return ARCHETYPES.SPOOKY;
  if (value.includes("hero") || value.includes("cinematic")) return ARCHETYPES.HEROIC;
  if (value.includes("cartoon") || value.includes("bright") || value.includes("toon")) return ARCHETYPES.KID_CARTOON;
  if (value.includes("chaotic") || value.includes("chaos") || value.includes("meme")) return ARCHETYPES.CHAOTIC;
  if (value.includes("synthetic") || value.includes("robot")) return ARCHETYPES.ROBOTIC;
  if (value.includes("creature")) return ARCHETYPES.CREATURE;
  if (value.includes("command")) return ARCHETYPES.COMMANDER;
  if (value.includes("fast")) return ARCHETYPES.SPORTY;
  return null;
}
function classifyEntryArchetype(entryName = "", context = {}) {
  const name = String(entryName || "").trim();
  const scenario = String(context && context.scenario || "").trim();
  const twist = String(context && context.twist || "").trim();
  const text = normalizeText(`${name} ${scenario} ${twist}`);
  const baseName = normalizeText(name);
  const explicitStyle = mapSpeechStyleToArchetype(context && context.voiceStyle);
  if (explicitStyle) {
    return { archetype: explicitStyle, confidence: 0.72, intensity: clamp01(context && context.intensity, 0.58) };
  }
  if (!name) {
    return { archetype: ARCHETYPES.ANNOUNCER, confidence: 0.32, intensity: 0.45 };
  }
  if (/^[A-Z0-9 !?._:-]{5,}$/.test(name) && /[A-Z]/.test(name)) {
    return { archetype: ARCHETYPES.ANNOUNCER, confidence: 0.84, intensity: 0.7 };
  }
  if (/\bmk\.?\s*[ivx0-9]+|\bunit\b|\bprotocol\b|\bmodel\b/.test(baseName)) {
    return { archetype: ARCHETYPES.ROBOTIC, confidence: 0.82, intensity: 0.62 };
  }
  const checks = [
    [ARCHETYPES.VILLAIN, ["doom", "dark", "evil", "lord", "vader", "thanos", "galactus", "joker", "devil", "demon"], 0.84, 0.7],
    [ARCHETYPES.HEROIC, ["hero", "captain", "superman", "batman", "wonder", "spider", "knight", "guardian"], 0.8, 0.68],
    [ARCHETYPES.CREATURE, ["dragon", "wolf", "bear", "cat", "dog", "lion", "tiger", "pokemon", "stitch", "dinosaur"], 0.78, 0.62],
    [ARCHETYPES.MONSTER, ["kraken", "godzilla", "monster", "ghoul", "zombie", "xenomorph"], 0.82, 0.72],
    [ARCHETYPES.KID_CARTOON, ["cartoon", "spongebob", "ben10", "ben 10", "scooby", "dora", "barney", "icarly", "avatar"], 0.86, 0.73],
    [ARCHETYPES.CUTE, ["hello kitty", "pikachu", "kirby", "cute", "baby", "chibi"], 0.8, 0.72],
    [ARCHETYPES.SCIENTIST, ["dr ", "doctor", "professor", "scientist", "einstein", "newton", "senku", "okabe"], 0.85, 0.6],
    [ARCHETYPES.DETECTIVE, ["detective", "sherlock", "holmes", "batman", "noir"], 0.77, 0.56],
    [ARCHETYPES.CORPORATE, ["ceo", "manager", "executive", "corporate", "accountant"], 0.8, 0.5],
    [ARCHETYPES.REGAL, ["king", "queen", "prince", "princess", "emperor", "duke"], 0.84, 0.62],
    [ARCHETYPES.ANCIENT, ["ancient", "pharaoh", "zeus", "odin", "atlas", "myth"], 0.76, 0.58],
    [ARCHETYPES.SPOOKY, ["ghost", "phantom", "spooky", "haunt", "specter", "witch"], 0.82, 0.64],
    [ARCHETYPES.WESTERN, ["cowboy", "ranger", "sheriff", "outlaw"], 0.8, 0.58],
    [ARCHETYPES.PIRATE, ["pirate", "captain hook", "blackbeard"], 0.82, 0.6],
    [ARCHETYPES.SPORTY, ["athlete", "lebron", "jordan", "bolt", "ohtani", "soccer", "nba", "nfl"], 0.83, 0.7],
    [ARCHETYPES.COSMIC, ["space", "cosmic", "galaxy", "star", "alien", "astro"], 0.74, 0.58],
    [ARCHETYPES.MAGICAL, ["wizard", "mage", "magic", "gandalf", "witch", "sorcerer"], 0.84, 0.6],
    [ARCHETYPES.CELEBRITY, ["actor", "singer", "rapper", "celebrity", "peywdie", "hemsworth", "ross"], 0.68, 0.55],
    [ARCHETYPES.STEALTHY, ["ninja", "assassin", "spy", "wick", "shadow", "stealth"], 0.82, 0.68],
    [ARCHETYPES.MENTOR, ["mentor", "master", "sensei", "teacher", "coach"], 0.76, 0.52],
    [ARCHETYPES.TRICKSTER, ["trickster", "loki", "prank", "chaos", "joker"], 0.8, 0.66],
    [ARCHETYPES.MEME, ["meme", "shitpost", "skibidi", "pepe", "doge"], 0.86, 0.78],
    [ARCHETYPES.OBJECT, ["gun", "sword", "portal gun", "chair", "sandwich", "banana", "device", "machine"], 0.78, 0.52]
  ];
  let best = null;
  let bestHits = 0;
  for (let i = 0; i < checks.length; i += 1) {
    const [archetype, terms, confidence, intensity] = checks[i];
    const hits = keywordScore(text, terms);
    if (hits > bestHits) {
      bestHits = hits;
      best = { archetype, confidence, intensity };
    }
  }
  if (best) {
    const confidenceBoost = Math.min(0.12, (bestHits - 1) * 0.06);
    return {
      archetype: best.archetype,
      confidence: clamp01(best.confidence + confidenceBoost, best.confidence),
      intensity: clamp01(best.intensity + Math.min(0.1, (bestHits - 1) * 0.04), best.intensity)
    };
  }
  if (/\b(tv|show|movie|film|series)\b/.test(text)) {
    return { archetype: ARCHETYPES.ANNOUNCER, confidence: 0.58, intensity: 0.54 };
  }
  if (/\b(a|an|the)\s+[a-z]+\b/.test(baseName) || /\bwith a\b/.test(baseName)) {
    return { archetype: ARCHETYPES.ABSURD, confidence: 0.61, intensity: 0.66 };
  }
  if (/\d/.test(name) || /[!?]{2,}/.test(name)) {
    return { archetype: ARCHETYPES.CHAOTIC, confidence: 0.57, intensity: 0.7 };
  }
  if (/\bmr\.?\b|\bms\.?\b|\bdr\.?\b|\bprof/.test(baseName)) {
    return { archetype: ARCHETYPES.CORPORATE, confidence: 0.55, intensity: 0.48 };
  }
  return { archetype: ARCHETYPES.ABSURD, confidence: 0.42, intensity: 0.56 };
}
function classifyVoiceCueArchetype(cue = {}) {
  const type = String(cue && cue.type || "").toLowerCase();
  if (type === "twist") return { archetype: ARCHETYPES.ANNOUNCER, confidence: 0.8, intensity: 0.74 };
  if (type === "round4") return { archetype: ARCHETYPES.NARRATOR, confidence: 0.85, intensity: 0.7 };
  if (type === "narration") return { archetype: ARCHETYPES.NARRATOR, confidence: 0.75, intensity: 0.58 };
  return classifyEntryArchetype(cue && cue.text ? cue.text : "", cue || {});
}

// public/js/audio/coreUtils.js
function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function clampAudioLevel(value, fallback = 1) {
  return clamp(value, 0, 1, fallback);
}
function clampAudioPan(value) {
  return clamp(value, -1, 1, 0);
}
function clampAudioRate(value, fallback = 1) {
  return clamp(value, 0.5, 2.5, fallback);
}
function nowMs() {
  return Date.now();
}
function normalizeTrimmedText(value = "") {
  return String(value || "").trim();
}
function normalizeCollapsedText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function hashString(input = "") {
  const text = String(input || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash >>> 0);
}

// public/js/audio/archetypePresets.js
var BASE = Object.freeze({
  voiceHints: [],
  rate: 1,
  pitch: 1,
  volume: 1,
  punctuationStyle: "neutral"
});
var ARCHETYPE_SPEECH_PRESETS = Object.freeze({
  [ARCHETYPES.NARRATOR]: { voiceHints: ["neural", "natural", "narrator", "serena", "aria", "jenny"], rate: 0.97, pitch: 0.95, volume: 0.95, punctuationStyle: "dramatic" },
  [ARCHETYPES.ANNOUNCER]: { voiceHints: ["neural", "natural", "enhanced", "aria", "guy", "davis"], rate: 1.03, pitch: 1, volume: 0.98, punctuationStyle: "staccato" },
  [ARCHETYPES.HEROIC]: { voiceHints: ["natural", "enhanced", "davis", "guy", "jenny"], rate: 0.93, pitch: 0.89, volume: 0.99, punctuationStyle: "dramatic" },
  [ARCHETYPES.VILLAIN]: { voiceHints: ["natural", "enhanced", "david", "mark", "daniel"], rate: 0.84, pitch: 0.76, volume: 0.97, punctuationStyle: "dramatic" },
  [ARCHETYPES.MYSTERIOUS]: { voiceHints: ["natural", "neural", "sara", "jenny", "aria"], rate: 0.88, pitch: 0.9, volume: 0.92, punctuationStyle: "dramatic" },
  [ARCHETYPES.CHAOTIC]: { voiceHints: ["enhanced", "aria", "zira", "samantha"], rate: 1.21, pitch: 1.16, volume: 0.99, punctuationStyle: "staccato" },
  [ARCHETYPES.ROBOTIC]: { voiceHints: ["microsoft", "google", "online", "zira", "heera"], rate: 0.99, pitch: 0.85, volume: 0.93, punctuationStyle: "staccato" },
  [ARCHETYPES.CORPORATE]: { voiceHints: ["natural", "neural", "jenny", "guy", "davis"], rate: 1, pitch: 0.97, volume: 0.92, punctuationStyle: "neutral" },
  [ARCHETYPES.REGAL]: { voiceHints: ["natural", "enhanced", "libby", "victoria", "david"], rate: 0.9, pitch: 0.85, volume: 0.97, punctuationStyle: "dramatic" },
  [ARCHETYPES.ANCIENT]: { voiceHints: ["natural", "enhanced", "grandma", "david", "fred"], rate: 0.86, pitch: 0.82, volume: 0.94, punctuationStyle: "dramatic" },
  [ARCHETYPES.SPOOKY]: { voiceHints: ["natural", "enhanced", "samantha", "victoria", "zira"], rate: 0.82, pitch: 0.78, volume: 0.88, punctuationStyle: "dramatic" },
  [ARCHETYPES.CUTE]: { voiceHints: ["natural", "neural", "aria", "jenny", "samantha"], rate: 1.07, pitch: 1.18, volume: 0.96, punctuationStyle: "neutral" },
  [ARCHETYPES.KID_CARTOON]: { voiceHints: ["natural", "enhanced", "aria", "samantha", "zira"], rate: 1.18, pitch: 1.24, volume: 1, punctuationStyle: "staccato" },
  [ARCHETYPES.GRUFF]: { voiceHints: ["david", "guy", "mark", "daniel"], rate: 0.93, pitch: 0.82, volume: 0.98, punctuationStyle: "neutral" },
  [ARCHETYPES.SWEET]: { voiceHints: ["jenny", "aria", "sara", "victoria"], rate: 1, pitch: 1.1, volume: 0.95, punctuationStyle: "neutral" },
  [ARCHETYPES.SCIENTIST]: { voiceHints: ["natural", "enhanced", "guy", "davis", "jenny"], rate: 1.04, pitch: 0.98, volume: 0.93, punctuationStyle: "neutral" },
  [ARCHETYPES.WESTERN]: { voiceHints: ["guy", "david", "mark"], rate: 0.97, pitch: 0.88, volume: 0.96, punctuationStyle: "staccato" },
  [ARCHETYPES.PIRATE]: { voiceHints: ["david", "mark", "fred"], rate: 0.94, pitch: 0.86, volume: 1, punctuationStyle: "dramatic" },
  [ARCHETYPES.SPORTY]: { voiceHints: ["neural", "natural", "guy", "aria", "jenny"], rate: 1.12, pitch: 1.02, volume: 0.99, punctuationStyle: "staccato" },
  [ARCHETYPES.ABSURD]: { voiceHints: ["natural", "enhanced", "aria", "guy", "zira"], rate: 1.05, pitch: 1.04, volume: 0.96, punctuationStyle: "neutral" },
  [ARCHETYPES.MEME]: { voiceHints: ["natural", "enhanced", "zira", "aria"], rate: 1.2, pitch: 1.16, volume: 1, punctuationStyle: "staccato" },
  [ARCHETYPES.OBJECT]: { voiceHints: ["microsoft", "online", "google", "davis"], rate: 1.02, pitch: 0.94, volume: 0.92, punctuationStyle: "neutral" },
  [ARCHETYPES.CREATURE]: { voiceHints: ["samantha", "victoria", "zira", "aria"], rate: 0.98, pitch: 1.14, volume: 0.97, punctuationStyle: "dramatic" },
  [ARCHETYPES.MONSTER]: { voiceHints: ["david", "mark", "zira"], rate: 0.88, pitch: 0.8, volume: 1, punctuationStyle: "dramatic" },
  [ARCHETYPES.COSMIC]: { voiceHints: ["natural", "neural", "libby", "jenny", "davis"], rate: 0.95, pitch: 0.99, volume: 0.94, punctuationStyle: "dramatic" },
  [ARCHETYPES.DETECTIVE]: { voiceHints: ["guy", "david", "jenny"], rate: 0.96, pitch: 0.92, volume: 0.94, punctuationStyle: "neutral" },
  [ARCHETYPES.COMMANDER]: { voiceHints: ["guy", "davis", "david", "natural"], rate: 0.98, pitch: 0.88, volume: 1, punctuationStyle: "staccato" },
  [ARCHETYPES.MAGICAL]: { voiceHints: ["natural", "neural", "victoria", "sara", "jenny"], rate: 0.97, pitch: 1.06, volume: 0.95, punctuationStyle: "dramatic" },
  [ARCHETYPES.CELEBRITY]: { voiceHints: ["natural", "enhanced", "aria", "guy", "jenny"], rate: 1.03, pitch: 1.01, volume: 0.97, punctuationStyle: "neutral" },
  [ARCHETYPES.STEALTHY]: { voiceHints: ["natural", "neural", "david", "jenny"], rate: 0.96, pitch: 0.9, volume: 0.9, punctuationStyle: "dramatic" },
  [ARCHETYPES.MENTOR]: { voiceHints: ["natural", "enhanced", "davis", "libby", "jenny"], rate: 0.93, pitch: 0.93, volume: 0.94, punctuationStyle: "neutral" },
  [ARCHETYPES.TRICKSTER]: { voiceHints: ["natural", "enhanced", "aria", "zira", "guy"], rate: 1.14, pitch: 1.09, volume: 0.98, punctuationStyle: "staccato" }
});
function getSpeechPresetForArchetype(archetype, { expressive = true } = {}) {
  const key = String(archetype || "").trim();
  const preset = ARCHETYPE_SPEECH_PRESETS[key] || BASE;
  if (expressive !== false) {
    return { ...BASE, ...preset };
  }
  return {
    ...BASE,
    ...preset,
    // Neutral mode keeps a clear "host" personality rather than flattening to dry default TTS.
    rate: clamp(Number(preset.rate) * 0.45 + 0.62, 0.92, 1.16, 1.03),
    pitch: clamp(Number(preset.pitch) * 0.5 + 0.5, 0.9, 1.12, 0.98),
    volume: clamp(Number(preset.volume) * 0.6 + 0.36, 0.9, 1, 0.96),
    punctuationStyle: "host"
  };
}
function maybeTrimSentence(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim();
}
function stylizeVoiceCueText(text = "", archetype, { expressive = true, cueType = "entry" } = {}) {
  let next = maybeTrimSentence(text);
  if (!next) return "";
  if (!expressive) {
    if (cueType === "twist") {
      next = next.replace(/^Twist revealed:\s*/i, "Alright, twist revealed... ");
      if (!/[.!?]$/.test(next)) next = `${next}.`;
    } else if (cueType === "narration" || cueType === "round4") {
      if (!/^Alright[,.]/i.test(next) && !/^Okay[,.]/i.test(next)) {
        next = `Alright, ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
      }
      next = next.replace(/^Round (\d+) begins\.?$/i, "Alright, round $1 begins.");
      next = next.replace(/^Final evaluation begins\.?$/i, "Alright. Final evaluation begins.");
      next = next.replace(/^Scenario:\s+/i, "Scenario... ");
      next = next.replace(/^Twist:\s+/i, "Twist... ");
      if (!/[.!?]$/.test(next)) next = `${next}.`;
    } else if (cueType === "entry") {
      next = next.replace(/^([^:]{2,40}):\s+/, "$1, ");
      next = next.replace(/:\s+/g, ", ");
      next = next.replace(/\.\s+/g, ". ");
      if (!/[.!?]$/.test(next) && next.length > 14) next = `${next}.`;
    }
    return next;
  }
  const preset = getSpeechPresetForArchetype(archetype, { expressive: true });
  const punctuation = preset.punctuationStyle || "neutral";
  if (punctuation === "dramatic") {
    if (!/[.!?]$/.test(next)) next = `${next}.`;
    if (cueType === "round4" || cueType === "narration") {
      next = next.replace(/:\s+/g, "... ");
    }
  } else if (punctuation === "staccato") {
    next = next.replace(/\s+-\s+/g, ", ");
    if (cueType === "twist") {
      next = next.replace(/^Twist revealed:\s*/i, "Twist revealed. ");
    }
  }
  if (archetype === ARCHETYPES.VILLAIN && !/\.\.\./.test(next) && next.length > 20) {
    next = next.replace(/:\s+/g, "... ").replace(/,\s+/g, "... ").replace(/\. /g, "... ");
  }
  if ((archetype === ARCHETYPES.SPOOKY || archetype === ARCHETYPES.MYSTERIOUS) && cueType === "entry") {
    next = next.replace(/:\s+/g, "... ");
    next = next.replace(/,\s+/g, "... ");
    if (!/[.!?]$/.test(next)) next = `${next}...`;
  }
  if (archetype === ARCHETYPES.HEROIC && cueType === "entry") {
    next = next.replace(/:\s+/g, ". ");
    next = next.replace(/\s{2,}/g, " ");
    if (!/[.!?]$/.test(next)) next = `${next}.`;
  }
  if (archetype === ARCHETYPES.ROBOTIC && cueType === "entry") {
    next = next.replace(/:\s+/g, ". ");
    next = next.replace(/,\s+/g, ". ");
    const robotAdjacent = /\b(robot|android|cyborg|droid|protocol|unit|system|module|core|online|ai)\b/i.test(next);
    if (robotAdjacent && next.length > 12 && !/\bbeep\b/i.test(next)) {
      next = `Beep. ${next}`;
    }
  }
  if (archetype === ARCHETYPES.CUTE && cueType === "entry" && !/[!?]$/.test(next)) {
    next = `${next}!`;
  }
  if (archetype === ARCHETYPES.KID_CARTOON && cueType === "entry") {
    next = next.replace(/^([^:]{2,32}):\s+/i, "$1! ");
    if (!/[!?]$/.test(next)) next = `${next}!`;
  }
  if (archetype === ARCHETYPES.CHAOTIC && cueType === "entry") {
    next = next.replace(/:\s+/g, "! ");
    next = next.replace(/,\s+/g, ", ");
    if (!/[!?]$/.test(next)) next = `${next}!`;
  }
  if (archetype === ARCHETYPES.ANNOUNCER && (cueType === "narration" || cueType === "round4") && !/^Alright[,.]/i.test(next)) {
    next = `Alright, ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
  }
  if (next.length > 180) {
    next = `${next.slice(0, 177).trim()}...`;
  }
  return next;
}

// public/js/audio/voiceManager.js
function normalizeCue(rawCue = {}) {
  if (!rawCue || typeof rawCue !== "object") return null;
  const text = normalizeTrimmedText(rawCue.text);
  if (!text) return null;
  const priority = Number.isFinite(Number(rawCue.priority)) ? Number(rawCue.priority) : 50;
  const type = String(rawCue.type || "entry").trim() || "entry";
  const normalized = {
    id: normalizeTrimmedText(rawCue.id) || `vc-${hashString(`${type}|${text}|${Math.random()}`)}`,
    type,
    text,
    subtitleText: normalizeTrimmedText(rawCue.subtitleText) || text,
    archetype: rawCue.archetype ? String(rawCue.archetype) : "",
    intensity: clamp(rawCue.intensity, 0, 1, 0.6),
    priority,
    dedupeKey: normalizeTrimmedText(rawCue.dedupeKey) || `${type}:${text.toLowerCase()}`,
    preempt: rawCue.preempt === true,
    delayMs: Math.max(0, Number(rawCue.delayMs) || 0),
    speechSpec: rawCue.speechSpec && typeof rawCue.speechSpec === "object" ? { ...rawCue.speechSpec } : {}
  };
  return normalized;
}
function scoreVoiceQuality(voice) {
  const name = String(voice && voice.name || "").toLowerCase();
  const uri = String(voice && voice.voiceURI || "").toLowerCase();
  const lang = String(voice && voice.lang || "").toLowerCase();
  const text = `${name} ${uri}`;
  let score = 0;
  if (lang.startsWith("en-us")) score += 14;
  else if (lang.startsWith("en-gb")) score += 12;
  else if (lang.startsWith("en")) score += 10;
  if (voice && voice.default) score += 5;
  if (/(neural|natural|premium|enhanced)/.test(text)) score += 18;
  if (/(online \(natural\)|online natural)/.test(text)) score += 16;
  if (/(microsoft|google|apple)/.test(text)) score += 4;
  if (/(compact|espeak|festival)/.test(text)) score -= 12;
  return score;
}
function getVoiceStableId(voice) {
  if (!voice || typeof voice !== "object") return "";
  const uri = String(voice.voiceURI || "").trim();
  const name = String(voice.name || "").trim();
  const lang = String(voice.lang || "").trim();
  const base = uri || name;
  if (!base) return "";
  return `${base}::${lang}`;
}
function matchesVoiceId(voice, voiceId = "") {
  const target = String(voiceId || "").trim();
  if (!target) return false;
  const stable = getVoiceStableId(voice);
  if (stable && stable === target) return true;
  const uri = String(voice && voice.voiceURI || "").trim();
  const name = String(voice && voice.name || "").trim();
  return target === uri || target === name;
}
function pickBestVoice(voices = [], {
  lang = "en-US",
  voiceHints = [],
  diversityKey = "",
  archetype = "",
  qualityBias = 0
} = {}) {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!list.length) return null;
  const targetLang = String(lang || "en-US").toLowerCase();
  const hints = (Array.isArray(voiceHints) ? voiceHints : []).map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  const englishPool = list.filter((voice) => String(voice.lang || "").toLowerCase().startsWith("en"));
  const pool = englishPool.length ? englishPool : list;
  const diversitySeed = hashString(`${diversityKey}|${archetype}`);
  const ranked = pool.map((voice, index) => {
    const name = String(voice && voice.name || "").toLowerCase();
    const uri = String(voice && voice.voiceURI || "").toLowerCase();
    const langCode = String(voice && voice.lang || "").toLowerCase();
    const combined = `${name} ${uri}`;
    let score = scoreVoiceQuality(voice) + Number(qualityBias || 0);
    if (langCode === targetLang) score += 8;
    else if (langCode.startsWith(targetLang.split("-")[0] || "en")) score += 4;
    for (let i = 0; i < hints.length; i += 1) {
      if (combined.includes(hints[i])) score += 6;
    }
    const diversityBucket = hashString(`${diversitySeed}|${voice && voice.name || ""}`) % 7;
    score += (6 - Math.abs(diversitySeed % 7 - diversityBucket)) * 0.15;
    score += index * 1e-3;
    return { voice, score };
  }).sort((a, b) => b.score - a.score);
  return ranked[0] ? ranked[0].voice : null;
}
var VoiceManager = class {
  constructor(options = {}) {
    this.options = options && typeof options === "object" ? { ...options } : {};
    this.synth = null;
    this.supported = false;
    this.ready = false;
    this.unlocked = false;
    this.muted = false;
    this.enabled = true;
    this.expressiveMode = true;
    this.queue = [];
    this.maxQueue = Math.max(4, Number(this.options.maxQueue) || 16);
    this.activeCue = null;
    this.activeUtterance = null;
    this.activeCustomCancel = null;
    this.activeCancelPromise = null;
    this.activeToken = 0;
    this.activeDelayTimer = null;
    this.queueSeq = 0;
    this.voices = [];
    this.voiceCacheByArchetype = /* @__PURE__ */ new Map();
    this.recentDedupe = /* @__PURE__ */ new Map();
    this.lastPrimeAt = 0;
    this._voicesChangeHandler = null;
  }
  _browserSpeechDisabled() {
    return this.options && this.options.disableBrowserSpeech === true;
  }
  _hasCustomSpeaker() {
    return Boolean(this.options && typeof this.options.customSpeak === "function");
  }
  init() {
    if (this.ready) return Promise.resolve(this.getState());
    this.supported = this._isSpeechSupported();
    if (!this.supported) {
      this.ready = true;
      this._notifyStateChange();
      return Promise.resolve(this.getState());
    }
    if (this._browserSpeechDisabled() && this._hasCustomSpeaker()) {
      this.synth = null;
      this.voices = [];
      this.ready = true;
      this._notifyStateChange();
      this._drain();
      return Promise.resolve(this.getState());
    }
    this.synth = this._getSynth();
    this._refreshVoices();
    this._installVoiceChangeListener();
    this.ready = true;
    this._notifyStateChange();
    this._drain();
    return Promise.resolve(this.getState());
  }
  unlock() {
    if (!this.ready) {
      void this.init();
    }
    this.unlocked = true;
    this._primeSpeechOnGesture();
    this._notifyStateChange();
    this._drain();
  }
  setMuted(muted) {
    const next = muted === true;
    if (this.muted === next) return;
    this.muted = next;
    if (this.muted) {
      this._cancelActive("muted");
    }
    this._notifyStateChange();
  }
  setEnabled(enabled) {
    const next = enabled !== false;
    if (this.enabled === next) return;
    this.enabled = next;
    if (!this.enabled) {
      this.clearQueue("disabled", { includeActive: true });
    }
    this._notifyStateChange();
    this._drain();
  }
  setExpressiveMode(enabled) {
    this.expressiveMode = enabled !== false;
    this._notifyStateChange();
  }
  refreshVoices() {
    this._refreshVoices();
    this.voiceCacheByArchetype.clear();
    this._notifyStateChange();
    return this.getVoicesCatalog();
  }
  getVoicesCatalog() {
    const list = Array.isArray(this.voices) ? this.voices : [];
    return list.map((voice, index) => ({
      id: getVoiceStableId(voice) || `voice-${index}`,
      name: String(voice && voice.name || "").trim() || `Voice ${index + 1}`,
      lang: String(voice && voice.lang || "").trim() || "",
      voiceURI: String(voice && voice.voiceURI || "").trim() || "",
      default: Boolean(voice && voice.default),
      localService: voice && typeof voice.localService === "boolean" ? voice.localService : null,
      qualityScore: scoreVoiceQuality(voice)
    }));
  }
  enqueue(rawCue) {
    const cue = normalizeCue(rawCue);
    if (!cue) return { enqueued: false, reason: "invalid" };
    if (!this.supported) return { enqueued: false, reason: "unsupported" };
    if (!this.enabled) return { enqueued: false, reason: "disabled" };
    this._pruneRecentDedupe();
    if (cue.dedupeKey && this.recentDedupe.has(cue.dedupeKey)) {
      return { enqueued: false, reason: "duplicate" };
    }
    if (cue.preempt === true) {
      this.clearQueue("preempt", { includeActive: true });
    }
    if (this.queue.length >= this.maxQueue && cue.priority <= 35) {
      return { enqueued: false, reason: "queue_full_low_priority" };
    }
    const queueItem = {
      ...cue,
      _seq: ++this.queueSeq,
      _enqueuedAt: nowMs()
    };
    this.queue.push(queueItem);
    this._pruneQueueBacklog();
    this._sortQueue();
    this._notifyStateChange();
    this._drain();
    return { enqueued: true, cue: queueItem };
  }
  clearQueue(reason = "clear", options = {}) {
    const opts = options && typeof options === "object" ? options : {};
    const types = Array.isArray(opts.types) ? new Set(opts.types.map((t) => String(t))) : null;
    if (types) {
      this.queue = this.queue.filter((cue) => !types.has(String(cue.type || "")));
    } else {
      this.queue = [];
    }
    if (opts.includeActive === true) {
      if (!types || this.activeCue && types.has(String(this.activeCue.type || ""))) {
        this._cancelActive(reason);
      }
    }
    this._notifyStateChange();
    this._drain();
  }
  getState() {
    return {
      supported: this.supported,
      ready: this.ready,
      unlocked: this.unlocked,
      muted: this.muted,
      enabled: this.enabled,
      expressiveMode: this.expressiveMode,
      queued: this.queue.length,
      speaking: Boolean(this.activeCue),
      voicesLoaded: this.voices.length,
      activeCueType: this.activeCue ? String(this.activeCue.type || "") : "",
      activeCueText: this.activeCue ? String(this.activeCue.subtitleText || this.activeCue.text || "") : ""
    };
  }
  _isSpeechSupported() {
    try {
      if (this._hasCustomSpeaker()) return true;
      return typeof window !== "undefined" && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";
    } catch (error) {
      return false;
    }
  }
  _getSynth() {
    try {
      if (this._browserSpeechDisabled()) return null;
      return this._isSpeechSupported() ? window.speechSynthesis : null;
    } catch (error) {
      return null;
    }
  }
  _installVoiceChangeListener() {
    if (!this.synth || typeof this.synth.addEventListener !== "function") return;
    if (this._voicesChangeHandler) return;
    this._voicesChangeHandler = () => {
      this._refreshVoices();
      this.voiceCacheByArchetype.clear();
      this._notifyStateChange();
    };
    try {
      this.synth.addEventListener("voiceschanged", this._voicesChangeHandler);
    } catch (error) {
    }
  }
  _refreshVoices() {
    if (this._browserSpeechDisabled()) {
      this.voices = [];
      return this.voices;
    }
    if (!this.synth || typeof this.synth.getVoices !== "function") {
      this.voices = [];
      return this.voices;
    }
    try {
      const next = this.synth.getVoices() || [];
      this.voices = Array.isArray(next) ? next.filter(Boolean) : [];
    } catch (error) {
      this.voices = [];
    }
    return this.voices;
  }
  _primeSpeechOnGesture() {
    if (!this.supported) return;
    if (this._browserSpeechDisabled()) return;
    const synth = this._getSynth();
    if (!synth) return;
    const now = nowMs();
    if (now - this.lastPrimeAt < 2e3) return;
    this.lastPrimeAt = now;
    try {
      this._refreshVoices();
      const utter = new SpeechSynthesisUtterance(".");
      utter.volume = 0;
      utter.rate = 1;
      utter.pitch = 1;
      utter.onend = () => {
      };
      utter.onerror = () => {
      };
      synth.speak(utter);
      window.setTimeout(() => {
        try {
          synth.cancel();
        } catch (error) {
        }
      }, 40);
    } catch (error) {
    }
  }
  _sortQueue() {
    this.queue.sort((a, b) => {
      if (Number(b.priority) !== Number(a.priority)) return Number(b.priority) - Number(a.priority);
      if (Number(a._seq) !== Number(b._seq)) return Number(a._seq) - Number(b._seq);
      return 0;
    });
  }
  _pruneQueueBacklog() {
    if (this.queue.length <= this.maxQueue) return;
    const keep = [];
    const sorted = this.queue.slice().sort((a, b) => {
      if (Number(b.priority) !== Number(a.priority)) return Number(b.priority) - Number(a.priority);
      return Number(a._seq) - Number(b._seq);
    });
    for (let i = 0; i < sorted.length; i += 1) {
      const cue = sorted[i];
      if (keep.length < this.maxQueue) {
        keep.push(cue);
        continue;
      }
      if (cue.type === "entry" && Number(cue.priority) <= 40) {
        continue;
      }
    }
    this.queue = keep;
    this._sortQueue();
  }
  _pruneRecentDedupe() {
    const now = nowMs();
    const ttl = Math.max(2e3, Number(this.options.dedupeTtlMs) || 12e3);
    for (const [key, ts] of this.recentDedupe.entries()) {
      if (now - ts > ttl) {
        this.recentDedupe.delete(key);
      }
    }
  }
  _computeCueOutputVolume(cue) {
    const getter = this.options && typeof this.options.getVolumeForCue === "function" ? this.options.getVolumeForCue : null;
    const base = getter ? Number(getter(cue)) : 1;
    const safeBase = clamp(base, 0, 1, 1);
    return this.muted ? 0 : safeBase;
  }
  _selectVoiceForCue(cue, preset) {
    const preferredVoiceId = this.options && typeof this.options.getPreferredVoiceIdForCue === "function" ? String(this.options.getPreferredVoiceIdForCue(cue, {
      expressiveMode: this.expressiveMode,
      voices: this.getVoicesCatalog()
    }) || "").trim() : "";
    if (preferredVoiceId) {
      const explicit = this.voices.find((voice2) => matchesVoiceId(voice2, preferredVoiceId));
      if (explicit) return explicit;
    }
    const archetype = String(cue.archetype || "");
    const cacheKey = `${this.expressiveMode ? "x" : "n"}|${archetype}|${cue.type}|${cue.speechSpec && cue.speechSpec.voiceStyle ? cue.speechSpec.voiceStyle : ""}|${preferredVoiceId}`;
    const cached = this.voiceCacheByArchetype.get(cacheKey);
    if (cached && this.voices.includes(cached)) return cached;
    const voice = pickBestVoice(this.voices, {
      lang: cue.speechSpec && cue.speechSpec.lang || "en-US",
      voiceHints: preset.voiceHints || [],
      diversityKey: `${cue.type}|${cue.dedupeKey || cue.id}`,
      archetype,
      qualityBias: 0
    });
    if (voice) this.voiceCacheByArchetype.set(cacheKey, voice);
    return voice;
  }
  _buildSpeakingPlan(cue) {
    const inferred = cue.archetype ? { archetype: cue.archetype, confidence: 0.65, intensity: cue.intensity } : classifyVoiceCueArchetype({
      ...cue,
      voiceStyle: cue.speechSpec && cue.speechSpec.voiceStyle
    });
    const neutralPersonaArchetype = (() => {
      const cueType = String(cue && cue.type || "").toLowerCase();
      if (cueType === "entry") return ARCHETYPES.ANNOUNCER;
      if (cueType === "twist") return ARCHETYPES.ANNOUNCER;
      if (cueType === "round4") return ARCHETYPES.NARRATOR;
      return ARCHETYPES.ANNOUNCER;
    })();
    const expressiveArchetype = inferred && inferred.archetype ? inferred.archetype : ARCHETYPES.ANNOUNCER;
    const archetype = this.expressiveMode ? expressiveArchetype : neutralPersonaArchetype;
    const intensity = clamp(
      cue.intensity != null ? cue.intensity : inferred && inferred.intensity,
      0,
      1,
      0.58
    );
    const preset = getSpeechPresetForArchetype(archetype, { expressive: this.expressiveMode });
    const presetForBackend = this._browserSpeechDisabled() ? { ...preset, voiceHints: [] } : preset;
    const stylizedText = stylizeVoiceCueText(cue.text, archetype, {
      expressive: this.expressiveMode,
      cueType: cue.type
    });
    const voice = this._selectVoiceForCue(cue, presetForBackend);
    const rawSpeechRate = clamp(cue.speechSpec && cue.speechSpec.rate, 0.6, 2, presetForBackend.rate || 1);
    const rawSpeechPitch = clamp(cue.speechSpec && cue.speechSpec.pitch, 0.4, 2, presetForBackend.pitch || 1);
    const rateBlendWeight = this.expressiveMode ? 0.28 : 0.04;
    const pitchBlendWeight = this.expressiveMode ? 0.24 : 0.03;
    const rateBase = Number(presetForBackend.rate) * (1 - rateBlendWeight) + rawSpeechRate * rateBlendWeight;
    const pitchBase = Number(presetForBackend.pitch) * (1 - pitchBlendWeight) + rawSpeechPitch * pitchBlendWeight;
    const gainBase = clamp(cue.speechSpec && cue.speechSpec.gain, 0, 2, presetForBackend.volume || 1);
    const intensityRateDelta = this.expressiveMode ? (intensity - 0.5) * 0.32 : (intensity - 0.5) * 0.12;
    const intensityPitchDelta = this.expressiveMode ? (intensity - 0.5) * 0.28 : (intensity - 0.5) * 0.08;
    const rate = clamp(rateBase + intensityRateDelta, this.expressiveMode ? 0.72 : 0.9, this.expressiveMode ? 1.85 : 1.22, 1);
    const pitch = clamp(pitchBase + intensityPitchDelta, this.expressiveMode ? 0.62 : 0.9, this.expressiveMode ? 1.55 : 1.16, 1);
    return {
      archetype,
      stylizedText,
      subtitleText: cue.subtitleText || cue.text,
      voice,
      rate,
      pitch,
      gain: gainBase
    };
  }
  _drain() {
    if (!this.supported || !this.ready || !this.enabled || this.muted || !this.unlocked) return;
    if (this.activeCue || this.activeDelayTimer || this.activeCancelPromise) return;
    if (!this.queue.length) return;
    const nextCue = this.queue.shift();
    if (!nextCue) return;
    this._speakCue(nextCue);
    this._notifyStateChange();
  }
  _speakCue(cue) {
    const plan = this._buildSpeakingPlan(cue);
    const volume = clamp(this._computeCueOutputVolume(cue) * (Number(plan.gain) || 1), 0, 1, 1);
    if (volume <= 1e-4) {
      this._markCueConsumed(cue);
      this._finishActiveCue();
      return;
    }
    const token = ++this.activeToken;
    this.activeCue = cue;
    const startSpeak = () => {
      if (token !== this.activeToken) return;
      const synth = this._getSynth();
      try {
        if (synth && typeof synth.cancel === "function") synth.cancel();
      } catch (error) {
      }
      const customSpeak = this.options && typeof this.options.customSpeak === "function" ? this.options.customSpeak : null;
      if (customSpeak) {
        let startedByCustom = false;
        let endedByCustom = false;
        const startFromCustom = () => {
          if (token !== this.activeToken || startedByCustom) return;
          startedByCustom = true;
          this._markCueConsumed(cue);
          this._notifyCueStart(cue, plan);
          this._notifyStateChange();
        };
        const endFromCustom = (status = "end") => {
          if (token !== this.activeToken || endedByCustom) return;
          endedByCustom = true;
          if (!startedByCustom) {
            startFromCustom();
          }
          this.activeCustomCancel = null;
          this._notifyCueEnd(cue, plan, status);
          this._finishActiveCue();
        };
        try {
          const customResult = customSpeak({
            cue,
            plan,
            volume,
            expressiveMode: this.expressiveMode,
            start: startFromCustom,
            end: endFromCustom
          });
          const onResolved = (result) => {
            if (token !== this.activeToken) return;
            if (result && result.handled === true) {
              this.activeCustomCancel = typeof result.cancel === "function" ? result.cancel : null;
              if (result.started === true) startFromCustom();
              return;
            }
            if (!synth || typeof window.SpeechSynthesisUtterance !== "function") {
              this._notifyCueEnd(cue, plan, "error");
              this._finishActiveCue();
              return;
            }
            let utterance2;
            try {
              utterance2 = new SpeechSynthesisUtterance(plan.stylizedText || cue.text);
            } catch (error) {
              this._markCueConsumed(cue);
              this._finishActiveCue();
              return;
            }
            this.activeUtterance = utterance2;
            try {
              utterance2.volume = volume;
            } catch (error) {
            }
            try {
              utterance2.rate = plan.rate;
            } catch (error) {
            }
            try {
              utterance2.pitch = plan.pitch;
            } catch (error) {
            }
            if (plan.voice) {
              try {
                utterance2.voice = plan.voice;
              } catch (error) {
              }
              try {
                if (plan.voice.lang) utterance2.lang = plan.voice.lang;
              } catch (error) {
              }
            }
            utterance2.onstart = () => {
              if (token !== this.activeToken) return;
              this._markCueConsumed(cue);
              this._notifyCueStart(cue, plan);
              this._notifyStateChange();
            };
            const finalize2 = (status) => () => {
              if (token !== this.activeToken) return;
              this._notifyCueEnd(cue, plan, status);
              this._finishActiveCue();
            };
            utterance2.onend = finalize2("end");
            utterance2.onerror = finalize2("error");
            try {
              synth.speak(utterance2);
            } catch (error) {
              this._notifyCueEnd(cue, plan, "error");
              this._finishActiveCue();
            }
          };
          if (customResult && typeof customResult.then === "function") {
            customResult.then(onResolved).catch(() => {
              if (token !== this.activeToken) return;
              this._notifyCueEnd(cue, plan, "error");
              this._finishActiveCue();
            });
            return;
          }
          onResolved(customResult);
          return;
        } catch (error) {
        }
      }
      if (!synth || typeof window.SpeechSynthesisUtterance !== "function") {
        this._notifyCueEnd(cue, plan, "error");
        this._finishActiveCue();
        return;
      }
      let utterance;
      try {
        utterance = new SpeechSynthesisUtterance(plan.stylizedText || cue.text);
      } catch (error) {
        this._markCueConsumed(cue);
        this._finishActiveCue();
        return;
      }
      this.activeUtterance = utterance;
      try {
        utterance.volume = volume;
      } catch (error) {
      }
      try {
        utterance.rate = plan.rate;
      } catch (error) {
      }
      try {
        utterance.pitch = plan.pitch;
      } catch (error) {
      }
      if (plan.voice) {
        try {
          utterance.voice = plan.voice;
        } catch (error) {
        }
        try {
          if (plan.voice.lang) utterance.lang = plan.voice.lang;
        } catch (error) {
        }
      }
      utterance.onstart = () => {
        if (token !== this.activeToken) return;
        this._markCueConsumed(cue);
        this._notifyCueStart(cue, plan);
        this._notifyStateChange();
      };
      const finalize = (status) => () => {
        if (token !== this.activeToken) return;
        this._notifyCueEnd(cue, plan, status);
        this._finishActiveCue();
      };
      utterance.onend = finalize("end");
      utterance.onerror = finalize("error");
      try {
        synth.speak(utterance);
      } catch (error) {
        this._notifyCueEnd(cue, plan, "error");
        this._finishActiveCue();
      }
    };
    const delayMs = Math.max(0, Number(cue.delayMs) || 0);
    if (delayMs > 0) {
      this.activeDelayTimer = window.setTimeout(() => {
        if (token !== this.activeToken) return;
        this.activeDelayTimer = null;
        startSpeak();
      }, delayMs);
      return;
    }
    startSpeak();
  }
  _markCueConsumed(cue) {
    if (!cue || !cue.dedupeKey) return;
    this.recentDedupe.set(cue.dedupeKey, nowMs());
  }
  _cancelActive(reason = "cancel") {
    if (this.activeDelayTimer) {
      window.clearTimeout(this.activeDelayTimer);
      this.activeDelayTimer = null;
    }
    if (this.activeCue || this.activeUtterance) {
      this._notifyCueEnd(this.activeCue, null, reason);
    }
    this.activeCue = null;
    this.activeUtterance = null;
    const customCancel = this.activeCustomCancel;
    this.activeCustomCancel = null;
    let cancelPromise = null;
    if (customCancel) {
      try {
        const customResult = customCancel({
          reason,
          fadeOutMs: reason === "preempt" ? 85 : 0
        });
        if (customResult && typeof customResult.then === "function") {
          cancelPromise = customResult;
        }
      } catch (error) {
      }
    }
    this.activeToken += 1;
    try {
      const synth = this._getSynth();
      if (synth && typeof synth.cancel === "function") synth.cancel();
    } catch (error) {
    }
    if (cancelPromise) {
      const waitFor = Promise.resolve(cancelPromise).catch(() => {
      }).finally(() => {
        if (this.activeCancelPromise === waitFor) {
          this.activeCancelPromise = null;
        }
        this._notifyStateChange();
        this._drain();
      });
      this.activeCancelPromise = waitFor;
    }
    this._notifyStateChange();
  }
  _finishActiveCue() {
    this.activeCue = null;
    this.activeUtterance = null;
    this.activeCustomCancel = null;
    if (this.activeDelayTimer) {
      window.clearTimeout(this.activeDelayTimer);
      this.activeDelayTimer = null;
    }
    this._notifyStateChange();
    this._drain();
  }
  _notifyStateChange() {
    if (typeof this.options.onStateChange !== "function") return;
    try {
      this.options.onStateChange(this.getState());
    } catch (error) {
    }
  }
  _notifyCueStart(cue, plan) {
    if (typeof this.options.onCueStart !== "function") return;
    try {
      this.options.onCueStart({
        cue,
        plan,
        state: this.getState()
      });
    } catch (error) {
    }
  }
  _notifyCueEnd(cue, plan, status) {
    if (typeof this.options.onCueEnd !== "function") return;
    try {
      this.options.onCueEnd({
        cue,
        plan,
        status,
        state: this.getState()
      });
    } catch (error) {
    }
  }
};

// public/js/audio/phaseVoiceCueFallbacks.js
function hashVoiceCueSeed(input = "") {
  const text = String(input || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash >>> 0);
}
function pickVoiceCueVariant(list = [], seed = "") {
  const options = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!options.length) return "";
  return String(options[hashVoiceCueSeed(seed) % options.length] || "");
}
function detectTwistConnectorPhrase(twist = "") {
  const raw = String(twist || "").trim();
  if (!raw) return { connector: "", remainder: "" };
  const parts = raw.split(/\s+/).filter(Boolean);
  const connector = String(parts[0] || "").toUpperCase();
  const known = /* @__PURE__ */ new Set(["WITH", "UNDER", "DURING", "WHILE", "USING", "WITHOUT", "AS", "ON", "IN", "BY", "THROUGH", "AMID", "AGAINST", "AFTER", "BEFORE", "INSIDE", "OUTSIDE", "NO", "ONLY", "BUT"]);
  if (!known.has(connector)) return { connector: "", remainder: raw };
  return { connector, remainder: parts.slice(1).join(" ").trim() };
}
function normalizeContextToken(value = "") {
  const cleaned = String(value || "").trim().replace(/[.]+$/g, "");
  const upper = cleaned.toUpperCase();
  if (!upper) return "";
  if (upper === "NO PLOT TWIST" || upper === "NO FINAL TWIST" || upper === "NO FINAL SCENARIO" || upper === "NONE" || upper === "N/A") {
    return "";
  }
  return cleaned;
}
function buildFallbackRoundStartLead(roundNumber, scenario = "", twist = "") {
  return pickVoiceCueVariant([
    `Round ${roundNumber}!`,
    `Round ${roundNumber}... let's go!`,
    `Round ${roundNumber}! Here we go!`,
    `Round ${roundNumber} is live!`
  ], `roundstart:${roundNumber}:${scenario}:${twist}`);
}
function buildFallbackScenarioLead(roundNumber, scenario = "") {
  const variantsByRound = {
    1: ["The scenario?", "Your scenario?", "Scenario check!"],
    2: ["This round's scenario?", "Your challenge?", "Scenario drop!"],
    3: ["Scenario time!", "Here's the scenario!", "The setup?"]
  };
  const pool = variantsByRound[roundNumber] || ["The scenario?", "Scenario check!", "Here's the scenario!"];
  return pickVoiceCueVariant(pool, `scenario:${roundNumber}:${scenario}`);
}
function buildFallbackTwistLine(twist = "", roundNumber = 0) {
  const safeTwist = normalizeContextToken(twist);
  const spokenTwist = String(safeTwist || "").split("|")[0].trim();
  if (!spokenTwist) return "";
  const { connector, remainder } = detectTwistConnectorPhrase(spokenTwist);
  if (connector) {
    if (remainder) {
      if (connector === "BUT") {
        const flourish = pickVoiceCueVariant(["...", "!", "!!"], `twist-flourish:${roundNumber}:${spokenTwist}`);
        return `${connector}${flourish} ${remainder}!`;
      }
      return `${connector} ${remainder}!`;
    }
    return `${connector}!`;
  }
  const prefix = pickVoiceCueVariant(["BUT...", "AND...", "NOW..."], `twist-prefix:${roundNumber}:${spokenTwist}`);
  return `${prefix} ${spokenTwist}!`;
}
function buildFallbackRound4PreludeLine(scenario = "", twist = "") {
  const safeScenario = normalizeContextToken(scenario);
  const safeTwist = normalizeContextToken(twist);
  if (!safeScenario && !safeTwist) {
    return pickVoiceCueVariant([
      "Round 4! Full team final check!",
      "Round 4! Final team evaluation incoming!",
      "Final check! The full team is up next!"
    ], "round4-prelude:fallback");
  }
  const twistLine = buildFallbackTwistLine(safeTwist, 4);
  const mission = safeScenario || "face the final evaluation";
  return pickVoiceCueVariant([
    `Round 4! Your full team has to ${mission}${twistLine ? `. ${twistLine}` : "!"}`,
    `So... your full team now has to ${mission}${twistLine ? `. ${twistLine}` : "!"}`,
    `Final brief! Full squad mission: ${mission}${twistLine ? `. ${twistLine}` : "!"}`,
    `Here we go... full team task: ${mission}${twistLine ? `. ${twistLine}` : "!"}`
  ], `round4-prelude:${safeScenario}:${safeTwist}`);
}

// public/js/audio/phaseVoiceCueBuilder.js
function isDisabledContextToken(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return true;
  return normalized === "NO PLOT TWIST" || normalized === "NO FINAL SCENARIO" || normalized === "NO FINAL TWIST" || normalized === "NONE" || normalized === "N/A";
}
function buildPhaseVoiceCuesWithState(kind = "", data = {}, gameState2 = {}) {
  const safe = data && typeof data === "object" ? data : {};
  const gs = gameState2 && typeof gameState2 === "object" ? gameState2 : {};
  const roundNumber = Number(safe.roundNumber) || Number(gs.currentRound) || 0;
  const scenario = String(safe.scenario || gs.currentScenario || "").trim();
  const twist = String(safe.twist || gs.currentTwist || "").trim();
  const kindKey = String(kind || "").toLowerCase();
  if (kindKey === "roundstart") {
    if (safe.isFinalRound === true || roundNumber === 4) {
      const finaleLead = buildFallbackRound4PreludeLine(scenario, twist);
      return [{
        type: "round4",
        text: finaleLead,
        subtitleText: finaleLead,
        archetype: ARCHETYPES.NARRATOR,
        intensity: 0.62,
        priority: 78,
        dedupeKey: `phase:round4:start:${roundNumber}`
      }];
    }
    return [{
      type: "narration",
      text: buildFallbackRoundStartLead(roundNumber, scenario, twist),
      subtitleText: `Round ${roundNumber}!`,
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.58,
      priority: 62,
      dedupeKey: `phase:round:start:${roundNumber}`
    }];
  }
  if (kindKey === "scenario") {
    if (!scenario) return [];
    return [{
      type: "narration",
      text: `${buildFallbackScenarioLead(roundNumber, scenario)} ${scenario}${pickVoiceCueVariant([".", "!", "..."], `scenario-punct:${roundNumber}:${scenario}`)}`,
      subtitleText: `Scenario: ${scenario}`,
      archetype: ARCHETYPES.NARRATOR,
      intensity: 0.6,
      priority: 70,
      dedupeKey: `phase:scenario:${roundNumber}:${scenario.toLowerCase()}`
    }];
  }
  if (kindKey === "category") {
    const lockedCategory = safe && safe.lockedCategory && typeof safe.lockedCategory === "object" ? safe.lockedCategory : null;
    const category = String(
      safe.categoryLabel || lockedCategory && (lockedCategory.label || lockedCategory.name || lockedCategory.slug) || ""
    ).trim();
    if (!category) return [];
    return [{
      type: "narration",
      text: `Category locked: ${category}.`,
      subtitleText: `Category: ${category}`,
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.62,
      priority: 68,
      dedupeKey: `phase:category:${roundNumber}:${category.toLowerCase()}`
    }];
  }
  if (kindKey === "twist") {
    if (!twist || isDisabledContextToken(twist)) return [];
    return [{
      type: "twist",
      text: buildFallbackTwistLine(twist, roundNumber),
      subtitleText: `Twist: ${twist}`,
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.74,
      priority: 76,
      dedupeKey: `phase:twist:${roundNumber}:${twist.toLowerCase()}`
    }];
  }
  if (kindKey === "round4start") {
    const cues = [];
    if (scenario && !isDisabledContextToken(scenario)) {
      cues.push({
        type: "round4",
        text: `Scenario: ${scenario}.`,
        subtitleText: `Scenario: ${scenario}`,
        archetype: ARCHETYPES.NARRATOR,
        intensity: 0.62,
        priority: 84,
        dedupeKey: `round4:start:scenario:${(scenario || "").toLowerCase()}`
      });
    }
    if (twist && !isDisabledContextToken(twist)) {
      const spokenTwist = String(twist || "").split("|")[0].trim();
      if (spokenTwist) {
        cues.push({
          type: "round4",
          text: `Twist: ${spokenTwist}.`,
          subtitleText: `Twist: ${twist}`,
          archetype: ARCHETYPES.NARRATOR,
          intensity: 0.62,
          priority: 84,
          dedupeKey: `round4:start:twist:${String(twist || "").toLowerCase()}`
        });
      }
    }
    return cues;
  }
  if (kindKey === "round4evaluated") {
    return [{
      type: "round4",
      text: "Round four results are in.",
      subtitleText: "Round 4 complete - reveal starting",
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.62,
      priority: 80,
      dedupeKey: `round4:evaluated:${safe.isTie === true ? "tie" : "clear"}:${String(safe.evaluationId || "")}`
    }];
  }
  if (kindKey === "finalresults") {
    return [{
      type: "round4",
      text: safe && safe.isTie ? "Final round tally locked. Tie result." : "Final round tally locked.",
      subtitleText: safe && safe.isTie ? "Final round tie locked" : "Final round tally locked",
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.55,
      priority: 60,
      dedupeKey: `round4:finalresults:${safe && safe.isTie ? "tie" : "normal"}`
    }];
  }
  if (kindKey === "gameended") {
    const winnerName = String(safe && safe.winner && safe.winner.name || "").trim();
    return [{
      type: "round4",
      text: winnerName ? `${winnerName} wins the match.` : "Match complete. Final results are live.",
      subtitleText: winnerName ? `${winnerName} wins the match` : "Match complete",
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.66,
      priority: 72,
      dedupeKey: `game:end:${winnerName.toLowerCase()}`
    }];
  }
  return [];
}

// public/js/audio/catalogUtils.js
function buildKokoroCatalogSignature(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return "";
  return entries.map((entry) => `${String(entry && entry.id || "")}|${String(entry && entry.name || "")}|${String(entry && entry.overallGrade || "")}`).join("||");
}
function buildKokoroFallbackCatalogEntry(id = "", presetMetaById = {}) {
  const voiceId = String(id || "").trim();
  const meta = presetMetaById && presetMetaById[voiceId] ? presetMetaById[voiceId] : null;
  const isUk = voiceId.startsWith("bf_") || voiceId.startsWith("bm_");
  return {
    id: voiceId,
    name: meta && meta.shortName ? meta.shortName : voiceId || "Voice",
    language: isUk ? "en-gb" : "en-us",
    overallGrade: "",
    roleHint: meta && meta.roleHint ? meta.roleHint : ""
  };
}
function buildKokoroFallbackCatalog(curatedVoiceIds = [], presetMetaById = {}) {
  if (!Array.isArray(curatedVoiceIds) || !curatedVoiceIds.length) return [];
  return curatedVoiceIds.map((id) => buildKokoroFallbackCatalogEntry(id, presetMetaById));
}
function buildKokoroCuratedCatalog(rawCatalog = [], curatedVoiceIds = [], presetMetaById = {}) {
  if (!Array.isArray(curatedVoiceIds) || !curatedVoiceIds.length) return [];
  if (!Array.isArray(rawCatalog) || !rawCatalog.length) {
    return buildKokoroFallbackCatalog(curatedVoiceIds, presetMetaById);
  }
  const byId = /* @__PURE__ */ new Map();
  rawCatalog.forEach((entry) => {
    const id = String(entry && entry.id || "").trim();
    if (!id) return;
    byId.set(id, {
      ...entry,
      roleHint: presetMetaById[id] && presetMetaById[id].roleHint || ""
    });
  });
  return curatedVoiceIds.map((id) => byId.get(id) || buildKokoroFallbackCatalogEntry(id, presetMetaById));
}
function formatKokoroCatalogLabel(entry = {}, presetMetaById = {}) {
  const id = String(entry && entry.id || "").trim();
  const preset = presetMetaById && presetMetaById[id] ? presetMetaById[id] : null;
  if (preset && preset.menuLabel) return preset.menuLabel;
  const name = String(entry && entry.name || id || "Voice").trim();
  const lang = String(entry && entry.language || "").trim();
  const grade = String(entry && entry.overallGrade || "").trim();
  const roleHint = String(entry && entry.roleHint || "").trim();
  const parts = [name];
  if (lang) parts.push(lang.toUpperCase());
  if (grade) parts.push(grade);
  if (roleHint) parts.push(roleHint);
  return parts.join(" - ");
}
function buildVoiceCatalogSignature(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return "";
  return entries.map((entry) => `${entry && entry.id ? entry.id : ""}|${entry && entry.qualityScore != null ? entry.qualityScore : ""}`).join("||");
}
function sortVoiceCatalogEntries(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return [];
  return entries.slice().sort((a, b) => {
    const scoreDiff = Number(b && b.qualityScore || 0) - Number(a && a.qualityScore || 0);
    if (scoreDiff) return scoreDiff;
    return String(a && a.name || "").localeCompare(String(b && b.name || ""));
  });
}

// public/js/audio/mediaUtils.js
function writeAsciiToView(view, offset, text) {
  for (let idx = 0; idx < text.length; idx += 1) {
    view.setUint8(offset + idx, text.charCodeAt(idx));
  }
}
function encodeAudioPathSegment(filename = "") {
  return String(filename || "").split("/").map((part) => encodeURIComponent(part)).join("/");
}
function buildSilentWavDataUri(durationMs = 90) {
  try {
    const sampleRate = 8e3;
    const sampleCount = Math.max(1, Math.round(Math.max(10, Number(durationMs) || 90) / 1e3 * sampleRate));
    const dataSize = sampleCount;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    writeAsciiToView(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeAsciiToView(view, 8, "WAVE");
    writeAsciiToView(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    writeAsciiToView(view, 36, "data");
    view.setUint32(40, dataSize, true);
    for (let idx = 0; idx < dataSize; idx += 1) {
      view.setUint8(44 + idx, 128);
    }
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let idx = 0; idx < bytes.length; idx += 1) {
      binary += String.fromCharCode(bytes[idx]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  } catch (error) {
    return "";
  }
}
function getAudioCategoryMeta(category = "sfx") {
  const key = String(category || "sfx").toLowerCase();
  if (key === "music") return { enabledKey: "musicEnabled", volumeKey: "musicVolume", gainKey: "musicGain", label: "Music" };
  if (key === "reveal") return { enabledKey: "revealEnabled", volumeKey: "revealVolume", gainKey: "revealGain", label: "Reveal" };
  if (key === "card" || key === "cards" || key === "blurb" || key === "voice") return { enabledKey: "cardEnabled", volumeKey: "cardVolume", gainKey: "cardGain", label: "Callouts" };
  return { enabledKey: "sfxEnabled", volumeKey: "sfxVolume", gainKey: "sfxGain", label: "UI" };
}

// public/js/audio/iosVoiceMap.js
var IOS_CURATED_VOICE_PROFILES = Object.freeze({
  af_heart: Object.freeze({
    desiredGender: "female",
    preferredLangs: Object.freeze(["en-us", "en"]),
    nameHints: Object.freeze(["jenny", "samantha", "ava", "karen", "victoria", "serena", "susan"])
  }),
  af_bella: Object.freeze({
    desiredGender: "female",
    preferredLangs: Object.freeze(["en-us", "en"]),
    nameHints: Object.freeze(["aria", "allison", "zoe", "moira", "serena", "victoria", "susan"])
  }),
  am_michael: Object.freeze({
    desiredGender: "male",
    preferredLangs: Object.freeze(["en-us", "en"]),
    nameHints: Object.freeze(["aaron", "nathan", "tom", "fred", "alex", "daniel"])
  }),
  bm_george: Object.freeze({
    desiredGender: "male",
    preferredLangs: Object.freeze(["en-gb", "en"]),
    nameHints: Object.freeze(["daniel", "arthur", "gordon", "oliver", "thomas", "rishi"])
  })
});
var DISALLOWED_VOICE_NAME_RE = /(compact|espeak|festival|robot)/i;
var FEMALE_VOICE_NAME_RE = /(female|woman|girl|aria|allison|zoe|moira|jenny|samantha|ava|karen|victoria|serena|susan|kathy|salli|joanna)/i;
var MALE_VOICE_NAME_RE = /(male|man|guy|ryan|george|david|daniel|aaron|nathan|tom|fred|alex|arthur|gordon|oliver|thomas|rishi)/i;
function getSpeechVoiceStableId(voice = null) {
  if (!voice || typeof voice !== "object") return "";
  const uri = String(voice.voiceURI || "").trim();
  const name = String(voice.name || "").trim();
  const lang = String(voice.lang || "").trim();
  if (!uri && !name) return "";
  return `${uri || name}::${lang}`;
}
function scoreIosVoiceForProfile(voice = null, profile = null) {
  if (!voice || typeof voice !== "object") return Number.NEGATIVE_INFINITY;
  const name = String(voice.name || "").toLowerCase();
  const uri = String(voice.voiceURI || "").toLowerCase();
  const lang = String(voice.lang || "").toLowerCase();
  const combined = `${name} ${uri}`.trim();
  let score = 0;
  if (!lang.startsWith("en")) score -= 60;
  if (lang.startsWith("en-us")) score += 18;
  else if (lang.startsWith("en-gb")) score += 16;
  else if (lang.startsWith("en")) score += 10;
  if (voice && voice.default) score += 3;
  if (/(enhanced|natural|neural|premium|quality)/.test(combined)) score += 8;
  if (/narrator\s*voice/.test(combined)) score += 5;
  if (/(apple|ios|iphone|ipad|macos)/.test(combined)) score += 4;
  if (/siri/.test(combined)) score += 2;
  if (DISALLOWED_VOICE_NAME_RE.test(combined)) score -= 28;
  const desiredGender = String(profile && profile.desiredGender || "").trim().toLowerCase();
  const looksFemale = FEMALE_VOICE_NAME_RE.test(combined);
  const looksMale = MALE_VOICE_NAME_RE.test(combined);
  if (desiredGender === "female") {
    if (looksFemale) score += 14;
    if (looksMale) score -= 18;
  } else if (desiredGender === "male") {
    if (looksMale) score += 12;
    if (looksFemale) score -= 14;
  }
  const preferredLangs = Array.isArray(profile && profile.preferredLangs) ? profile.preferredLangs : [];
  const nameHints = Array.isArray(profile && profile.nameHints) ? profile.nameHints : [];
  for (let i = 0; i < preferredLangs.length; i += 1) {
    const prefLang = String(preferredLangs[i] || "").trim().toLowerCase();
    if (!prefLang) continue;
    if (lang === prefLang) {
      score += 22 - i * 2;
      break;
    }
    if (lang.startsWith(prefLang)) {
      score += 14 - i;
      break;
    }
  }
  for (let i = 0; i < nameHints.length; i += 1) {
    const hint = String(nameHints[i] || "").trim().toLowerCase();
    if (!hint) continue;
    if (combined.includes(hint)) {
      score += Math.max(6, 56 - i * 6);
      break;
    }
  }
  return score;
}
function pickBestIosVoiceForCuratedId(voices = [], voiceId = "", { excludeStableIds = null } = {}) {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!list.length) return null;
  const profile = IOS_CURATED_VOICE_PROFILES[String(voiceId || "").trim()] || null;
  const excluded = excludeStableIds instanceof Set ? excludeStableIds : null;
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < list.length; i += 1) {
    const voice = list[i];
    const stableId = getSpeechVoiceStableId(voice);
    if (excluded && stableId && excluded.has(stableId)) continue;
    const score = scoreIosVoiceForProfile(voice, profile) + i * 1e-3;
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return best;
}

// public/js/audio/adaptiveTtsVoiceEngine.js
function detectDeviceType() {
  const ua = typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : "";
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Mobile|Tablet/.test(ua)) return "mobile";
  return "desktop";
}
var DEFAULT_API_CATALOG_URL = "/api/tts/catalog";
var DEFAULT_API_SYNTH_URL = "/api/tts/synthesize";
var DEFAULT_NARRATOR_VOICE_IDS = Object.freeze(["af_heart", "af_bella", "am_michael", "bm_george"]);
var FALLBACK_CATALOG = Object.freeze([
  {
    id: "af_heart",
    name: "Jenny",
    language: "en-US",
    gender: "female",
    traits: "warm, host, natural",
    targetQuality: "humanlike",
    overallGrade: "A",
    roleHint: "Narration - Female 1",
    provider: "edge",
    providerLabel: "Edge Neural",
    providerGrade: "A"
  },
  {
    id: "af_bella",
    name: "Aria",
    language: "en-US",
    gender: "female",
    traits: "bright, articulate, energetic",
    targetQuality: "humanlike",
    overallGrade: "A",
    roleHint: "Narration - Female 2",
    provider: "edge",
    providerLabel: "Edge Neural",
    providerGrade: "A"
  },
  {
    id: "am_michael",
    name: "Guy",
    language: "en-US",
    gender: "male",
    traits: "heroic, steady, cinematic",
    targetQuality: "humanlike",
    overallGrade: "A",
    roleHint: "Narration - Male 1",
    provider: "edge",
    providerLabel: "Edge Neural",
    providerGrade: "A"
  },
  {
    id: "bm_george",
    name: "Ryan",
    language: "en-GB",
    gender: "male",
    traits: "dramatic, darker, announcer",
    targetQuality: "humanlike",
    overallGrade: "A",
    roleHint: "Narration - Male 2",
    provider: "edge",
    providerLabel: "Edge Neural",
    providerGrade: "A"
  }
]);
var BROWSER_FALLBACK_HINTS = Object.freeze({
  af_heart: { hints: ["jenny", "samantha", "ava", "female", "neural", "natural", "enhanced"], pitch: 1.02 },
  af_bella: { hints: ["aria", "allison", "zoe", "moira", "female", "neural", "natural", "enhanced"], pitch: 1.08 },
  am_michael: { hints: ["guy", "david", "daniel", "alex", "male", "neural", "natural", "enhanced"], pitch: 0.98 },
  bm_george: { hints: ["ryan", "george", "male", "british", "uk", "neural", "natural", "enhanced"], pitch: 0.9 },
  "arch:heroic": { hints: ["guy", "male", "neural"], pitch: 0.98 },
  "arch:villain": { hints: ["ryan", "male", "british"], pitch: 0.86 },
  "arch:cartoon": { hints: ["aria", "female"], pitch: 1.12 },
  "arch:robotic": { hints: ["davis", "male"], pitch: 0.92 },
  "arch:spooky": { hints: ["ryan", "male"], pitch: 0.82 },
  "arch:chaotic": { hints: ["aria", "female"], pitch: 1.14 }
});
function getSpeechVoiceStableId2(voice = null) {
  if (!voice || typeof voice !== "object") return "";
  const uri = String(voice.voiceURI || "").trim();
  const name = String(voice.name || "").trim();
  const lang = String(voice.lang || "").trim();
  if (!uri && !name) return "";
  return `${uri || name}::${lang}`;
}
function rankSpeechSynthesisVoices(voices = [], hints = []) {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!list.length) return [];
  const normalizedHints = (Array.isArray(hints) ? hints : []).map((v) => String(v || "").toLowerCase()).filter(Boolean);
  return list.map((voice, index) => {
    const name = String(voice && voice.name || "").toLowerCase();
    const uri = String(voice && voice.voiceURI || "").toLowerCase();
    const lang = String(voice && voice.lang || "").toLowerCase();
    const combined = `${name} ${uri}`;
    let score = 0;
    if (lang.startsWith("en-us")) score += 12;
    else if (lang.startsWith("en-gb")) score += 10;
    else if (lang.startsWith("en")) score += 8;
    if (voice && voice.default) score += 4;
    if (/(neural|natural|enhanced|premium)/.test(combined)) score += 14;
    if (/(microsoft|google|apple)/.test(combined)) score += 3;
    if (/(espeak|compact|festival)/.test(combined)) score -= 12;
    normalizedHints.forEach((hint) => {
      if (combined.includes(hint)) score += 7;
    });
    score += index * 1e-3;
    return { voice, score };
  }).sort((a, b) => b.score - a.score);
}
function pickBestSpeechSynthesisVoice(voices = [], hints = []) {
  const ranked = rankSpeechSynthesisVoices(voices, hints);
  return ranked[0] ? ranked[0].voice : null;
}
function fetchJsonWithTimeout(url, { timeoutMs = 12e3 } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(800, Number(timeoutMs) || 12e3));
  return fetch(url, { signal: controller.signal }).then((res) => {
    if (!res || !res.ok) throw new Error(`http_${res ? res.status : "fail"}`);
    return res.json();
  }).finally(() => window.clearTimeout(timer));
}
function postForAudioWithTimeout(url, payload, { timeoutMs = 3e4 } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(1200, Number(timeoutMs) || 3e4));
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload || {}),
    signal: controller.signal
  }).then(async (res) => {
    if (!res) throw new Error("no_response");
    if (!res.ok) {
      let detail = "";
      try {
        const errJson = await res.json();
        detail = errJson && errJson.message ? `:${String(errJson.message)}` : "";
      } catch (_error) {
      }
      throw new Error(`http_${res.status}${detail}`);
    }
    const blob = await res.blob();
    return {
      blob,
      providerId: String(res.headers.get("X-Lobby-TTS-Provider") || ""),
      cacheHit: String(res.headers.get("X-Lobby-TTS-Cache") || "") === "hit"
    };
  }).finally(() => window.clearTimeout(timer));
}
var AdaptiveTtsVoiceEngine = class {
  constructor(options = {}) {
    this.options = options && typeof options === "object" ? { ...options } : {};
    this.deviceType = detectDeviceType();
    this.loading = false;
    this.ready = false;
    this.error = "";
    this.lastLoadMs = 0;
    this.catalog = [];
    this.catalogById = /* @__PURE__ */ new Map();
    this.maxCacheEntries = Math.max(8, Number(this.options.maxCacheEntries) || 40);
    this.allowedVoiceIds = new Set(
      Array.isArray(this.options.allowedVoiceIds) ? this.options.allowedVoiceIds.map((v) => String(v || "").trim()).filter(Boolean) : []
    );
    this.apiCatalogUrl = String(this.options.catalogUrl || DEFAULT_API_CATALOG_URL);
    this.apiSynthUrl = String(this.options.synthUrl || DEFAULT_API_SYNTH_URL);
    this.loadProgress = {
      phase: "idle",
      label: "",
      status: "",
      file: "",
      pct: 0,
      loaded: 0,
      total: 0
    };
    this.defaultDevice = "server";
    this.defaultDtype = "adaptive";
    this.audioEl = null;
    this.activeJob = null;
    this.activeSpeechUtterance = null;
    this.cache = /* @__PURE__ */ new Map();
    this.inFlightGeneration = /* @__PURE__ */ new Map();
    this.loadingPromise = null;
    this.browserVoiceWarmPromise = null;
    this.browserFallbackPrimed = false;
    this.browserFallbackPrimeAt = 0;
    this.browserFallbackVoiceAssignments = /* @__PURE__ */ new Map();
    this.browserFallbackVoiceAssignmentsSig = "";
    this.serverSynthesisAvailable = true;
    this.serverSynthesisBackoffUntil = 0;
  }
  getState() {
    return {
      supported: true,
      loading: this.loading,
      ready: this.ready,
      error: this.error,
      modelId: "adaptive-tts-router",
      device: this.isBrowserFallbackOnly() ? "browser-fallback" : this.defaultDevice,
      dtype: this.defaultDtype,
      voicesLoaded: this.catalog.length,
      lastLoadMs: this.lastLoadMs,
      loadProgress: { ...this.loadProgress }
    };
  }
  _notifyStateChange() {
    if (typeof this.options.onStateChange !== "function") return;
    try {
      this.options.onStateChange(this.getState());
    } catch (_error) {
    }
  }
  _setCatalog(entries = []) {
    const input = Array.isArray(entries) && entries.length ? entries : FALLBACK_CATALOG;
    const filtered = input.map((entry) => ({
      id: String(entry && entry.id || ""),
      name: String(entry && (entry.name || entry.id) || ""),
      language: String(entry && (entry.language || entry.lang) || ""),
      gender: String(entry && entry.gender || ""),
      traits: String(entry && entry.traits || ""),
      targetQuality: String(entry && entry.targetQuality || ""),
      overallGrade: String(entry && (entry.overallGrade || entry.providerGrade) || ""),
      roleHint: String(entry && entry.roleHint || ""),
      provider: String(entry && entry.provider || ""),
      providerLabel: String(entry && entry.providerLabel || "")
    })).filter((entry) => entry.id).filter((entry) => !this.allowedVoiceIds.size || this.allowedVoiceIds.has(entry.id));
    const finalList = filtered.length ? filtered : FALLBACK_CATALOG.filter((entry) => !this.allowedVoiceIds.size || this.allowedVoiceIds.has(entry.id));
    this.catalog = finalList.slice();
    this.catalogById.clear();
    this.catalog.forEach((entry) => this.catalogById.set(entry.id, entry));
    return this.catalog;
  }
  getCatalog() {
    return this.catalog.slice();
  }
  _getAudioElement() {
    if (this.audioEl) return this.audioEl;
    const el = new Audio();
    el.preload = "auto";
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    this.audioEl = el;
    return el;
  }
  _assignBrowserFallbackVoices(voices = [], requestedVoiceIds = []) {
    const source = Array.isArray(voices) ? voices.filter(Boolean) : [];
    if (!source.length) {
      this.browserFallbackVoiceAssignments.clear();
      this.browserFallbackVoiceAssignmentsSig = "";
      return { assigned: 0, available: 0 };
    }
    const englishPool = source.filter((voice) => {
      const lang = String(voice && voice.lang || "").toLowerCase();
      return lang.startsWith("en");
    });
    const qualityPool = englishPool.filter((voice) => {
      const name = String(voice && voice.name || "").toLowerCase();
      const uri = String(voice && voice.voiceURI || "").toLowerCase();
      return /(neural|natural|enhanced|premium)/.test(name + uri) && !/(default|robot|compact|espeak|festival)/.test(name + uri);
    });
    const pool = qualityPool.length ? qualityPool : englishPool;
    const voiceIds = [];
    const seenIds = /* @__PURE__ */ new Set();
    [...DEFAULT_NARRATOR_VOICE_IDS, ...Array.isArray(requestedVoiceIds) ? requestedVoiceIds : []].forEach((rawId) => {
      const id = String(rawId || "").trim();
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      voiceIds.push(id);
    });
    const nextAssignments = /* @__PURE__ */ new Map();
    const usedVoiceSigs = /* @__PURE__ */ new Set();
    const preferIosCuratedVoices = this.deviceType === "ios";
    voiceIds.forEach((voiceId) => {
      const hints = BROWSER_FALLBACK_HINTS[voiceId] || BROWSER_FALLBACK_HINTS.af_heart || { hints: [] };
      let picked = null;
      if (preferIosCuratedVoices) {
        picked = pickBestIosVoiceForCuratedId(pool, voiceId, {
          excludeStableIds: usedVoiceSigs
        });
      }
      const ranked = rankSpeechSynthesisVoices(pool, hints.hints).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.voice.name).localeCompare(String(b.voice.name));
      });
      if (!picked) {
        for (let i = 0; i < ranked.length; i += 1) {
          const candidate = ranked[i] && ranked[i].voice;
          const sig = getSpeechVoiceStableId2(candidate);
          if (!candidate) continue;
          const name = String(candidate && candidate.name || "").toLowerCase();
          if (/(default|robot|compact|espeak|festival)/.test(name)) continue;
          if (!sig || !usedVoiceSigs.has(sig)) {
            picked = candidate;
            if (sig) usedVoiceSigs.add(sig);
            break;
          }
        }
      }
      if (!picked) {
        if (typeof window !== "undefined") {
          const msg = `[TTS] No good browser fallback voice for narrator/archetype '${voiceId}' on this platform. Skipping.`;
          if (window.console && window.console.warn) window.console.warn(msg);
          if (typeof window.showTtsWarningToast === "function") {
            window.showTtsWarningToast(msg);
          } else {
            let toast = document.getElementById("tts-toast");
            if (!toast) {
              toast = document.createElement("div");
              toast.id = "tts-toast";
              toast.style.position = "fixed";
              toast.style.bottom = "24px";
              toast.style.left = "50%";
              toast.style.transform = "translateX(-50%)";
              toast.style.background = "rgba(30,30,30,0.96)";
              toast.style.color = "#fff";
              toast.style.padding = "12px 24px";
              toast.style.borderRadius = "8px";
              toast.style.fontSize = "1.1em";
              toast.style.zIndex = "99999";
              toast.style.boxShadow = "0 2px 12px rgba(0,0,0,0.18)";
              toast.style.maxWidth = "90vw";
              toast.style.textAlign = "center";
              document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.style.opacity = "1";
            toast.style.pointerEvents = "auto";
            clearTimeout(window.__ttsToastTimeout);
            window.__ttsToastTimeout = setTimeout(() => {
              toast.style.opacity = "0";
              toast.style.pointerEvents = "none";
            }, 4200);
          }
        }
        return;
      }
      const pickedSig = getSpeechVoiceStableId2(picked);
      nextAssignments.set(voiceId, pickedSig || picked);
      if (pickedSig) usedVoiceSigs.add(pickedSig);
    });
    const allVoiceSig = source.map((voice) => getSpeechVoiceStableId2(voice)).filter(Boolean).join("||");
    this.browserFallbackVoiceAssignments = nextAssignments;
    this.browserFallbackVoiceAssignmentsSig = allVoiceSig;
    if (typeof window !== "undefined") {
      window.__lobbyVoiceAssignments = Array.from(nextAssignments.entries());
      if (window.console && window.console.info) {
        window.console.info("[TTS] Browser fallback voice assignments:", window.__lobbyVoiceAssignments);
      }
    }
    return { assigned: nextAssignments.size, available: source.length };
  }
  _resolveAssignedBrowserFallbackVoice(voices = [], voiceId = "") {
    const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
    if (!list.length) return null;
    const currentSig = list.map((voice) => getSpeechVoiceStableId2(voice)).filter(Boolean).join("||");
    if (!this.browserFallbackVoiceAssignmentsSig || this.browserFallbackVoiceAssignmentsSig !== currentSig) {
      this._assignBrowserFallbackVoices(list, [voiceId]);
    }
    const target = String(this.browserFallbackVoiceAssignments.get(String(voiceId || "").trim()) || "").trim();
    if (!target) return null;
    for (let i = 0; i < list.length; i += 1) {
      const voice = list[i];
      if (getSpeechVoiceStableId2(voice) === target) return voice;
    }
    return null;
  }
  _warmBrowserFallbackVoices({ primeUtterance = false, timeoutMs = 900, voiceIds = [] } = {}) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      return Promise.resolve({ ok: false, reason: "speech_unsupported" });
    }
    if (this.browserVoiceWarmPromise) return this.browserVoiceWarmPromise;
    this.browserVoiceWarmPromise = (async () => {
      let voices = [];
      try {
        voices = Array.isArray(window.speechSynthesis.getVoices()) ? window.speechSynthesis.getVoices() : [];
      } catch (_error) {
        voices = [];
      }
      if (!voices.length) {
        voices = await new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            try {
              window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
            } catch (_error) {
            }
            let next = [];
            try {
              next = Array.isArray(window.speechSynthesis.getVoices()) ? window.speechSynthesis.getVoices() : [];
            } catch (_error) {
              next = [];
            }
            resolve(next);
          };
          const onVoicesChanged = () => finish();
          try {
            window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged, { once: true });
          } catch (_error) {
          }
          window.setTimeout(finish, Math.max(200, Number(timeoutMs) || 900));
        });
      }
      const isIOS2 = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const recentlyPrimed = this.browserFallbackPrimed && nowMs() - Number(this.browserFallbackPrimeAt || 0) < 12e3;
      const synthBusy = Boolean(window.speechSynthesis.speaking || window.speechSynthesis.pending);
      const shouldPrime = (primeUtterance === true || isIOS2 && !recentlyPrimed) && !synthBusy;
      if (shouldPrime) {
        try {
          await new Promise((resolve) => {
            let settled = false;
            let settleTimer = null;
            const finish = () => {
              if (settled) return;
              settled = true;
              if (settleTimer) {
                window.clearTimeout(settleTimer);
                settleTimer = null;
              }
              resolve();
            };
            const utter = new SpeechSynthesisUtterance(".");
            utter.volume = 0;
            utter.rate = 1;
            utter.pitch = 1;
            utter.onstart = () => window.setTimeout(finish, 30);
            utter.onend = finish;
            utter.onerror = finish;
            try {
              window.speechSynthesis.resume();
            } catch (_error) {
            }
            try {
              window.speechSynthesis.speak(utter);
              settleTimer = window.setTimeout(finish, 220);
            } catch (_error) {
              finish();
            }
          });
          this.browserFallbackPrimed = true;
          this.browserFallbackPrimeAt = nowMs();
        } catch (_error) {
        }
      }
      const assignmentInfo = this._assignBrowserFallbackVoices(voices, voiceIds);
      if (typeof window !== "undefined" && window.console && window.console.info) {
        window.console.info("[TTS] Warmed browser fallback voices:", assignmentInfo, voices);
      }
      return {
        ok: true,
        voicesLoaded: Array.isArray(voices) ? voices.length : 0,
        assignedVoices: Number(assignmentInfo && assignmentInfo.assigned) || 0
      };
    })().finally(() => {
      this.browserVoiceWarmPromise = null;
    });
    return this.browserVoiceWarmPromise;
  }
  _stopAudioElement() {
    if (!this.audioEl) return;
    try {
      this.audioEl.pause();
    } catch (_error) {
    }
    try {
      this.audioEl.currentTime = 0;
    } catch (_error) {
    }
  }
  _fadeOutAudioElement({ durationMs = 80 } = {}) {
    if (!this.audioEl) return Promise.resolve(false);
    const el = this.audioEl;
    const ms = Math.max(0, Math.min(220, Number(durationMs) || 0));
    if (!ms || el.paused) {
      this._stopAudioElement();
      return Promise.resolve(false);
    }
    const startVolume = clamp(el.volume, 0, 1, 1);
    if (startVolume <= 1e-3) {
      this._stopAudioElement();
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let done = false;
      const startedAt = nowMs();
      const finish = () => {
        if (done) return;
        done = true;
        try {
          el.pause();
        } catch (_error) {
        }
        try {
          el.currentTime = 0;
        } catch (_error) {
        }
        try {
          el.volume = startVolume;
        } catch (_error) {
        }
        resolve(true);
      };
      const tick = () => {
        if (done) return;
        if (el.paused) {
          finish();
          return;
        }
        const elapsed = Math.max(0, nowMs() - startedAt);
        const progress = Math.max(0, Math.min(1, elapsed / ms));
        try {
          el.volume = Math.max(0, startVolume * (1 - progress));
        } catch (_error) {
        }
        if (progress >= 1) {
          finish();
          return;
        }
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(tick);
        } else {
          window.setTimeout(tick, 16);
        }
      };
      tick();
      window.setTimeout(finish, ms + 40);
    });
  }
  isBrowserFallbackOnly() {
    if (this.serverSynthesisAvailable === false) return true;
    if ((Number(this.serverSynthesisBackoffUntil) || 0) > nowMs()) return true;
    return false;
  }
  stop() {
    if (this.activeJob && typeof this.activeJob.cancel === "function") {
      try {
        void this.activeJob.cancel({ reason: "stop", fadeOutMs: 0 });
      } catch (_error) {
      }
    } else {
      this._stopAudioElement();
    }
    if (this.activeSpeechUtterance && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (_error) {
      }
      this.activeSpeechUtterance = null;
    }
  }
  _cacheKey({ text, voiceId, speed, pitch }) {
    return `${String(voiceId || "")}|${clamp(speed, 0.65, 1.6, 1).toFixed(2)}|${clamp(pitch, 0.7, 1.35, 1).toFixed(2)}|${normalizeCollapsedText(text).toLowerCase()}`;
  }
  hasCachedClip(spec = {}) {
    const key = this._cacheKey(spec);
    return Boolean(key && this.cache.has(key));
  }
  _getCache(spec = {}) {
    const key = this._cacheKey(spec);
    if (!key) return null;
    const row = this.cache.get(key);
    if (!row) return null;
    row.lastUsedAt = nowMs();
    return row;
  }
  _setCache(spec = {}, value = {}) {
    const key = this._cacheKey(spec);
    if (!key || !value) return null;
    this.cache.set(key, {
      ...value,
      key,
      lastUsedAt: nowMs()
    });
    if (this.cache.size > this.maxCacheEntries) {
      const rows = Array.from(this.cache.values()).sort((a, b) => Number(a.lastUsedAt || 0) - Number(b.lastUsedAt || 0));
      while (rows.length && this.cache.size > this.maxCacheEntries) {
        const victim = rows.shift();
        if (!victim || !victim.key) continue;
        const stored = this.cache.get(victim.key);
        if (stored && stored.objectUrl) {
          try {
            URL.revokeObjectURL(stored.objectUrl);
          } catch (_error) {
          }
        }
        this.cache.delete(victim.key);
      }
    }
    return this.cache.get(key);
  }
  async ensureLoaded() {
    if (this.ready) {
      return { ok: true, state: this.getState() };
    }
    if (this.loadingPromise) return this.loadingPromise;
    this.loading = true;
    this.error = "";
    this.loadProgress = {
      phase: "catalog",
      label: "Loading adaptive voice catalog",
      status: "catalog",
      file: "",
      pct: 10,
      loaded: 0,
      total: 0
    };
    this._notifyStateChange();
    const startedAt = nowMs();
    this.loadingPromise = (async () => {
      try {
        const payload = await fetchJsonWithTimeout(this.apiCatalogUrl, { timeoutMs: 1e4 }).catch(() => null);
        const voices = Array.isArray(payload && payload.voices) ? payload.voices : [];
        const providers = Array.isArray(payload && payload.providers) ? payload.providers : [];
        const anyConfigured = providers.some((provider) => provider && provider.configured === true);
        this._setCatalog(voices);
        const usingFallbackCatalog = !voices.length || !anyConfigured;
        this.serverSynthesisAvailable = anyConfigured;
        this.serverSynthesisBackoffUntil = 0;
        this.defaultDevice = usingFallbackCatalog ? "browser-fallback" : "server";
        this.defaultDtype = "adaptive";
        this.ready = true;
        this.error = "";
        this.lastLoadMs = Math.max(1, nowMs() - startedAt);
        this.loadProgress = {
          phase: "ready",
          label: usingFallbackCatalog ? "Adaptive voice ready (browser fallback mode)" : "Adaptive voice router ready",
          status: usingFallbackCatalog ? "fallback" : "ready",
          file: "",
          pct: 100,
          loaded: 0,
          total: 0
        };
        this.loading = false;
        this._notifyStateChange();
        void this._warmBrowserFallbackVoices({
          primeUtterance: false,
          timeoutMs: 1200,
          voiceIds: this.catalog.map((entry) => String(entry && entry.id || ""))
        });
        return { ok: true, state: this.getState(), payload };
      } catch (error) {
        this._setCatalog(FALLBACK_CATALOG);
        this.ready = true;
        this.error = "";
        this.serverSynthesisAvailable = false;
        this.serverSynthesisBackoffUntil = 0;
        this.defaultDevice = "browser-fallback";
        this.defaultDtype = "adaptive";
        this.lastLoadMs = Math.max(1, nowMs() - startedAt);
        this.loadProgress = {
          phase: "ready",
          label: "Adaptive voice ready (browser fallback mode)",
          status: "fallback",
          file: "",
          pct: 100,
          loaded: 0,
          total: 0
        };
        this.loading = false;
        this._notifyStateChange();
        void this._warmBrowserFallbackVoices({
          primeUtterance: false,
          timeoutMs: 1200,
          voiceIds: this.catalog.map((entry) => String(entry && entry.id || ""))
        });
        return { ok: true, state: this.getState(), fallback: true };
      } finally {
        this.loadingPromise = null;
      }
    })();
    return this.loadingPromise;
  }
  async _generateClip(spec = {}) {
    if (this.isBrowserFallbackOnly()) {
      throw new Error("server_synthesis_unavailable");
    }
    const normalized = {
      text: normalizeCollapsedText(spec && spec.text),
      voiceId: String(spec && spec.voiceId || ""),
      speed: clamp(spec && spec.speed, 0.65, 1.6, 1),
      pitch: clamp(spec && spec.pitch, 0.7, 1.35, 1)
    };
    if (!normalized.text) throw new Error("empty_text");
    const key = this._cacheKey(normalized);
    if (this.inFlightGeneration.has(key)) return this.inFlightGeneration.get(key);
    const job = (async () => {
      let result;
      try {
        result = await postForAudioWithTimeout(this.apiSynthUrl, normalized, { timeoutMs: 45e3 });
      } catch (error) {
        const message = String(error && (error.message || error) || "");
        if (/no_tts_provider_available/i.test(message) || /http_503/i.test(message) || /failed to fetch/i.test(message) || /networkerror/i.test(message) || /load failed/i.test(message) || /http_0/i.test(message)) {
          this.serverSynthesisAvailable = false;
          this.serverSynthesisBackoffUntil = nowMs() + 45 * 1e3;
          this.defaultDevice = "browser-fallback";
          this.error = "";
          this._notifyStateChange();
        }
        throw error;
      }
      const blob = result && result.blob;
      if (!blob || !blob.size) throw new Error("empty_audio_blob");
      const objectUrl = URL.createObjectURL(blob);
      const row = this._setCache(normalized, {
        objectUrl,
        mimeType: String(blob.type || "audio/mpeg"),
        cacheHit: Boolean(result && result.cacheHit),
        providerId: String(result && result.providerId || "")
      });
      return {
        ...row,
        cacheHit: Boolean(result && result.cacheHit)
      };
    })();
    this.inFlightGeneration.set(key, job);
    try {
      return await job;
    } finally {
      this.inFlightGeneration.delete(key);
    }
  }
  async _getOrGenerateAudioClip(spec = {}) {
    const cached = this._getCache(spec);
    if (cached && cached.objectUrl) return { ...cached, cacheHit: true };
    return this._generateClip(spec);
  }
  async prewarmVoices({
    voiceIds = [],
    textByVoiceId = {},
    speedByVoiceId = {},
    pitchByVoiceId = {},
    mode = "cache-clips"
  } = {}) {
    await this.ensureLoaded();
    const deduped = [];
    const seen = /* @__PURE__ */ new Set();
    (Array.isArray(voiceIds) ? voiceIds : []).forEach((rawId) => {
      const id = String(rawId || "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      deduped.push(id);
    });
    if (this.isBrowserFallbackOnly()) {
      const warm = await this._warmBrowserFallbackVoices({
        primeUtterance: false,
        timeoutMs: 1500,
        voiceIds: deduped
      }).catch(() => ({ ok: false }));
      const warmOk = Boolean(warm && warm.ok === true);
      return {
        ok: warmOk && deduped.length > 0,
        warmed: warmOk ? deduped.length : 0,
        results: deduped.map((voiceId) => ({ voiceId, ok: warmOk, cacheHit: false, mode: "browser-fallback" })),
        browserWarm: warm && typeof warm === "object" ? warm : null
      };
    }
    const results = [];
    for (let i = 0; i < deduped.length; i += 1) {
      const voiceId = deduped[i];
      const text = normalizeCollapsedText(textByVoiceId && textByVoiceId[voiceId]) || "Voice ready.";
      const speed = clamp(speedByVoiceId && speedByVoiceId[voiceId], 0.65, 1.6, 1);
      const pitch = clamp(pitchByVoiceId && pitchByVoiceId[voiceId], 0.7, 1.35, 1);
      try {
        if (String(mode || "").toLowerCase() === "weights-only") {
          results.push({ voiceId, ok: true, cacheHit: false, mode: "weights-only" });
          continue;
        }
        const clip = await this._getOrGenerateAudioClip({ text, voiceId, speed, pitch });
        results.push({ voiceId, ok: true, cacheHit: Boolean(clip && clip.cacheHit), mode: "cache-clips" });
      } catch (error) {
        results.push({
          voiceId,
          ok: false,
          error: String(error && (error.message || error) || "warm_failed").slice(0, 200)
        });
      }
    }
    return {
      ok: results.some((r) => r && r.ok),
      warmed: results.filter((r) => r && r.ok).length,
      results
    };
  }
  _speakViaBrowserFallback({
    text,
    voiceId,
    speed,
    pitch,
    volume,
    onStart,
    onEnd
  }) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      return false;
    }
    let utterance;
    try {
      utterance = new SpeechSynthesisUtterance(text);
    } catch (_error) {
      return false;
    }
    const hints = BROWSER_FALLBACK_HINTS[voiceId] || BROWSER_FALLBACK_HINTS.af_heart || { hints: [] };
    let voices = [];
    try {
      voices = Array.isArray(window.speechSynthesis.getVoices()) ? window.speechSynthesis.getVoices() : [];
    } catch (_error) {
    }
    const picked = this._resolveAssignedBrowserFallbackVoice(voices, voiceId) || (this.deviceType === "ios" ? pickBestIosVoiceForCuratedId(voices, voiceId) : null) || pickBestSpeechSynthesisVoice(voices, hints.hints);
    if (picked) {
      try {
        utterance.voice = picked;
      } catch (_error) {
      }
      try {
        if (picked.lang) utterance.lang = picked.lang;
      } catch (_error) {
      }
    }
    const normalizedVoiceId = String(voiceId || "").trim();
    const requestedPitch = clamp(pitch, 0.7, 1.35, 1);
    const shouldBlendHintPitch = normalizedVoiceId.startsWith("arch:");
    const hintPitch = Number(hints.pitch) || 1;
    const blendedPitch = shouldBlendHintPitch ? hintPitch * 0.6 + requestedPitch * 0.4 : requestedPitch;
    const targetPitch = clamp(blendedPitch, 0.72, 1.35, requestedPitch);
    try {
      utterance.rate = clamp(speed, 0.7, 1.6, 1);
    } catch (_error) {
    }
    try {
      utterance.pitch = targetPitch;
    } catch (_error) {
    }
    try {
      utterance.volume = clamp(volume, 0, 1, 1);
    } catch (_error) {
    }
    utterance.onstart = () => {
      if (typeof onStart === "function") {
        try {
          onStart();
        } catch (_error) {
        }
      }
    };
    const finalize = (status) => () => {
      if (this.activeSpeechUtterance === utterance) {
        this.activeSpeechUtterance = null;
      }
      if (typeof onEnd === "function") {
        try {
          onEnd(status);
        } catch (_error) {
        }
      }
    };
    utterance.onend = finalize("end");
    utterance.onerror = finalize("error");
    this.activeSpeechUtterance = utterance;
    try {
      try {
        window.speechSynthesis.resume();
      } catch (_error) {
      }
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (_error) {
      this.activeSpeechUtterance = null;
      return false;
    }
  }
  speakText({
    text,
    voiceId = "af_heart",
    speed = 1,
    pitch = 1,
    volume = 1,
    onStart = null,
    onEnd = null
  } = {}) {
    switch (this.deviceType) {
      case "ios":
        return this._speakTextIOS({ text, voiceId, speed, pitch, volume, onStart, onEnd });
      case "android":
      case "mobile":
        return this._speakTextMobile({ text, voiceId, speed, pitch, volume, onStart, onEnd });
      case "desktop":
      default:
        return this._speakTextDesktop({ text, voiceId, speed, pitch, volume, onStart, onEnd });
    }
  }
  // iOS-specific TTS/audio pipeline
  _speakTextIOS({
    text,
    voiceId = "af_heart",
    speed = 1,
    pitch = 1,
    volume = 1,
    onStart = null,
    onEnd = null
  } = {}) {
    const spokenText = normalizeCollapsedText(text);
    if (!spokenText) return { handled: false, reason: "empty_text" };
    const safeSpeed = clamp(speed, 0.74, 1.45, 1);
    const safePitch = clamp(pitch, 0.74, 1.28, 1);
    const safeVolume = clamp(volume, 0, 1, 1);
    let cancelled = false;
    const jobId = `adaptive-ios-${nowMs()}-${hashString(`${voiceId}|${spokenText}`).toString(36).slice(0, 8)}`;
    const job = {
      id: jobId,
      cancel: (options = {}) => {
        cancelled = true;
        if (this.activeJob && this.activeJob.id === jobId) {
          this.activeJob = null;
        }
        if (this.activeSpeechUtterance && window.speechSynthesis) {
          try {
            window.speechSynthesis.cancel();
          } catch (_error) {
          }
          this.activeSpeechUtterance = null;
        }
      }
    };
    this.activeJob = job;
    let started = false;
    let finished = false;
    const safeStart = () => {
      if (cancelled || started) return;
      started = true;
      if (typeof onStart === "function") {
        try {
          onStart();
        } catch (_error) {
        }
      }
    };
    const safeEnd = (status = "end") => {
      if (cancelled || finished) return;
      finished = true;
      if (this.activeJob && this.activeJob.id === jobId) this.activeJob = null;
      if (typeof onEnd === "function") {
        try {
          onEnd(status);
        } catch (_error) {
        }
      }
    };
    (async () => {
      try {
        const needsPrime = !this.browserFallbackPrimed || nowMs() - Number(this.browserFallbackPrimeAt || 0) > 1e4;
        await this._warmBrowserFallbackVoices({
          primeUtterance: needsPrime,
          timeoutMs: 1200,
          voiceIds: [voiceId]
        }).catch(() => {
        });
        if (cancelled || !this.activeJob || this.activeJob.id !== jobId) return;
        const didStart = this._speakViaBrowserFallback({
          text: spokenText,
          voiceId,
          speed: safeSpeed,
          pitch: safePitch,
          volume: safeVolume,
          onStart: () => {
            if (cancelled) return;
            safeStart();
          },
          onEnd: (status) => {
            if (cancelled) return;
            safeEnd(status || "end");
          }
        });
        if (!didStart) safeEnd("error");
      } catch (error) {
        this.error = String(error && (error.message || error) || "iOS TTS playback failed");
        this._notifyStateChange();
        safeEnd("error");
      }
    })();
    return { handled: true, cancel: job.cancel };
  }
  // Stub for Android/mobile pipeline
  _speakTextMobile(args) {
    return this._speakTextDesktop(args);
  }
  // Desktop/server-preferred pipeline (bm_george as default for narration)
  _speakTextDesktop({
    text,
    voiceId = "bm_george",
    // Always prefer male UK voice for narration
    speed = 1,
    pitch = 1,
    volume = 1,
    onStart = null,
    onEnd = null
  } = {}) {
    const spokenText = normalizeCollapsedText(text);
    if (!spokenText) return { handled: false, reason: "empty_text" };
    let effectiveVoiceId = voiceId;
    if (!voiceId || voiceId === "af_heart" || voiceId === "af_bella" || voiceId === "am_michael") {
      effectiveVoiceId = "bm_george";
    }
    const safeSpeed = clamp(speed, 0.65, 1.6, 1);
    const safePitch = clamp(pitch, 0.7, 1.35, 1);
    const safeVolume = clamp(volume, 0, 1, 1);
    let cancelled = false;
    const jobId = `adaptive-desktop-${nowMs()}-${hashString(`${effectiveVoiceId}|${spokenText}`).toString(36).slice(0, 8)}`;
    const job = {
      id: jobId,
      cancel: (options = {}) => {
        cancelled = true;
        const opts = options && typeof options === "object" ? options : {};
        const fadeOutMs = clamp(opts.fadeOutMs, 0, 220, 0);
        let cancelPlaybackPromise = null;
        if (this.activeJob && this.activeJob.id === jobId) {
          this.activeJob = null;
          if (fadeOutMs > 0 && this.audioEl && !this.audioEl.paused) {
            cancelPlaybackPromise = this._fadeOutAudioElement({ durationMs: fadeOutMs }).catch(() => {
              this._stopAudioElement();
              return false;
            });
          } else {
            this._stopAudioElement();
          }
        }
        if (this.activeSpeechUtterance && window.speechSynthesis) {
          try {
            window.speechSynthesis.cancel();
          } catch (_error) {
          }
          this.activeSpeechUtterance = null;
        }
        return cancelPlaybackPromise;
      }
    };
    this.activeJob = job;
    let started = false;
    let finished = false;
    const safeStart = () => {
      if (cancelled || started) return;
      started = true;
      if (typeof onStart === "function") {
        try {
          onStart();
        } catch (_error) {
        }
      }
    };
    const safeEnd = (status = "end") => {
      if (cancelled || finished) return;
      finished = true;
      if (this.activeJob && this.activeJob.id === jobId) this.activeJob = null;
      if (typeof onEnd === "function") {
        try {
          onEnd(status);
        } catch (_error) {
        }
      }
    };
    (async () => {
      try {
        const loadResult = await this.ensureLoaded();
        if (!loadResult || loadResult.ok !== true) {
          throw new Error(loadResult && loadResult.error || "voice_load_failed");
        }
        if (cancelled || !this.activeJob || this.activeJob.id !== jobId) return;
        let clip = null;
        try {
          clip = await this._getOrGenerateAudioClip({ text: spokenText, voiceId: effectiveVoiceId, speed: safeSpeed, pitch: safePitch });
        } catch (error) {
          clip = null;
        }
        if (cancelled || !this.activeJob || this.activeJob.id !== jobId) return;
        if (!clip || !clip.objectUrl) {
          await this._warmBrowserFallbackVoices({ primeUtterance: true, timeoutMs: 900, voiceIds: [effectiveVoiceId] }).catch(() => {
          });
          let voices = [];
          try {
            voices = Array.isArray(window.speechSynthesis.getVoices()) ? window.speechSynthesis.getVoices() : [];
          } catch (_error) {
          }
          let picked = this._resolveAssignedBrowserFallbackVoice(voices, "bm_george");
          if (!picked) {
            picked = voices.find((v) => String(v.lang || "").toLowerCase().startsWith("en-gb") && String(v.gender || "").toLowerCase() === "male");
          }
          if (!picked) {
            picked = voices.find((v) => String(v.lang || "").toLowerCase().startsWith("en-gb"));
          }
          if (!picked) {
            picked = voices.find((v) => String(v.lang || "").toLowerCase().startsWith("en"));
          }
          if (!picked) {
            if (typeof window !== "undefined") {
              const msg = `[TTS] No usable UK/English browser voice for narration. Skipping.`;
              if (window.console && window.console.warn) window.console.warn(msg);
              if (typeof window.showTtsWarningToast === "function") {
                window.showTtsWarningToast(msg);
              }
            }
            safeEnd("error");
            return;
          }
          let utterance;
          try {
            utterance = new SpeechSynthesisUtterance(spokenText);
          } catch (_error) {
            safeEnd("error");
            return;
          }
          try {
            utterance.voice = picked;
          } catch (_error) {
          }
          try {
            if (picked.lang) utterance.lang = picked.lang;
          } catch (_error) {
          }
          try {
            utterance.rate = safeSpeed;
          } catch (_error) {
          }
          try {
            utterance.pitch = safePitch;
          } catch (_error) {
          }
          try {
            utterance.volume = safeVolume;
          } catch (_error) {
          }
          utterance.onstart = () => {
            if (cancelled) return;
            safeStart();
          };
          utterance.onend = () => {
            if (cancelled) return;
            safeEnd("end");
          };
          utterance.onerror = () => {
            if (cancelled) return;
            safeEnd("error");
          };
          this.activeSpeechUtterance = utterance;
          try {
            try {
              window.speechSynthesis.resume();
            } catch (_error) {
            }
            window.speechSynthesis.speak(utterance);
          } catch (_error) {
            this.activeSpeechUtterance = null;
            safeEnd("error");
          }
          return;
        }
        const el = this._getAudioElement();
        const currentJobId = jobId;
        let finalized = false;
        const finalize = (status) => {
          if (finalized) return;
          finalized = true;
          el.removeEventListener("playing", handlePlaying);
          el.removeEventListener("ended", handleEnded);
          el.removeEventListener("error", handleError);
          safeEnd(status);
        };
        const handlePlaying = () => {
          if (cancelled || !this.activeJob || this.activeJob.id !== currentJobId) return;
          safeStart();
        };
        const handleEnded = () => finalize("end");
        const handleError = () => finalize("error");
        el.addEventListener("playing", handlePlaying, { once: true });
        el.addEventListener("ended", handleEnded, { once: true });
        el.addEventListener("error", handleError, { once: true });
        el.preload = "auto";
        el.volume = safeVolume;
        el.src = clip.objectUrl;
        try {
          el.currentTime = 0;
        } catch (_error) {
        }
        const playResult = el.play();
        if (playResult && typeof playResult.then === "function") {
          playResult.then(() => {
            if (cancelled || !this.activeJob || this.activeJob.id !== currentJobId) return;
            safeStart();
          }).catch(() => {
            void this._warmBrowserFallbackVoices({ primeUtterance: false, timeoutMs: 500 }).catch(() => {
            });
            if (!finalized) {
              finalized = true;
              el.removeEventListener("playing", handlePlaying);
              el.removeEventListener("ended", handleEnded);
              el.removeEventListener("error", handleError);
              try {
                el.pause();
              } catch (_error) {
              }
            }
            if (typeof window !== "undefined") {
              const msg = `[TTS] All desktop TTS options failed for narration.`;
              if (window.console && window.console.warn) window.console.warn(msg);
              if (typeof window.showTtsWarningToast === "function") {
                window.showTtsWarningToast(msg);
              }
            }
            safeEnd("error");
          });
        } else {
          safeStart();
        }
      } catch (error) {
        this.error = String(error && (error.message || error) || "Adaptive TTS playback failed");
        this._notifyStateChange();
        safeEnd("error");
      }
    })();
    return { handled: true, cancel: job.cancel };
  }
  async prepareBrowserFallback({
    voiceIds = [],
    primeUtterance = false,
    timeoutMs = 1200
  } = {}) {
    await this.ensureLoaded();
    return this._warmBrowserFallbackVoices({
      primeUtterance: primeUtterance === true,
      timeoutMs,
      voiceIds: Array.isArray(voiceIds) && voiceIds.length ? voiceIds : this.catalog.map((entry) => String(entry && entry.id || ""))
    });
  }
};
var ADAPTIVE_NARRATOR_VOICE_IDS = DEFAULT_NARRATOR_VOICE_IDS;

// public/js/app.js
var LOBBY_APP_BUILD = "20260302-preflight-voice2";
try {
  window.__lobbyBuild = window.__lobbyBuild || {};
  window.__lobbyBuild.app = LOBBY_APP_BUILD;
} catch (error) {
}
var socket = io(window.location.origin, {
  path: "/socket.io",
  transports: ["websocket", "polling"]
});
window.socket = socket;
var mobileChromeState = {
  enabled: false,
  fullscreenAttempted: false,
  nudgeTimerIds: []
};
var installPromptState = {
  deferredPrompt: null,
  initialized: false,
  sessionDismissed: false,
  fallbackTimerId: null
};
var INSTALL_PROMPT_DISMISS_KEY = "lobbywars_install_prompt_dismissed_session_v1";
var CONNECTION_DEBUG_KEY = "lobbywars_connection_debug_v1";
var connectionDebugState = {
  enabled: false,
  lastSignature: "",
  lastShownAt: 0
};
var networkOutageUiState = {
  lastToastAt: 0,
  lastReason: ""
};
var categoryVoteCountdownTimer = null;
var categoryVoteLocalChoice = "";
function updateNetworkOutageIndicators(reason = "", { showToastNotice = false } = {}) {
  const detail = String(reason || "").trim() || "server_unreachable";
  const message = `Connection lost (${detail}). Waiting for server...`;
  const round4Status = document.getElementById("evalFinalStatus");
  if (round4Status) {
    round4Status.textContent = message;
  }
  const loadingHint = document.getElementById("evalLoadingSubtitle");
  if (loadingHint) {
    loadingHint.textContent = "Server is unreachable. Round 4 will resume automatically once reconnect succeeds.";
  }
  const now = Date.now();
  if (showToastNotice && (now - Number(networkOutageUiState.lastToastAt || 0) > 8e3 || networkOutageUiState.lastReason !== detail)) {
    networkOutageUiState.lastToastAt = now;
    networkOutageUiState.lastReason = detail;
    showToast("Server connection lost. Trying to reconnect\u2026", "warning", 4200);
  }
}
function clearNetworkOutageIndicators() {
  networkOutageUiState.lastReason = "";
}
function resolveConnectionDebugEnabled() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("debugConnection") === "1") {
      window.localStorage.setItem(CONNECTION_DEBUG_KEY, "1");
      return true;
    }
    if (params.get("debugConnection") === "0") {
      window.localStorage.removeItem(CONNECTION_DEBUG_KEY);
      return false;
    }
    return window.localStorage.getItem(CONNECTION_DEBUG_KEY) === "1";
  } catch (error) {
    return false;
  }
}
function shouldAutoOpenRound4Loading() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return params.get("debugRound4Loading") === "1";
  } catch (error) {
    return false;
  }
}
function openRound4LoadingDebugView() {
  if (typeof window.initRound4Evaluation !== "function") return;
  const debugData = {
    scenario: "PULL OFF A HEIST",
    twist: "WITH GODZILLA AS BANKER",
    finalTeams: {
      ALPHA: [
        { name: "Batman", ovr: 92 },
        { name: "Sherlock Holmes", ovr: 89 }
      ],
      BRAVO: [
        { name: "Hermione Granger", ovr: 90 },
        { name: "Dwayne Johnson", ovr: 87 }
      ],
      CHARLIE: [
        { name: "Gandalf", ovr: 95 },
        { name: "SpongeBob", ovr: 84 }
      ]
    }
  };
  window.initRound4Evaluation(debugData);
}
function getSocketTransportName() {
  return socket && socket.io && socket.io.engine && socket.io.engine.transport ? socket.io.engine.transport.name : "n/a";
}
function showConnectionDebugToast(status, detail = "") {
  if (!connectionDebugState.enabled) return;
  const now = Date.now();
  const origin = window.location.origin;
  const transport = getSocketTransportName();
  const socketId = socket && socket.id ? socket.id.slice(0, 8) : "none";
  const signature = `${status}|${detail}|${transport}|${socketId}`;
  if (connectionDebugState.lastSignature === signature && now - connectionDebugState.lastShownAt < 2e3) {
    return;
  }
  connectionDebugState.lastSignature = signature;
  connectionDebugState.lastShownAt = now;
  const roomTag = player && player.room ? ` room=${player.room}` : "";
  const suffix = detail ? ` \u2022 ${detail}` : "";
  const message = `ConnDebug: ${status}${suffix} \u2022 origin=${origin} \u2022 transport=${transport} \u2022 id=${socketId}${roomTag}`;
  showToast(message, status === "error" ? "warning" : "info", 7e3);
}
connectionDebugState.enabled = resolveConnectionDebugEnabled();
if (connectionDebugState.enabled) {
  showConnectionDebugToast("init", "debugConnection=1 active");
}
function isLikelyMobileDevice() {
  const ua = navigator.userAgent || "";
  const coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const hasTouch = navigator.maxTouchPoints > 0;
  return /android|iphone|ipad|ipod|mobile|windows phone/i.test(ua) || coarsePointer || hasTouch;
}
function isConstrainedMobileStartupDevice() {
  const connection = navigator && (navigator.connection || navigator.mozConnection || navigator.webkitConnection) || null;
  const effectiveType = String(connection && connection.effectiveType || "").toLowerCase();
  const saveDataEnabled = Boolean(connection && connection.saveData === true);
  const constrainedNetwork = saveDataEnabled || /(^|[^a-z])(slow-2g|2g)($|[^a-z])/i.test(effectiveType);
  const hardwareConcurrency = Math.max(0, Number(navigator && navigator.hardwareConcurrency) || 0);
  const deviceMemory = Math.max(0, Number(navigator && navigator.deviceMemory) || 0);
  const constrainedCpu = hardwareConcurrency > 0 && hardwareConcurrency <= 4;
  const constrainedMemory = deviceMemory > 0 && deviceMemory <= 2;
  return isLikelyMobileDevice() && (constrainedNetwork || constrainedCpu || constrainedMemory);
}
function setMobileAppHeightVar() {
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  if (!viewportHeight || !Number.isFinite(viewportHeight)) return;
  document.documentElement.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
}
function nudgeBrowserChrome() {
  if (!mobileChromeState.enabled) return;
  if (window.scrollY > 0) return;
  window.scrollTo(0, 1);
}
function clearChromeNudges() {
  mobileChromeState.nudgeTimerIds.forEach((id) => clearTimeout(id));
  mobileChromeState.nudgeTimerIds = [];
}
function scheduleChromeNudges() {
  clearChromeNudges();
  const delays = [0, 80, 180, 320, 600, 1e3, 1600, 2400];
  delays.forEach((delay) => {
    const timerId = setTimeout(() => {
      setMobileAppHeightVar();
      nudgeBrowserChrome();
    }, delay);
    mobileChromeState.nudgeTimerIds.push(timerId);
  });
}
function tryEnterFullscreenOnGesture() {
  if (mobileChromeState.fullscreenAttempted) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  const root = document.documentElement;
  const requestFullscreen = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
  if (typeof requestFullscreen !== "function") return;
  mobileChromeState.fullscreenAttempted = true;
  try {
    const maybePromise = requestFullscreen.call(root);
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {
        mobileChromeState.fullscreenAttempted = false;
      });
    }
  } catch (error) {
    mobileChromeState.fullscreenAttempted = false;
  }
}
function installMobileChromeController() {
  if (!isLikelyMobileDevice()) return;
  mobileChromeState.enabled = true;
  document.body.classList.add("mobile-chrome-hack");
  setMobileAppHeightVar();
  scheduleChromeNudges();
  const refreshLayoutAndChrome = () => {
    setMobileAppHeightVar();
    scheduleChromeNudges();
  };
  window.addEventListener("load", refreshLayoutAndChrome, { passive: true });
  window.addEventListener("resize", refreshLayoutAndChrome, { passive: true });
  window.addEventListener("orientationchange", refreshLayoutAndChrome, { passive: true });
  window.addEventListener("pageshow", refreshLayoutAndChrome, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshLayoutAndChrome();
    }
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", setMobileAppHeightVar, { passive: true });
    window.visualViewport.addEventListener("scroll", setMobileAppHeightVar, { passive: true });
  }
  const unlockImmersiveMode = () => {
    tryEnterFullscreenOnGesture();
    nudgeBrowserChrome();
  };
  ["touchstart", "touchend", "pointerup", "click"].forEach((eventName) => {
    document.addEventListener(eventName, unlockImmersiveMode, { passive: true });
  });
}
installMobileChromeController();
function isStandaloneDisplayMode() {
  const standaloneByMedia = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  const standaloneByNavigator = window.navigator.standalone === true;
  return standaloneByMedia || standaloneByNavigator;
}
function isIOS() {
  const ua = navigator.userAgent || "";
  const classicIOS = /iphone|ipad|ipod/i.test(ua);
  const iPadDesktopMode = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return classicIOS || iPadDesktopMode;
}
function canShowInstallPromptNow() {
  try {
    return window.sessionStorage.getItem(INSTALL_PROMPT_DISMISS_KEY) !== "1";
  } catch (error) {
    return true;
  }
}
function rememberInstallPromptDismissal() {
  try {
    window.sessionStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, "1");
  } catch (error) {
  }
}
function isJoinScreenActive() {
  const joinScreen = document.getElementById("join");
  return Boolean(joinScreen && joinScreen.classList.contains("active"));
}
function syncInstallPromptReopenVisibility() {
  const reopenBtn = document.getElementById("installPromptReopen");
  if (!reopenBtn) return;
  const shouldShowReopen = isLikelyMobileDevice() && !isStandaloneDisplayMode() && isJoinScreenActive();
  reopenBtn.hidden = !shouldShowReopen;
}
function hideInstallPrompt() {
  const root = document.getElementById("installPrompt");
  const instructionEl = document.getElementById("installPromptInstruction");
  if (!root) return;
  root.style.display = "none";
  root.hidden = true;
  if (instructionEl) {
    instructionEl.textContent = "";
    instructionEl.hidden = true;
  }
  syncInstallPromptReopenVisibility();
}
function showPersistentInstallInstruction(message) {
  const instructionEl = document.getElementById("installPromptInstruction");
  if (!instructionEl) return;
  instructionEl.textContent = message;
  instructionEl.hidden = false;
}
function showInstallPrompt({ copy, actionLabel, onAction }) {
  if (installPromptState.sessionDismissed) return;
  if (isStandaloneDisplayMode()) {
    hideInstallPrompt();
    return;
  }
  const root = document.getElementById("installPrompt");
  const copyEl = document.getElementById("installPromptCopy");
  const instructionEl = document.getElementById("installPromptInstruction");
  const actionBtn = document.getElementById("installPromptAction");
  const dismissBtn = document.getElementById("installPromptDismiss");
  const closeBtn = document.getElementById("installPromptClose");
  const reopenBtn = document.getElementById("installPromptReopen");
  if (!root || !copyEl || !actionBtn || !dismissBtn || !closeBtn) return;
  copyEl.textContent = copy;
  if (instructionEl) {
    instructionEl.textContent = "";
    instructionEl.hidden = true;
  }
  actionBtn.textContent = actionLabel;
  actionBtn.onclick = onAction;
  closeBtn.onclick = () => {
    installPromptState.sessionDismissed = true;
    hideInstallPrompt();
    rememberInstallPromptDismissal();
  };
  dismissBtn.onclick = () => {
    installPromptState.sessionDismissed = true;
    hideInstallPrompt();
    rememberInstallPromptDismissal();
  };
  root.style.removeProperty("display");
  root.hidden = false;
  if (reopenBtn) {
    reopenBtn.hidden = true;
    reopenBtn.onclick = () => {
      installPromptState.sessionDismissed = false;
      showInstallPrompt({ copy, actionLabel, onAction });
    };
  }
}
function installFullscreenPromptFlow() {
  if (installPromptState.initialized) return;
  installPromptState.initialized = true;
  document.addEventListener("screenChanged", syncInstallPromptReopenVisibility);
  document.addEventListener("screenChanged", (event) => {
    const screenId = event && event.detail ? event.detail.screenId : "";
    if (screenId === "lobby" && getActiveLobbyTabName() === "chat") {
      resetChatTabPing();
    }
    if (screenId !== "scenarioScreen") {
      resetDraftWaitIntelPreview({ hide: true, statusText: "Checking cached evaluator prep..." });
    }
  });
  document.addEventListener("lobbyTabChanged", (event) => {
    const tabName = event && event.detail ? event.detail.tabName : "";
    if (tabName === "chat") {
      resetChatTabPing();
      renderChatMessages({ forceBottom: true });
    }
  });
  syncInstallPromptReopenVisibility();
  if (!isLikelyMobileDevice()) {
    hideInstallPrompt();
    return;
  }
  const reopenBtn = document.getElementById("installPromptReopen");
  if (reopenBtn) {
    reopenBtn.onclick = () => {
      installPromptState.sessionDismissed = false;
      if (isIOS()) {
        showInstallPrompt({
          copy: "Install to play in fullscreen with hidden browser bars.",
          actionLabel: "Install",
          onAction: () => {
            showPersistentInstallInstruction("Chrome on iOS: Share \u2192 More \u2192 Add to Home Screen. Safari on iOS: Share \u2192 Add to Home Screen.");
          }
        });
        return;
      }
      showInstallPrompt({
        copy: "Install from your browser menu for true fullscreen mode and hidden browser bars.",
        actionLabel: "Install",
        onAction: async () => {
          const deferred = installPromptState.deferredPrompt;
          if (deferred && typeof deferred.prompt === "function") {
            try {
              deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice && choice.outcome === "accepted") {
                installPromptState.sessionDismissed = true;
                rememberInstallPromptDismissal();
                hideInstallPrompt();
              }
            } catch (error) {
              showPersistentInstallInstruction("Install prompt could not open. Use browser menu and choose Install App or Add to Home Screen.");
            }
            return;
          }
          showPersistentInstallInstruction("Use your browser menu and choose Install App or Add to Home Screen.");
        }
      });
    };
  }
  if (isStandaloneDisplayMode()) {
    hideInstallPrompt();
    return;
  }
  if (!canShowInstallPromptNow()) {
    installPromptState.sessionDismissed = true;
    hideInstallPrompt();
    return;
  }
  const standaloneModeQuery = window.matchMedia ? window.matchMedia("(display-mode: standalone)") : null;
  if (standaloneModeQuery && typeof standaloneModeQuery.addEventListener === "function") {
    standaloneModeQuery.addEventListener("change", (event) => {
      if (event.matches) {
        hideInstallPrompt();
      }
    });
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (installPromptState.fallbackTimerId) {
      clearTimeout(installPromptState.fallbackTimerId);
      installPromptState.fallbackTimerId = null;
    }
    installPromptState.deferredPrompt = event;
    showInstallPrompt({
      copy: "Install LobbyWARS to launch with fullscreen behavior and hidden browser bars.",
      actionLabel: "Install",
      onAction: async () => {
        const deferred = installPromptState.deferredPrompt;
        if (!deferred) {
          showPersistentInstallInstruction("Use your browser menu and choose Install App or Add to Home Screen.");
          return;
        }
        try {
          deferred.prompt();
        } catch (error) {
          showPersistentInstallInstruction("Native install prompt could not open. Use browser menu and choose Install App or Add to Home Screen.");
          return;
        }
        try {
          const choice = await deferred.userChoice;
          if (choice && choice.outcome === "accepted") {
            installPromptState.sessionDismissed = true;
            rememberInstallPromptDismissal();
            hideInstallPrompt();
          } else {
            showPersistentInstallInstruction("Install canceled. You can still install later from your browser menu.");
          }
        } catch (error) {
          showPersistentInstallInstruction("Install result unavailable. You can install from your browser menu anytime.");
        }
        installPromptState.deferredPrompt = null;
      }
    });
  });
  window.addEventListener("appinstalled", () => {
    installPromptState.deferredPrompt = null;
    installPromptState.sessionDismissed = true;
    rememberInstallPromptDismissal();
    hideInstallPrompt();
    const reopenBtnAfterInstall = document.getElementById("installPromptReopen");
    if (reopenBtnAfterInstall) reopenBtnAfterInstall.hidden = true;
    showToast("Installed! Open LobbyWARS from your home screen for true fullscreen mode.", "info", 5e3);
  });
  if (isIOS()) {
    showInstallPrompt({
      copy: "Install to play in fullscreen with hidden browser bars.",
      actionLabel: "Install",
      onAction: () => {
        showPersistentInstallInstruction("Chrome on iOS: Share \u2192 More \u2192 Add to Home Screen. Safari on iOS: Share \u2192 Add to Home Screen.");
      }
    });
    return;
  }
  showInstallPrompt({
    copy: "Install from your browser menu for true fullscreen mode and hidden browser bars.",
    actionLabel: "Install",
    onAction: async () => {
      const deferred = installPromptState.deferredPrompt;
      if (deferred && typeof deferred.prompt === "function") {
        try {
          deferred.prompt();
          const choice = await deferred.userChoice;
          if (choice && choice.outcome === "accepted") {
            installPromptState.sessionDismissed = true;
            rememberInstallPromptDismissal();
            hideInstallPrompt();
          }
        } catch (error) {
          showPersistentInstallInstruction("Install prompt could not open. Use browser menu and choose Install App or Add to Home Screen.");
        }
        return;
      }
      showPersistentInstallInstruction("Use your browser menu and choose Install App or Add to Home Screen.");
    }
  });
}
installFullscreenPromptFlow();
var audioContext = null;
var AUDIO_PREFS_KEY = "lobbywars_audio_prefs_v2";
var AUDIO_CATEGORY_KEYS = ["music", "sfx", "reveal", "card"];
var AUDIO_CATEGORY_DEFAULTS = {
  music: { enabled: true, volume: 0.42 },
  sfx: { enabled: true, volume: 0.9 },
  reveal: { enabled: true, volume: 0.88 },
  card: { enabled: true, volume: 0.92 }
};
var KOKORO_ONLY_VOICE_SYSTEM = true;
var audioState = {
  unlocked: false,
  htmlMediaUnlocked: false,
  managedHtmlMediaPrimed: false,
  masterGain: null,
  sfxGain: null,
  musicGain: null,
  revealGain: null,
  cardGain: null,
  muted: false,
  masterVolume: 0.9,
  sfxVolume: AUDIO_CATEGORY_DEFAULTS.sfx.volume,
  musicVolume: AUDIO_CATEGORY_DEFAULTS.music.volume,
  revealVolume: AUDIO_CATEGORY_DEFAULTS.reveal.volume,
  cardVolume: AUDIO_CATEGORY_DEFAULTS.card.volume,
  sfxEnabled: AUDIO_CATEGORY_DEFAULTS.sfx.enabled,
  musicEnabled: AUDIO_CATEGORY_DEFAULTS.music.enabled,
  revealEnabled: AUDIO_CATEGORY_DEFAULTS.reveal.enabled,
  cardEnabled: AUDIO_CATEGORY_DEFAULTS.card.enabled,
  voiceEnabled: true,
  voiceExpressiveMode: true,
  voiceSupported: null,
  voiceReady: false,
  voiceUnlocked: false,
  voiceQueueLength: 0,
  voiceSpeaking: false,
  voiceActiveCueText: "",
  voiceStatusText: "",
  voiceStatusTone: "",
  voiceNarratorVoiceId: "",
  voiceCharacterVoiceId: "",
  voiceCharacterProfile: "auto_archetype",
  voiceCatalog: [],
  voiceCatalogSignature: "",
  voicePreviewCharacterIndex: 0,
  voiceBackendLastLabel: "",
  kokoroEnabled: true,
  kokoroAutoLoad: true,
  kokoroLoading: false,
  kokoroReady: false,
  kokoroError: "",
  kokoroStatusText: "",
  kokoroStatusTone: "",
  kokoroNarratorVoiceId: "bm_george",
  kokoroCharacterVoiceId: "",
  kokoroCatalog: [],
  kokoroCatalogSignature: "",
  kokoroLastLoadMs: 0,
  kokoroDevice: "",
  kokoroDtype: "",
  kokoroLoadProgressPct: 0,
  kokoroLoadProgressText: "",
  kokoroLoadProgressFile: "",
  kokoroLoadPhase: "",
  kokoroWarmupDone: false,
  kokoroWarmupLoading: false,
  kokoroWarmupWarmedCount: 0,
  kokoroCastWarmupDone: false,
  kokoroCastWarmupLoading: false,
  kokoroPanelOpen: false,
  kokoroNarratorQueuedVoiceId: "",
  kokoroNarratorQueuedBy: "",
  kokoroNarratorQueuedAt: 0,
  kokoroNarratorQueuedSig: "",
  kokoroNarratorQueuedPulseUntil: 0,
  kokoroNarratorPeerPingCount: 0,
  kokoroNarratorPeerPingSeenAt: 0,
  kokoroHostPreviewWarmupDone: false,
  kokoroHostPreviewWarmupLoading: false,
  currentMusicScene: "join",
  currentScreenScene: "join",
  musicLoopToken: 0,
  musicLoopTimer: null,
  musicPreviewTimer: null,
  musicPreviewActive: false,
  musicPreviewRestoreScene: "",
  musicPreviewRestoreMusicEnabled: null,
  musicPreviewStatusText: "",
  musicPreviewStatusTone: "",
  musicDecks: [],
  musicActiveDeckIndex: -1,
  musicTransitionToken: 0,
  musicFadeRaf: null,
  musicTransitionState: null,
  musicSceneRequestSeq: 0,
  musicCurrentTrackUrl: "",
  musicCurrentSceneSpec: null,
  lastMusicSceneLogSig: "",
  previewSceneSelection: "join",
  quickPanelOpen: false,
  audioDeckExpanded: false,
  quickPanelHandlersBound: false,
  globalAudioHandlersBound: false,
  quickFabDotDismissed: false,
  lastCardBlurbAt: 0,
  lastCardBlurbSig: "",
  lastFinaleAutoplaySig: "",
  lastFinaleVictoryAutoplaySig: "",
  lastFinaleNoAudioToastSig: "",
  cardClipStats: null,
  cardClipStatsFetchedAt: 0,
  cardClipLibrarySignature: "",
  cardClipResolverApiAvailable: null,
  cardClipResolverApiRetryAt: 0,
  cardSnippetMatchCache: /* @__PURE__ */ new Map(),
  cardSnippetBatchMetaCache: /* @__PURE__ */ new Map(),
  cardClipPrefetchQueue: [],
  cardClipPrefetchQueuedKeys: /* @__PURE__ */ new Set(),
  cardClipPrefetchDrainTimer: null,
  cardClipPrefetchInFlight: false,
  cardClipPrefetchLastLogAt: 0,
  mediaUrlProbeCache: /* @__PURE__ */ new Map(),
  cardPlaybackGainScalar: 1,
  cardPlaybackToken: 0,
  cardSpeechToken: 0,
  voiceCueCache: /* @__PURE__ */ new Map(),
  voiceEntryArchetypeCache: /* @__PURE__ */ new Map(),
  speechVoices: [],
  speechVoicesLoaded: false,
  speechVoicesLoading: false,
  htmlUnlockElement: null,
  mobileTouchHintShown: false,
  mobileTouchHintTimer: null,
  lastManagedMediaPlayErrorSig: "",
  lastManagedMediaPlayErrorAt: 0,
  hasPlayedLobbyEntry: false,
  listenerCleanup: null,
  controlsInitialized: false
};
var preRoundAudioState = {
  lastMilestone: -1
};
var voteTallyLoadingState = {
  active: false,
  totalFetches: 0,
  completedFetches: 0,
  stallTarget: 78,
  pulseTimer: null,
  finalizeTimer: null
};
var draftLockVisualState = {
  availableSince: 0,
  urgencyTicker: null,
  waitTicker: null,
  waitEmojiIndex: 0,
  waitDotIndex: 0
};
var chatPingState = {
  unreadCount: 0,
  roomCode: "",
  lastMessageTs: 0
};
var READY_TOGGLE_ARM_WINDOW_MS = 2600;
var READY_TOGGLE_COOLDOWN_MS = 1200;
var READY_TOGGLE_PENDING_TIMEOUT_MS = 3200;
var readyToggleLockState = {
  armed: false,
  armTimer: null,
  pending: false,
  pendingTimer: null,
  cooldownUntil: 0,
  cooldownTimer: null,
  lastHintAt: 0
};
var draftWaitIntelPreviewState = {
  pollTimer: null,
  pollStopAtMs: 0,
  receivedRound: null,
  requestRound: null
};
var voiceManagerInstance = null;
var voiceStatusResetTimer = null;
var voiceCuePrefetchState = {
  queue: [],
  queuedKeys: /* @__PURE__ */ new Set(),
  inFlight: false,
  timerId: null,
  lastLogAt: 0
};
function setVoiceStatus(text = "", tone = "") {
  audioState.voiceStatusText = String(text || "").trim();
  audioState.voiceStatusTone = String(tone || "").trim().toLowerCase();
  if (voiceStatusResetTimer) {
    window.clearTimeout(voiceStatusResetTimer);
    voiceStatusResetTimer = null;
  }
  if (audioState.voiceStatusText) {
    voiceStatusResetTimer = window.setTimeout(() => {
      audioState.voiceStatusText = "";
      audioState.voiceStatusTone = "";
      syncAudioControlUI();
    }, 4200);
  }
  syncAudioControlUI();
}
function getVoiceStatusText() {
  if (audioState.voiceEnabled === false) return "Voice cues off";
  if (audioState.kokoroLoading) return "Loading adaptive neural voice routing...";
  if (audioState.kokoroReady) {
    if (audioState.voiceSpeaking && audioState.voiceActiveCueText) return `Neural voice speaking: ${audioState.voiceActiveCueText}`;
    return "Voice ready (adaptive neural)";
  }
  if (audioState.kokoroError) return `Neural voice not ready: ${audioState.kokoroError}`;
  if (!audioState.voiceUnlocked) return "Tap to enable voice narration (iOS/mobile requires gesture)";
  if (audioState.muted) return "Voice muted by master audio";
  if (audioState.voiceSpeaking && audioState.voiceActiveCueText) return `Speaking: ${audioState.voiceActiveCueText}`;
  if (audioState.voiceQueueLength > 0) return `Voice queue ready (${audioState.voiceQueueLength})`;
  return "Neural voice queued (awaiting provider warmup)";
}
function getCharacterRuntimeModeText() {
  return "Automatic archetype routing always uses the curated 4-voice cast, with gold-standard archetype mapping plus prosody shaping.";
}
function getVoiceCueCategoryVolume(cue = {}) {
  if (audioState.muted || audioState.voiceEnabled === false) return 0;
  const type = String(cue && cue.type || "").toLowerCase();
  const master = clampAudioLevel(audioState.masterVolume, 0.9);
  if (type === "entry") {
    const previewCue = isVoicePreviewCue(cue) || /voice studio:\s*character preview/i.test(String(cue && cue.subtitleText || ""));
    if (!audioState.cardEnabled && !previewCue) return 0;
    const cardVolume = clampAudioLevel(
      previewCue ? Math.max(0.7, Number(audioState.cardVolume) || AUDIO_CATEGORY_DEFAULTS.card.volume) : audioState.cardVolume,
      AUDIO_CATEGORY_DEFAULTS.card.volume
    );
    return Math.max(0, Math.min(1, master * cardVolume));
  }
  return Math.max(0, Math.min(1, master * 0.82));
}
function normalizeVoiceChoiceId(value = "") {
  return String(value || "").trim();
}
var CHARACTER_VOICE_PROFILE_OPTIONS = Object.freeze([
  { id: "auto_archetype", label: "Auto Mix (Runtime Default)", description: "Gameplay uses the curated 4-voice cast with archetype-specific voice + prosody shaping" },
  { id: "villain", label: "Preview: Villain / Dark", description: "Gold voice: Ryan (UK male) with darker pacing and lower pitch feel" },
  { id: "heroic", label: "Preview: Heroic / Cinematic", description: "Gold voice: Ryan (UK male) with brighter, hopeful cinematic lift" },
  { id: "cartoon", label: "Preview: Cartoon / Bright", description: "Gold voice: Aria (US female) with brighter, faster delivery" },
  { id: "robotic", label: "Preview: Robotic / Synthetic", description: "Gold voice: Guy/Ryan with tighter cadence and flatter shaping" },
  { id: "spooky", label: "Preview: Spooky / Whispery", description: "Gold voice: Ryan (UK male) softer, hush-like pacing with trailing ambience feel" },
  { id: "chaotic", label: "Preview: Chaotic / Meme", description: "Gold voice: Jenny (US female) fast, upbeat, and cheerful" }
]);
function normalizeCharacterVoiceProfile(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  const found = CHARACTER_VOICE_PROFILE_OPTIONS.find((item) => String(item.id || "").toLowerCase() === raw);
  return found ? found.id : "auto_archetype";
}
function getCharacterVoiceProfileOption(profileId = "") {
  const normalized = normalizeCharacterVoiceProfile(profileId);
  return CHARACTER_VOICE_PROFILE_OPTIONS.find((item) => item.id === normalized) || CHARACTER_VOICE_PROFILE_OPTIONS[0];
}
function setVoiceCharacterProfile(nextProfile, { persist = true } = {}) {
  audioState.voiceCharacterProfile = normalizeCharacterVoiceProfile(nextProfile);
  syncAudioControlUI();
  if (persist) saveAudioPreferences();
}
function getPreferredVoiceIdForCue(cue = {}) {
  const type = String(cue && cue.type || "").toLowerCase();
  if (type === "entry") {
    return normalizeVoiceChoiceId(audioState.voiceCharacterVoiceId);
  }
  return normalizeVoiceChoiceId(audioState.voiceNarratorVoiceId);
}
var KOKORO_VOICE_PRESET_META = Object.freeze({
  af_heart: {
    shortName: "Jenny",
    menuLabel: "Jenny (US Female) - Neural Host",
    roleHint: "Narration \u2022 Female 1 \u2022 Edge Neural"
  },
  af_bella: {
    shortName: "Aria",
    menuLabel: "Aria (US Female) - Neural Bright",
    roleHint: "Narration \u2022 Female 2 \u2022 Edge Neural"
  },
  am_michael: {
    shortName: "Guy",
    menuLabel: "Guy (US Male) - Neural Heroic",
    roleHint: "Narration \u2022 Male 1 \u2022 Edge Neural"
  },
  bm_george: {
    shortName: "Ryan",
    menuLabel: "Ryan (UK Male) - Neural Dramatic (Suggested)",
    roleHint: "Narration \u2022 Male 2 \u2022 Edge Neural"
  }
});
var KOKORO_VOICE_PRESET_LABELS = Object.freeze(
  Object.fromEntries(
    Object.entries(KOKORO_VOICE_PRESET_META).map(([id, meta]) => [id, String(meta && meta.menuLabel || id)])
  )
);
var DEFAULT_NARRATOR_VOICE_ID = "bm_george";
var KOKORO_CURATED_VOICE_IDS = Object.freeze(ADAPTIVE_NARRATOR_VOICE_IDS.slice());
var KOKORO_VOICE_PREWARM_TEXT_BY_ID = Object.freeze({
  af_heart: "Round begins.",
  af_bella: "I'm ready!",
  am_michael: "Stay focused.",
  bm_george: "Final brief. Scenario locked."
});
var KOKORO_VOICE_PREWARM_SPEED_BY_ID = Object.freeze({
  af_heart: 1,
  af_bella: 1.08,
  am_michael: 0.98,
  bm_george: 0.92
});
var KOKORO_HOST_PREVIEW_TEXT = "Final brief. Scenario locked. Twist incoming.";
var KOKORO_HOST_PREVIEW_SPEED = 0.92;
function isCurrentPlayerHost() {
  return Boolean(player && player.name && roomState && roomState.host && String(player.name) === String(roomState.host));
}
function getKokoroNarratorLabelById(voiceId = "") {
  const normalized = normalizeKokoroVoiceId(voiceId) || DEFAULT_NARRATOR_VOICE_ID;
  const entry = findKokoroCatalogEntryById(normalized);
  return entry ? formatKokoroCatalogLabel(entry) : KOKORO_VOICE_PRESET_LABELS[normalized] || normalized;
}
function clearKokoroNarratorPeerPing({ sync = true } = {}) {
  audioState.kokoroNarratorPeerPingCount = 0;
  audioState.kokoroNarratorPeerPingSeenAt = Date.now();
  if (sync) syncAudioControlUI();
}
function setKokoroVoiceStudioOpen(open, { clearPing = true } = {}) {
  audioState.kokoroPanelOpen = open === true;
  if (audioState.kokoroPanelOpen && clearPing) {
    clearKokoroNarratorPeerPing({ sync: false });
  }
  syncAudioControlUI();
}
function getKokoroNarratorCollapsedSummaryText() {
  const narratorId = normalizeKokoroVoiceId(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID;
  const narratorLabel = getKokoroNarratorLabelById(narratorId);
  const queuedBy = String(audioState.kokoroNarratorQueuedBy || "").trim();
  const queuedAt = Number(audioState.kokoroNarratorQueuedAt) || 0;
  if (queuedAt > 0 && queuedBy) {
    const ageMs = Date.now() - queuedAt;
    if (ageMs < 12e4) {
      const byText = queuedBy === String(player && player.name || "") ? "you" : queuedBy;
      return `Narrator: ${narratorLabel} (queued by ${byText})`;
    }
  }
  return `Narrator: ${narratorLabel}`;
}
function applyQueuedKokoroNarratorVoice(payload = {}, { local = false } = {}) {
  const narratorVoiceId = normalizeKokoroVoiceId(payload && payload.narratorVoiceId) || DEFAULT_NARRATOR_VOICE_ID;
  const queuedBy = String(payload && payload.queuedBy || "").trim();
  const queuedAt = Number(payload && payload.queuedAt) || Date.now();
  const sig = `${narratorVoiceId}|${queuedBy}|${queuedAt}`;
  if (sig && sig === String(audioState.kokoroNarratorQueuedSig || "")) {
    return;
  }
  audioState.kokoroNarratorQueuedSig = sig;
  audioState.kokoroNarratorQueuedVoiceId = narratorVoiceId;
  audioState.kokoroNarratorQueuedBy = queuedBy;
  audioState.kokoroNarratorQueuedAt = queuedAt;
  audioState.kokoroNarratorQueuedPulseUntil = Date.now() + 9e3;
  setKokoroVoiceChoice("narrator", narratorVoiceId, { persist: true });
  if (!audioState.kokoroWarmupDone && !audioState.kokoroWarmupLoading) {
    void ensureKokoroStartupWarmup({ source: local ? "host-change" : "room-sync" }).then(() => ensureKokoroHostPreviewClipWarmup({ source: local ? "host-change-preview" : "room-sync-preview", deferIfBusy: false })).catch(() => {
    });
  } else {
    void ensureKokoroHostPreviewClipWarmup({ source: local ? "host-change" : "room-sync", deferIfBusy: true });
  }
  const narratorLabel = getKokoroNarratorLabelById(narratorVoiceId);
  const myName = String(player && player.name || "");
  const isSelf = queuedBy && queuedBy === myName;
  if (!local && !isSelf && queuedBy) {
    audioState.kokoroNarratorPeerPingCount = Math.min(9, (Number(audioState.kokoroNarratorPeerPingCount) || 0) + 1);
    showToast(`\u{1F399}\uFE0F ${queuedBy} queued narrator voice: ${narratorLabel}`, "info", 3200);
    try {
      playMessageSound();
    } catch (error) {
    }
  }
  if (isSelf || local) {
    setKokoroStatus(`Queued narrator for this room: ${narratorLabel}`, "active");
    setVoiceStatus(`Narrator queued: ${narratorLabel}`, "active");
  } else if (queuedBy) {
    setKokoroStatus(`Host queued narrator: ${narratorLabel} (${queuedBy})`, "active");
  }
  syncAudioControlUI();
}
function queueRoomKokoroNarratorVoice(narratorVoiceId = "") {
  const voiceId = normalizeKokoroVoiceId(narratorVoiceId) || DEFAULT_NARRATOR_VOICE_ID;
  const queuedBy = String(player && player.name || "").trim();
  const queuedAt = Date.now();
  applyQueuedKokoroNarratorVoice({ narratorVoiceId: voiceId, queuedBy, queuedAt }, { local: true });
  if (socket && socket.connected && player && player.room && isCurrentPlayerHost()) {
    socket.emit("queueNarratorVoice", { voiceId });
  }
}
var kokoroVoiceEngineInstance = null;
var kokoroStatusResetTimer = null;
var kokoroStartupWarmupPromise = null;
var kokoroFullCastWarmupPromise = null;
var kokoroHostPreviewWarmupPromise = null;
var kokoroCastWarmupScheduled = false;
var kokoroGesturePrimeAt = 0;
var kokoroPreparedVoiceIds = /* @__PURE__ */ new Set();
var kokoroPreviewClipWarmedVoiceIds = /* @__PURE__ */ new Set();
function setKokoroStatus(text = "", tone = "") {
  audioState.kokoroStatusText = String(text || "").trim();
  audioState.kokoroStatusTone = String(tone || "").trim().toLowerCase();
  if (kokoroStatusResetTimer) {
    window.clearTimeout(kokoroStatusResetTimer);
    kokoroStatusResetTimer = null;
  }
  if (audioState.kokoroStatusText) {
    kokoroStatusResetTimer = window.setTimeout(() => {
      audioState.kokoroStatusText = "";
      audioState.kokoroStatusTone = "";
      syncAudioControlUI();
    }, 5200);
  }
  syncAudioControlUI();
}
function getKokoroPreparedVoiceCount() {
  let count = 0;
  KOKORO_CURATED_VOICE_IDS.forEach((id) => {
    if (kokoroPreparedVoiceIds.has(id)) count += 1;
  });
  return count;
}
function markKokoroVoicesPrepared(results = []) {
  if (!Array.isArray(results)) return 0;
  results.forEach((entry) => {
    if (!entry || entry.ok !== true) return;
    const id = normalizeKokoroVoiceId(entry.voiceId || "");
    if (id) kokoroPreparedVoiceIds.add(id);
  });
  const count = getKokoroPreparedVoiceCount();
  audioState.kokoroWarmupWarmedCount = count;
  audioState.kokoroCastWarmupDone = count >= KOKORO_CURATED_VOICE_IDS.length;
  const narratorId = normalizeKokoroVoiceId(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID;
  audioState.kokoroWarmupDone = kokoroPreparedVoiceIds.has(narratorId);
  return count;
}
function getMissingKokoroVoiceIds(targetVoiceIds = []) {
  const ids = Array.isArray(targetVoiceIds) ? targetVoiceIds : [];
  const normalized = [];
  const seen = /* @__PURE__ */ new Set();
  ids.forEach((id) => {
    const voiceId = normalizeKokoroVoiceId(id);
    if (!voiceId || seen.has(voiceId)) return;
    seen.add(voiceId);
    if (!kokoroPreparedVoiceIds.has(voiceId)) normalized.push(voiceId);
  });
  return normalized;
}
function getKokoroCatalogEntries() {
  return Array.isArray(audioState.kokoroCatalog) ? audioState.kokoroCatalog : [];
}
function findKokoroCatalogEntryById(id = "") {
  const target = String(id || "").trim();
  if (!target) return null;
  const catalog = getKokoroCatalogEntries();
  for (let i = 0; i < catalog.length; i += 1) {
    const item = catalog[i];
    if (String(item && item.id || "") === target) return item;
  }
  return null;
}
function normalizeKokoroVoiceId(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!KOKORO_CURATED_VOICE_IDS.includes(raw)) return "";
  if (findKokoroCatalogEntryById(raw)) return raw;
  if (KOKORO_CURATED_VOICE_IDS.includes(raw)) return raw;
  return "";
}
function refreshKokoroCatalogFromEngine(engine = null) {
  const target = engine || kokoroVoiceEngineInstance;
  let catalog = [];
  if (target && typeof target.getCatalog === "function") {
    try {
      catalog = target.getCatalog() || [];
    } catch (error) {
      catalog = [];
    }
  }
  catalog = buildKokoroCuratedCatalog(catalog, KOKORO_CURATED_VOICE_IDS, KOKORO_VOICE_PRESET_META);
  const sig = buildKokoroCatalogSignature(catalog);
  const changed = sig !== audioState.kokoroCatalogSignature;
  audioState.kokoroCatalog = catalog;
  audioState.kokoroCatalogSignature = sig;
  let prefsChanged = false;
  if (audioState.kokoroNarratorVoiceId && !findKokoroCatalogEntryById(audioState.kokoroNarratorVoiceId)) {
    audioState.kokoroNarratorVoiceId = DEFAULT_NARRATOR_VOICE_ID;
    prefsChanged = true;
  }
  if (audioState.kokoroCharacterVoiceId && !findKokoroCatalogEntryById(audioState.kokoroCharacterVoiceId)) {
    audioState.kokoroCharacterVoiceId = "";
    prefsChanged = true;
  }
  if (prefsChanged) saveAudioPreferences();
  return changed || prefsChanged;
}
function getKokoroStatusText() {
  if (audioState.kokoroEnabled !== true) return "Adaptive voice backend standby";
  if (audioState.kokoroLoading) {
    const progressPct = Math.round(Math.max(0, Math.min(100, Number(audioState.kokoroLoadProgressPct) || 0)));
    const progressText = String(audioState.kokoroLoadProgressText || "").trim();
    return progressText ? `${progressText}${progressPct > 0 && progressPct < 100 && !progressText.includes("%") ? ` (${progressPct}%)` : ""}` : "Loading adaptive voice router... neural providers are warming while browser fallback stays available.";
  }
  if (audioState.kokoroCastWarmupLoading) return `Neural narration ready. Background cache warmup running (${Math.max(0, Number(audioState.kokoroWarmupWarmedCount) || 0)}/4 prepared)...`;
  if (audioState.kokoroHostPreviewWarmupLoading) return "Neural narration ready. Caching narrator preview clip...";
  if (audioState.kokoroWarmupLoading) return "Adaptive voice loaded. Pre-warming narrator voice for instant lobby narration...";
  if (audioState.kokoroReady) {
    const narrator = findKokoroCatalogEntryById(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID);
    const narratorLabel = narrator ? formatKokoroCatalogLabel(narrator) : audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID;
    const detail = audioState.kokoroLastLoadMs > 0 ? ` (cold setup ${Math.round(audioState.kokoroLastLoadMs)}ms)` : "";
    const preparedCount = Math.max(0, Number(audioState.kokoroWarmupWarmedCount) || 0);
    const warmDetail = audioState.kokoroCastWarmupDone ? ` \u2022 cast ${preparedCount}/4 prepared` : audioState.kokoroWarmupDone ? ` \u2022 host ready (${preparedCount}/4 prepared)` : "";
    return `Adaptive voice ready \u2022 Narrator ${narratorLabel}${detail}${warmDetail}`;
  }
  if (audioState.kokoroError) return `Adaptive voice unavailable: ${audioState.kokoroError}`;
  return "Adaptive voice queued for startup auto-load";
}
function syncKokoroVoiceSelectControl(selectEl, {
  autoLabel = "",
  selectedId = ""
} = {}) {
  if (!selectEl) return;
  const catalog = getKokoroCatalogEntries();
  const optionsData = [];
  if (autoLabel) optionsData.push({ id: "", label: autoLabel });
  catalog.forEach((entry) => {
    optionsData.push({
      id: String(entry && entry.id || ""),
      label: formatKokoroCatalogLabel(entry)
    });
  });
  const sig = optionsData.map((item) => `${item.id}|${item.label}`).join("||");
  if (selectEl.dataset.kokoroOptionsSig !== sig) {
    const frag = document.createDocumentFragment();
    optionsData.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      option.title = item.label;
      frag.appendChild(option);
    });
    selectEl.innerHTML = "";
    selectEl.appendChild(frag);
    selectEl.dataset.kokoroOptionsSig = sig;
  }
  const safeSelectedId = optionsData.some((item) => item.id === selectedId) ? selectedId : optionsData[0] ? optionsData[0].id : "";
  if (document.activeElement !== selectEl && selectEl.value !== safeSelectedId) {
    selectEl.value = safeSelectedId;
  }
  const selectedOption = selectEl.options && selectEl.selectedIndex >= 0 ? selectEl.options[selectEl.selectedIndex] : null;
  if (selectedOption) {
    selectEl.title = String(selectedOption.textContent || "");
  }
}
function setKokoroVoiceChoice(kind = "narrator", voiceId = "", { persist = true } = {}) {
  const key = String(kind || "").toLowerCase() === "character" ? "kokoroCharacterVoiceId" : "kokoroNarratorVoiceId";
  const prev = String(audioState[key] || "");
  audioState[key] = normalizeKokoroVoiceId(voiceId);
  if (key === "kokoroNarratorVoiceId" && String(audioState[key] || "") !== prev) {
    const nextNarratorId = normalizeKokoroVoiceId(audioState[key]) || DEFAULT_NARRATOR_VOICE_ID;
    audioState.kokoroHostPreviewWarmupDone = kokoroPreviewClipWarmedVoiceIds.has(nextNarratorId);
    kokoroHostPreviewWarmupPromise = null;
  }
  const narratorId = normalizeKokoroVoiceId(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID;
  audioState.kokoroWarmupDone = kokoroPreparedVoiceIds.has(narratorId);
  audioState.kokoroWarmupWarmedCount = getKokoroPreparedVoiceCount();
  syncAudioControlUI();
  if (persist) saveAudioPreferences();
}
function getKokoroVoiceEngine() {
  if (kokoroVoiceEngineInstance) return kokoroVoiceEngineInstance;
  kokoroVoiceEngineInstance = new AdaptiveTtsVoiceEngine({
    maxCacheEntries: 20,
    allowedVoiceIds: KOKORO_CURATED_VOICE_IDS,
    dtype: "q4f16",
    device: "wasm",
    onStateChange(state) {
      audioState.kokoroLoading = Boolean(state && state.loading);
      audioState.kokoroReady = Boolean(state && state.ready);
      audioState.kokoroError = String(state && state.error || "");
      audioState.kokoroLastLoadMs = Number(state && state.lastLoadMs) || audioState.kokoroLastLoadMs || 0;
      audioState.kokoroDevice = String(state && state.device || "");
      audioState.kokoroDtype = String(state && state.dtype || "");
      const progress = state && state.loadProgress && typeof state.loadProgress === "object" ? state.loadProgress : null;
      audioState.kokoroLoadPhase = String(progress && progress.phase || "");
      audioState.kokoroLoadProgressPct = Math.max(0, Math.min(100, Number(progress && progress.pct) || 0));
      audioState.kokoroLoadProgressFile = String(progress && progress.file || "");
      const progressLabel = String(progress && progress.label || "").trim();
      const progressFile = String(progress && progress.file || "").trim();
      const progressPct = Math.max(0, Math.min(100, Number(progress && progress.pct) || 0));
      audioState.kokoroLoadProgressText = progressLabel ? `${progressLabel}${progressFile ? ` \u2022 ${progressFile}` : ""}${progressPct > 0 && progressPct < 100 ? ` \u2022 ${Math.round(progressPct)}%` : ""}` : "";
      refreshKokoroCatalogFromEngine(kokoroVoiceEngineInstance);
      syncAudioControlUI();
      try {
        if (startupBootstrapState && startupBootstrapState.started) {
          const liveDetail = String(audioState.kokoroLoadProgressText || "").trim();
          if (liveDetail) {
            setStartupBootstrapTaskStatus("kokoro-host", "active", liveDetail);
            renderStartupBootstrapTasks();
          }
          updateStartupBootstrapUi(
            startupBootstrapState.done,
            startupBootstrapState.total,
            startupBootstrapState.currentLabel || "",
            ""
          );
        }
      } catch (error) {
      }
    }
  });
  refreshKokoroCatalogFromEngine(kokoroVoiceEngineInstance);
  return kokoroVoiceEngineInstance;
}
async function ensureKokoroVoiceEngineLoaded({ source = "manual" } = {}) {
  const engine = getKokoroVoiceEngine();
  if (!engine) return { ok: false, error: "engine-missing" };
  if (!audioState.kokoroLoading) {
    setKokoroStatus(source === "preview" ? "Loading adaptive neural voice for preview..." : "Loading adaptive neural voice routing...", "warning");
  }
  const result = await engine.ensureLoaded();
  refreshKokoroCatalogFromEngine(engine);
  if (result && result.ok) {
    const loadMs = Number(result.state && result.state.lastLoadMs) || 0;
    const meta = [audioState.kokoroDevice, audioState.kokoroDtype].filter(Boolean).join("/");
    setKokoroStatus(`Adaptive voice ready${meta ? ` (${meta})` : ""}${loadMs ? ` - ${Math.round(loadMs)}ms` : ""}`, "active");
  } else if (result && result.error) {
    setKokoroStatus(`Adaptive voice failed to load. ${String(result.error).slice(0, 180)}`, "warning");
  }
  return result;
}
async function ensureKokoroStartupWarmup({ source = "startup-bootstrap" } = {}) {
  if (audioState.voiceEnabled === false) return { ok: false, reason: "voice-disabled" };
  const narratorId = normalizeKokoroVoiceId(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID;
  if (audioState.kokoroWarmupDone && kokoroPreparedVoiceIds.has(narratorId)) {
    return {
      ok: true,
      warmed: getKokoroPreparedVoiceCount(),
      cached: true
    };
  }
  if (kokoroStartupWarmupPromise) return kokoroStartupWarmupPromise;
  kokoroStartupWarmupPromise = (async () => {
    audioState.kokoroWarmupLoading = true;
    syncAudioControlUI();
    let finalResult = null;
    try {
      const loadResult = await ensureKokoroVoiceEngineLoaded({ source });
      if (!loadResult || loadResult.ok !== true) {
        finalResult = { ok: false, error: loadResult && loadResult.error || "load-failed" };
        return finalResult;
      }
      audioState.kokoroWarmupDone = kokoroPreparedVoiceIds.has(narratorId);
      audioState.kokoroWarmupWarmedCount = getKokoroPreparedVoiceCount();
      setKokoroStatus("Adaptive voice ready. Caching narrator preview clip...", "active");
      finalResult = {
        ok: true,
        warmed: audioState.kokoroWarmupWarmedCount,
        loadResult,
        cached: audioState.kokoroWarmupDone
      };
      return finalResult;
    } finally {
      audioState.kokoroWarmupLoading = false;
      if (!finalResult || finalResult.ok !== true) {
        kokoroStartupWarmupPromise = null;
      }
      syncAudioControlUI();
    }
  })();
  return kokoroStartupWarmupPromise;
}
async function ensureKokoroHostPreviewClipWarmup({ source = "host-preview", deferIfBusy = false } = {}) {
  if (audioState.voiceEnabled === false) return { ok: false, reason: "voice-disabled" };
  if (audioState.kokoroEnabled !== true) return { ok: false, reason: "kokoro-disabled" };
  const narratorId = normalizeKokoroVoiceId(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID;
  const engine = getKokoroVoiceEngine();
  const hasPreviewClipCached = engine && typeof engine.hasCachedClip === "function" ? engine.hasCachedClip({ text: KOKORO_HOST_PREVIEW_TEXT, voiceId: narratorId, speed: KOKORO_HOST_PREVIEW_SPEED }) : false;
  if ((kokoroPreviewClipWarmedVoiceIds.has(narratorId) || hasPreviewClipCached) && kokoroPreparedVoiceIds.has(narratorId)) {
    kokoroPreviewClipWarmedVoiceIds.add(narratorId);
    audioState.kokoroHostPreviewWarmupDone = true;
    return { ok: true, cached: true, warmed: getKokoroPreparedVoiceCount() };
  }
  if (deferIfBusy && (audioState.kokoroLoading || audioState.kokoroWarmupLoading)) {
    return { ok: false, reason: "startup-warmup-active" };
  }
  if (kokoroHostPreviewWarmupPromise) return kokoroHostPreviewWarmupPromise;
  kokoroHostPreviewWarmupPromise = (async () => {
    audioState.kokoroHostPreviewWarmupLoading = true;
    syncAudioControlUI();
    let finalResult = null;
    try {
      const core = await ensureKokoroStartupWarmup({ source });
      if (!core || core.ok !== true) {
        finalResult = { ok: false, error: core && core.error || "host-core-warmup-failed" };
        return finalResult;
      }
      const previewVoiceIds = [narratorId];
      const warmResult = await engine.prewarmVoices({
        voiceIds: previewVoiceIds,
        textByVoiceId: { [narratorId]: KOKORO_HOST_PREVIEW_TEXT },
        speedByVoiceId: { [narratorId]: KOKORO_HOST_PREVIEW_SPEED },
        mode: "cache-clips"
      });
      markKokoroVoicesPrepared(warmResult && warmResult.results ? warmResult.results : []);
      if (warmResult && Array.isArray(warmResult.results)) {
        warmResult.results.forEach((entry) => {
          if (!entry || entry.ok !== true) return;
          const id = normalizeKokoroVoiceId(entry.voiceId || "");
          if (id) kokoroPreviewClipWarmedVoiceIds.add(id);
        });
      }
      const currentNarratorId = normalizeKokoroVoiceId(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID;
      audioState.kokoroHostPreviewWarmupDone = kokoroPreviewClipWarmedVoiceIds.has(currentNarratorId);
      if (warmResult && warmResult.ok) {
        setKokoroStatus(`Narrator preview cached: ${getKokoroNarratorLabelById(narratorId)}`, "active");
      } else {
        const errEntry = warmResult && Array.isArray(warmResult.results) ? warmResult.results.find((entry) => entry && entry.ok !== true) : null;
        const errText = String(errEntry && errEntry.error || warmResult && warmResult.error || "preview-warmup-failed").slice(0, 140);
        setKokoroStatus(`Narrator preview cache failed for ${getKokoroNarratorLabelById(narratorId)}: ${errText}`, "warning");
      }
      finalResult = {
        ok: Boolean(warmResult && warmResult.ok),
        warmResult,
        warmed: getKokoroPreparedVoiceCount()
      };
      return finalResult;
    } finally {
      audioState.kokoroHostPreviewWarmupLoading = false;
      if (!finalResult || finalResult.ok !== true) {
        kokoroHostPreviewWarmupPromise = null;
      }
      syncAudioControlUI();
    }
  })();
  return kokoroHostPreviewWarmupPromise;
}
async function ensureKokoroFullCastWarmup({ source = "startup-deferred" } = {}) {
  if (audioState.voiceEnabled === false) return { ok: false, reason: "voice-disabled" };
  if (audioState.kokoroCastWarmupDone) {
    return { ok: true, warmed: getKokoroPreparedVoiceCount(), cached: true };
  }
  if (kokoroFullCastWarmupPromise) return kokoroFullCastWarmupPromise;
  kokoroFullCastWarmupPromise = (async () => {
    audioState.kokoroCastWarmupLoading = true;
    syncAudioControlUI();
    let finalResult = null;
    try {
      const core = await ensureKokoroStartupWarmup({ source });
      if (!core || core.ok !== true) {
        finalResult = { ok: false, error: core && core.error || "core-warmup-failed" };
        return finalResult;
      }
      const missingVoiceIds = getMissingKokoroVoiceIds(KOKORO_CURATED_VOICE_IDS);
      if (!missingVoiceIds.length) {
        audioState.kokoroCastWarmupDone = true;
        audioState.kokoroWarmupWarmedCount = getKokoroPreparedVoiceCount();
        finalResult = { ok: true, warmed: audioState.kokoroWarmupWarmedCount, cached: true };
        return finalResult;
      }
      const engine = getKokoroVoiceEngine();
      const warmResult = await engine.prewarmVoices({
        voiceIds: missingVoiceIds,
        textByVoiceId: KOKORO_VOICE_PREWARM_TEXT_BY_ID,
        speedByVoiceId: KOKORO_VOICE_PREWARM_SPEED_BY_ID,
        mode: "cache-clips",
        yieldMs: 180
      });
      const warmed = markKokoroVoicesPrepared(warmResult && warmResult.results ? warmResult.results : []);
      if (warmResult && Array.isArray(warmResult.results)) {
        warmResult.results.forEach((entry) => {
          if (!entry || entry.ok !== true) return;
          const id = normalizeKokoroVoiceId(entry.voiceId || "");
          if (id) kokoroPreviewClipWarmedVoiceIds.add(id);
        });
      }
      if (warmResult && warmResult.ok) {
        setKokoroStatus(`Adaptive voice cache preparation complete (${warmed}/4 voices prepared).`, "active");
      } else if (warmResult && warmResult.error) {
        setKokoroStatus(`Adaptive voice warmup partial. ${String(warmResult.error).slice(0, 160)}`, "warning");
      }
      finalResult = { ok: Boolean(warmResult && warmResult.ok), warmed, warmResult };
      return finalResult;
    } finally {
      audioState.kokoroCastWarmupLoading = false;
      if (!finalResult || finalResult.ok !== true) {
        kokoroFullCastWarmupPromise = null;
      }
      syncAudioControlUI();
    }
  })();
  return kokoroFullCastWarmupPromise;
}
function scheduleKokoroFullCastWarmup({ source = "on-demand", delayMs = 300 } = {}) {
  if (audioState.voiceEnabled === false) return;
  if (audioState.kokoroEnabled !== true) return;
  if (audioState.kokoroCastWarmupDone || audioState.kokoroCastWarmupLoading || kokoroFullCastWarmupPromise) return;
  if (kokoroCastWarmupScheduled) return;
  kokoroCastWarmupScheduled = true;
  const run = async () => {
    try {
      await ensureKokoroFullCastWarmup({ source });
    } catch (error) {
    } finally {
      kokoroCastWarmupScheduled = false;
    }
  };
  const start = () => {
    void run();
  };
  if (typeof window.requestIdleCallback === "function") {
    window.setTimeout(() => {
      try {
        window.requestIdleCallback(() => start(), { timeout: 2500 });
      } catch (error) {
        start();
      }
    }, Math.max(0, Number(delayMs) || 0));
    return;
  }
  window.setTimeout(start, Math.max(0, Number(delayMs) || 0) + 150);
}
function resolveKokoroVoiceIdForCue(cue = {}, plan = {}) {
  const type = String(cue && cue.type || "").toLowerCase();
  const cueIdText = String(cue && cue.id || "").toLowerCase();
  const explicitNarrator = normalizeKokoroVoiceId(audioState.kokoroNarratorVoiceId) || DEFAULT_NARRATOR_VOICE_ID;
  const explicitCharacter = KOKORO_ONLY_VOICE_SYSTEM ? "" : normalizeKokoroVoiceId(audioState.kokoroCharacterVoiceId);
  if (type !== "entry") {
    if (type === "round4") {
      if (cueIdText.includes("reveal-announcer")) {
        return "bm_george";
      }
      if (cueIdText.includes("final") || cueIdText.includes("game-ended") || cueIdText.includes("winner")) {
        return "bm_george";
      }
      if (cueIdText.includes("brief") || cueIdText.includes("start")) {
        return explicitNarrator || DEFAULT_NARRATOR_VOICE_ID;
      }
    }
    return explicitNarrator;
  }
  if (explicitCharacter) return explicitCharacter;
  const previewProfile = normalizeCharacterVoiceProfile(audioState.voiceCharacterProfile || "auto_archetype");
  if (isVoicePreviewCue(cue) && previewProfile && previewProfile !== "auto_archetype") {
    const previewMap = {
      villain: "bm_george",
      heroic: "bm_george",
      cartoon: "af_bella",
      robotic: "am_michael",
      spooky: "bm_george",
      chaotic: "af_heart"
    };
    if (previewMap[previewProfile]) return previewMap[previewProfile];
  }
  const archetype = String(plan && plan.archetype || cue && cue.archetype || "").toUpperCase();
  const map = {
    [ARCHETYPES.VILLAIN]: "bm_george",
    [ARCHETYPES.MYSTERIOUS]: "bm_george",
    [ARCHETYPES.SPOOKY]: "bm_george",
    [ARCHETYPES.MONSTER]: "bm_george",
    [ARCHETYPES.REGAL]: "bm_george",
    [ARCHETYPES.ANCIENT]: "bm_george",
    [ARCHETYPES.PIRATE]: "bm_george",
    [ARCHETYPES.STEALTHY]: "bm_george",
    [ARCHETYPES.DETECTIVE]: "bm_george",
    [ARCHETYPES.HEROIC]: "am_michael",
    [ARCHETYPES.GRUFF]: "am_michael",
    [ARCHETYPES.COMMANDER]: "am_michael",
    [ARCHETYPES.MENTOR]: "am_michael",
    [ARCHETYPES.WESTERN]: "am_michael",
    [ARCHETYPES.ROBOTIC]: "am_michael",
    [ARCHETYPES.CORPORATE]: "am_michael",
    [ARCHETYPES.SCIENTIST]: "am_michael",
    [ARCHETYPES.OBJECT]: "am_michael",
    [ARCHETYPES.SPORTY]: "am_michael",
    [ARCHETYPES.KID_CARTOON]: "af_bella",
    [ARCHETYPES.CUTE]: "af_bella",
    [ARCHETYPES.CHAOTIC]: "af_bella",
    [ARCHETYPES.ABSURD]: "af_bella",
    [ARCHETYPES.MEME]: "af_bella",
    [ARCHETYPES.CREATURE]: "af_bella",
    [ARCHETYPES.TRICKSTER]: "af_bella",
    [ARCHETYPES.COSMIC]: "af_heart",
    [ARCHETYPES.MAGICAL]: "af_heart",
    [ARCHETYPES.SWEET]: "af_heart",
    [ARCHETYPES.CELEBRITY]: "af_heart",
    [ARCHETYPES.ANNOUNCER]: "af_heart",
    [ARCHETYPES.NARRATOR]: "af_heart"
  };
  return map[archetype] || explicitNarrator || DEFAULT_NARRATOR_VOICE_ID;
}
function resolveKokoroSpeedForCue(cue = {}, plan = {}) {
  const cueType = String(cue && cue.type || "").toLowerCase();
  const cueIdText = String(cue && cue.id || "").toLowerCase();
  const isRevealAnnouncerCue = cueType === "round4" && cueIdText.includes("reveal-announcer");
  const cueSpeechSpec = cue && cue.speechSpec && typeof cue.speechSpec === "object" ? cue.speechSpec : null;
  const isPreviewCue = isVoicePreviewCue(cue);
  const previewStyle = String(cueSpeechSpec && cueSpeechSpec.voiceStyle || "").trim().toLowerCase();
  if (cueType === "narration" && String(cue && cue.id || "").startsWith("voice-preview-narrator-")) {
    return KOKORO_HOST_PREVIEW_SPEED;
  }
  const requestedRate = clampAudioRate(cueSpeechSpec && cueSpeechSpec.rate, NaN);
  const fallbackPlanRate = clampAudioRate(plan && plan.rate, 1);
  const baseRate = Number.isFinite(requestedRate) ? isPreviewCue ? requestedRate : requestedRate * 0.55 + fallbackPlanRate * 0.45 : fallbackPlanRate;
  let speed = 0.98 + (baseRate - 1) * 0.82;
  if (cueType === "entry") {
    speed = 1 + (baseRate - 1) * 0.95;
  } else if (cueType === "twist") {
    speed += 0.02;
  } else if (cueType === "round4") {
    speed += isRevealAnnouncerCue ? 0.02 : -0.06;
  }
  const archetype = String(plan && plan.archetype || cue && cue.archetype || "").toUpperCase();
  if (cueType === "entry") {
    const archetypeDeltaMap = {
      [ARCHETYPES.VILLAIN]: -0.03,
      [ARCHETYPES.MYSTERIOUS]: -0.12,
      [ARCHETYPES.SPOOKY]: 0.01,
      [ARCHETYPES.MONSTER]: -0.08,
      [ARCHETYPES.REGAL]: -0.1,
      [ARCHETYPES.ANCIENT]: -0.12,
      [ARCHETYPES.PIRATE]: -0.06,
      [ARCHETYPES.STEALTHY]: -0.12,
      [ARCHETYPES.HEROIC]: -0.06,
      [ARCHETYPES.GRUFF]: -0.05,
      [ARCHETYPES.COMMANDER]: -0.07,
      [ARCHETYPES.DETECTIVE]: -0.07,
      [ARCHETYPES.MENTOR]: -0.06,
      [ARCHETYPES.WESTERN]: -0.04,
      [ARCHETYPES.ROBOTIC]: -0.09,
      [ARCHETYPES.CORPORATE]: -0.03,
      [ARCHETYPES.SCIENTIST]: -0.01,
      [ARCHETYPES.OBJECT]: -0.07,
      [ARCHETYPES.KID_CARTOON]: 0.09,
      [ARCHETYPES.CUTE]: 0.08,
      [ARCHETYPES.CHAOTIC]: 0.07,
      [ARCHETYPES.MEME]: 0.22,
      [ARCHETYPES.CREATURE]: 0.06,
      [ARCHETYPES.MAGICAL]: 0.03,
      [ARCHETYPES.TRICKSTER]: 0.14,
      [ARCHETYPES.COSMIC]: -0.04,
      [ARCHETYPES.ANNOUNCER]: -0.03,
      [ARCHETYPES.NARRATOR]: -0.05
    };
    speed += Number(archetypeDeltaMap[archetype] || 0);
    if (isPreviewCue) {
      const previewStyleDeltaMap = {
        villain: -0.08,
        heroic: 0.13,
        cartoon: 0.12,
        robotic: -0.05,
        spooky: -0.16,
        chaotic: 0.22
      };
      speed += Number(previewStyleDeltaMap[previewStyle] || 0);
    }
  }
  if (cueType === "round4") {
    const intensity = Math.max(0, Math.min(1, Number(cue && cue.intensity) || 0.6));
    if (isRevealAnnouncerCue) {
      speed += intensity < 0.68 ? 0.13 : intensity < 0.84 ? 0.08 : intensity < 0.94 ? 0.03 : -0.01;
      const textLen = String(cue && cue.text || "").trim().length;
      if (textLen <= 18) speed += 0.04;
      else if (textLen <= 28) speed += 0.02;
      else if (textLen >= 46) speed -= 0.03;
    } else {
      speed += (intensity - 0.55) * 0.08;
      if (cueIdText.includes("brief")) speed -= 0.03;
      if (cueIdText.includes("game-ended")) speed -= 0.04;
    }
  }
  return Math.max(0.78, Math.min(isRevealAnnouncerCue ? 1.48 : 1.35, speed));
}
function resolveKokoroPitchForCue(cue = {}, plan = {}) {
  const cueType = String(cue && cue.type || "").toLowerCase();
  const cueIdText = String(cue && cue.id || "").toLowerCase();
  const isRevealAnnouncerCue = cueType === "round4" && cueIdText.includes("reveal-announcer");
  const cueSpeechSpec = cue && cue.speechSpec && typeof cue.speechSpec === "object" ? cue.speechSpec : null;
  const isPreviewCue = isVoicePreviewCue(cue);
  const previewStyle = String(cueSpeechSpec && cueSpeechSpec.voiceStyle || "").trim().toLowerCase();
  if (cueType !== "entry" && !isRevealAnnouncerCue) return 1;
  if (isRevealAnnouncerCue) {
    const basePitch2 = clampAudioRate(plan && plan.pitch, 1);
    let pitch2 = 1 + (basePitch2 - 1) * 0.85;
    const intensity = Math.max(0, Math.min(1, Number(cue && cue.intensity) || 0.7));
    if (intensity < 0.68) pitch2 += 0.03;
    else if (intensity >= 0.92) pitch2 -= 0.03;
    return Math.max(0.78, Math.min(1.18, pitch2));
  }
  const requestedPitch = clampAudioRate(cueSpeechSpec && cueSpeechSpec.pitch, NaN);
  const fallbackPlanPitch = clampAudioRate(plan && plan.pitch, 1);
  const basePitch = Number.isFinite(requestedPitch) ? isPreviewCue ? requestedPitch : requestedPitch * 0.55 + fallbackPlanPitch * 0.45 : fallbackPlanPitch;
  let pitch = 1 + (basePitch - 1) * 0.95;
  const archetype = String(plan && plan.archetype || cue && cue.archetype || "").toUpperCase();
  const archetypeDeltaMap = {
    [ARCHETYPES.VILLAIN]: 0.01,
    [ARCHETYPES.SPOOKY]: 0.01,
    [ARCHETYPES.MONSTER]: -0.06,
    [ARCHETYPES.REGAL]: -0.05,
    [ARCHETYPES.ROBOTIC]: -0.02,
    [ARCHETYPES.OBJECT]: -0.04,
    [ARCHETYPES.HEROIC]: 0,
    [ARCHETYPES.COMMANDER]: -0.04,
    [ARCHETYPES.GRUFF]: -0.05,
    [ARCHETYPES.KID_CARTOON]: 0.01,
    [ARCHETYPES.CUTE]: 0.1,
    [ARCHETYPES.CHAOTIC]: 0.03,
    [ARCHETYPES.MEME]: 0.1,
    [ARCHETYPES.TRICKSTER]: 0.06,
    [ARCHETYPES.CREATURE]: 0.07,
    [ARCHETYPES.MAGICAL]: 0.05
  };
  pitch += Number(archetypeDeltaMap[archetype] || 0);
  if (isPreviewCue) {
    const previewStyleDeltaMap = {
      villain: -0.08,
      heroic: 0.12,
      cartoon: 0.08,
      robotic: -0.06,
      spooky: -0.14,
      chaotic: 0.09
    };
    pitch += Number(previewStyleDeltaMap[previewStyle] || 0);
  }
  return Math.max(0.72, Math.min(1.35, pitch));
}
function trimKokoroCueTextForLatency(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const maxLen = 110;
  if (collapsed.length <= maxLen) return collapsed;
  const cut = collapsed.slice(0, maxLen);
  const splitAt = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf(", "));
  if (splitAt >= 48) {
    return cut.slice(0, splitAt + 1).trim();
  }
  return `${cut.slice(0, maxLen - 3).trim()}...`;
}
function normalizeKokoroCueTextForSpeech(text = "", cue = {}, plan = {}) {
  let normalized = String(text || "");
  if (!normalized) return "";
  const cueSpeechSpec = cue && cue.speechSpec && typeof cue.speechSpec === "object" ? cue.speechSpec : null;
  const style = String(cueSpeechSpec && cueSpeechSpec.voiceStyle || "").trim().toLowerCase();
  const archetype = String(plan && plan.archetype || cue && cue.archetype || "").toUpperCase();
  normalized = normalized.replace(/\bS\s*H\s*H\b/gi, "shush").replace(/\bshh+\b/gi, "shush");
  if (style === "spooky" || archetype === ARCHETYPES.SPOOKY) {
    normalized = normalized.replace(/\bshh+\b/gi, "shush").replace(/\bghost\s+signal\b/gi, "ghost signal").replace(/\bwhispers\s+back\b/gi, "whispers back... back...");
  }
  if (style === "chaotic" || archetype === ARCHETYPES.CHAOTIC || archetype === ARCHETYPES.MEME) {
    normalized = normalized.replace(/\bdoing\s+this\s+live\b/gi, "going LIVE on-air").replace(/\bgo,\s*go,\s*goh\b/gi, "go, GO, GO").replace(/\bgo,\s*go,\s*go\b/gi, "go, GO, GO");
  }
  return normalized;
}
function isVoicePreviewCue(cue = {}) {
  const id = String(cue && cue.id || "");
  return id.startsWith("voice-preview-");
}
function isInteractiveEntryVoiceCue(cue = {}) {
  const type = String(cue && cue.type || "").toLowerCase();
  if (type !== "entry") return false;
  if (cue && cue.allowLiveGenerate === true) return true;
  if (cue && cue.preempt === true) return true;
  const subtitle = String(cue && cue.subtitleText || "").toLowerCase();
  return subtitle.includes("ovr") || subtitle.includes("preview");
}
function shouldAllowLiveKokoroGenerateForCue(cue = {}) {
  const type = String(cue && cue.type || "").toLowerCase();
  if (cue && cue.allowLiveGenerate === true) return true;
  if (isVoicePreviewCue(cue)) return true;
  if (type === "narration" || type === "twist" || type === "round4") return true;
  if (isInteractiveEntryVoiceCue(cue)) return true;
  return false;
}
function buildKokoroCuePlaybackSpec(cue = {}, plan = null) {
  const safeCue = cue && typeof cue === "object" ? cue : null;
  if (!safeCue) return null;
  let computedPlan = plan;
  if (!computedPlan) {
    const manager = getVoiceManager();
    if (manager && typeof manager._buildSpeakingPlan === "function") {
      try {
        computedPlan = manager._buildSpeakingPlan(safeCue);
      } catch (error) {
        computedPlan = null;
      }
    }
  }
  const rawText = computedPlan && computedPlan.stylizedText ? computedPlan.stylizedText : safeCue.text || "";
  const text = trimKokoroCueTextForLatency(normalizeKokoroCueTextForSpeech(rawText, safeCue, computedPlan || {}));
  if (!text) return null;
  const voiceId = resolveKokoroVoiceIdForCue(safeCue, computedPlan || {});
  const speed = resolveKokoroSpeedForCue(safeCue, computedPlan || {});
  const pitch = resolveKokoroPitchForCue(safeCue, computedPlan || {});
  if (!voiceId) return null;
  return {
    cue: safeCue,
    plan: computedPlan || null,
    text,
    voiceId,
    speed,
    pitch
  };
}
function getKokoroCuePrefetchKey(spec = null) {
  if (!spec || !spec.voiceId || !spec.text) return "";
  return `${String(spec.voiceId)}|${Number(spec.speed || 1).toFixed(2)}|${Number(spec.pitch || 1).toFixed(2)}|${String(spec.text).toLowerCase()}`;
}
async function prefetchKokoroCueClipNow(cue = {}, { source = "cue-prefetch" } = {}) {
  if (audioState.kokoroEnabled !== true || audioState.voiceEnabled === false) {
    return { ok: false, reason: "voice-disabled" };
  }
  const spec = buildKokoroCuePlaybackSpec(cue);
  if (!spec) return { ok: false, reason: "invalid-spec" };
  const engine = getKokoroVoiceEngine();
  if (!engine) return { ok: false, reason: "engine-missing" };
  if (typeof engine.hasCachedClip === "function" && engine.hasCachedClip(spec)) {
    return { ok: true, cached: true, spec };
  }
  if (!audioState.kokoroReady) {
    const load = await ensureKokoroStartupWarmup({ source });
    if (!load || load.ok !== true) {
      return { ok: false, reason: load && load.error || "kokoro-not-ready", spec };
    }
  }
  const warm = await engine.prewarmVoices({
    voiceIds: [spec.voiceId],
    textByVoiceId: { [spec.voiceId]: spec.text },
    speedByVoiceId: { [spec.voiceId]: spec.speed },
    pitchByVoiceId: { [spec.voiceId]: spec.pitch },
    mode: "cache-clips"
  });
  return {
    ok: Boolean(warm && warm.ok),
    warm,
    spec
  };
}
function scheduleKokoroVoiceCuePrefetch(cues = [], { source = "voice-cues", delayMs = 0 } = {}) {
  if (audioState.kokoroEnabled !== true || audioState.voiceEnabled === false) return false;
  const list = Array.isArray(cues) ? cues : [cues];
  if (!list.length) return false;
  let added = 0;
  list.forEach((cue) => {
    if (!cue || typeof cue !== "object") return;
    const spec = buildKokoroCuePlaybackSpec(cue);
    if (!spec) return;
    const key = getKokoroCuePrefetchKey(spec);
    if (!key) return;
    const engine = kokoroVoiceEngineInstance;
    if (engine && typeof engine.hasCachedClip === "function" && engine.hasCachedClip(spec)) return;
    if (voiceCuePrefetchState.queuedKeys.has(key)) return;
    voiceCuePrefetchState.queuedKeys.add(key);
    voiceCuePrefetchState.queue.push({
      key,
      cue: { ...cue, text: cue.text, subtitleText: cue.subtitleText },
      source,
      priority: Number(cue.priority) || 0,
      enqueuedAt: Date.now()
    });
    added += 1;
  });
  if (!added) return false;
  voiceCuePrefetchState.queue.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
  if (voiceCuePrefetchState.queue.length > 48) {
    const overflow = voiceCuePrefetchState.queue.splice(48);
    overflow.forEach((entry) => voiceCuePrefetchState.queuedKeys.delete(entry.key));
  }
  if (voiceCuePrefetchState.timerId || voiceCuePrefetchState.inFlight) return true;
  const run = () => {
    voiceCuePrefetchState.timerId = null;
    void drainKokoroVoiceCuePrefetchQueue();
  };
  if (typeof window.requestIdleCallback === "function") {
    voiceCuePrefetchState.timerId = window.setTimeout(() => {
      try {
        window.requestIdleCallback(run, { timeout: 1200 });
      } catch (error) {
        run();
      }
    }, Math.max(0, Number(delayMs) || 0));
  } else {
    voiceCuePrefetchState.timerId = window.setTimeout(run, Math.max(0, Number(delayMs) || 0) + 60);
  }
  return true;
}
async function warmKokoroVoiceCuesNow(cues = [], {
  source = "voice-cues-warm",
  limit = 12,
  concurrency = 3,
  onProgress = null,
  preserveOrder = false
} = {}) {
  if (audioState.kokoroEnabled !== true || audioState.voiceEnabled === false) {
    return { ok: false, reason: "voice-disabled", requested: 0, unique: 0, warmed: 0, cached: 0, failed: 0 };
  }
  const list = Array.isArray(cues) ? cues : [cues];
  if (!list.length) {
    return { ok: true, requested: 0, unique: 0, warmed: 0, cached: 0, failed: 0 };
  }
  const deduped = [];
  const seen = /* @__PURE__ */ new Set();
  list.forEach((cue) => {
    if (!cue || typeof cue !== "object") return;
    const spec = buildKokoroCuePlaybackSpec(cue);
    if (!spec) return;
    const key = getKokoroCuePrefetchKey(spec);
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push({ cue, priority: Number(cue.priority) || 0 });
  });
  if (!preserveOrder) {
    deduped.sort((a, b) => Number(b.priority) - Number(a.priority));
  }
  const dedupedCues = deduped.map((entry) => entry.cue);
  if (!dedupedCues.length) {
    return { ok: false, reason: "no-valid-cues", requested: list.length, unique: 0, warmed: 0, cached: 0, failed: 0 };
  }
  scheduleKokoroVoiceCuePrefetch(dedupedCues, { source, delayMs: 0 });
  const warmTarget = Math.max(0, Math.min(dedupedCues.length, Number(limit) || dedupedCues.length));
  const selected = dedupedCues.slice(0, warmTarget);
  const safeConcurrency = Math.max(1, Math.min(Number(concurrency) || 1, selected.length || 1));
  const progressCb = typeof onProgress === "function" ? onProgress : null;
  const stats = {
    ok: true,
    requested: list.length,
    unique: dedupedCues.length,
    selected: selected.length,
    warmed: 0,
    cached: 0,
    failed: 0,
    done: 0
  };
  const emitProgress = () => {
    if (!progressCb) return;
    try {
      progressCb({ ...stats, total: selected.length });
    } catch (error) {
    }
  };
  emitProgress();
  if (!selected.length) return { ...stats };
  let index = 0;
  await Promise.all(Array.from({ length: safeConcurrency }, async (_, workerIndex) => {
    while (index < selected.length) {
      const currentIndex = index;
      index += 1;
      const cue = selected[currentIndex];
      try {
        const warmResult = await prefetchKokoroCueClipNow(cue, { source });
        if (warmResult && warmResult.ok) {
          if (warmResult.cached) stats.cached += 1;
          else stats.warmed += 1;
        } else {
          stats.failed += 1;
        }
      } catch (error) {
        stats.failed += 1;
      } finally {
        stats.done += 1;
        emitProgress();
      }
      if (workerIndex < safeConcurrency - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 14));
      }
    }
  }));
  return { ...stats };
}
async function drainKokoroVoiceCuePrefetchQueue() {
  if (voiceCuePrefetchState.inFlight) return;
  if (!voiceCuePrefetchState.queue.length) return;
  voiceCuePrefetchState.inFlight = true;
  try {
    const batch = voiceCuePrefetchState.queue.splice(0, 6);
    for (let i = 0; i < batch.length; i += 1) {
      const task = batch[i];
      if (!task) continue;
      voiceCuePrefetchState.queuedKeys.delete(task.key);
      try {
        await prefetchKokoroCueClipNow(task.cue, { source: task.source || "voice-prefetch" });
      } catch (error) {
      }
      if (i < batch.length - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
    }
  } finally {
    voiceCuePrefetchState.inFlight = false;
    if (voiceCuePrefetchState.queue.length) {
      if (typeof window.requestIdleCallback === "function") {
        voiceCuePrefetchState.timerId = window.setTimeout(() => {
          try {
            window.requestIdleCallback(() => {
              voiceCuePrefetchState.timerId = null;
              void drainKokoroVoiceCuePrefetchQueue();
            }, { timeout: 1800 });
          } catch (error) {
            voiceCuePrefetchState.timerId = null;
            void drainKokoroVoiceCuePrefetchQueue();
          }
        }, 120);
      } else {
        voiceCuePrefetchState.timerId = window.setTimeout(() => {
          voiceCuePrefetchState.timerId = null;
          void drainKokoroVoiceCuePrefetchQueue();
        }, 180);
      }
    }
  }
}
function trySpeakVoiceCueWithKokoro({ cue, plan, volume, start, end } = {}) {
  const finishNoop = (status = "end") => {
    if (typeof end === "function") {
      window.setTimeout(() => end(status), 0);
    }
    return { handled: true, cancel: () => {
    }, started: false };
  };
  if (audioState.kokoroEnabled !== true) {
    if (KOKORO_ONLY_VOICE_SYSTEM) {
      return finishNoop("error");
    }
    return { handled: false, reason: "kokoro-disabled" };
  }
  if (audioState.voiceEnabled === false) return finishNoop("cancelled");
  if (audioState.muted) return finishNoop("muted");
  if (!audioState.voiceUnlocked) return finishNoop("cancelled");
  if (!audioState.htmlMediaUnlocked) {
    tryUnlockHtmlMediaStack();
  }
  const rawText = plan && plan.stylizedText ? plan.stylizedText : cue && cue.text ? cue.text : "";
  const text = trimKokoroCueTextForLatency(normalizeKokoroCueTextForSpeech(rawText, cue || {}, plan || {}));
  if (!text) {
    return finishNoop("cancelled");
  }
  const engine = getKokoroVoiceEngine();
  if (!engine) {
    return finishNoop("error");
  }
  if (!audioState.kokoroReady && !audioState.kokoroLoading) {
    setKokoroStatus("Loading adaptive neural voice in background for voice cues...", "warning");
  }
  const voiceId = resolveKokoroVoiceIdForCue(cue, plan);
  const speed = resolveKokoroSpeedForCue(cue, plan);
  const pitch = resolveKokoroPitchForCue(cue, plan);
  const allowLiveGenerate = shouldAllowLiveKokoroGenerateForCue(cue);
  const hasCachedClip = typeof engine.hasCachedClip === "function" ? engine.hasCachedClip({ text, voiceId, speed, pitch }) : false;
  const browserFallbackOnly = typeof engine.isBrowserFallbackOnly === "function" ? engine.isBrowserFallbackOnly() : false;
  if (!allowLiveGenerate && !hasCachedClip && !browserFallbackOnly) {
    scheduleKokoroVoiceCuePrefetch([cue], { source: "playback-cache-miss", delayMs: 0 });
    if (!audioState.kokoroReady && !audioState.kokoroLoading) {
      void ensureKokoroStartupWarmup({ source: "cue-prefetch" });
    }
    return finishNoop("deferred");
  }
  const voiceMeta = findKokoroCatalogEntryById(voiceId);
  const voiceLabel = voiceMeta ? formatKokoroCatalogLabel(voiceMeta) : voiceId;
  const handle = engine.speakText({
    text,
    voiceId,
    speed,
    pitch,
    volume: clampAudioLevel(volume, 1),
    onStart: () => {
      audioState.voiceBackendLastLabel = `Adaptive \u2022 ${voiceLabel}`;
      if (typeof start === "function") start();
      syncAudioControlUI();
    },
    onEnd: (status) => {
      if (typeof end === "function") end(status);
      window.setTimeout(() => {
        if (!audioState.voiceSpeaking) {
          audioState.voiceBackendLastLabel = "";
          syncAudioControlUI();
        }
      }, 0);
    }
  });
  if (!handle || handle.handled !== true) {
    return finishNoop("error");
  }
  return handle;
}
function getVoiceCatalogEntries() {
  return Array.isArray(audioState.voiceCatalog) ? audioState.voiceCatalog : [];
}
function findVoiceCatalogEntryById(id = "") {
  const target = normalizeVoiceChoiceId(id);
  if (!target) return null;
  const catalog = getVoiceCatalogEntries();
  for (let i = 0; i < catalog.length; i += 1) {
    const entry = catalog[i];
    if (String(entry && entry.id || "") === target) return entry;
  }
  return null;
}
function formatVoiceCatalogLabel(entry = {}) {
  const name = String(entry && entry.name || "").trim() || "Unknown Voice";
  const lang = String(entry && entry.lang || "").trim();
  const parts = [name];
  if (lang) parts.push(lang);
  if (entry && entry.default) parts.push("Default");
  if (entry && entry.qualityScore >= 28) {
    parts.push("HQ");
  } else if (entry && entry.qualityScore >= 20) {
    parts.push("Good");
  }
  return parts.join(" \u2022 ");
}
function refreshVoiceCatalogFromManager(manager = null) {
  const target = manager || voiceManagerInstance;
  if (!target || typeof target.getVoicesCatalog !== "function") return false;
  let catalog = [];
  try {
    catalog = target.getVoicesCatalog() || [];
  } catch (error) {
    catalog = [];
  }
  const sorted = sortVoiceCatalogEntries(catalog);
  const sig = buildVoiceCatalogSignature(sorted);
  const changed = sig !== audioState.voiceCatalogSignature;
  audioState.voiceCatalog = sorted;
  audioState.voiceCatalogSignature = sig;
  const narratorValid = !audioState.voiceNarratorVoiceId || !!findVoiceCatalogEntryById(audioState.voiceNarratorVoiceId);
  const characterValid = !audioState.voiceCharacterVoiceId || !!findVoiceCatalogEntryById(audioState.voiceCharacterVoiceId);
  let prefsChanged = false;
  if (!narratorValid) {
    audioState.voiceNarratorVoiceId = "";
    prefsChanged = true;
  }
  if (!characterValid) {
    audioState.voiceCharacterVoiceId = "";
    prefsChanged = true;
  }
  if (prefsChanged) saveAudioPreferences();
  return changed || prefsChanged;
}
function setVoiceChoice(kind, voiceId, { persist = true } = {}) {
  const key = String(kind || "").toLowerCase() === "character" ? "voiceCharacterVoiceId" : "voiceNarratorVoiceId";
  audioState[key] = normalizeVoiceChoiceId(voiceId);
  const manager = getVoiceManager();
  if (manager && typeof manager.refreshVoices === "function") {
    refreshVoiceCatalogFromManager(manager);
  }
  syncAudioControlUI();
  if (persist) saveAudioPreferences();
}
function syncCharacterVoiceProfileSelect(selectEl, selectedProfile = "auto_archetype") {
  if (!selectEl) return;
  if (selectEl.dataset && selectEl.dataset.kokoroOptionsSig) {
    delete selectEl.dataset.kokoroOptionsSig;
  }
  const optionsData = CHARACTER_VOICE_PROFILE_OPTIONS.map((item) => ({
    id: item.id,
    label: item.label
  }));
  const sig = optionsData.map((item) => `${item.id}|${item.label}`).join("||");
  if (selectEl.dataset.characterProfileSig !== sig) {
    const frag = document.createDocumentFragment();
    optionsData.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      const profileMeta = getCharacterVoiceProfileOption(item.id);
      if (profileMeta && profileMeta.description) option.title = `${item.label} - ${profileMeta.description}`;
      frag.appendChild(option);
    });
    selectEl.innerHTML = "";
    selectEl.appendChild(frag);
    selectEl.dataset.characterProfileSig = sig;
  }
  const safeSelectedId = normalizeCharacterVoiceProfile(selectedProfile);
  if (document.activeElement !== selectEl && selectEl.value !== safeSelectedId) {
    selectEl.value = safeSelectedId;
  }
  const selected = selectEl.options && selectEl.selectedIndex >= 0 ? selectEl.options[selectEl.selectedIndex] : null;
  if (selected) selectEl.title = String(selected.title || selected.textContent || "");
}
function emitVoiceCueLifecycleEvent(kind = "", payload = {}) {
  try {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function" || typeof window.CustomEvent !== "function") return;
    const safeKind = String(kind || "").trim();
    if (!safeKind) return;
    window.dispatchEvent(new CustomEvent(`lobby:voice-cue-${safeKind}`, {
      detail: payload && typeof payload === "object" ? payload : {}
    }));
  } catch (error) {
  }
}
function getVoiceManager() {
  if (voiceManagerInstance) return voiceManagerInstance;
  voiceManagerInstance = new VoiceManager({
    maxQueue: 20,
    dedupeTtlMs: 14e3,
    disableBrowserSpeech: KOKORO_ONLY_VOICE_SYSTEM,
    getVolumeForCue(cue) {
      return getVoiceCueCategoryVolume(cue);
    },
    getPreferredVoiceIdForCue(cue) {
      return getPreferredVoiceIdForCue(cue);
    },
    customSpeak(payload) {
      return trySpeakVoiceCueWithKokoro(payload);
    },
    onStateChange(state) {
      audioState.voiceSupported = state && typeof state.supported === "boolean" ? state.supported : audioState.voiceSupported;
      audioState.voiceReady = Boolean(state && state.ready);
      audioState.voiceUnlocked = Boolean(state && state.unlocked);
      audioState.voiceQueueLength = Number(state && state.queued) || 0;
      audioState.voiceSpeaking = Boolean(state && state.speaking);
      if (!audioState.voiceSpeaking && !(state && state.activeCueText)) {
        audioState.voiceActiveCueText = "";
      }
      if (!KOKORO_ONLY_VOICE_SYSTEM) {
        refreshVoiceCatalogFromManager(voiceManagerInstance);
      }
      syncAudioControlUI();
    },
    onCueStart(payload) {
      const cue = payload && payload.cue ? payload.cue : {};
      const plan = payload && payload.plan ? payload.plan : {};
      emitVoiceCueLifecycleEvent("start", {
        id: String(cue && cue.id || ""),
        type: String(cue && cue.type || ""),
        dedupeKey: String(cue && cue.dedupeKey || ""),
        text: String(cue && (cue.subtitleText || cue.text) || "").trim()
      });
      audioState.voiceActiveCueText = String(plan && plan.subtitleText || cue && cue.subtitleText || cue && cue.text || "").trim();
      const kokoroLabel = String(audioState.voiceBackendLastLabel || "").trim();
      const localVoiceName = String(plan && plan.voice && (plan.voice.name || plan.voice.voiceURI) || "").trim();
      const voiceName = kokoroLabel || localVoiceName;
      if (voiceName) {
        audioState.voiceStatusText = `Speaking via ${voiceName}`;
        audioState.voiceStatusTone = "active";
      }
      const subtitle = String(cue && cue.subtitleText || cue && cue.text || "").trim();
      if (subtitle) {
        setVoiceStatus(voiceName ? `${subtitle} \u2022 ${voiceName}` : subtitle, "active");
      } else {
        syncAudioControlUI();
      }
    },
    onCueEnd(payload) {
      const cue = payload && payload.cue ? payload.cue : {};
      emitVoiceCueLifecycleEvent("end", {
        id: String(cue && cue.id || ""),
        type: String(cue && cue.type || ""),
        dedupeKey: String(cue && cue.dedupeKey || ""),
        status: String(payload && payload.status || ""),
        text: String(cue && (cue.subtitleText || cue.text) || "").trim()
      });
      if (!audioState.voiceSpeaking) {
        audioState.voiceActiveCueText = "";
        audioState.voiceBackendLastLabel = "";
      }
      syncAudioControlUI();
    }
  });
  voiceManagerInstance.setEnabled(audioState.voiceEnabled !== false);
  voiceManagerInstance.setExpressiveMode(KOKORO_ONLY_VOICE_SYSTEM ? true : audioState.voiceExpressiveMode !== false);
  voiceManagerInstance.setMuted(audioState.muted === true);
  if (!KOKORO_ONLY_VOICE_SYSTEM) {
    refreshVoiceCatalogFromManager(voiceManagerInstance);
  }
  return voiceManagerInstance;
}
function ensureVoiceManagerInitialized() {
  const manager = getVoiceManager();
  if (!manager) return Promise.resolve(null);
  return manager.init().then((state) => {
    if (!KOKORO_ONLY_VOICE_SYSTEM) {
      refreshVoiceCatalogFromManager(manager);
    }
    syncAudioControlUI();
    return state;
  });
}
function syncVoiceManagerState() {
  const manager = getVoiceManager();
  if (!manager) return;
  manager.setEnabled(audioState.voiceEnabled !== false);
  manager.setExpressiveMode(KOKORO_ONLY_VOICE_SYSTEM ? true : audioState.voiceExpressiveMode !== false);
  manager.setMuted(audioState.muted === true);
}
function setVoiceEnabled(nextEnabled, { persist = true } = {}) {
  audioState.voiceEnabled = nextEnabled !== false;
  syncVoiceManagerState();
  if (!audioState.voiceEnabled) {
    const manager = getVoiceManager();
    if (manager) {
      manager.clearQueue("voice-disabled", { includeActive: true });
    }
  }
  syncAudioControlUI();
  if (persist) saveAudioPreferences();
}
function toggleVoiceEnabled() {
  setVoiceEnabled(!(audioState.voiceEnabled !== false));
}
function getQuickVoiceBundleState() {
  const narrationEnabled = audioState.voiceEnabled !== false;
  const calloutsEnabled = audioState.cardEnabled === true;
  return {
    narrationEnabled,
    calloutsEnabled,
    enabled: narrationEnabled && calloutsEnabled,
    mixed: narrationEnabled !== calloutsEnabled
  };
}
function setQuickVoiceBundleEnabled(nextEnabled, { persist = true } = {}) {
  const enabled = nextEnabled !== false;
  if (enabled && audioState.muted) {
    setAudioMuted(false, { persist: false });
  }
  setVoiceEnabled(enabled, { persist: false });
  setAudioCategoryEnabled("card", enabled, { persist: false });
  syncAudioControlUI();
  if (persist) saveAudioPreferences();
}
function toggleQuickVoiceBundleEnabled() {
  const state = getQuickVoiceBundleState();
  if (audioState.muted) {
    setQuickVoiceBundleEnabled(true);
    return;
  }
  setQuickVoiceBundleEnabled(!(state && state.enabled));
}
function setVoiceExpressiveMode(nextEnabled, { persist = true } = {}) {
  if (KOKORO_ONLY_VOICE_SYSTEM) {
    audioState.voiceExpressiveMode = true;
    syncVoiceManagerState();
    syncAudioControlUI();
    if (persist) saveAudioPreferences();
    setVoiceStatus("Entry voices always use automatic archetype routing in adaptive mode.", "active");
    return;
  }
  audioState.voiceExpressiveMode = nextEnabled !== false;
  syncVoiceManagerState();
  syncAudioControlUI();
  if (persist) saveAudioPreferences();
}
function toggleVoiceExpressiveMode() {
  setVoiceExpressiveMode(!(audioState.voiceExpressiveMode !== false));
}
function ensureVoiceCatalogReadyForUi() {
  if (!voiceManagerInstance) return;
  refreshVoiceCatalogFromManager(voiceManagerInstance);
}
function syncVoiceSelectControl(selectEl, {
  autoLabel = "Auto",
  selectedId = ""
} = {}) {
  if (!selectEl) return;
  const catalog = getVoiceCatalogEntries();
  const optionsData = [{ id: "", label: autoLabel }, ...catalog.map((entry) => ({
    id: String(entry && entry.id || ""),
    label: formatVoiceCatalogLabel(entry)
  }))];
  const sig = optionsData.map((item) => `${item.id}|${item.label}`).join("||");
  if (selectEl.dataset.voiceOptionsSig !== sig) {
    const frag = document.createDocumentFragment();
    optionsData.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      frag.appendChild(option);
    });
    selectEl.innerHTML = "";
    selectEl.appendChild(frag);
    selectEl.dataset.voiceOptionsSig = sig;
  }
  const safeSelectedId = optionsData.some((item) => item.id === selectedId) ? selectedId : "";
  if (document.activeElement !== selectEl && selectEl.value !== safeSelectedId) {
    selectEl.value = safeSelectedId;
  }
}
function syncVoiceStudioUi() {
  if (!KOKORO_ONLY_VOICE_SYSTEM) {
    ensureVoiceCatalogReadyForUi();
  }
  refreshKokoroCatalogFromEngine();
  const narratorSelect = document.getElementById("audioVoiceNarratorSelect");
  const characterSelect = document.getElementById("audioVoiceCharacterSelect");
  const localNarratorPicker = document.getElementById("audioVoiceLocalNarratorPicker");
  const localCharacterPicker = document.getElementById("audioVoiceLocalCharacterPicker");
  const voiceCount = getVoiceCatalogEntries().length;
  if (!KOKORO_ONLY_VOICE_SYSTEM) {
    syncVoiceSelectControl(narratorSelect, {
      autoLabel: "Auto (Best Local Voice)",
      selectedId: normalizeVoiceChoiceId(audioState.voiceNarratorVoiceId)
    });
    syncCharacterVoiceProfileSelect(characterSelect, audioState.voiceCharacterProfile);
    if (narratorSelect) narratorSelect.disabled = audioState.voiceSupported === false || voiceCount === 0;
    if (characterSelect) characterSelect.disabled = audioState.voiceSupported === false;
  }
  if (localNarratorPicker) localNarratorPicker.hidden = KOKORO_ONLY_VOICE_SYSTEM;
  if (localCharacterPicker) localCharacterPicker.hidden = KOKORO_ONLY_VOICE_SYSTEM;
  const previewNarratorBtn = document.getElementById("audioVoicePreviewNarratorBtn");
  const previewCharacterBtn = document.getElementById("audioVoicePreviewCharacterBtn");
  const kokoroPreviewNarratorBtn = document.getElementById("audioKokoroPreviewNarratorBtn");
  const kokoroPreviewCharacterBtn = document.getElementById("audioKokoroPreviewCharacterBtn");
  const disabledPreview = audioState.voiceEnabled === false;
  if (previewNarratorBtn) previewNarratorBtn.disabled = disabledPreview;
  if (previewCharacterBtn) previewCharacterBtn.disabled = disabledPreview;
  if (previewNarratorBtn) previewNarratorBtn.hidden = KOKORO_ONLY_VOICE_SYSTEM;
  if (previewCharacterBtn) previewCharacterBtn.hidden = KOKORO_ONLY_VOICE_SYSTEM;
  if (kokoroPreviewNarratorBtn) {
    kokoroPreviewNarratorBtn.disabled = audioState.voiceEnabled === false || audioState.kokoroHostPreviewWarmupLoading === true;
    kokoroPreviewNarratorBtn.textContent = audioState.kokoroHostPreviewWarmupLoading ? "Preparing Narrator..." : "Preview Narration";
  }
  if (kokoroPreviewCharacterBtn) kokoroPreviewCharacterBtn.disabled = audioState.voiceEnabled === false;
  const kokoroNarratorSelect = document.getElementById("audioKokoroNarratorSelect");
  const kokoroCharacterSelect = document.getElementById("audioKokoroCharacterSelect");
  const kokoroStatus = document.getElementById("audioKokoroStatus");
  const kokoroPanelShell = document.getElementById("audioKokoroPanelShell");
  const kokoroPanel = document.getElementById("audioKokoroPanel");
  const kokoroPanelToggleBtn = document.getElementById("audioKokoroPanelToggleBtn");
  const kokoroPanelToggleSummary = document.getElementById("audioKokoroPanelToggleSummary");
  const kokoroPanelPing = document.getElementById("audioKokoroPanelPing");
  const kokoroQueuedBanner = document.getElementById("audioKokoroQueuedBanner");
  const kokoroQueuedBannerText = document.getElementById("audioKokoroQueuedBannerText");
  const kokoroQueuedBannerMeta = document.getElementById("audioKokoroQueuedBannerMeta");
  syncKokoroVoiceSelectControl(kokoroNarratorSelect, {
    selectedId: normalizeKokoroVoiceId(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID
  });
  syncCharacterVoiceProfileSelect(kokoroCharacterSelect, audioState.voiceCharacterProfile);
  const inRoom = Boolean(player && player.room);
  const hasHost = Boolean(roomState && roomState.host);
  const isHost = isCurrentPlayerHost();
  const narratorLockedToHost = inRoom && hasHost && !isHost;
  if (kokoroNarratorSelect) kokoroNarratorSelect.disabled = audioState.voiceEnabled === false || narratorLockedToHost;
  if (kokoroCharacterSelect) kokoroCharacterSelect.disabled = audioState.voiceEnabled === false;
  if (kokoroPanelShell) kokoroPanelShell.hidden = !audioState.kokoroPanelOpen;
  if (kokoroPanelToggleSummary) {
    kokoroPanelToggleSummary.hidden = audioState.kokoroPanelOpen;
    kokoroPanelToggleSummary.textContent = getKokoroNarratorCollapsedSummaryText();
  }
  if (kokoroPanelToggleBtn) {
    kokoroPanelToggleBtn.setAttribute("aria-expanded", audioState.kokoroPanelOpen ? "true" : "false");
    kokoroPanelToggleBtn.classList.toggle("is-open", audioState.kokoroPanelOpen);
    kokoroPanelToggleBtn.classList.toggle("has-ping", (Number(audioState.kokoroNarratorPeerPingCount) || 0) > 0);
    kokoroPanelToggleBtn.title = narratorLockedToHost ? "Host controls narration voice. Open to preview and view current narrator." : "Open adaptive narrator controls";
  }
  if (kokoroPanelPing) {
    const pingCount = Math.max(0, Number(audioState.kokoroNarratorPeerPingCount) || 0);
    kokoroPanelPing.hidden = pingCount <= 0;
    kokoroPanelPing.textContent = pingCount > 9 ? "9+" : String(pingCount);
    kokoroPanelPing.setAttribute("aria-label", pingCount > 0 ? `${pingCount} narrator updates` : "No narrator updates");
  }
  const hasQueuedEvent = Boolean(Number(audioState.kokoroNarratorQueuedAt) || 0);
  const queuedFresh = hasQueuedEvent && Date.now() - (Number(audioState.kokoroNarratorQueuedAt) || 0) < 18e4;
  if (kokoroQueuedBanner) {
    kokoroQueuedBanner.hidden = !queuedFresh;
    const hostPulse = (Number(audioState.kokoroNarratorQueuedPulseUntil) || 0) > Date.now();
    kokoroQueuedBanner.classList.toggle("is-pulse", hostPulse);
    kokoroQueuedBanner.classList.toggle("is-host", String(audioState.kokoroNarratorQueuedBy || "") === String(player && player.name || ""));
  }
  if (queuedFresh) {
    const queuedVoiceId = normalizeKokoroVoiceId(audioState.kokoroNarratorQueuedVoiceId || audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID;
    const queuedVoiceLabel = getKokoroNarratorLabelById(queuedVoiceId);
    if (kokoroQueuedBannerText) kokoroQueuedBannerText.textContent = `Queued narrator: ${queuedVoiceLabel}`;
    if (kokoroQueuedBannerMeta) {
      const by = String(audioState.kokoroNarratorQueuedBy || "").trim();
      const byText = by ? by === String(player && player.name || "") ? "Queued by you" : `Queued by host ${by}` : "Queued for this room";
      kokoroQueuedBannerMeta.textContent = byText;
    }
  }
  if (kokoroPanel) {
    kokoroPanel.classList.toggle("is-queued-highlight", (Number(audioState.kokoroNarratorQueuedPulseUntil) || 0) > Date.now());
    kokoroPanel.classList.toggle("is-locked-to-host", narratorLockedToHost);
  }
  if (kokoroStatus) {
    kokoroStatus.textContent = audioState.kokoroStatusText || getKokoroStatusText();
    kokoroStatus.classList.toggle("is-warning", audioState.kokoroStatusTone === "warning" || !!audioState.kokoroError && !audioState.kokoroReady);
    kokoroStatus.classList.toggle("is-active", audioState.kokoroStatusTone === "active" || audioState.kokoroReady === true);
  }
  const hint = document.getElementById("audioVoiceSelectionHint");
  if (hint) {
    const narrator = findKokoroCatalogEntryById(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID);
    const narratorLabel = narrator ? formatKokoroCatalogLabel(narrator) : audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID;
    const characterProfile = getCharacterVoiceProfileOption(audioState.voiceCharacterProfile);
    const previewMode = `${characterProfile.label}`;
    let text = `Adaptive neural voice backend (4 curated narration voices: 2 female + 2 male). Host voice selection controls narration throughout the game: ${narratorLabel}. Character dropdown previews gold-standard archetype shaping (${previewMode}). `;
    if (narratorLockedToHost) {
      text += `Host ${roomState.host} controls narrator changes. You will receive a ping when they queue a new narrator. `;
    } else if (inRoom && isHost) {
      text += "You are the host. Changing narrator queues a room-wide narrator update and pings everyone else. ";
    }
    text += audioState.kokoroReady ? `Model ready (${getKokoroCatalogEntries().length}/4 cast voices visible${audioState.kokoroWarmupWarmedCount ? `, ${audioState.kokoroWarmupWarmedCount}/4 prepared` : ""}).` : audioState.kokoroLoading || audioState.kokoroWarmupLoading || audioState.kokoroCastWarmupLoading ? "Adaptive voice routing is loading/warming now. Narration/round cues are allowed to speak immediately and fall back to local voice if neural clips are not cached yet." : "Adaptive voice router auto-loads during startup.";
    text += ` ${getCharacterRuntimeModeText()}`;
    hint.textContent = text;
    hint.classList.toggle("is-warning", audioState.kokoroLoading === true || audioState.kokoroError || !audioState.kokoroReady);
  }
}
function buildVoiceStudioPreviewCue(kind = "narrator") {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (String(kind || "").toLowerCase() === "character") {
    const samples = [
      {
        archetype: ARCHETYPES.VILLAIN,
        label: "Villain",
        text: "Doctor Doom: Kneel... and witness despair.",
        speechSpec: { voiceStyle: "villain", rate: 0.72, pitch: 0.7, gain: 0.93 },
        intensity: 0.92
      },
      {
        archetype: ARCHETYPES.KID_CARTOON,
        label: "Cartoon",
        text: "SpongeBob: I'm ready!",
        speechSpec: { voiceStyle: "cartoon", rate: 1.34, pitch: 1.2, gain: 0.95 },
        intensity: 0.88
      },
      {
        archetype: ARCHETYPES.ROBOTIC,
        label: "Robotic",
        text: "Unit Seven online.",
        speechSpec: { voiceStyle: "robotic", rate: 0.9, pitch: 0.84, gain: 0.95 },
        intensity: 0.76
      },
      {
        archetype: ARCHETYPES.HEROIC,
        label: "Heroic",
        text: "Batman: We rise! We finish this together.",
        speechSpec: { voiceStyle: "heroic", rate: 1.12, pitch: 1.18, gain: 1 },
        intensity: 0.84
      },
      {
        archetype: ARCHETYPES.SPOOKY,
        label: "Spooky",
        text: "Shush... ghost signal... the hallway whispers back... back...",
        speechSpec: { voiceStyle: "spooky", rate: 0.68, pitch: 0.78, gain: 0.72 },
        intensity: 0.9
      },
      {
        archetype: ARCHETYPES.CHAOTIC,
        label: "Chaotic",
        text: "Chaos mode! go, GO, GO! we're going LIVE on-air!!",
        speechSpec: { voiceStyle: "chaotic", rate: 1.42, pitch: 1.24, gain: 1 },
        intensity: 0.94
      }
    ];
    const profile = normalizeCharacterVoiceProfile(audioState.voiceCharacterProfile);
    const profileMatchMap = {
      villain: "Villain",
      heroic: "Heroic",
      cartoon: "Cartoon",
      robotic: "Robotic",
      spooky: "Spooky",
      chaotic: "Chaotic"
    };
    let chosen = null;
    if (profile !== "auto_archetype" && profile !== "host_voice") {
      const targetLabel = profileMatchMap[profile] || "";
      chosen = samples.find((sample) => sample.label === targetLabel) || null;
    }
    if (!chosen) {
      const idx = Math.abs(Number(audioState.voicePreviewCharacterIndex) || 0) % samples.length;
      chosen = samples[idx];
      audioState.voicePreviewCharacterIndex = (idx + 1) % samples.length;
    }
    return {
      id: `voice-preview-character-${suffix}`,
      type: "entry",
      text: chosen.text,
      subtitleText: `Voice Studio: Character Preview (${chosen.label})`,
      archetype: chosen.archetype,
      intensity: chosen.intensity,
      priority: 98,
      preempt: true,
      allowLiveGenerate: true,
      dedupeKey: `voice-preview-character:${suffix}`,
      speechSpec: { ...chosen.speechSpec || {} }
    };
  }
  return {
    id: `voice-preview-narrator-${suffix}`,
    type: "narration",
    text: KOKORO_HOST_PREVIEW_TEXT,
    subtitleText: "Voice Studio: Host Preview",
    archetype: ARCHETYPES.ANNOUNCER,
    intensity: 0.76,
    priority: 98,
    preempt: true,
    allowLiveGenerate: true,
    dedupeKey: `voice-preview-narrator:${suffix}`,
    speechSpec: {
      voiceStyle: "cinematic",
      rate: 1,
      pitch: 1.02,
      gain: 0.95
    }
  };
}
function getVoiceStudioPreviewWarmupCues() {
  return [
    {
      id: "voice-preview-warmup-narrator",
      type: "narration",
      text: KOKORO_HOST_PREVIEW_TEXT,
      subtitleText: "Voice Studio: Host Preview",
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.76,
      priority: 72,
      preempt: false,
      allowLiveGenerate: true,
      dedupeKey: "voice-preview-warmup:narrator",
      speechSpec: { voiceStyle: "cinematic", rate: 1, pitch: 1.02, gain: 0.95 }
    },
    {
      id: "voice-preview-warmup-villain",
      type: "entry",
      text: "Doctor Doom: Kneel... and witness despair.",
      subtitleText: "Voice Studio: Character Preview (Villain)",
      archetype: ARCHETYPES.VILLAIN,
      intensity: 0.92,
      priority: 72,
      preempt: false,
      allowLiveGenerate: true,
      dedupeKey: "voice-preview-warmup:villain",
      speechSpec: { voiceStyle: "villain", rate: 0.72, pitch: 0.7, gain: 0.93 }
    },
    {
      id: "voice-preview-warmup-cartoon",
      type: "entry",
      text: "SpongeBob: I'm ready!",
      subtitleText: "Voice Studio: Character Preview (Cartoon)",
      archetype: ARCHETYPES.KID_CARTOON,
      intensity: 0.88,
      priority: 72,
      preempt: false,
      allowLiveGenerate: true,
      dedupeKey: "voice-preview-warmup:cartoon",
      speechSpec: { voiceStyle: "cartoon", rate: 1.34, pitch: 1.2, gain: 0.95 }
    },
    {
      id: "voice-preview-warmup-robotic",
      type: "entry",
      text: "Unit Seven online.",
      subtitleText: "Voice Studio: Character Preview (Robotic)",
      archetype: ARCHETYPES.ROBOTIC,
      intensity: 0.76,
      priority: 72,
      preempt: false,
      allowLiveGenerate: true,
      dedupeKey: "voice-preview-warmup:robotic",
      speechSpec: { voiceStyle: "robotic", rate: 0.9, pitch: 0.84, gain: 0.95 }
    },
    {
      id: "voice-preview-warmup-heroic",
      type: "entry",
      text: "Batman: We rise! We finish this together.",
      subtitleText: "Voice Studio: Character Preview (Heroic)",
      archetype: ARCHETYPES.HEROIC,
      intensity: 0.84,
      priority: 72,
      preempt: false,
      allowLiveGenerate: true,
      dedupeKey: "voice-preview-warmup:heroic",
      speechSpec: { voiceStyle: "heroic", rate: 1.12, pitch: 1.18, gain: 1 }
    },
    {
      id: "voice-preview-warmup-spooky",
      type: "entry",
      text: "Shush... ghost signal... the hallway whispers back...",
      subtitleText: "Voice Studio: Character Preview (Spooky)",
      archetype: ARCHETYPES.SPOOKY,
      intensity: 0.9,
      priority: 72,
      preempt: false,
      allowLiveGenerate: true,
      dedupeKey: "voice-preview-warmup:spooky",
      speechSpec: { voiceStyle: "spooky", rate: 0.68, pitch: 0.78, gain: 0.72 }
    },
    {
      id: "voice-preview-warmup-chaotic",
      type: "entry",
      text: "Chaos mode! go, GO, GO! we're going LIVE on-air!!",
      subtitleText: "Voice Studio: Character Preview (Chaotic)",
      archetype: ARCHETYPES.CHAOTIC,
      intensity: 0.94,
      priority: 72,
      preempt: false,
      allowLiveGenerate: true,
      dedupeKey: "voice-preview-warmup:chaotic",
      speechSpec: { voiceStyle: "chaotic", rate: 1.42, pitch: 1.24, gain: 1 }
    }
  ];
}
function ensureVoicePreviewUnlocked() {
  try {
    unlockAudioFromGesture({ type: "voice-preview" });
  } catch (error) {
  }
  try {
    tryUnlockHtmlMediaStack();
  } catch (error) {
  }
  try {
    const manager = getVoiceManager();
    if (manager) {
      void manager.init();
      manager.unlock();
      if (!KOKORO_ONLY_VOICE_SYSTEM && typeof manager.refreshVoices === "function") {
        manager.refreshVoices();
      }
    }
  } catch (error) {
  }
  if (audioState.kokoroEnabled === true && audioState.kokoroAutoLoad !== false && (!audioState.kokoroReady || !audioState.kokoroWarmupDone) && !audioState.kokoroLoading && !audioState.kokoroWarmupLoading) {
    void ensureKokoroStartupWarmup({ source: "preview" });
  }
}
async function playVoiceStudioPreview(kind = "narrator") {
  ensureVoicePreviewUnlocked();
  const normalizedKind = String(kind || "").toLowerCase();
  if (audioState.kokoroEnabled === true && (!audioState.kokoroReady || !audioState.kokoroWarmupDone)) {
    const loadResult = await ensureKokoroStartupWarmup({ source: "preview" });
    if (!loadResult || loadResult.ok !== true) {
      setVoiceStatus("Neural preview unavailable right now. Check voice status and try again.", "warning");
    }
  }
  if (audioState.kokoroEnabled === true && normalizedKind === "narrator") {
    const narratorLabel = getKokoroNarratorLabelById(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID);
    setVoiceStatus(`Preparing narrator preview: ${narratorLabel}...`, "active");
    const warmResult = await ensureKokoroHostPreviewClipWarmup({ source: "preview-click", deferIfBusy: false });
    if (!warmResult || warmResult.ok !== true) {
      setVoiceStatus(`Narrator preview cache missed for ${narratorLabel}. Generating live preview...`, "warning");
    }
  }
  const cue = buildVoiceStudioPreviewCue(kind);
  const result = enqueueVoiceCue(cue);
  if (result && result.enqueued) {
    setVoiceStatus(
      normalizedKind === "character" ? `${cue.subtitleText || "Character archetype preview"} queued (preview only)` : "Narration voice preview queued",
      "active"
    );
  } else if (result && result.reason === "unsupported") {
    setVoiceStatus("Voice preview unavailable in this browser.", "warning");
  } else if (result && result.reason === "disabled") {
    setVoiceStatus("Voice cues are disabled. Turn Voice On to preview.", "warning");
  } else {
    setVoiceStatus("Voice preview could not start yet. Try tapping Enable Voice first.", "warning");
  }
}
function normalizeVoiceCuePayload(cue = {}, defaults = {}) {
  const raw = cue && typeof cue === "object" ? cue : {};
  const text = String(raw.text || defaults.text || "").trim();
  if (!text) return null;
  const type = String(raw.type || defaults.type || "narration").trim() || "narration";
  return {
    id: String(raw.id || defaults.id || `${type}-${hashString(`${text}|${type}`)}`),
    type,
    text,
    subtitleText: String(raw.subtitleText || defaults.subtitleText || text).trim() || text,
    archetype: raw.archetype ? String(raw.archetype) : defaults.archetype ? String(defaults.archetype) : void 0,
    intensity: Number.isFinite(Number(raw.intensity)) ? Math.max(0, Math.min(1, Number(raw.intensity))) : defaults.intensity != null ? defaults.intensity : void 0,
    priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : Number(defaults.priority) || 50,
    dedupeKey: String(raw.dedupeKey || defaults.dedupeKey || `${type}:${text.toLowerCase()}`),
    delayMs: Number.isFinite(Number(raw.delayMs)) ? Math.max(0, Number(raw.delayMs)) : Number(defaults.delayMs) || 0,
    allowLiveGenerate: raw.allowLiveGenerate === true || defaults.allowLiveGenerate === true,
    speechSpec: raw.speechSpec && typeof raw.speechSpec === "object" ? { ...raw.speechSpec } : defaults.speechSpec ? { ...defaults.speechSpec } : void 0
  };
}
function enqueueVoiceCue(cue = {}, defaults = {}) {
  const manager = getVoiceManager();
  if (!manager) return { enqueued: false, reason: "manager-missing" };
  void ensureVoiceManagerInitialized();
  const normalized = normalizeVoiceCuePayload(cue, defaults);
  if (!normalized) return { enqueued: false, reason: "invalid" };
  if (!shouldAllowLiveKokoroGenerateForCue(normalized)) {
    scheduleKokoroVoiceCuePrefetch([normalized], { source: "single-cue", delayMs: 0 });
  }
  return manager.enqueue(normalized);
}
function enqueueVoiceCues(cues = [], { fallback = null, clear = false, clearTypes = null } = {}) {
  const list = Array.isArray(cues) ? cues : [];
  const fallbackList = typeof fallback === "function" ? fallback() || [] : Array.isArray(fallback) ? fallback : [];
  const target = list.length ? list : fallbackList;
  if (!target.length) return { total: 0, enqueued: 0 };
  const manager = getVoiceManager();
  if (!manager) return { total: target.length, enqueued: 0 };
  if (clear) {
    manager.clearQueue("voice-cue-replace", {
      includeActive: true,
      types: Array.isArray(clearTypes) && clearTypes.length ? clearTypes : null
    });
  }
  const normalizedTarget = target.map((cue) => normalizeVoiceCuePayload(cue)).filter(Boolean).map((cue) => {
    if (shouldAllowLiveKokoroGenerateForCue(cue)) return cue;
    if (Number(cue.delayMs) > 0) return cue;
    const spec = buildKokoroCuePlaybackSpec(cue);
    const engine = kokoroVoiceEngineInstance;
    const hasMemCache = Boolean(spec && engine && typeof engine.hasCachedClip === "function" && engine.hasCachedClip(spec));
    if (hasMemCache) return cue;
    const type = String(cue.type || "").toLowerCase();
    if (type === "narration" || type === "twist" || type === "round4") {
      return { ...cue, delayMs: 260 };
    }
    return cue;
  });
  scheduleKokoroVoiceCuePrefetch(normalizedTarget, { source: "event-cues", delayMs: 0 });
  let enqueued = 0;
  normalizedTarget.forEach((cue) => {
    const result = enqueueVoiceCue(cue);
    if (result && result.enqueued) enqueued += 1;
  });
  return { total: normalizedTarget.length, enqueued };
}
function clearVoiceCues(reason = "phase-change", { types = null, includeActive = true } = {}) {
  const manager = getVoiceManager();
  if (!manager) return;
  manager.clearQueue(reason, {
    includeActive,
    types: Array.isArray(types) ? types : null
  });
}
function buildPhaseVoiceCues(kind = "", data = {}) {
  return buildPhaseVoiceCuesWithState(kind, data, gameState);
}
function setAudioButtonPressed(button, pressed, labels = null) {
  if (!button) return;
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
  if (labels && labels.on && labels.off) {
    button.textContent = pressed ? labels.on : labels.off;
  }
}
function getAudioStatusText() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return "Audio unavailable in this browser";
  if (!audioState.unlocked) return "Tap any audio control to unlock audio on iOS/mobile";
  if (!audioState.htmlMediaUnlocked) return "Audio unlocked, but HTML media may still need one tap (iOS)";
  if (audioState.muted) return "Muted (master)";
  const enabled = AUDIO_CATEGORY_KEYS.filter((key) => audioState[`${key}Enabled`] === true).map((key) => key === "sfx" ? "UI" : key === "card" ? "Callouts" : key[0].toUpperCase() + key.slice(1));
  if (!enabled.length) return "All categories disabled";
  return `Ready \u2022 ${enabled.join(" / ")}`;
}
function getAudioQuickPanelStatusText() {
  if (audioState.muted) return "Muted";
  const music = audioState.musicEnabled ? "Music on" : "Music off";
  const voiceBundle = getQuickVoiceBundleState();
  let voice = voiceBundle && voiceBundle.enabled ? "Voice on" : "Voice off";
  if (voiceBundle && voiceBundle.mixed) {
    voice = voiceBundle.narrationEnabled ? "Narration only" : "Callouts only";
  }
  if (!audioState.unlocked) return `${music} / ${voice}`;
  return `${music} \u2022 ${voice}`;
}
function setAudioPreviewStatus(text = "", tone = "") {
  audioState.musicPreviewStatusText = String(text || "").trim();
  audioState.musicPreviewStatusTone = String(tone || "").trim().toLowerCase();
  syncAudioControlUI();
}
function loadAudioPreferences() {
  try {
    const raw = window.localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    audioState.muted = parsed.muted === true;
    audioState.masterVolume = clampAudioLevel(parsed.masterVolume, 0.9);
    const legacySfxVolume = clampAudioLevel(parsed.sfxVolume, AUDIO_CATEGORY_DEFAULTS.sfx.volume);
    audioState.sfxVolume = clampAudioLevel(parsed.sfxVolume, legacySfxVolume);
    audioState.musicVolume = clampAudioLevel(parsed.musicVolume, AUDIO_CATEGORY_DEFAULTS.music.volume);
    audioState.revealVolume = clampAudioLevel(parsed.revealVolume, legacySfxVolume);
    audioState.cardVolume = clampAudioLevel(parsed.cardVolume, legacySfxVolume);
    audioState.sfxEnabled = parsed.sfxEnabled !== false;
    audioState.musicEnabled = parsed.musicEnabled !== false;
    audioState.revealEnabled = parsed.revealEnabled !== false;
    audioState.cardEnabled = parsed.cardEnabled !== false;
    audioState.voiceEnabled = parsed.voiceEnabled !== false;
    audioState.voiceExpressiveMode = KOKORO_ONLY_VOICE_SYSTEM ? true : parsed.voiceExpressiveMode !== false;
    audioState.voiceNarratorVoiceId = normalizeVoiceChoiceId(parsed.voiceNarratorVoiceId);
    audioState.voiceCharacterVoiceId = normalizeVoiceChoiceId(parsed.voiceCharacterVoiceId);
    audioState.voiceCharacterProfile = normalizeCharacterVoiceProfile(parsed.voiceCharacterProfile);
    audioState.kokoroEnabled = KOKORO_ONLY_VOICE_SYSTEM ? true : parsed.kokoroEnabled === true;
    audioState.kokoroAutoLoad = parsed.kokoroAutoLoad !== false;
    audioState.kokoroNarratorVoiceId = normalizeKokoroVoiceId(parsed.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID;
    audioState.kokoroCharacterVoiceId = normalizeKokoroVoiceId(parsed.kokoroCharacterVoiceId || "");
    audioState.kokoroPanelOpen = false;
    audioState.quickFabDotDismissed = parsed.quickFabDotDismissed === true;
    audioState.audioDeckExpanded = false;
    if (parsed.previewSceneSelection) {
      audioState.previewSceneSelection = resolveMusicSceneKey(String(parsed.previewSceneSelection));
    }
  } catch (error) {
    console.log("Audio preferences unavailable");
  }
}
function saveAudioPreferences() {
  try {
    window.localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify({
      muted: audioState.muted,
      masterVolume: audioState.masterVolume,
      sfxVolume: audioState.sfxVolume,
      musicVolume: audioState.musicVolume,
      revealVolume: audioState.revealVolume,
      cardVolume: audioState.cardVolume,
      sfxEnabled: audioState.sfxEnabled,
      musicEnabled: audioState.musicEnabled,
      revealEnabled: audioState.revealEnabled,
      cardEnabled: audioState.cardEnabled,
      voiceEnabled: audioState.voiceEnabled !== false,
      voiceExpressiveMode: KOKORO_ONLY_VOICE_SYSTEM ? true : audioState.voiceExpressiveMode !== false,
      voiceNarratorVoiceId: normalizeVoiceChoiceId(audioState.voiceNarratorVoiceId),
      voiceCharacterVoiceId: normalizeVoiceChoiceId(audioState.voiceCharacterVoiceId),
      voiceCharacterProfile: normalizeCharacterVoiceProfile(audioState.voiceCharacterProfile),
      kokoroEnabled: KOKORO_ONLY_VOICE_SYSTEM ? true : audioState.kokoroEnabled === true,
      kokoroAutoLoad: audioState.kokoroAutoLoad !== false,
      kokoroNarratorVoiceId: normalizeKokoroVoiceId(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID,
      kokoroCharacterVoiceId: normalizeKokoroVoiceId(audioState.kokoroCharacterVoiceId || ""),
      quickFabDotDismissed: audioState.quickFabDotDismissed === true,
      previewSceneSelection: resolveMusicSceneKey(audioState.previewSceneSelection || "join")
    }));
  } catch (error) {
    console.log("Unable to save audio preferences");
  }
}
function syncAudioControlUI() {
  const legacyMuteBtn = document.getElementById("audioToggleMute");
  if (legacyMuteBtn) {
    legacyMuteBtn.textContent = audioState.muted ? "Audio: Off" : "Audio: On";
    legacyMuteBtn.setAttribute("aria-pressed", audioState.muted ? "true" : "false");
    legacyMuteBtn.setAttribute("aria-label", audioState.muted ? "Unmute sound effects" : "Mute sound effects");
  }
  setAudioButtonPressed(document.getElementById("audioMasterMuteBtn"), !audioState.muted, {
    on: "All Audio: On",
    off: "All Audio: Off"
  });
  setAudioButtonPressed(document.getElementById("audioMusicToggle"), audioState.musicEnabled, { on: "On", off: "Off" });
  setAudioButtonPressed(document.getElementById("audioUiToggle"), audioState.sfxEnabled, { on: "On", off: "Off" });
  setAudioButtonPressed(document.getElementById("audioRevealToggle"), audioState.revealEnabled, { on: "On", off: "Off" });
  setAudioButtonPressed(document.getElementById("audioCardToggle"), audioState.cardEnabled, { on: "On", off: "Off" });
  setAudioButtonPressed(document.getElementById("audioVoiceToggle"), audioState.voiceEnabled !== false, { on: "On", off: "Off" });
  setAudioButtonPressed(document.getElementById("audioQuickMusicToggleBtn"), audioState.muted ? false : audioState.musicEnabled, {
    on: "Music On",
    off: "Music Off"
  });
  {
    const quickVoiceToggleBtn = document.getElementById("audioQuickVoiceToggleBtn");
    const bundleState = getQuickVoiceBundleState();
    if (audioState.muted) {
      setAudioButtonPressed(quickVoiceToggleBtn, false, {
        on: "Voice On",
        off: "Voice Off"
      });
    } else if (quickVoiceToggleBtn && bundleState && bundleState.mixed) {
      quickVoiceToggleBtn.setAttribute("aria-pressed", "mixed");
      quickVoiceToggleBtn.textContent = "Voice Mixed";
    } else {
      setAudioButtonPressed(quickVoiceToggleBtn, Boolean(bundleState && bundleState.enabled), {
        on: "Voice On",
        off: "Voice Off"
      });
    }
  }
  const statusText = getAudioStatusText();
  const unlockStatus = document.getElementById("audioUnlockStatus");
  if (unlockStatus) {
    unlockStatus.textContent = statusText;
    unlockStatus.classList.toggle("is-warning", !audioState.unlocked);
    unlockStatus.classList.toggle("is-ready", audioState.unlocked && !audioState.muted);
  }
  const quickStatus = document.getElementById("audioQuickPanelStatus");
  if (quickStatus) quickStatus.textContent = getAudioQuickPanelStatusText();
  const deck = document.querySelector(".audio-control-deck");
  const deckBody = document.getElementById("audioControlDeckBody");
  const deckToggleBtn = document.getElementById("audioDeckToggleBtn");
  if (deck) {
    deck.classList.toggle("is-collapsed", !audioState.audioDeckExpanded);
  }
  if (deckBody) {
    deckBody.hidden = !audioState.audioDeckExpanded;
  }
  if (deckToggleBtn) {
    deckToggleBtn.setAttribute("aria-expanded", audioState.audioDeckExpanded ? "true" : "false");
    deckToggleBtn.setAttribute("aria-label", audioState.audioDeckExpanded ? "Collapse audio controls" : "Expand audio controls");
    deckToggleBtn.textContent = audioState.audioDeckExpanded ? "v" : ">";
  }
  const voiceExpressiveBtn = document.getElementById("audioVoiceExpressiveToggle");
  if (voiceExpressiveBtn && KOKORO_ONLY_VOICE_SYSTEM) {
    voiceExpressiveBtn.hidden = true;
    voiceExpressiveBtn.closest(".audio-control-row")?.classList.add("voice-row-kokoro-only");
  }
  const quickFab = document.getElementById("audioQuickFab");
  const quickFabState = document.getElementById("audioQuickFabState");
  if (quickFab) {
    quickFab.classList.toggle("is-muted", audioState.muted);
    quickFab.classList.toggle("dot-dismissed", audioState.quickFabDotDismissed === true);
    quickFab.setAttribute("aria-expanded", audioState.quickPanelOpen ? "true" : "false");
  }
  if (quickFabState) {
    if (audioState.muted) {
      quickFabState.textContent = "OFF";
    } else if (!audioState.musicEnabled) {
      quickFabState.textContent = "MUSIC OFF";
    } else {
      quickFabState.textContent = "ON";
    }
  }
  const panel = document.getElementById("audioQuickPanel");
  if (panel) {
    panel.hidden = !audioState.quickPanelOpen;
  }
  [
    ["audioMasterVolume", "audioMasterVolumeValue", audioState.masterVolume],
    ["audioMusicVolume", "audioMusicVolumeValue", audioState.musicVolume],
    ["audioUiVolume", "audioUiVolumeValue", audioState.sfxVolume],
    ["audioRevealVolume", "audioRevealVolumeValue", audioState.revealVolume],
    ["audioCardVolume", "audioCardVolumeValue", audioState.cardVolume]
  ].forEach(([inputId, valueId, numeric]) => {
    const input = document.getElementById(inputId);
    const valueEl = document.getElementById(valueId);
    const percent = Math.round(clampAudioLevel(numeric, 0) * 100);
    if (input && document.activeElement !== input) input.value = String(percent);
    if (valueEl) valueEl.textContent = `${percent}%`;
  });
  const quickMusicVolume = document.getElementById("audioQuickMusicVolume");
  if (quickMusicVolume && document.activeElement !== quickMusicVolume) {
    quickMusicVolume.value = String(Math.round(clampAudioLevel(audioState.musicVolume, 0) * 100));
  }
  const previewSelect = document.getElementById("audioPreviewSceneSelect");
  const previewSelection = resolveMusicSceneKey(audioState.previewSceneSelection || audioState.currentScreenScene || audioState.currentMusicScene || "join");
  if (previewSelect && document.activeElement !== previewSelect && previewSelect.value !== previewSelection) {
    previewSelect.value = previewSelection;
  }
  const previewStatus = document.getElementById("audioPreviewSceneStatus");
  if (previewStatus) {
    previewStatus.textContent = audioState.musicPreviewStatusText || "Preview mode temporarily overrides live music, then restores the active scene.";
    previewStatus.classList.toggle("is-warning", audioState.musicPreviewStatusTone === "warning");
    previewStatus.classList.toggle("is-active", audioState.musicPreviewActive === true);
  }
  const voiceStatus = document.getElementById("audioVoiceStatus");
  if (voiceStatus) {
    voiceStatus.textContent = audioState.voiceStatusText || getVoiceStatusText();
    voiceStatus.classList.toggle("is-warning", audioState.voiceStatusTone === "warning" || !audioState.voiceUnlocked && audioState.voiceEnabled !== false);
    voiceStatus.classList.toggle("is-active", audioState.voiceStatusTone === "active" || audioState.voiceSpeaking === true);
  }
  const voiceUnlockBtn = document.getElementById("audioVoiceUnlockBtn");
  if (voiceUnlockBtn) {
    const shouldShowUnlock = audioState.voiceEnabled !== false && audioState.voiceSupported !== false && !audioState.voiceUnlocked;
    voiceUnlockBtn.hidden = !shouldShowUnlock;
    voiceUnlockBtn.disabled = audioState.voiceSupported === false;
  }
  syncVoiceStudioUi();
  if (!audioState.unlocked && !audioState.mobileTouchHintShown) {
    scheduleMobileTouchAudioHint({ delayMs: 1200 });
  }
}
function applyAudioLevels() {
  if (audioState.masterGain) {
    audioState.masterGain.gain.value = audioState.muted ? 0 : audioState.masterVolume;
  }
  if (audioState.sfxGain) {
    audioState.sfxGain.gain.value = audioState.sfxEnabled ? audioState.sfxVolume : 0;
  }
  if (audioState.musicGain) {
    audioState.musicGain.gain.value = audioState.musicEnabled ? audioState.musicVolume : 0;
  }
  if (audioState.revealGain) {
    audioState.revealGain.gain.value = audioState.revealEnabled ? audioState.revealVolume : 0;
  }
  if (audioState.cardGain) {
    audioState.cardGain.gain.value = audioState.cardEnabled ? audioState.cardVolume : 0;
  }
  syncManagedMediaAudioLevels();
  syncVoiceManagerState();
  syncAudioControlUI();
}
function setAudioMuted(nextMuted, { persist = true } = {}) {
  audioState.muted = nextMuted === true;
  applyAudioLevels();
  syncMusicLoopState();
  if (persist) saveAudioPreferences();
}
function setMasterAudioVolume(value, { persist = true } = {}) {
  audioState.masterVolume = clampAudioLevel(value, 0.9);
  applyAudioLevels();
  if (persist) saveAudioPreferences();
}
function setAudioCategoryEnabled(category, enabled, { persist = true } = {}) {
  const meta = getAudioCategoryMeta(category);
  audioState[meta.enabledKey] = enabled === true;
  applyAudioLevels();
  if (meta.gainKey === "cardGain" && audioState.cardEnabled !== true) {
    clearVoiceCues("card-audio-disabled", { types: ["entry"], includeActive: true });
  }
  if (meta.gainKey === "musicGain") {
    syncMusicLoopState();
  }
  if (persist) saveAudioPreferences();
}
function toggleAudioCategory(category) {
  const meta = getAudioCategoryMeta(category);
  setAudioCategoryEnabled(category, !Boolean(audioState[meta.enabledKey]));
}
function enableQuickAudioCategoryFromMuted(category) {
  setAudioMuted(false, { persist: false });
  setAudioCategoryEnabled(category, true, { persist: true });
}
function setAudioCategoryVolume(category, value, { persist = true } = {}) {
  const meta = getAudioCategoryMeta(category);
  const fallbackKey = meta.gainKey === "musicGain" ? "music" : meta.gainKey === "revealGain" ? "reveal" : meta.gainKey === "cardGain" ? "card" : "sfx";
  audioState[meta.volumeKey] = clampAudioLevel(value, AUDIO_CATEGORY_DEFAULTS[fallbackKey].volume);
  applyAudioLevels();
  if (meta.gainKey === "musicGain") {
    syncMusicLoopState();
  }
  if (persist) saveAudioPreferences();
}
function setAudioQuickPanelOpen(open) {
  audioState.quickPanelOpen = open === true;
  syncAudioControlUI();
}
function setAudioControlDeckExpanded(open) {
  audioState.audioDeckExpanded = open === true;
  syncAudioControlUI();
}
var AUDIO_MUSIC_SCENE_DEFS = {
  join: {
    label: "Join",
    files: ["DeepUrbanHouse - Join.mp3"],
    baseGain: 0.22,
    playbackRate: 1,
    transitionInMs: 2200,
    transitionOutMs: 1600
  },
  lobby: {
    label: "Lobby",
    files: ["HipHop - Lobby.mp3"],
    baseGain: 0.84,
    playbackRate: 1,
    transitionInMs: 1350,
    transitionOutMs: 1e3
  },
  entry: {
    label: "Entry",
    files: ["Can't Get You Off My Mind - Entry.mp3"],
    baseGain: 0.4,
    playbackRate: 1,
    transitionInMs: 1500,
    transitionOutMs: 1200
  },
  voting: {
    label: "Voting",
    files: ["Can't Get You Off My Mind - Entry.mp3"],
    baseGain: 0.48,
    playbackRate: 1.65,
    transitionInMs: 850,
    transitionOutMs: 750
  },
  ceremony: {
    label: "Ceremony",
    files: ["Complicated - Ceremony.mp3"],
    baseGain: 0.8,
    playbackRate: 1,
    transitionInMs: 6400,
    transitionOutMs: 2e3,
    transitionInCurve: "easeOutQuint",
    transitionOutCurve: "easeInCubic"
  },
  round4Bg: {
    label: "Round 4 Background",
    files: ["GamesWorldbeat - Round4BG.mp3"],
    baseGain: 0.46,
    playbackRate: 1,
    transitionInMs: 1800,
    transitionOutMs: 1100
  }
};
var AUDIO_MUSIC_SCENE_ALIASES = {
  draft: "entry",
  scenario: "entry",
  twist: "entry",
  results: "entry",
  round4Reveal: "ceremony",
  finale: "ceremony",
  round4bg: "round4Bg",
  round4_bg: "round4Bg"
};
function createManagedAudioElement(kind = "audio") {
  const el = new Audio();
  el.preload = "auto";
  el.loop = false;
  el.playsInline = true;
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.setAttribute("data-managed-audio-kind", kind);
  return el;
}
function ensureMusicDecks() {
  if (Array.isArray(audioState.musicDecks) && audioState.musicDecks.length >= 2) return audioState.musicDecks;
  audioState.musicDecks = [0, 1].map((index) => {
    const el = createManagedAudioElement("music");
    el.loop = true;
    el.volume = 0;
    return {
      index,
      el,
      sceneKey: "",
      sourceUrl: "",
      currentGain: 0,
      targetGain: 0,
      playbackRate: 1,
      isPrimary: false,
      mediaSourceNode: null,
      mediaGainNode: null,
      routedToGraph: false,
      routingWarned: false
    };
  });
  return audioState.musicDecks;
}
function ensureMusicDeckWebAudioRouting(deck) {
  if (!deck || !deck.el) return false;
  if (deck.routedToGraph === true && deck.mediaGainNode) return true;
  const ctx = getAudioContext();
  if (!ctx || !audioState.musicGain || typeof ctx.createMediaElementSource !== "function") {
    return false;
  }
  try {
    if (!deck.mediaSourceNode) {
      deck.mediaSourceNode = ctx.createMediaElementSource(deck.el);
    }
    if (!deck.mediaGainNode) {
      deck.mediaGainNode = ctx.createGain();
      deck.mediaGainNode.gain.value = 0;
    }
    if (!deck.routedToGraph) {
      deck.mediaSourceNode.connect(deck.mediaGainNode);
      deck.mediaGainNode.connect(audioState.musicGain);
      deck.routedToGraph = true;
    }
    try {
      deck.el.volume = 1;
    } catch (error) {
    }
    return true;
  } catch (error) {
    if (!deck.routingWarned) {
      deck.routingWarned = true;
      console.warn("[audio] music deck WebAudio routing unavailable; falling back to element volume control");
    }
    deck.routedToGraph = false;
    return false;
  }
}
function resolveMusicSceneKey(sceneKey = "") {
  const raw = String(sceneKey || "").trim();
  if (!raw) return "lobby";
  if (AUDIO_MUSIC_SCENE_DEFS[raw]) return raw;
  const lowered = raw.toLowerCase();
  if (AUDIO_MUSIC_SCENE_DEFS[lowered]) return lowered;
  if (AUDIO_MUSIC_SCENE_ALIASES[raw]) return AUDIO_MUSIC_SCENE_ALIASES[raw];
  if (AUDIO_MUSIC_SCENE_ALIASES[lowered]) return AUDIO_MUSIC_SCENE_ALIASES[lowered];
  return "lobby";
}
function getMusicSceneSpec(sceneKey = "") {
  const key = resolveMusicSceneKey(sceneKey);
  return { key, ...AUDIO_MUSIC_SCENE_DEFS[key] || AUDIO_MUSIC_SCENE_DEFS.lobby };
}
function getManagedMusicMasterScalar() {
  if (!audioState.unlocked || document.hidden || audioState.muted || !audioState.musicEnabled) {
    return 0;
  }
  return clampAudioLevel(audioState.masterVolume, 0.9) * clampAudioLevel(audioState.musicVolume, AUDIO_CATEGORY_DEFAULTS.music.volume);
}
function safePlayManagedAudioElement(el) {
  if (!el) return;
  try {
    try {
      if (el.muted) el.muted = false;
    } catch (muteError) {
    }
    const result = el.play();
    if (result && typeof result.catch === "function") {
      result.catch((error) => {
        try {
          const kind = String(el.getAttribute && el.getAttribute("data-managed-audio-kind") || "audio");
          const src = String(el.currentSrc || el.src || "").replace(window.location.origin, "");
          const errName = String(error && error.name || "Error");
          const errMsg = String(error && error.message || "").trim();
          const sig = `${kind}|${src}|${errName}|${errMsg}`;
          const now = Date.now();
          if (audioState.lastManagedMediaPlayErrorSig !== sig || now - audioState.lastManagedMediaPlayErrorAt > 3500) {
            audioState.lastManagedMediaPlayErrorSig = sig;
            audioState.lastManagedMediaPlayErrorAt = now;
            console.warn(`[audio] managed play blocked (${kind}) ${errName}${errMsg ? `: ${errMsg}` : ""} src=${src || "n/a"}`);
          }
        } catch (logError) {
        }
      });
    }
  } catch (error) {
  }
}
function safePauseManagedAudioElement(el) {
  if (!el) return;
  try {
    el.pause();
  } catch (error) {
  }
}
function syncManagedMediaAudioLevels() {
  const musicScalar = getManagedMusicMasterScalar();
  ensureMusicDecks().forEach((deck) => {
    if (!deck || !deck.el) return;
    const effective = Math.max(0, Math.min(1, musicScalar * clampAudioLevel(deck.currentGain, 0)));
    const routed = ensureMusicDeckWebAudioRouting(deck);
    if (routed && deck.mediaGainNode) {
      try {
        deck.mediaGainNode.gain.value = effective;
      } catch (error) {
      }
    }
    try {
      deck.el.volume = routed ? 1 : effective;
    } catch (error) {
    }
    if (effective <= 8e-4) {
      if (deck.el && !deck.el.paused) safePauseManagedAudioElement(deck.el);
    } else if (deck.sourceUrl && deck.el && deck.el.paused) {
      safePlayManagedAudioElement(deck.el);
    }
  });
}
function getMusicFadeCurveValue(progress, curve = "easeInOutSine") {
  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  if (curve === "linear") return t;
  if (curve === "easeInCubic") return t * t * t;
  if (curve === "easeOutCubic") return 1 - (1 - t) ** 3;
  if (curve === "easeOutQuint") return 1 - (1 - t) ** 5;
  if (curve === "easeInOutQuad") return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  return -(Math.cos(Math.PI * t) - 1) / 2;
}
function cancelMusicFadeAnimation() {
  audioState.musicTransitionToken += 1;
  if (audioState.musicFadeRaf) {
    window.cancelAnimationFrame(audioState.musicFadeRaf);
    audioState.musicFadeRaf = null;
  }
  audioState.musicTransitionState = null;
}
function enforceMusicDeckExclusivity(keepIndexes = []) {
  const keep = new Set((Array.isArray(keepIndexes) ? keepIndexes : [keepIndexes]).filter((idx) => Number.isFinite(idx)).map((idx) => Number(idx)));
  let changed = false;
  ensureMusicDecks().forEach((deck) => {
    if (!deck) return;
    if (keep.has(deck.index)) return;
    if ((deck.currentGain || 0) > 0) changed = true;
    deck.currentGain = 0;
    deck.targetGain = 0;
    safePauseManagedAudioElement(deck.el);
  });
  if (changed) {
    syncManagedMediaAudioLevels();
  }
}
function stepMusicFadeAnimation() {
  const state = audioState.musicTransitionState;
  if (!state) return;
  if (state.token !== audioState.musicTransitionToken) return;
  const now = performance.now();
  const elapsed = now - state.startedAt;
  let done = true;
  if (state.outDeck) {
    const outElapsed = Math.max(0, elapsed - state.outDelayMs);
    const outDuration = Math.max(1, state.outDurationMs);
    const outProgress = Math.max(0, Math.min(1, outElapsed / outDuration));
    const outCurve = getMusicFadeCurveValue(outProgress, state.outCurve);
    state.outDeck.currentGain = Math.max(0, state.outStartGain * (1 - outCurve));
    if (outProgress < 1) done = false;
  }
  if (state.inDeck) {
    const inElapsed = Math.max(0, elapsed - state.inDelayMs);
    const inDuration = Math.max(1, state.inDurationMs);
    const inProgress = Math.max(0, Math.min(1, inElapsed / inDuration));
    const inCurve = getMusicFadeCurveValue(inProgress, state.inCurve);
    state.inDeck.currentGain = state.inStartGain + (state.inTargetGain - state.inStartGain) * inCurve;
    if (inProgress < 1) done = false;
  }
  syncManagedMediaAudioLevels();
  if (done) {
    if (state.outDeck && state.outDeck.el) {
      state.outDeck.currentGain = 0;
      safePauseManagedAudioElement(state.outDeck.el);
    }
    if (state.inDeck) {
      state.inDeck.currentGain = state.inTargetGain;
    }
    enforceMusicDeckExclusivity(state.inDeck ? [state.inDeck.index] : []);
    syncManagedMediaAudioLevels();
    audioState.musicFadeRaf = null;
    audioState.musicTransitionState = null;
    return;
  }
  audioState.musicFadeRaf = window.requestAnimationFrame(stepMusicFadeAnimation);
}
function beginMusicCrossfade({ inDeck = null, outDeck = null, inTargetGain = 0, inStartGain = 0, inDelayMs = 0, inDurationMs = 1200, inCurve = "easeInOutSine", outDelayMs = 0, outDurationMs = 1e3, outCurve = "easeOutCubic" } = {}) {
  cancelMusicFadeAnimation();
  const token = ++audioState.musicTransitionToken;
  audioState.musicTransitionState = {
    token,
    startedAt: performance.now(),
    inDeck,
    outDeck,
    inTargetGain: clampAudioLevel(inTargetGain, 0),
    inStartGain: clampAudioLevel(inStartGain, 0),
    inDelayMs: Math.max(0, Number(inDelayMs) || 0),
    inDurationMs: Math.max(1, Number(inDurationMs) || 1),
    inCurve: String(inCurve || "easeInOutSine"),
    outStartGain: clampAudioLevel(outDeck && outDeck.currentGain, 0),
    outDelayMs: Math.max(0, Number(outDelayMs) || 0),
    outDurationMs: Math.max(1, Number(outDurationMs) || 1),
    outCurve: String(outCurve || "easeOutCubic")
  };
  if (inDeck) {
    inDeck.currentGain = clampAudioLevel(inStartGain, 0);
  }
  syncManagedMediaAudioLevels();
  audioState.musicFadeRaf = window.requestAnimationFrame(stepMusicFadeAnimation);
}
function stopAllMusicDecks() {
  ensureMusicDecks().forEach((deck) => {
    if (!deck) return;
    deck.currentGain = 0;
    deck.targetGain = 0;
    safePauseManagedAudioElement(deck.el);
  });
  syncManagedMediaAudioLevels();
}
async function probeManagedMediaUrl(url = "") {
  const key = String(url || "").trim();
  if (!key) return false;
  if (audioState.mediaUrlProbeCache.has(key)) {
    return audioState.mediaUrlProbeCache.get(key);
  }
  const pending = (async () => {
    try {
      const response = await fetch(key, { method: "HEAD", cache: "force-cache" });
      if (response && (response.ok || response.status === 304)) return true;
    } catch (error) {
    }
    return false;
  })();
  audioState.mediaUrlProbeCache.set(key, pending);
  return pending;
}
function resolveMusicSceneSourceUrl(sceneSpec) {
  const spec = sceneSpec && typeof sceneSpec === "object" ? sceneSpec : getMusicSceneSpec("lobby");
  const candidates = Array.isArray(spec.files) ? spec.files : [];
  const urls = candidates.map((filename) => `/audio/${encodeAudioPathSegment(filename)}`).filter(Boolean);
  if (!urls.length) return "";
  return urls[0];
}
function getMusicTransitionProfile(fromSceneKey, toSceneKey, options = {}) {
  const fromKey = resolveMusicSceneKey(fromSceneKey);
  const toKey = resolveMusicSceneKey(toSceneKey);
  const explicit = String(options && options.transition || "").trim().toLowerCase();
  let profile = {
    inDelayMs: 0,
    inDurationMs: 1200,
    inCurve: "easeInOutSine",
    inStartGain: 0,
    outDelayMs: 0,
    outDurationMs: 1e3,
    outCurve: "easeOutCubic"
  };
  const targetSpec = AUDIO_MUSIC_SCENE_DEFS[toKey] || AUDIO_MUSIC_SCENE_DEFS.lobby;
  const sourceSpec = AUDIO_MUSIC_SCENE_DEFS[fromKey] || null;
  if (targetSpec) {
    profile.inDurationMs = Math.max(profile.inDurationMs, Number(targetSpec.transitionInMs) || profile.inDurationMs);
    if (targetSpec.transitionInCurve) profile.inCurve = targetSpec.transitionInCurve;
  }
  if (sourceSpec) {
    profile.outDurationMs = Math.max(profile.outDurationMs, Number(sourceSpec.transitionOutMs) || profile.outDurationMs);
    if (sourceSpec.transitionOutCurve) profile.outCurve = sourceSpec.transitionOutCurve;
  }
  if (toKey === "ceremony" || explicit === "crescendo") {
    profile.inStartGain = 0.03;
    profile.inDurationMs = Math.max(profile.inDurationMs, 5200);
    profile.inCurve = "easeOutQuint";
    profile.outDurationMs = Math.min(Math.max(profile.outDurationMs, 850), 1200);
    profile.outCurve = "easeInCubic";
  }
  if (fromKey === "ceremony" && toKey === "round4Bg" || explicit === "ceremony-to-round4" || explicit === "decrescendo") {
    profile.outDurationMs = Math.max(profile.outDurationMs, 2400);
    profile.outCurve = "easeInCubic";
    profile.inDelayMs = Math.max(profile.inDelayMs, 420);
    profile.inStartGain = 0;
    profile.inDurationMs = Math.max(profile.inDurationMs, 1800);
    profile.inCurve = "easeInOutQuad";
  }
  if (explicit === "fast") {
    profile.inDurationMs = 450;
    profile.outDurationMs = 400;
    profile.inDelayMs = 0;
  }
  if (explicit === "preview") {
    profile.inDurationMs = 700;
    profile.outDurationMs = 520;
    profile.inDelayMs = 0;
    profile.outDelayMs = 0;
    profile.inCurve = "easeInOutQuad";
    profile.outCurve = "easeOutCubic";
  }
  return profile;
}
async function playMusicSceneInternal(sceneKey, options = {}) {
  const spec = getMusicSceneSpec(sceneKey);
  const requestSeq = ++audioState.musicSceneRequestSeq;
  if (!audioState.unlocked || audioState.muted || !audioState.musicEnabled || document.hidden) {
    syncManagedMediaAudioLevels();
    return false;
  }
  const decks = ensureMusicDecks();
  const activeDeck = Number.isFinite(audioState.musicActiveDeckIndex) && audioState.musicActiveDeckIndex >= 0 ? decks[audioState.musicActiveDeckIndex] : null;
  const sourceUrl = resolveMusicSceneSourceUrl(spec);
  if (requestSeq !== audioState.musicSceneRequestSeq) return false;
  if (!sourceUrl) return false;
  const sameScene = activeDeck && activeDeck.sceneKey === spec.key;
  const sameSource = activeDeck && activeDeck.sourceUrl === sourceUrl;
  const targetGain = clampAudioLevel(spec.baseGain, 0.75);
  const nextRate = clampAudioRate(spec.playbackRate, 1);
  if (activeDeck && sameSource) {
    activeDeck.sceneKey = spec.key;
    activeDeck.targetGain = targetGain;
    activeDeck.playbackRate = nextRate;
    try {
      activeDeck.el.playbackRate = nextRate;
    } catch (error) {
    }
    enforceMusicDeckExclusivity([activeDeck.index]);
    beginMusicCrossfade({
      inDeck: activeDeck,
      outDeck: null,
      inTargetGain: targetGain,
      inStartGain: clampAudioLevel(activeDeck.currentGain, 0),
      inDurationMs: sameScene ? 650 : 900,
      inCurve: "easeInOutSine",
      outDurationMs: 1
    });
    audioState.musicCurrentTrackUrl = sourceUrl;
    audioState.musicCurrentSceneSpec = spec;
    const sameSceneLogSig = `${spec.key}|${sourceUrl}|${nextRate}|${targetGain}|refresh`;
    if (audioState.lastMusicSceneLogSig !== sameSceneLogSig) {
      audioState.lastMusicSceneLogSig = sameSceneLogSig;
      console.info(`[audio] music scene active scene=${spec.key} track=${sourceUrl} gain=${targetGain.toFixed(2)} rate=${nextRate}`);
    }
    return true;
  }
  const nextDeck = decks.find((deck) => !activeDeck || deck.index !== activeDeck.index) || decks[0];
  nextDeck.sceneKey = spec.key;
  nextDeck.sourceUrl = sourceUrl;
  nextDeck.targetGain = targetGain;
  nextDeck.playbackRate = nextRate;
  nextDeck.isPrimary = true;
  const shouldResetTime = !activeDeck || activeDeck.sourceUrl !== sourceUrl || options.force === true;
  try {
    if (nextDeck.el.src !== `${window.location.origin}${sourceUrl}` && nextDeck.el.src !== sourceUrl) {
      nextDeck.el.src = sourceUrl;
      try {
        nextDeck.el.load();
      } catch (loadError) {
      }
    }
  } catch (error) {
    nextDeck.el.src = sourceUrl;
    try {
      nextDeck.el.load();
    } catch (loadError) {
    }
  }
  nextDeck.el.loop = true;
  nextDeck.el.preload = "auto";
  try {
    nextDeck.el.playbackRate = nextRate;
  } catch (error) {
  }
  if (!shouldResetTime && activeDeck && activeDeck.el && Number.isFinite(activeDeck.el.currentTime)) {
    try {
      nextDeck.el.currentTime = Math.max(0, Number(activeDeck.el.currentTime) || 0);
    } catch (error) {
    }
  } else {
    try {
      nextDeck.el.currentTime = 0;
    } catch (error) {
    }
  }
  safePlayManagedAudioElement(nextDeck.el);
  audioState.musicActiveDeckIndex = nextDeck.index;
  audioState.musicCurrentTrackUrl = sourceUrl;
  audioState.musicCurrentSceneSpec = spec;
  const startLogSig = `${spec.key}|${sourceUrl}|${nextRate}|${targetGain}|deck:${nextDeck.index}`;
  if (audioState.lastMusicSceneLogSig !== startLogSig) {
    audioState.lastMusicSceneLogSig = startLogSig;
    console.info(`[audio] music scene start scene=${spec.key} deck=${nextDeck.index} track=${sourceUrl} gain=${targetGain.toFixed(2)} rate=${nextRate}`);
  }
  const transition = getMusicTransitionProfile(activeDeck && activeDeck.sceneKey, spec.key, options);
  if (options && options.exclusive === true) {
    enforceMusicDeckExclusivity([activeDeck ? activeDeck.index : NaN, nextDeck.index]);
  } else {
    enforceMusicDeckExclusivity([activeDeck ? activeDeck.index : NaN, nextDeck.index]);
  }
  beginMusicCrossfade({
    inDeck: nextDeck,
    outDeck: activeDeck || null,
    inTargetGain: targetGain,
    inStartGain: transition.inStartGain,
    inDelayMs: transition.inDelayMs,
    inDurationMs: transition.inDurationMs,
    inCurve: transition.inCurve,
    outDelayMs: transition.outDelayMs,
    outDurationMs: transition.outDurationMs,
    outCurve: transition.outCurve
  });
  return true;
}
function syncMusicLoopState(options = {}) {
  if (!audioState.currentMusicScene) {
    cancelMusicFadeAnimation();
    stopAllMusicDecks();
    return;
  }
  if (!audioState.unlocked || audioState.muted || !audioState.musicEnabled || document.hidden) {
    cancelMusicFadeAnimation();
    syncManagedMediaAudioLevels();
    return;
  }
  ensureAudioRunning();
  if (!audioState.htmlMediaUnlocked) {
    tryUnlockHtmlMediaStack();
  }
  void playMusicSceneInternal(audioState.currentMusicScene, options);
}
function stopMusicScenePreview({ restore = true } = {}) {
  if (audioState.musicPreviewTimer) {
    window.clearTimeout(audioState.musicPreviewTimer);
    audioState.musicPreviewTimer = null;
  }
  const wasActive = audioState.musicPreviewActive === true;
  audioState.musicPreviewActive = false;
  if (typeof audioState.musicPreviewRestoreMusicEnabled === "boolean") {
    audioState.musicEnabled = audioState.musicPreviewRestoreMusicEnabled;
  }
  if (restore) {
    const restoreScene = audioState.musicPreviewRestoreScene || audioState.currentScreenScene || "lobby";
    audioState.currentMusicScene = resolveMusicSceneKey(restoreScene);
    syncMusicLoopState({ force: true, transition: "fast", exclusive: true });
  }
  audioState.musicPreviewRestoreScene = "";
  audioState.musicPreviewRestoreMusicEnabled = null;
  if (wasActive) {
    setAudioPreviewStatus("Preview ended. Live scene music is restored.", "info");
  }
}
function previewMusicScene(sceneKey, options = {}) {
  const selectedKey = resolveMusicSceneKey(sceneKey);
  const durationMs = Math.max(1200, Number(options && options.previewMs) || 6500);
  audioState.previewSceneSelection = selectedKey;
  saveAudioPreferences();
  stopMusicScenePreview({ restore: false });
  audioState.musicPreviewActive = true;
  audioState.musicPreviewRestoreScene = resolveMusicSceneKey(audioState.currentScreenScene || audioState.currentMusicScene || "lobby");
  audioState.musicPreviewRestoreMusicEnabled = audioState.musicEnabled === true;
  if (!audioState.musicEnabled) {
    audioState.musicEnabled = true;
  }
  cancelMusicFadeAnimation();
  stopAllMusicDecks();
  audioState.currentMusicScene = selectedKey;
  setAudioPreviewStatus(`Previewing ${getMusicSceneSpec(selectedKey).label}. Live music is temporarily paused${audioState.musicPreviewRestoreMusicEnabled ? "" : " and Music was auto-enabled for this test"}.`, "warning");
  syncAudioControlUI();
  syncMusicLoopState({ force: true, transition: "preview", exclusive: true });
  audioState.musicPreviewTimer = window.setTimeout(() => {
    audioState.musicPreviewTimer = null;
    stopMusicScenePreview({ restore: true });
  }, durationMs);
}
function setMusicScene(sceneKey, options = {}) {
  const nextKey = resolveMusicSceneKey(sceneKey);
  const force = options && options.force === true;
  const persist = options && options.persist === true;
  const previousScreenScene = resolveMusicSceneKey(audioState.currentScreenScene || "lobby");
  if (force || audioState.currentMusicScene !== nextKey) {
    audioState.currentMusicScene = nextKey;
    if (persist) saveAudioPreferences();
  }
  syncAudioControlUI();
  syncMusicLoopState(options);
  if (!audioState.musicPreviewActive && !audioState.musicPreviewTimer && previousScreenScene === nextKey) {
    setAudioPreviewStatus("", "");
  }
}
function mapScreenToMusicScene(screenId) {
  const id = String(screenId || "");
  if (id === "join" || id === "tutorial") return "join";
  if (id === "lobby") return "lobby";
  if (id === "categoryVoteScreen") return "entry";
  if (id === "preRound") return "entry";
  if (id === "categoryScreen") return "entry";
  if (id === "scenarioScreen") return "entry";
  if (id === "twistScreen") return "entry";
  if (id === "votingScreen") return "voting";
  if (id === "resultsScreen") return "entry";
  if (id === "round4EvalScreen") return "ceremony";
  if (id === "finalScreen") return "ceremony";
  return "lobby";
}
function runAudioMixSelfTest() {
  playMessageSound();
  window.setTimeout(() => playRound4RevealAccent({ audioMode: "accent" }, "launch"), 80);
  window.setTimeout(() => playRound4RevealAccent({ audioMode: "intense" }, "impact"), 260);
  window.setTimeout(() => playCharacterCardBlurb({ character: "Audio Test", ovr: 88, rarity: "Epic" }, { context: "test" }), 420);
}
function setupAudioControls() {
  if (audioState.controlsInitialized) return;
  const ensureUnlockedByControlGesture = () => {
    unlockAudioFromGesture({ type: "audio-control" });
    try {
      const manager = getVoiceManager();
      if (manager) {
        void manager.init();
        manager.unlock();
      }
    } catch (error) {
    }
  };
  const toggleMasterMute = () => {
    ensureUnlockedByControlGesture();
    setAudioMuted(!audioState.muted);
  };
  const legacyMute = document.getElementById("audioToggleMute");
  if (legacyMute) {
    legacyMute.addEventListener("click", toggleMasterMute);
  }
  const masterMuteBtn = document.getElementById("audioMasterMuteBtn");
  if (masterMuteBtn) {
    masterMuteBtn.addEventListener("click", toggleMasterMute);
  }
  const deckToggleBtn = document.getElementById("audioDeckToggleBtn");
  if (deckToggleBtn) {
    deckToggleBtn.addEventListener("click", () => {
      ensureUnlockedByControlGesture();
      setAudioControlDeckExpanded(!audioState.audioDeckExpanded);
    });
  }
  const bindSlider = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) return;
    const onInput = () => handler((Number(el.value) || 0) / 100);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onInput);
  };
  bindSlider("audioMasterVolume", (value) => setMasterAudioVolume(value));
  bindSlider("audioMusicVolume", (value) => setAudioCategoryVolume("music", value));
  bindSlider("audioUiVolume", (value) => setAudioCategoryVolume("sfx", value));
  bindSlider("audioRevealVolume", (value) => setAudioCategoryVolume("reveal", value));
  bindSlider("audioCardVolume", (value) => setAudioCategoryVolume("card", value));
  bindSlider("audioQuickMusicVolume", (value) => setAudioCategoryVolume("music", value));
  const bindToggleBtn = (id, category) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", () => {
      ensureUnlockedByControlGesture();
      toggleAudioCategory(category);
    });
  };
  bindToggleBtn("audioMusicToggle", "music");
  bindToggleBtn("audioUiToggle", "sfx");
  bindToggleBtn("audioRevealToggle", "reveal");
  bindToggleBtn("audioCardToggle", "card");
  const quickMusicToggleBtn = document.getElementById("audioQuickMusicToggleBtn");
  if (quickMusicToggleBtn) {
    quickMusicToggleBtn.addEventListener("click", () => {
      ensureUnlockedByControlGesture();
      if (audioState.muted) {
        enableQuickAudioCategoryFromMuted("music");
        return;
      }
      toggleAudioCategory("music");
    });
  }
  const voiceToggleBtn = document.getElementById("audioVoiceToggle");
  if (voiceToggleBtn) {
    voiceToggleBtn.addEventListener("click", () => {
      ensureUnlockedByControlGesture();
      toggleVoiceEnabled();
    });
  }
  const quickVoiceToggleBtn = document.getElementById("audioQuickVoiceToggleBtn");
  if (quickVoiceToggleBtn) {
    quickVoiceToggleBtn.addEventListener("click", () => {
      ensureUnlockedByControlGesture();
      if (audioState.muted) {
        setQuickVoiceBundleEnabled(true);
        return;
      }
      toggleQuickVoiceBundleEnabled();
    });
  }
  const voiceExpressiveBtn = document.getElementById("audioVoiceExpressiveToggle");
  if (voiceExpressiveBtn) {
    if (KOKORO_ONLY_VOICE_SYSTEM) {
      voiceExpressiveBtn.hidden = true;
      voiceExpressiveBtn.setAttribute("aria-hidden", "true");
    } else {
      voiceExpressiveBtn.addEventListener("click", () => {
        ensureUnlockedByControlGesture();
        toggleVoiceExpressiveMode();
      });
    }
  }
  const voiceUnlockBtn = document.getElementById("audioVoiceUnlockBtn");
  if (voiceUnlockBtn) {
    voiceUnlockBtn.addEventListener("click", () => {
      ensureUnlockedByControlGesture();
      setVoiceStatus("Voice unlocked on this device.", "active");
    });
  }
  const kokoroPanelToggleBtn = document.getElementById("audioKokoroPanelToggleBtn");
  if (kokoroPanelToggleBtn) {
    kokoroPanelToggleBtn.addEventListener("click", () => {
      ensureUnlockedByControlGesture();
      setKokoroVoiceStudioOpen(!audioState.kokoroPanelOpen);
      if (audioState.kokoroPanelOpen) {
        setKokoroStatus("Adaptive voice panel opened. Host narrator changes queue for the whole room.", "active");
      }
    });
  }
  const voiceNarratorSelect = document.getElementById("audioVoiceNarratorSelect");
  if (voiceNarratorSelect) {
    voiceNarratorSelect.addEventListener("change", () => {
      ensureUnlockedByControlGesture();
      setVoiceChoice("narrator", voiceNarratorSelect.value || "");
      setVoiceStatus(
        voiceNarratorSelect.value ? "Narrator voice updated." : "Narrator voice set to Auto.",
        "active"
      );
    });
  }
  const voiceCharacterSelect = document.getElementById("audioVoiceCharacterSelect");
  if (voiceCharacterSelect) {
    voiceCharacterSelect.addEventListener("change", () => {
      ensureUnlockedByControlGesture();
      setVoiceCharacterProfile(voiceCharacterSelect.value || "auto_archetype");
      const selectedProfile = getCharacterVoiceProfileOption(voiceCharacterSelect.value || "auto_archetype");
      setVoiceStatus(
        selectedProfile ? `Character archetype preview: ${selectedProfile.label} (preview only)` : "Character archetype preview updated.",
        "active"
      );
    });
  }
  const voicePreviewNarratorBtn = document.getElementById("audioVoicePreviewNarratorBtn");
  if (voicePreviewNarratorBtn) {
    voicePreviewNarratorBtn.addEventListener("click", () => {
      playVoiceStudioPreview("narrator");
    });
  }
  const voicePreviewCharacterBtn = document.getElementById("audioVoicePreviewCharacterBtn");
  if (voicePreviewCharacterBtn) {
    voicePreviewCharacterBtn.addEventListener("click", () => {
      playVoiceStudioPreview("character");
    });
  }
  const kokoroPreviewNarratorBtn = document.getElementById("audioKokoroPreviewNarratorBtn");
  if (kokoroPreviewNarratorBtn) {
    kokoroPreviewNarratorBtn.addEventListener("click", () => {
      playVoiceStudioPreview("narrator");
    });
  }
  const kokoroPreviewCharacterBtn = document.getElementById("audioKokoroPreviewCharacterBtn");
  if (kokoroPreviewCharacterBtn) {
    kokoroPreviewCharacterBtn.addEventListener("click", () => {
      playVoiceStudioPreview("character");
    });
  }
  const kokoroNarratorSelect = document.getElementById("audioKokoroNarratorSelect");
  if (kokoroNarratorSelect) {
    kokoroNarratorSelect.addEventListener("change", () => {
      ensureUnlockedByControlGesture();
      const chosen = findKokoroCatalogEntryById(kokoroNarratorSelect.value || DEFAULT_NARRATOR_VOICE_ID);
      const narratorLabel = chosen ? formatKokoroCatalogLabel(chosen) : kokoroNarratorSelect.value || DEFAULT_NARRATOR_VOICE_ID;
      if (isCurrentPlayerHost()) {
        queueRoomKokoroNarratorVoice(kokoroNarratorSelect.value || DEFAULT_NARRATOR_VOICE_ID);
        setKokoroVoiceStudioOpen(true, { clearPing: true });
        setKokoroStatus(`Queued narrator for room: ${narratorLabel}`, "active");
      } else {
        setKokoroStatus(`Only the host can queue narrator voice changes. Current narrator remains room-controlled.`, "warning");
        syncAudioControlUI();
      }
    });
  }
  const kokoroCharacterSelect = document.getElementById("audioKokoroCharacterSelect");
  if (kokoroCharacterSelect) {
    kokoroCharacterSelect.addEventListener("change", () => {
      ensureUnlockedByControlGesture();
      setVoiceCharacterProfile(kokoroCharacterSelect.value || "auto_archetype");
      const selectedProfile = getCharacterVoiceProfileOption(kokoroCharacterSelect.value || "auto_archetype");
      setKokoroStatus(
        selectedProfile ? `Preview archetype sample: ${selectedProfile.label}${selectedProfile.description ? ` - ${selectedProfile.description}` : ""}` : "Preview archetype sample updated.",
        "active"
      );
    });
  }
  const previewSceneBtn = document.getElementById("audioPreviewSceneBtn");
  const previewSceneSelect = document.getElementById("audioPreviewSceneSelect");
  if (previewSceneBtn && previewSceneSelect) {
    previewSceneSelect.addEventListener("change", () => {
      audioState.previewSceneSelection = resolveMusicSceneKey(previewSceneSelect.value || "join");
      saveAudioPreferences();
      syncAudioControlUI();
    });
    previewSceneBtn.addEventListener("click", () => {
      ensureUnlockedByControlGesture();
      previewMusicScene(previewSceneSelect.value || "join", { previewMs: 6200 });
      playMessageSound();
    });
  }
  const testMixBtn = document.getElementById("audioTestSoundscapeBtn");
  if (testMixBtn) {
    testMixBtn.addEventListener("click", () => {
      ensureUnlockedByControlGesture();
      runAudioMixSelfTest();
    });
  }
  const quickFab = document.getElementById("audioQuickFab");
  if (quickFab) {
    quickFab.addEventListener("click", () => {
      ensureUnlockedByControlGesture();
      if (!audioState.quickFabDotDismissed) {
        audioState.quickFabDotDismissed = true;
        saveAudioPreferences();
      }
      setAudioQuickPanelOpen(!audioState.quickPanelOpen);
    });
  }
  const quickClose = document.getElementById("audioQuickCloseBtn");
  if (quickClose) {
    quickClose.addEventListener("click", () => setAudioQuickPanelOpen(false));
  }
  if (!audioState.globalAudioHandlersBound) {
    audioState.globalAudioHandlersBound = true;
    document.addEventListener("screenChanged", (event) => {
      const screenId = event && event.detail ? event.detail.screenId : "";
      const scene = mapScreenToMusicScene(screenId);
      audioState.currentScreenScene = scene;
      if (audioState.musicPreviewActive) {
        stopMusicScenePreview({ restore: false });
      }
      if (!audioState.musicPreviewTimer && !audioState.musicPreviewActive) {
        setMusicScene(scene, { force: true });
      }
      if (screenId !== "lobby") {
        setAudioQuickPanelOpen(false);
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (!audioState.quickPanelOpen) return;
      const panel = document.getElementById("audioQuickPanel");
      const fab = document.getElementById("audioQuickFab");
      const target = event.target;
      if (!panel || !fab) return;
      if (panel.contains(target) || fab.contains(target)) return;
      setAudioQuickPanelOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && audioState.quickPanelOpen) {
        setAudioQuickPanelOpen(false);
      }
    });
    window.addEventListener("pageshow", () => {
      if (audioState.unlocked) {
        ensureAudioRunning();
        applyAudioLevels();
        syncMusicLoopState();
      }
    });
  }
  audioState.controlsInitialized = true;
  applyAudioLevels();
  syncMusicLoopState();
  void ensureVoiceManagerInitialized();
  syncVoiceManagerState();
  if (!KOKORO_ONLY_VOICE_SYSTEM) {
    ensureSpeechVoicesLoadedSoon();
  }
}
var startupBootstrapState = {
  started: false,
  completed: false,
  deferredStarted: false,
  forceReleaseTimerId: null,
  total: 0,
  done: 0,
  currentLabel: "",
  detail: "",
  taskIndex: /* @__PURE__ */ new Map(),
  tasks: []
};
function dismissInitialStartupOverlay() {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return;
  overlay.classList.remove("active");
  overlay.setAttribute("aria-hidden", "true");
}
function forceReleaseStartupInteractivity(reason = "") {
  const panel = document.getElementById("startupBootstrapPanel");
  if (panel) panel.hidden = true;
  setStartupBootstrapLock(false);
  dismissInitialStartupOverlay();
  if (startupBootstrapState.forceReleaseTimerId) {
    window.clearTimeout(startupBootstrapState.forceReleaseTimerId);
    startupBootstrapState.forceReleaseTimerId = null;
  }
}
function resetStartupBootstrapTasks(taskDefs = []) {
  startupBootstrapState.tasks = [];
  startupBootstrapState.taskIndex = /* @__PURE__ */ new Map();
  (Array.isArray(taskDefs) ? taskDefs : []).forEach((task, index) => {
    const key = String(task && task.key || `task-${index}`);
    const entry = {
      key,
      label: String(task && task.label || key),
      phase: String(task && task.phase || "blocking"),
      status: "pending",
      detail: ""
    };
    startupBootstrapState.taskIndex.set(key, startupBootstrapState.tasks.length);
    startupBootstrapState.tasks.push(entry);
  });
}
function setStartupBootstrapTaskStatus(taskKey = "", status = "pending", detail = "") {
  const key = String(taskKey || "");
  if (!key || !(startupBootstrapState.taskIndex instanceof Map)) return;
  const idx = startupBootstrapState.taskIndex.get(key);
  if (!Number.isFinite(idx)) return;
  const current = startupBootstrapState.tasks[idx];
  if (!current) return;
  startupBootstrapState.tasks[idx] = {
    ...current,
    status: String(status || "pending"),
    detail: String(detail || "")
  };
}
function renderStartupBootstrapTasks() {
  const listEl = document.getElementById("startupBootstrapSteps");
  if (!listEl) return;
  const tasks = Array.isArray(startupBootstrapState.tasks) ? startupBootstrapState.tasks : [];
  const sig = tasks.map((task) => `${task.key}|${task.status}|${task.detail}`).join("||");
  if (listEl.dataset.sig === sig) return;
  const frag = document.createDocumentFragment();
  tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = `startup-bootstrap-step is-${String(task.status || "pending")}`;
    const badge = document.createElement("span");
    badge.className = "startup-bootstrap-step-badge";
    badge.textContent = task.phase === "deferred" ? "BG" : "NOW";
    const label = document.createElement("span");
    label.className = "startup-bootstrap-step-label";
    label.textContent = task.label;
    li.appendChild(badge);
    li.appendChild(label);
    if (task.detail) {
      const detail = document.createElement("span");
      detail.className = "startup-bootstrap-step-detail";
      detail.textContent = task.detail;
      li.appendChild(detail);
    }
    frag.appendChild(li);
  });
  listEl.innerHTML = "";
  listEl.appendChild(frag);
  listEl.dataset.sig = sig;
}
function setStartupBootstrapLock(active = false) {
  const on = active === true;
  try {
    document.body.classList.toggle("startup-preflight-active", on);
  } catch (error) {
  }
}
function updateStartupBootstrapUi(done = 0, total = 0, label = "", detail = "") {
  const panel = document.getElementById("startupBootstrapPanel");
  const status = document.getElementById("startupBootstrapStatus");
  const detailEl = document.getElementById("startupBootstrapDetail");
  const fill = document.getElementById("startupBootstrapFill");
  const count = document.getElementById("startupBootstrapCount");
  const bar = document.querySelector("#startupBootstrapPanel .startup-bootstrap-bar");
  if (!panel) return;
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeDone = Math.max(0, Math.min(safeTotal, Number(done) || 0));
  const pct = Math.round(safeDone / safeTotal * 100);
  const finalizedAndHidden = startupBootstrapState.completed === true && panel.hidden === true;
  startupBootstrapState.currentLabel = String(label || startupBootstrapState.currentLabel || "");
  const kokoroLoadingDetail = audioState.kokoroLoading ? String(audioState.kokoroLoadProgressText || "").trim() : "";
  startupBootstrapState.detail = String(detail || kokoroLoadingDetail || "");
  if (!finalizedAndHidden) {
    panel.hidden = false;
    setStartupBootstrapLock(true);
  }
  panel.classList.toggle("is-done", safeDone >= safeTotal);
  if (status) status.textContent = label || (safeDone >= safeTotal ? "Startup ready. Join anytime." : "Warming local game services...");
  if (detailEl) {
    detailEl.textContent = startupBootstrapState.detail || (safeDone >= safeTotal ? "Non-critical warmups continue in the background with low priority." : "Preparing local audio, music, and voice systems for fast first interaction.");
  }
  if (fill) fill.style.width = `${pct}%`;
  if (bar) bar.setAttribute("aria-valuenow", String(pct));
  if (count) count.textContent = `${safeDone}/${safeTotal}`;
  renderStartupBootstrapTasks();
}
function hideStartupBootstrapUiSoon() {
  const panel = document.getElementById("startupBootstrapPanel");
  if (!panel) {
    forceReleaseStartupInteractivity("panel-missing");
    return;
  }
  window.setTimeout(() => {
    forceReleaseStartupInteractivity("normal-complete");
    scheduleMobileTouchAudioHint({ delayMs: 650 });
  }, 900);
}
function seedAudioSceneFromActiveScreen({ syncUi = false } = {}) {
  const activeScreen = document.querySelector(".screen.active");
  const activeScreenId = activeScreen && activeScreen.id ? String(activeScreen.id) : "join";
  const scene = resolveMusicSceneKey(mapScreenToMusicScene(activeScreenId));
  audioState.currentScreenScene = scene;
  audioState.currentMusicScene = scene;
  if (!audioState.previewSceneSelection) {
    audioState.previewSceneSelection = scene;
  }
  if (syncUi) syncAudioControlUI();
}
async function ensureJoinEvalPlaquesReady({ source = "startup-bootstrap", bridgeWaitMs = 1200, preload = true } = {}) {
  const resolvePrepareFn = () => {
    if (typeof window.prepareJoinEvalPlaques === "function") return window.prepareJoinEvalPlaques;
    if (window.JoinEvalPlaques && typeof window.JoinEvalPlaques.prepare === "function") return window.JoinEvalPlaques.prepare;
    return null;
  };
  let prepareFn = resolvePrepareFn();
  if (!prepareFn) {
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try {
          document.removeEventListener("joinEvalPlaquesBridgeReady", onBridgeReady);
        } catch (error) {
        }
        window.clearTimeout(timerId);
        resolve();
      };
      const onBridgeReady = () => finish();
      const timerId = window.setTimeout(() => finish(), Math.max(250, Number(bridgeWaitMs) || 1200));
      try {
        document.addEventListener("joinEvalPlaquesBridgeReady", onBridgeReady, { once: true });
      } catch (error) {
      }
    });
    prepareFn = resolvePrepareFn();
  }
  if (!prepareFn) {
    return { ok: false, skipped: "join-eval-bridge-missing" };
  }
  try {
    const result = await Promise.resolve(prepareFn({
      source,
      preload: preload !== false
    }));
    if (result && typeof result === "object") return result;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: String(error && (error.message || error) || "join-eval-prep-failed")
    };
  }
}
async function warmNarrationArchetypeRouting({ source = "startup-archetype-routing" } = {}) {
  const archetypes = Object.values(ARCHETYPES || {}).map((value) => String(value || "").trim()).filter(Boolean);
  if (!archetypes.length) return { ok: true, warmed: 0, uniqueVoices: 0 };
  const uniqueVoiceIds = /* @__PURE__ */ new Set();
  let warmed = 0;
  for (let i = 0; i < archetypes.length; i += 1) {
    const archetype = archetypes[i];
    const spec = buildKokoroCuePlaybackSpec({
      id: `startup-archetype-${archetype.toLowerCase()}`,
      type: "entry",
      text: `${archetype} voice route primed.`,
      subtitleText: `Startup archetype warmup (${archetype})`,
      archetype,
      intensity: 0.7,
      priority: 30,
      dedupeKey: `startup-archetype:${archetype.toLowerCase()}`,
      allowLiveGenerate: false,
      speechSpec: {
        voiceStyle: "cinematic",
        rate: 1,
        pitch: 1,
        gain: 0.9
      }
    });
    if (spec && spec.voiceId) {
      warmed += 1;
      uniqueVoiceIds.add(String(spec.voiceId));
    }
    if (i < archetypes.length - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }
  return {
    ok: warmed > 0,
    warmed,
    total: archetypes.length,
    uniqueVoices: uniqueVoiceIds.size,
    source
  };
}
async function runStartupBootstrapPreflight() {
  if (startupBootstrapState.started) return;
  startupBootstrapState.started = true;
  setStartupBootstrapLock(true);
  dismissInitialStartupOverlay();
  if (startupBootstrapState.forceReleaseTimerId) {
    window.clearTimeout(startupBootstrapState.forceReleaseTimerId);
  }
  startupBootstrapState.forceReleaseTimerId = window.setTimeout(() => {
    forceReleaseStartupInteractivity("watchdog-timeout");
  }, 12e3);
  const runWithSoftTimeout = (promiseFactory, {
    timeoutMs = 2500,
    timeoutCode = "timeout"
  } = {}) => new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, softTimeout: true, code: timeoutCode, timeoutMs });
    }, Math.max(250, Number(timeoutMs) || 2500));
    Promise.resolve().then(() => promiseFactory()).then((value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    }).catch((error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    });
  });
  const constrainedMobileStartup = isConstrainedMobileStartupDevice();
  const blockVoiceWarmups = true;
  const blockingTaskList = [
    {
      key: "join-eval-plaques",
      label: "Join eval visuals",
      run: async () => runWithSoftTimeout(
        () => ensureJoinEvalPlaquesReady({
          source: "startup-blocking-join-eval",
          preload: !constrainedMobileStartup
        }),
        { timeoutMs: 3200, timeoutCode: "join-eval-soft-timeout" }
      )
    }
  ];
  blockingTaskList.push({
    key: "kokoro-kickoff",
    label: "Adaptive voice kickoff",
    run: async () => {
      if (audioState.voiceEnabled === false) return { ok: true, skipped: "voice-disabled" };
      return runWithSoftTimeout(
        async () => {
          await ensureVoiceManagerInitialized().catch(() => null);
          return ensureKokoroStartupWarmup({ source: "startup-kickoff-core" });
        },
        { timeoutMs: 1100, timeoutCode: "voice-kickoff-soft-timeout" }
      );
    }
  });
  if (blockVoiceWarmups) {
    blockingTaskList.push(
      {
        key: "kokoro-core",
        label: "Adaptive voice router",
        run: async () => {
          if (audioState.voiceEnabled === false) return { ok: true, skipped: "voice-disabled" };
          return runWithSoftTimeout(
            async () => {
              await ensureVoiceManagerInitialized().catch(() => null);
              return ensureKokoroStartupWarmup({ source: "startup-blocking-core" });
            },
            { timeoutMs: 3200, timeoutCode: "voice-core-soft-timeout" }
          );
        }
      },
      {
        key: "kokoro-cast",
        label: "Voice cast prep (4 voices)",
        run: async () => {
          if (audioState.voiceEnabled === false) return { ok: true, skipped: "voice-disabled" };
          return runWithSoftTimeout(async () => {
            await ensureKokoroStartupWarmup({ source: "startup-blocking-cast-core" });
            const [castResult, previewResult] = await Promise.allSettled([
              ensureKokoroFullCastWarmup({ source: "startup-blocking-cast" }),
              ensureKokoroHostPreviewClipWarmup({ source: "startup-blocking-preview", deferIfBusy: false })
            ]);
            return {
              ok: true,
              castResult: castResult.status === "fulfilled" ? castResult.value : { ok: false, error: String(castResult.reason && castResult.reason.message || castResult.reason || "cast-failed") },
              previewResult: previewResult.status === "fulfilled" ? previewResult.value : { ok: false, error: String(previewResult.reason && previewResult.reason.message || previewResult.reason || "preview-failed") }
            };
          }, { timeoutMs: constrainedMobileStartup ? 7e3 : 5600, timeoutCode: "voice-cast-soft-timeout" });
        }
      },
      {
        key: "kokoro-preview-clips",
        label: "Narration archetype previews",
        run: async () => {
          if (audioState.voiceEnabled === false) return { ok: true, skipped: "voice-disabled" };
          return runWithSoftTimeout(async () => {
            await ensureKokoroStartupWarmup({ source: "startup-preview-cues-core" });
            const cues = getVoiceStudioPreviewWarmupCues();
            let warmed = 0;
            for (let i = 0; i < cues.length; i += 1) {
              const result = await prefetchKokoroCueClipNow(cues[i], { source: "startup-lobby-preview-cues" });
              if (result && result.ok) warmed += 1;
              if (i < cues.length - 1) {
                await new Promise((resolve) => window.setTimeout(resolve, 16));
              }
            }
            return { ok: warmed > 0, warmed, total: cues.length };
          }, { timeoutMs: constrainedMobileStartup ? 6e3 : 4200, timeoutCode: "voice-preview-cues-soft-timeout" });
        }
      },
      {
        key: "archetype-routing",
        label: "Archetype voice routing",
        run: async () => runWithSoftTimeout(
          () => warmNarrationArchetypeRouting({ source: "startup-blocking-archetypes" }),
          { timeoutMs: 1800, timeoutCode: "archetype-routing-soft-timeout" }
        )
      }
    );
  }
  blockingTaskList.push({
    key: "music-tracks",
    label: "Join + lobby music paths",
    run: async () => runWithSoftTimeout(
      () => Promise.all([
        probeManagedMediaUrl(`/audio/${encodeAudioPathSegment("DeepUrbanHouse - Join.mp3")}`),
        probeManagedMediaUrl(`/audio/${encodeAudioPathSegment("HipHop - Lobby.mp3")}`)
      ]),
      { timeoutMs: 1800, timeoutCode: "music-paths-soft-timeout" }
    )
  });
  const deferredTaskList = [
    {
      key: "kokoro-cast-topoff",
      label: "Voice cache top-off",
      run: async () => {
        if (audioState.voiceEnabled === false) return null;
        await ensureKokoroStartupWarmup({ source: "startup-deferred-core-topoff" });
        const [cast, preview] = await Promise.allSettled([
          ensureKokoroFullCastWarmup({ source: "startup-deferred-cast-topoff" }),
          ensureKokoroHostPreviewClipWarmup({ source: "startup-deferred-preview-topoff", deferIfBusy: false })
        ]);
        return { cast, preview };
      }
    },
    {
      key: "kokoro-preview-topoff",
      label: "Lobby preview cache top-off",
      run: async () => {
        if (audioState.voiceEnabled === false) return null;
        const cues = getVoiceStudioPreviewWarmupCues();
        for (let i = 0; i < cues.length; i += 1) {
          try {
            await prefetchKokoroCueClipNow(cues[i], { source: "startup-lobby-preview-topoff" });
          } catch (error) {
          }
          if (i < cues.length - 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 20));
          }
        }
        return { warmed: cues.length };
      }
    },
    {
      key: "pack-catalog",
      label: "Pack catalog",
      run: async () => fetch("/api/packs", { cache: "force-cache" }).then((r) => r && r.ok ? r.json() : null)
    },
    {
      key: "categories-catalog",
      label: "Categories catalog",
      run: async () => {
        await loadCategoryRegistryCatalog();
        return { ok: true };
      }
    },
    {
      key: "pack-metrics",
      label: "Pack metrics",
      run: async () => fetch("/api/packs/metrics", { cache: "force-cache" }).then((r) => r && r.ok ? r.json() : null)
    },
    {
      key: "clip-manifest",
      label: "Callout phrase rules",
      run: async () => ({ mode: "phrase-association", version: 1 })
    },
    {
      key: "clip-resolver",
      label: "Callout phrase engine",
      run: async () => {
        setAudioPreviewStatus("Character callouts use instant category phrases with archetype voice shaping.", "info");
        return { mode: "phrase-association", ready: true };
      }
    }
  ];
  resetStartupBootstrapTasks([
    ...blockingTaskList.map((task) => ({ key: task.key, label: task.label, phase: "blocking" })),
    ...deferredTaskList.map((task) => ({ key: task.key, label: task.label, phase: "deferred" }))
  ]);
  startupBootstrapState.total = blockingTaskList.length;
  startupBootstrapState.done = 0;
  updateStartupBootstrapUi(
    0,
    blockingTaskList.length,
    "Preparing join screen...",
    blockVoiceWarmups ? "Loading eval visuals, music, and adaptive voice cast before the join screen opens. Non-critical caches continue in the background." : "Loading essentials for faster mobile join. Voice and cache warmups continue in the background."
  );
  for (let i = 0; i < blockingTaskList.length; i += 1) {
    const task = blockingTaskList[i];
    setStartupBootstrapTaskStatus(task.key, "active");
    updateStartupBootstrapUi(
      startupBootstrapState.done,
      blockingTaskList.length,
      `Warming ${task.label}...`,
      ""
    );
    try {
      const startedAt = Date.now();
      const taskResult = await task.run();
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      let detail = `${elapsedMs}ms`;
      if (task.key === "join-eval-plaques") {
        const plaqueCount = Math.max(0, Number(taskResult && taskResult.plaqueCount) || 0);
        const decodedPortraits = Math.max(0, Number(taskResult && taskResult.decodedPortraits) || 0);
        const label = taskResult && taskResult.softTimeout ? "continuing in background" : `${plaqueCount || 18} plaques staged, ${decodedPortraits} portraits decoded`;
        detail = `${label} (${elapsedMs}ms)`;
      } else if (task.key === "kokoro-core") {
        const mode = audioState.kokoroDevice || "adaptive";
        const status = taskResult && taskResult.softTimeout ? "continuing in background" : audioState.kokoroReady ? "router ready" : "voice pending";
        detail = `${status} (${mode}, ${elapsedMs}ms)`;
      } else if (task.key === "kokoro-kickoff") {
        const mode = audioState.kokoroDevice || "adaptive";
        const status = taskResult && taskResult.softTimeout ? "kickoff started (continuing in background)" : audioState.kokoroReady ? "router ready" : "kickoff queued";
        detail = `${status} (${mode}, ${elapsedMs}ms)`;
      } else if (task.key === "kokoro-cast") {
        const prepared = Math.max(0, Number(audioState.kokoroWarmupWarmedCount) || 0);
        const label = taskResult && taskResult.softTimeout ? "continuing in background" : `${prepared}/4 prepared`;
        detail = `${label} (${elapsedMs}ms)`;
      } else if (task.key === "kokoro-preview-clips") {
        const warmed = Number(taskResult && taskResult.warmed) || 0;
        const total = Math.max(1, Number(taskResult && taskResult.total) || 5);
        const label = taskResult && taskResult.softTimeout ? "continuing in background" : `${warmed}/${total} preview clips cached`;
        detail = `${label} (${elapsedMs}ms)`;
      } else if (task.key === "archetype-routing") {
        const warmed = Math.max(0, Number(taskResult && taskResult.warmed) || 0);
        const total = Math.max(1, Number(taskResult && taskResult.total) || 1);
        const uniqueVoices = Math.max(0, Number(taskResult && taskResult.uniqueVoices) || 0);
        const label = taskResult && taskResult.softTimeout ? "continuing in background" : `${warmed}/${total} archetypes mapped (${uniqueVoices} voices)`;
        detail = `${label} (${elapsedMs}ms)`;
      } else if (task.key === "music-tracks") {
        detail = `verified local audio files (${elapsedMs}ms)`;
      }
      setStartupBootstrapTaskStatus(task.key, "done", detail);
    } catch (error) {
      setStartupBootstrapTaskStatus(task.key, "error", String(error && (error.message || error) || "failed"));
    } finally {
      if (startupBootstrapState.taskIndex.get(task.key) != null && (!Array.isArray(startupBootstrapState.tasks) || startupBootstrapState.tasks[startupBootstrapState.taskIndex.get(task.key)]?.status !== "error") && startupBootstrapState.tasks[startupBootstrapState.taskIndex.get(task.key)]?.status !== "done") {
        setStartupBootstrapTaskStatus(task.key, "done");
      }
      startupBootstrapState.done += 1;
      updateStartupBootstrapUi(startupBootstrapState.done, blockingTaskList.length, startupBootstrapState.done >= blockingTaskList.length ? blockVoiceWarmups ? "Join screen ready. Voice cast prepared and instant preview path armed." : "Join screen ready. Voice warmups continue in background for smoother mobile startup." : `Warming ${task.label}...`, "");
    }
  }
  startupBootstrapState.completed = true;
  hideStartupBootstrapUiSoon();
  if (!startupBootstrapState.deferredStarted) {
    startupBootstrapState.deferredStarted = true;
    const launchDeferred = () => {
      (async () => {
        for (let index = 0; index < deferredTaskList.length; index += 1) {
          const task = deferredTaskList[index];
          try {
            setStartupBootstrapTaskStatus(task.key, "active");
            renderStartupBootstrapTasks();
            if (index > 0) {
              await new Promise((resolve) => window.setTimeout(resolve, 120));
            }
            await task.run();
            if (task.key === "kokoro-cast-topoff") {
              const warmed = Number(audioState.kokoroWarmupWarmedCount) || 0;
              setStartupBootstrapTaskStatus(task.key, "done", `voice cast top-off complete (${warmed}/4 prepared)`);
            } else {
              setStartupBootstrapTaskStatus(task.key, "done");
            }
          } catch (error) {
            setStartupBootstrapTaskStatus(task.key, "error", String(error && (error.message || error) || "failed"));
          } finally {
            renderStartupBootstrapTasks();
          }
        }
      })();
    };
    window.setTimeout(() => {
      launchDeferred();
    }, 650);
  }
}
loadAudioPreferences();
seedAudioSceneFromActiveScreen();
publishGlobalAudioBridge();
function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext = new AudioCtor();
  return audioContext;
}
function initializeAudioGraph() {
  const ctx = getAudioContext();
  if (!ctx || audioState.masterGain) return;
  audioState.masterGain = ctx.createGain();
  audioState.sfxGain = ctx.createGain();
  audioState.musicGain = ctx.createGain();
  audioState.revealGain = ctx.createGain();
  audioState.cardGain = ctx.createGain();
  audioState.masterGain.gain.value = audioState.muted ? 0 : audioState.masterVolume;
  audioState.sfxGain.gain.value = audioState.sfxEnabled ? audioState.sfxVolume : 0;
  audioState.musicGain.gain.value = audioState.musicEnabled ? audioState.musicVolume : 0;
  audioState.revealGain.gain.value = audioState.revealEnabled ? audioState.revealVolume : 0;
  audioState.cardGain.gain.value = audioState.cardEnabled ? audioState.cardVolume : 0;
  audioState.sfxGain.connect(audioState.masterGain);
  audioState.musicGain.connect(audioState.masterGain);
  audioState.revealGain.connect(audioState.masterGain);
  audioState.cardGain.connect(audioState.masterGain);
  audioState.masterGain.connect(ctx.destination);
  ensureMusicDecks().forEach((deck) => {
    ensureMusicDeckWebAudioRouting(deck);
  });
}
function ensureAudioRunning() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  initializeAudioGraph();
  if (ctx.state === "running") return true;
  ctx.resume().catch(() => {
  });
  return false;
}
function getAudioBusGain(bus = "sfx") {
  const meta = getAudioCategoryMeta(bus);
  return audioState[meta.gainKey] || audioState.sfxGain || null;
}
function scheduleTone({
  frequency = 440,
  frequencyEnd = null,
  duration = 120,
  type = "sine",
  volume = 0.2,
  attack = 8e-3,
  release = 0.09,
  when = null,
  retryOnResume = true,
  bus = "sfx",
  pan = 0
} = {}) {
  const ctx = getAudioContext();
  if (!ctx) return;
  initializeAudioGraph();
  if (ctx.state !== "running") {
    if (!retryOnResume) return;
    ctx.resume().then(() => {
      scheduleTone({
        frequency,
        frequencyEnd,
        duration,
        type,
        volume,
        attack,
        release,
        when,
        retryOnResume: false,
        bus,
        pan
      });
    }).catch(() => {
    });
    return;
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const targetGain = getAudioBusGain(bus);
  let tailNode = gain;
  osc.connect(gain);
  if (typeof ctx.createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.value = clampAudioPan(pan);
    gain.connect(panner);
    tailNode = panner;
  }
  if (targetGain) {
    tailNode.connect(targetGain);
  } else {
    tailNode.connect(ctx.destination);
  }
  const startAt = Math.max(ctx.currentTime + 2e-3, Number(when) || ctx.currentTime);
  const lengthSec = Math.max(0.03, duration / 1e3);
  const attackSec = Math.max(3e-3, attack);
  const releaseSec = Math.max(0.03, release);
  const peak = Math.max(1e-4, volume);
  osc.frequency.setValueAtTime(Math.max(20, Number(frequency) || 440), startAt);
  osc.type = type;
  if (Number.isFinite(Number(frequencyEnd)) && Number(frequencyEnd) > 20) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, Number(frequencyEnd)), startAt + Math.max(0.02, lengthSec * 0.92));
  }
  gain.gain.setValueAtTime(1e-4, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + attackSec);
  gain.gain.exponentialRampToValueAtTime(1e-4, startAt + lengthSec + releaseSec);
  osc.start(startAt);
  osc.stop(startAt + lengthSec + releaseSec + 0.01);
}
function runNoteSequence(sequence = [], stepMs = 70, options = {}) {
  if (!Array.isArray(sequence) || !sequence.length) return;
  const defaultBus = options && options.bus ? options.bus : "sfx";
  const baseDelayMs = Math.max(0, Number(options && options.baseDelayMs) || 0);
  sequence.forEach((note, idx) => {
    const at = baseDelayMs + idx * stepMs;
    window.setTimeout(() => {
      scheduleTone({
        frequency: note.frequency,
        frequencyEnd: note.frequencyEnd,
        duration: note.duration,
        type: note.type,
        volume: note.volume,
        attack: note.attack,
        release: note.release,
        bus: note.bus || defaultBus,
        pan: note.pan
      });
    }, at);
  });
}
function playDraftSound() {
  runNoteSequence([
    { frequency: 622, duration: 90, type: "triangle", volume: 0.16 },
    { frequency: 740, duration: 90, type: "triangle", volume: 0.16 },
    { frequency: 880, duration: 130, type: "sine", volume: 0.17 }
  ], 62);
}
function playVoteSound() {
  runNoteSequence([
    { frequency: 330, duration: 65, type: "square", volume: 0.14 },
    { frequency: 392, duration: 70, type: "square", volume: 0.14 },
    { frequency: 494, duration: 95, type: "triangle", volume: 0.15 }
  ], 70);
}
function playWinSound() {
  runNoteSequence([
    { frequency: 523.3, duration: 160, type: "triangle", volume: 0.18 },
    { frequency: 659.3, duration: 170, type: "triangle", volume: 0.18 },
    { frequency: 784, duration: 210, type: "triangle", volume: 0.18 },
    { frequency: 1046.5, duration: 280, type: "sine", volume: 0.16 }
  ], 130, { bus: "reveal" });
}
function playErrorSound() {
  runNoteSequence([
    { frequency: 280, duration: 100, type: "sawtooth", volume: 0.16 },
    { frequency: 220, duration: 120, type: "sawtooth", volume: 0.16 }
  ], 95);
}
function playJoinSound() {
  runNoteSequence([
    { frequency: 392, duration: 110, type: "triangle", volume: 0.14 },
    { frequency: 523.3, duration: 130, type: "triangle", volume: 0.14 }
  ], 90);
}
function playReadyToggleSound(isReady = true) {
  if (isReady) {
    runNoteSequence([
      { frequency: 494, duration: 90, type: "triangle", volume: 0.13 },
      { frequency: 659.3, duration: 120, type: "triangle", volume: 0.13 }
    ], 90);
  } else {
    runNoteSequence([
      { frequency: 392, duration: 80, type: "triangle", volume: 0.12 },
      { frequency: 349.2, duration: 100, type: "triangle", volume: 0.12 }
    ], 90);
  }
}
function playPhaseShiftSound() {
  runNoteSequence([
    { frequency: 220, duration: 120, type: "sawtooth", volume: 0.11 },
    { frequency: 277.2, duration: 120, type: "triangle", volume: 0.12 },
    { frequency: 329.6, duration: 150, type: "triangle", volume: 0.12 }
  ], 110, { bus: "reveal" });
}
function playTwistSound() {
  runNoteSequence([
    { frequency: 220, duration: 80, type: "square", volume: 0.13 },
    { frequency: 293.7, duration: 70, type: "square", volume: 0.13 },
    { frequency: 196, duration: 120, type: "sawtooth", volume: 0.13 },
    { frequency: 370, duration: 140, type: "triangle", volume: 0.12 }
  ], 75, { bus: "reveal" });
}
function playCountdownTick(secondValue) {
  const sec = Number(secondValue);
  if (sec <= 1) {
    scheduleTone({ frequency: 880, duration: 140, type: "square", volume: 0.15, bus: "reveal" });
    return;
  }
  scheduleTone({ frequency: 660, duration: 80, type: "square", volume: 0.13, bus: "reveal" });
}
function playMessageSound() {
  runNoteSequence([
    { frequency: 659.3, duration: 55, type: "sine", volume: 0.1 },
    { frequency: 784, duration: 60, type: "sine", volume: 0.1 }
  ], 55);
}
function playSliceInteractionSound(tone = "core", cleared = false) {
  if (cleared) {
    scheduleTone({ frequency: 340, duration: 55, type: "triangle", volume: 0.1 });
    return;
  }
  if (tone === "vote") {
    runNoteSequence([
      { frequency: 470, duration: 50, type: "square", volume: 0.11 },
      { frequency: 560, duration: 65, type: "triangle", volume: 0.11 }
    ], 45);
    return;
  }
  if (tone === "intel") {
    runNoteSequence([
      { frequency: 620, duration: 55, type: "triangle", volume: 0.11 },
      { frequency: 740, duration: 70, type: "sine", volume: 0.11 }
    ], 45);
    return;
  }
  runNoteSequence([
    { frequency: 390, duration: 50, type: "sawtooth", volume: 0.11 },
    { frequency: 440, duration: 70, type: "triangle", volume: 0.1 }
  ], 45);
}
function playLoadingMilestoneSound(percent = 0) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  const frequency = 300 + Math.round(safe / 100 * 360);
  scheduleTone({ frequency, duration: 52, type: "triangle", volume: 0.085, bus: "reveal" });
}
function playFetchCompleteSound(success = true) {
  if (success === false) {
    scheduleTone({ frequency: 250, duration: 60, type: "sawtooth", volume: 0.095, bus: "reveal" });
    return;
  }
  runNoteSequence([
    { frequency: 700, duration: 50, type: "sine", volume: 0.095 },
    { frequency: 820, duration: 65, type: "triangle", volume: 0.095 }
  ], 40, { bus: "reveal" });
}
function getHtmlUnlockAudioElement() {
  if (audioState.htmlUnlockElement) return audioState.htmlUnlockElement;
  try {
    const el = new Audio();
    el.preload = "auto";
    el.loop = false;
    el.muted = true;
    el.volume = 0;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    const dataUri = buildSilentWavDataUri(110);
    if (dataUri) el.src = dataUri;
    audioState.htmlUnlockElement = el;
    return el;
  } catch (error) {
    return null;
  }
}
function shouldWarmManagedMediaForIos() {
  try {
    const ua = String(navigator.userAgent || "");
    const platform = String(navigator.platform || "");
    const touchPoints = Number(navigator.maxTouchPoints) || 0;
    const isIPhoneIPadIPod = /iphone|ipad|ipod/i.test(ua);
    const isIPadDesktopMode = /MacIntel/i.test(platform) && touchPoints > 1;
    return isIPhoneIPadIPod || isIPadDesktopMode;
  } catch (error) {
    return false;
  }
}
function tryUnlockHtmlMediaStack() {
  if (audioState.htmlMediaUnlocked) return;
  const media = getHtmlUnlockAudioElement();
  if (!media) return;
  try {
    const result = media.play();
    if (result && typeof result.then === "function") {
      result.then(() => {
        audioState.htmlMediaUnlocked = true;
        media.pause();
        media.currentTime = 0;
        primeManagedHtmlAudioElementsForUnlock({ force: true });
        syncAudioControlUI();
        syncMusicLoopState({ transition: "fast" });
        maybeCleanupAudioUnlockHandlers();
      }).catch(() => {
      });
      return;
    }
    audioState.htmlMediaUnlocked = true;
    media.pause();
    media.currentTime = 0;
    primeManagedHtmlAudioElementsForUnlock({ force: true });
    syncAudioControlUI();
    syncMusicLoopState({ transition: "fast" });
    maybeCleanupAudioUnlockHandlers();
  } catch (error) {
  }
}
function warmupManagedMediaElementForIos(el) {
  if (!el) return;
  try {
    const isActivelyPlaying = Boolean(!el.paused && !el.ended && Number(el.currentTime) > 0);
    if (isActivelyPlaying) return;
    const warmupToken = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    el.__iosWarmupToken = warmupToken;
    const originalSrc = el.src || "";
    const originalMuted = el.muted;
    const originalVolume = el.volume;
    const originalLoop = el.loop;
    const dataUri = buildSilentWavDataUri(70);
    if (!dataUri) return;
    let restored = false;
    let restoreTimer = null;
    const restoreElement = () => {
      if (restored) return;
      restored = true;
      try {
        if (restoreTimer) {
          window.clearTimeout(restoreTimer);
          restoreTimer = null;
        }
      } catch (timerError) {
      }
      const currentSrc = String(el.src || "");
      const stillWarmupSrc = currentSrc.startsWith("data:audio/");
      if (!stillWarmupSrc) {
        return;
      }
      try {
        if (el.__iosWarmupToken !== warmupToken) return;
        el.pause();
      } catch (pauseError) {
      }
      try {
        if (el.__iosWarmupToken !== warmupToken) return;
        el.currentTime = 0;
      } catch (timeError) {
      }
      try {
        if (el.__iosWarmupToken !== warmupToken) return;
        el.src = originalSrc;
        el.loop = originalLoop;
        el.muted = originalMuted;
        el.volume = originalVolume;
        if (el.__iosWarmupToken === warmupToken) {
          el.__iosWarmupToken = "";
        }
      } catch (restoreError) {
      }
    };
    el.loop = false;
    el.muted = true;
    el.volume = 0;
    el.src = dataUri;
    restoreTimer = window.setTimeout(restoreElement, 900);
    const maybe = el.play();
    if (maybe && typeof maybe.then === "function") {
      maybe.then(() => {
        try {
          restoreElement();
        } catch (error) {
        }
      }).catch(() => {
        restoreElement();
      });
      return;
    }
    restoreElement();
  } catch (error) {
  }
}
function primeManagedHtmlAudioElementsForUnlock(options = {}) {
  if (!shouldWarmManagedMediaForIos()) return;
  const force = options && options.force === true;
  const markPrimed = !(options && options.markPrimed === false);
  if (audioState.managedHtmlMediaPrimed && !force) return;
  if (markPrimed) {
    audioState.managedHtmlMediaPrimed = true;
  }
  try {
    ensureMusicDecks().forEach((deck) => {
      if (deck && deck.el) warmupManagedMediaElementForIos(deck.el);
    });
  } catch (error) {
  }
  try {
    const cardEl = ensureCardPlaybackElement();
    if (cardEl) warmupManagedMediaElementForIos(cardEl);
  } catch (error) {
  }
}
function maybeCleanupAudioUnlockHandlers() {
  if (!audioState.unlocked || !audioState.htmlMediaUnlocked) return;
  if (typeof audioState.listenerCleanup === "function") {
    audioState.listenerCleanup();
    audioState.listenerCleanup = null;
  }
}
function unlockAudioFromGesture(event = null) {
  const startupPanel = document.getElementById("startupBootstrapPanel");
  const startupBlockingJoin = document.body.classList.contains("startup-preflight-active") && startupPanel && startupPanel.hidden !== true;
  if (startupBlockingJoin) {
    return;
  }
  const needsVoiceUnlock = audioState.voiceUnlocked !== true;
  const needsWebAudioUnlock = audioState.unlocked !== true;
  const needsHtmlMediaUnlock = audioState.htmlMediaUnlocked !== true;
  const fullyUnlocked = !needsVoiceUnlock && !needsWebAudioUnlock && !needsHtmlMediaUnlock;
  if (fullyUnlocked) {
    maybeCleanupAudioUnlockHandlers();
    return;
  }
  if (audioState.kokoroEnabled === true && audioState.voiceEnabled !== false && (needsVoiceUnlock || audioState.kokoroCastWarmupDone !== true) && Date.now() - Number(kokoroGesturePrimeAt || 0) > 1200) {
    kokoroGesturePrimeAt = Date.now();
    try {
      const engine = getKokoroVoiceEngine();
      if (engine && typeof engine.prepareBrowserFallback === "function") {
        void engine.prepareBrowserFallback({
          voiceIds: KOKORO_CURATED_VOICE_IDS,
          primeUtterance: needsVoiceUnlock,
          timeoutMs: 900
        }).catch(() => {
        });
      }
    } catch (_error) {
    }
    if (audioState.kokoroCastWarmupDone !== true) {
      void ensureKokoroFullCastWarmup({ source: "gesture-unlock" }).catch(() => {
      });
    }
  }
  const ctx = getAudioContext();
  try {
    const manager = getVoiceManager();
    if (manager) {
      void manager.init();
      manager.unlock();
    }
  } catch (voiceError) {
  }
  if (!ctx) {
    if (needsHtmlMediaUnlock) {
      tryUnlockHtmlMediaStack();
    }
    syncAudioControlUI();
    return;
  }
  initializeAudioGraph();
  if (needsHtmlMediaUnlock) {
    tryUnlockHtmlMediaStack();
    if (!audioState.managedHtmlMediaPrimed) {
      primeManagedHtmlAudioElementsForUnlock({ markPrimed: true });
    }
  }
  const onUnlock = () => {
    const wasUnlocked = audioState.unlocked === true;
    audioState.unlocked = true;
    audioState.mobileTouchHintShown = true;
    if (audioState.mobileTouchHintTimer) {
      window.clearTimeout(audioState.mobileTouchHintTimer);
      audioState.mobileTouchHintTimer = null;
    }
    try {
      const manager = getVoiceManager();
      if (manager) manager.unlock();
    } catch (voiceError) {
    }
    applyAudioLevels();
    if (!wasUnlocked) {
      scheduleTone({ frequency: 220, duration: 20, type: "sine", volume: 2e-4, bus: "sfx" });
    }
    if (needsHtmlMediaUnlock && !audioState.managedHtmlMediaPrimed) {
      primeManagedHtmlAudioElementsForUnlock({ markPrimed: true });
    }
    syncMusicLoopState();
    maybeCleanupAudioUnlockHandlers();
  };
  if (ctx.state === "running") {
    onUnlock();
    return;
  }
  ctx.resume().then(onUnlock).catch(() => {
  });
}
function installAudioUnlockHandlers() {
  const handlers = [
    ["pointerdown", unlockAudioFromGesture, { capture: true }],
    ["pointerup", unlockAudioFromGesture, { capture: true }],
    ["touchstart", unlockAudioFromGesture, { passive: true, capture: true }],
    ["touchend", unlockAudioFromGesture, { passive: true, capture: true }],
    ["mousedown", unlockAudioFromGesture, { capture: true }],
    ["click", unlockAudioFromGesture, { capture: true }],
    ["keydown", unlockAudioFromGesture, { capture: true }]
  ];
  handlers.forEach(([eventName, handler, options]) => {
    document.addEventListener(eventName, handler, options);
  });
  audioState.listenerCleanup = () => {
    handlers.forEach(([eventName, handler, options]) => {
      document.removeEventListener(eventName, handler, options);
    });
  };
}
function scheduleMobileTouchAudioHint({ delayMs = 1500 } = {}) {
  if (!isLikelyMobileDevice()) return;
  if (audioState.mobileTouchHintShown) return;
  if (audioState.unlocked || audioState.muted) return;
  if (audioState.mobileTouchHintTimer) return;
  const safeDelayMs = Math.max(200, Number(delayMs) || 1500);
  audioState.mobileTouchHintTimer = window.setTimeout(() => {
    audioState.mobileTouchHintTimer = null;
    if (audioState.mobileTouchHintShown || audioState.unlocked || audioState.muted) return;
    if (document.body.classList.contains("startup-preflight-active")) {
      scheduleMobileTouchAudioHint({ delayMs: 750 });
      return;
    }
    const currentScreen = document.querySelector(".screen.active");
    const activeId = String(currentScreen && currentScreen.id || "").toLowerCase();
    if (activeId && activeId !== "join" && activeId !== "lobby") return;
    audioState.mobileTouchHintShown = true;
    showToast("Tap once anywhere to start music and voice on mobile/iOS.", "info", 3200);
  }, safeDelayMs);
}
function playRound4RevealAccent(profile = null, stage = "impact") {
  const mode = String(profile && profile.audioMode ? profile.audioMode : "none");
  if (mode === "none") return;
  if (stage === "launch") {
    const peak = mode === "elite" ? 0.075 : mode === "intense" ? 0.06 : 0.048;
    scheduleTone({
      frequency: mode === "accent" ? 220 : 170,
      frequencyEnd: mode === "accent" ? 520 : 690,
      duration: 420,
      type: mode === "elite" ? "sawtooth" : "triangle",
      volume: peak,
      attack: 0.02,
      release: 0.12,
      bus: "reveal"
    });
    return;
  }
  const impactPeak = mode === "elite" ? 0.13 : mode === "intense" ? 0.105 : 0.075;
  scheduleTone({
    frequency: mode === "accent" ? 170 : 130,
    frequencyEnd: mode === "accent" ? 84 : 46,
    duration: 240,
    type: mode === "elite" ? "triangle" : "sine",
    volume: impactPeak,
    attack: 0.01,
    release: 0.09,
    bus: "reveal"
  });
  if (mode !== "accent") {
    scheduleTone({
      frequency: mode === "elite" ? 920 : 740,
      frequencyEnd: mode === "elite" ? 620 : 520,
      duration: 100,
      type: "square",
      volume: mode === "elite" ? 0.05 : 0.038,
      attack: 4e-3,
      release: 0.05,
      bus: "reveal",
      pan: 0.18
    });
  }
}
function normalizeCharacterAudioMeta(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const scoreMeta = source.scoreMeta && typeof source.scoreMeta === "object" ? source.scoreMeta : {};
  const infoConfidence = Number(scoreMeta.infoConfidence);
  const resolverConfidence = Number(scoreMeta.resolverConfidence);
  const rawAliases = [].concat(Array.isArray(scoreMeta.aliases) ? scoreMeta.aliases : []).concat(Array.isArray(source.aliases) ? source.aliases : []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean);
  const rawRiskFlags = [].concat(Array.isArray(scoreMeta.riskFlags) ? scoreMeta.riskFlags : []).concat(Array.isArray(source.riskFlags) ? source.riskFlags : []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean);
  return {
    character: String(source.character || source.name || source.topPick || "Unknown").trim() || "Unknown",
    ownerName: String(source.ownerName || source.playerName || source.owner || "").trim(),
    rarity: String(source.rarity || source.rarityLabel || "").trim(),
    ovr: Math.max(0, Math.min(99, Number(source.ovr) || Number(source.finalOVR) || 0)),
    tier: String(source.ovrTierLabel || source.revealTier || source.tier || "").trim(),
    resolvedTitle: String(scoreMeta.resolvedTitle || source.resolvedTitle || "").trim(),
    resolvedSource: String(scoreMeta.resolvedSource || source.infoSource || "").trim(),
    description: String(
      scoreMeta.resolvedDescriptionSnippet || source.resolvedDescriptionSnippet || source.description || source.breakdown && source.breakdown.characterSummary || ""
    ).replace(/\s+/g, " ").trim().slice(0, 700),
    infoConfidence: Number.isFinite(infoConfidence) ? Math.max(0, Math.min(1, infoConfidence)) : 0,
    resolverConfidence: Number.isFinite(resolverConfidence) ? Math.max(0, Math.min(1, resolverConfidence)) : 0,
    aliases: Array.from(new Set(rawAliases)).slice(0, 12),
    riskFlags: Array.from(new Set(rawRiskFlags)).slice(0, 12),
    imageSynthetic: Boolean(scoreMeta.imageSynthetic || source.imageSynthetic)
  };
}
function buildCharacterAudioSignature(input = {}) {
  const meta = normalizeCharacterAudioMeta(input);
  return `${meta.character}|${meta.resolvedTitle}|${meta.ownerName}|${meta.ovr}|${meta.rarity}|${meta.tier}`;
}
var AUDIO_CARD_CALLOUT_RESOLVE_BATCH_URL = "/api/audio-callouts/resolve-batch";
function buildCalloutEngineStatus() {
  return {
    version: 1,
    mode: "phrase-association",
    indexedClipCount: 0,
    manifestClipCount: 0,
    totalResolvableSources: 0,
    libraryEmpty: true,
    librarySignature: String(audioState.cardClipLibrarySignature || "phrase-association-v4"),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function sanitizeCardAudioSlug(text = "") {
  let normalized = String(text || "").trim();
  if (!normalized) return "";
  try {
    normalized = normalized.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  } catch (error) {
  }
  return normalized.toLowerCase().replace(/&/g, " and ").replace(/[\u2019'`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}
function getCardAudioCandidateSlugs(meta) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  const rawCandidates = [
    safeMeta.character,
    safeMeta.resolvedTitle,
    ...Array.isArray(safeMeta.aliases) ? safeMeta.aliases : []
  ];
  const slugs = /* @__PURE__ */ new Set();
  rawCandidates.filter(Boolean).forEach((candidate) => {
    const text = String(candidate).trim();
    if (!text) return;
    const base = text.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const noArticle = base.replace(/^(a|an|the)\s+/i, "").trim();
    [text, base, noArticle].forEach((variantText) => {
      const slug = sanitizeCardAudioSlug(variantText);
      if (slug) slugs.add(slug);
    });
  });
  return Array.from(slugs);
}
function stopCardSpeechFallback() {
  audioState.cardSpeechToken += 1;
  try {
    clearVoiceCues("card-stop", { types: ["entry"], includeActive: true });
  } catch (error) {
  }
  if (voiceManagerInstance) return;
  try {
    if (window.speechSynthesis && typeof window.speechSynthesis.cancel === "function") {
      window.speechSynthesis.cancel();
    }
  } catch (error) {
  }
}
function stopCardPlaybackElement() {
  audioState.cardPlaybackGainScalar = 1;
  audioState.cardPlaybackToken += 1;
}
function getCardSnippetCacheKey(meta = {}, options = {}) {
  const slugs = getCardAudioCandidateSlugs(meta);
  const resolvedSlug = sanitizeCardAudioSlug(meta && meta.resolvedTitle ? meta.resolvedTitle : "");
  const purpose = String(options && options.purpose || "entry-callout").toLowerCase();
  return `snippet:${purpose}|${slugs.join("|")}|${resolvedSlug}`;
}
function buildCardClipResolveBatchRequestEntry(meta = {}) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  return {
    character: String(safeMeta.character || "").trim(),
    resolvedTitle: String(safeMeta.resolvedTitle || "").trim(),
    aliases: Array.isArray(safeMeta.aliases) ? safeMeta.aliases.slice(0, 16) : [],
    description: String(safeMeta.description || "").trim().slice(0, 700),
    resolvedSource: String(safeMeta.resolvedSource || "").trim(),
    riskFlags: Array.isArray(safeMeta.riskFlags) ? safeMeta.riskFlags.slice(0, 16) : [],
    imageSynthetic: safeMeta.imageSynthetic === true,
    infoConfidence: Number.isFinite(Number(safeMeta.infoConfidence)) ? Number(safeMeta.infoConfidence) : 0,
    resolverConfidence: Number.isFinite(Number(safeMeta.resolverConfidence)) ? Number(safeMeta.resolverConfidence) : 0,
    ovr: Number.isFinite(Number(safeMeta.ovr)) ? Number(safeMeta.ovr) : 0
  };
}
function cacheCardSnippetMatchResult(meta = {}, resolvedRow = null, options = {}) {
  const cacheKey = getCardSnippetCacheKey(meta, options);
  let payload = null;
  let mode = "miss";
  if (resolvedRow && resolvedRow.speech && typeof resolvedRow.speech === "object") {
    payload = {
      __speechQuote: true,
      ...resolvedRow.speech
    };
    mode = String(resolvedRow.mode || "speech-fact");
  }
  audioState.cardSnippetMatchCache.set(cacheKey, Promise.resolve(payload));
  audioState.cardSnippetBatchMetaCache.set(cacheKey, {
    mode,
    source: resolvedRow && resolvedRow.matchSource ? String(resolvedRow.matchSource) : "none",
    matchScore: Number(resolvedRow && resolvedRow.matchScore) || 0,
    updatedAt: Date.now(),
    purpose: String(options && options.purpose || "entry-callout")
  });
  return payload;
}
async function resolveCharacterCardSnippetsViaServerBatch(metaList = [], options = {}) {
  const metas = (Array.isArray(metaList) ? metaList : []).map((meta) => normalizeCharacterAudioMeta(meta)).filter((meta) => meta && (meta.character || meta.resolvedTitle));
  if (!metas.length) return null;
  if (audioState.cardClipResolverApiAvailable === false && Date.now() < (audioState.cardClipResolverApiRetryAt || 0)) {
    return null;
  }
  const uniqueMetas = [];
  const seen = /* @__PURE__ */ new Set();
  metas.forEach((meta) => {
    const key = getCardSnippetCacheKey(meta, options);
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueMetas.push(meta);
  });
  if (!uniqueMetas.length) return null;
  const requestEntries = uniqueMetas.map((meta) => buildCardClipResolveBatchRequestEntry(meta));
  let parsed = null;
  try {
    const response = await fetch(AUDIO_CARD_CALLOUT_RESOLVE_BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        entries: requestEntries,
        purpose: String(options && options.purpose || "entry-callout")
      })
    });
    if (!response || !response.ok) {
      throw new Error(`blurb-batch-${response ? response.status : "fail"}`);
    }
    parsed = await response.json();
    audioState.cardClipResolverApiAvailable = true;
  } catch (error) {
    audioState.cardClipResolverApiAvailable = false;
    audioState.cardClipResolverApiRetryAt = Date.now() + 12e3;
    return null;
  }
  const rows = Array.isArray(parsed && parsed.results) ? parsed.results : [];
  rows.forEach((row, index) => {
    const meta = uniqueMetas[index];
    if (!meta) return;
    cacheCardSnippetMatchResult(meta, row || null, options);
  });
  const library = parsed && parsed.library && typeof parsed.library === "object" ? { ...parsed.library } : buildCalloutEngineStatus();
  audioState.cardClipStats = library;
  audioState.cardClipStatsFetchedAt = Date.now();
  const nextSig = String(library.librarySignature || "").trim();
  if (nextSig) audioState.cardClipLibrarySignature = nextSig;
  const shouldLog = options && options.log !== false;
  if (shouldLog) {
    const now = Date.now();
    if (now - (audioState.cardClipPrefetchLastLogAt || 0) > 1400) {
      audioState.cardClipPrefetchLastLogAt = now;
      const stats = parsed && parsed.stats && typeof parsed.stats === "object" ? parsed.stats : {};
      const purpose = String(options && options.purpose || stats.purpose || "entry-callout");
      console.info(
        `[audio callouts] batch resolve requested=${Number(stats.requested) || uniqueMetas.length} purpose=${purpose} speech=${Number(stats.speechAssociation || stats.speechFact) || 0} miss=${Number(stats.misses) || 0} ${parsed && parsed.cacheHit ? "cache=hit " : ""}ms=${Number(stats.elapsedMs || stats.quoteFetchMsAvg) || 0}`
      );
    }
  }
  return {
    endpointOk: true,
    parsed,
    metas: uniqueMetas
  };
}
async function resolveCharacterCardSnippetViaServer(meta = {}, options = {}) {
  const safeMeta = normalizeCharacterAudioMeta(meta);
  const result = await resolveCharacterCardSnippetsViaServerBatch([safeMeta], { ...options, log: false });
  if (!result || !result.endpointOk) {
    return { endpointOk: false, blurb: null, libraryEmpty: false };
  }
  const cacheKey = getCardSnippetCacheKey(safeMeta, options);
  const cached = audioState.cardSnippetMatchCache.get(cacheKey);
  if (cached && typeof cached.then === "function") {
    const blurb = await cached;
    return { endpointOk: true, blurb: blurb || null, libraryEmpty: false };
  }
  return { endpointOk: true, blurb: null, libraryEmpty: false };
}
async function resolveCharacterCardSnippetSpec(meta, options = {}) {
  const signatureKey = getCardSnippetCacheKey(meta, options);
  if (audioState.cardSnippetMatchCache.has(signatureKey)) {
    return audioState.cardSnippetMatchCache.get(signatureKey);
  }
  const pending = (async () => {
    const serverResolved = await resolveCharacterCardSnippetViaServer(meta, options).catch(() => ({ endpointOk: false }));
    if (serverResolved && serverResolved.endpointOk) {
      if (serverResolved.blurb) return serverResolved.blurb;
      return null;
    }
    return null;
  })();
  audioState.cardSnippetMatchCache.set(signatureKey, pending);
  return pending;
}
function scoreCardClipPrefetchPriority(meta = {}, options = {}) {
  const safeMeta = normalizeCharacterAudioMeta(meta);
  const info = Number(safeMeta.infoConfidence) || 0;
  const resolver = Number(safeMeta.resolverConfidence) || 0;
  const ovr = Number(safeMeta.ovr) || 0;
  const hasResolved = safeMeta.resolvedTitle ? 1 : 0;
  const aliasBoost = Array.isArray(safeMeta.aliases) ? Math.min(4, safeMeta.aliases.length) : 0;
  const context = String(options && options.context || "").toLowerCase();
  const contextBoost = context.includes("final") ? 22 : context.includes("round4") ? 14 : 0;
  return info * 120 + resolver * 90 + ovr * 0.35 + hasResolved * 18 + aliasBoost * 2.5 + contextBoost;
}
function getCachedSnippetForMeta(meta = {}, options = {}) {
  const cacheKey = getCardSnippetCacheKey(meta, options);
  const cached = audioState.cardSnippetMatchCache.get(cacheKey);
  if (!cached || typeof cached.then !== "function") return null;
  return cached;
}
function canUseSpeechSynthesis() {
  try {
    return typeof window !== "undefined" && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";
  } catch (error) {
    return false;
  }
}
function getSpeechSynthesisSafe() {
  try {
    return canUseSpeechSynthesis() ? window.speechSynthesis : null;
  } catch (error) {
    return null;
  }
}
function refreshSpeechVoicesCache() {
  const synth = getSpeechSynthesisSafe();
  if (!synth || typeof synth.getVoices !== "function") return [];
  let voices = [];
  try {
    voices = synth.getVoices() || [];
  } catch (error) {
    voices = [];
  }
  const normalized = Array.isArray(voices) ? voices.filter((v) => v && typeof v === "object") : [];
  audioState.speechVoices = normalized;
  audioState.speechVoicesLoaded = normalized.length > 0;
  return normalized;
}
function ensureSpeechVoicesLoadedSoon() {
  if (!canUseSpeechSynthesis()) return;
  if (audioState.speechVoicesLoading) return;
  audioState.speechVoicesLoading = true;
  const synth = getSpeechSynthesisSafe();
  const finish = () => {
    audioState.speechVoicesLoading = false;
    refreshSpeechVoicesCache();
  };
  try {
    refreshSpeechVoicesCache();
    if (synth && typeof synth.addEventListener === "function") {
      const onChanged = () => {
        synth.removeEventListener("voiceschanged", onChanged);
        finish();
      };
      synth.addEventListener("voiceschanged", onChanged, { once: true });
      window.setTimeout(() => {
        try {
          synth.removeEventListener("voiceschanged", onChanged);
        } catch (error) {
        }
        finish();
      }, 1600);
      return;
    }
  } catch (error) {
  }
  finish();
}
function getCardSpeechUtteranceVolume(speechSpec = {}, options = {}) {
  const bypassCardEnabled = options && options.bypassCardEnabled === true;
  if (audioState.muted || !bypassCardEnabled && !audioState.cardEnabled) return 0;
  const master = clampAudioLevel(audioState.masterVolume, 0.9);
  const card = clampAudioLevel(audioState.cardVolume, AUDIO_CATEGORY_DEFAULTS.card.volume);
  const gain = clampAudioLevel(speechSpec && speechSpec.gain != null ? speechSpec.gain : 1, 1);
  return Math.max(0, Math.min(1, master * card * gain));
}
function buildCardSpeechQuoteVoiceCue(speechSpec = {}, meta = {}, options = {}) {
  const text = String(speechSpec && (speechSpec.text || speechSpec.displayText) || "").trim();
  if (!text) return null;
  const startDelayMs = Math.max(0, Number(options && options.delayMs) || 0);
  const contextLabel = String(options && options.context || "").toLowerCase();
  const manualReplayContext = contextLabel.includes("ovr") || contextLabel.includes("click") || contextLabel.includes("replay") || contextLabel.includes("mvp") || contextLabel.includes("final-screen");
  const shouldPreemptVoice = options && options.preemptVoice === true ? true : contextLabel.includes("ovr") || contextLabel.includes("click") || contextLabel.includes("replay") || contextLabel.includes("mvp") || contextLabel.includes("finale") || contextLabel.includes("final-screen-autoplay");
  const inferred = classifyEntryArchetype(meta && (meta.character || meta.resolvedTitle || ""), {
    scenario: gameState.currentScenario,
    twist: gameState.currentTwist,
    round: gameState.currentRound,
    voiceStyle: speechSpec && speechSpec.voiceStyle
  });
  const speechArchetype = mapSpeechStyleToArchetype(speechSpec && speechSpec.voiceStyle) || inferred && inferred.archetype;
  const intensity = Math.max(
    0.25,
    Math.min(
      1,
      Number(speechSpec && speechSpec.confidence) || 0,
      1
    )
  );
  return {
    id: `entry-${hashString(buildCharacterAudioSignature(meta))}`,
    type: "entry",
    text,
    subtitleText: String(speechSpec && (speechSpec.displayText || speechSpec.text) || text).trim(),
    archetype: speechArchetype,
    intensity: Math.max(intensity, Number(inferred && inferred.intensity) || 0.5, Math.min(1, (Number(meta && meta.ovr) || 0) / 100)),
    priority: contextLabel.includes("mvp") || contextLabel.includes("finale") ? 94 : contextLabel.includes("final") ? 88 : 76,
    dedupeKey: manualReplayContext && !(options && options.forPrefetch === true) ? `entry:interactive:${buildCharacterAudioSignature(meta)}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}` : `entry:${buildCharacterAudioSignature(meta)}:${text.toLowerCase()}`,
    preempt: options && options.forPrefetch === true ? false : shouldPreemptVoice,
    allowLiveGenerate: true,
    delayMs: options && options.forPrefetch === true ? 0 : startDelayMs,
    speechSpec: {
      voiceStyle: speechSpec && speechSpec.voiceStyle,
      rate: speechSpec && speechSpec.rate,
      pitch: speechSpec && speechSpec.pitch,
      gain: clampAudioLevel(speechSpec && speechSpec.gain != null ? speechSpec.gain : getCardSpeechUtteranceVolume(speechSpec, options), 1)
    }
  };
}
function playCardSpeechQuote(speechSpec = {}, meta = {}, options = {}) {
  const bypassCardEnabled = options && options.bypassCardEnabled === true;
  if (audioState.muted || audioState.voiceEnabled === false || !bypassCardEnabled && !audioState.cardEnabled) return false;
  scheduleKokoroFullCastWarmup({ source: "card-speech", delayMs: 120 });
  const contextLabel = String(options && options.context || "").toLowerCase();
  const bypassSupersedeCheck = contextLabel.includes("mvp") || contextLabel.includes("finale");
  const manager = getVoiceManager();
  if (!manager) return false;
  void ensureVoiceManagerInitialized();
  stopCardPlaybackElement();
  stopCardSpeechFallback();
  const requestToken = ++audioState.cardPlaybackToken;
  const cue = buildCardSpeechQuoteVoiceCue(speechSpec, meta, options);
  if (!cue) return false;
  const result = manager.enqueue(cue);
  if (!result || !result.enqueued) return false;
  if (!bypassSupersedeCheck && requestToken !== audioState.cardPlaybackToken) return false;
  return true;
}
async function prefetchCharacterCardBlurbsNow(metaList = [], options = {}) {
  scheduleKokoroFullCastWarmup({ source: "blurb-prefetch", delayMs: 120 });
  const metas = (Array.isArray(metaList) ? metaList : []).map((meta) => normalizeCharacterAudioMeta(meta)).filter((meta) => meta && (meta.character || meta.resolvedTitle));
  if (!metas.length) return { queued: 0, fetched: 0, warmed: 0 };
  const deduped = [];
  const seen = /* @__PURE__ */ new Set();
  metas.forEach((meta) => {
    const key = getCardSnippetCacheKey(meta);
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(meta);
  });
  deduped.sort((a, b) => scoreCardClipPrefetchPriority(b, options) - scoreCardClipPrefetchPriority(a, options));
  const maxEntries = Math.max(1, Math.min(48, Number(options && options.maxEntries) || 18));
  const selected = deduped.slice(0, maxEntries);
  const pendingRequest = selected.filter((meta) => !getCachedSnippetForMeta(meta));
  if (pendingRequest.length) {
    await resolveCharacterCardSnippetsViaServerBatch(pendingRequest, { log: true });
  }
  let speechQueued = 0;
  let speechWarmed = 0;
  const contextKey = String(options && options.context || "").toLowerCase();
  const voiceWarmCap = contextKey.includes("round4") || contextKey.includes("final") || contextKey.includes("ovr") ? 18 : 10;
  const voiceWarmLimit = Math.max(0, Math.min(voiceWarmCap, Number(options && options.voiceWarmTop) || Math.min(6, selected.length)));
  const speechPrefetchCues = [];
  for (let i = 0; i < selected.length; i += 1) {
    const meta = selected[i];
    const cached = await Promise.resolve(getCachedSnippetForMeta(meta) || null);
    if (!cached) continue;
    if (cached.__speechQuote) {
      const cue = buildCardSpeechQuoteVoiceCue(cached, meta, {
        context: String(options && options.context || "blurb-prefetch"),
        preemptVoice: false,
        forPrefetch: true
      });
      if (cue) speechPrefetchCues.push(cue);
    }
  }
  if (speechPrefetchCues.length) {
    scheduleKokoroVoiceCuePrefetch(speechPrefetchCues, {
      source: String(options && options.context || "card-speech-prefetch"),
      delayMs: 0
    });
    speechQueued = speechPrefetchCues.length;
    for (let i = 0; i < Math.min(voiceWarmLimit, speechPrefetchCues.length); i += 1) {
      try {
        const warmResult = await prefetchKokoroCueClipNow(speechPrefetchCues[i], { source: "card-speech-prefetch" });
        if (warmResult && warmResult.ok) speechWarmed += 1;
      } catch (error) {
      }
      if (i < Math.min(voiceWarmLimit, speechPrefetchCues.length) - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 18));
      }
    }
  }
  return {
    queued: metas.length,
    fetched: pendingRequest.length,
    warmed: 0,
    speechQueued,
    speechWarmed
  };
}
function scheduleCharacterCardBlurbPrefetch(entries = [], options = {}) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  if (!list.length) return false;
  const context = String(options && options.context || "generic");
  const maxEntries = Number(options && options.maxEntries) || 18;
  const warmTop = Number(options && options.warmTop) || 0;
  const voiceWarmTop = Number(options && options.voiceWarmTop) || 0;
  const immediate = options && options.immediate === true;
  list.forEach((entry) => {
    const meta = normalizeCharacterAudioMeta(entry);
    if (!meta.character && !meta.resolvedTitle) return;
    const key = getCardSnippetCacheKey(meta);
    if (!key || audioState.cardClipPrefetchQueuedKeys.has(key)) return;
    if (audioState.cardSnippetMatchCache.has(key)) return;
    audioState.cardClipPrefetchQueuedKeys.add(key);
    audioState.cardClipPrefetchQueue.push({ meta, context, maxEntries, warmTop, voiceWarmTop, immediate, enqueuedAt: Date.now() });
  });
  if (audioState.cardClipPrefetchDrainTimer) {
    if (!immediate) return true;
    try {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(audioState.cardClipPrefetchDrainTimer);
      } else {
        window.clearTimeout(audioState.cardClipPrefetchDrainTimer);
      }
    } catch (error) {
    }
    audioState.cardClipPrefetchDrainTimer = null;
  }
  const drain = () => {
    audioState.cardClipPrefetchDrainTimer = null;
    void drainCharacterCardBlurbPrefetchQueue();
  };
  if (!immediate && typeof window.requestIdleCallback === "function") {
    audioState.cardClipPrefetchDrainTimer = window.requestIdleCallback(drain, { timeout: 450 });
  } else {
    audioState.cardClipPrefetchDrainTimer = window.setTimeout(drain, immediate ? 0 : 60);
  }
  return true;
}
async function drainCharacterCardBlurbPrefetchQueue() {
  if (audioState.cardClipPrefetchInFlight) return;
  if (!audioState.cardClipPrefetchQueue.length) return;
  audioState.cardClipPrefetchInFlight = true;
  try {
    const queue = audioState.cardClipPrefetchQueue.splice(0, 48);
    queue.forEach((task) => {
      if (task && task.meta) {
        const key = getCardSnippetCacheKey(task.meta);
        if (key) audioState.cardClipPrefetchQueuedKeys.delete(key);
      }
    });
    const metas = queue.map((task) => task.meta).filter(Boolean);
    const warmTop = queue.reduce((best, task) => Math.max(best, Number(task && task.warmTop) || 0), 0);
    const voiceWarmTop = queue.reduce((best, task) => Math.max(best, Number(task && task.voiceWarmTop) || 0), 0);
    const maxEntries = queue.reduce((best, task) => Math.max(best, Number(task && task.maxEntries) || 0), 0);
    const context = queue[0] && queue[0].context ? queue[0].context : "prefetch";
    await prefetchCharacterCardBlurbsNow(metas, { context, warmTop, voiceWarmTop, maxEntries });
  } catch (error) {
  } finally {
    audioState.cardClipPrefetchInFlight = false;
    if (audioState.cardClipPrefetchQueue.length) {
      if (audioState.cardClipPrefetchDrainTimer) {
        try {
          if (typeof window.cancelIdleCallback === "function") {
            window.cancelIdleCallback(audioState.cardClipPrefetchDrainTimer);
          } else {
            window.clearTimeout(audioState.cardClipPrefetchDrainTimer);
          }
        } catch (cancelError) {
        }
      }
      audioState.cardClipPrefetchDrainTimer = window.setTimeout(() => {
        audioState.cardClipPrefetchDrainTimer = null;
        void drainCharacterCardBlurbPrefetchQueue();
      }, 70);
    }
  }
}
function buildNoAudioPromptText(meta = {}, options = {}) {
  const name = String(meta && (meta.character || meta.resolvedTitle) || "").trim() || "this card";
  const context = String(options && options.context || "").toLowerCase();
  if (context.includes("final")) {
    return `No character callout available for ${name} yet. Playing fallback sting.`;
  }
  return `No character callout available for ${name} yet.`;
}
function resetCharacterCalloutSessionState(reason = "generic") {
  audioState.lastCardBlurbAt = 0;
  audioState.lastCardBlurbSig = "";
  audioState.lastFinaleAutoplaySig = "";
  audioState.lastFinaleVictoryAutoplaySig = "";
  audioState.lastFinaleNoAudioToastSig = "";
  audioState.cardPlaybackToken += 1;
  audioState.cardSpeechToken += 1;
  if (String(reason || "").toLowerCase().includes("lobby")) {
    try {
      stopCardPlaybackElement();
      stopCardSpeechFallback();
    } catch (error) {
    }
  }
}
function playNoAudioSadCue(meta = {}, options = {}) {
  const ovr = Math.max(0, Math.min(99, Number(meta && meta.ovr) || 0));
  const context = String(options && options.context || "").toLowerCase();
  const softer = context.includes("reveal") ? 0.72 : 1;
  const base = 240 + Math.round(ovr * 0.32);
  const delay = Math.max(0, Number(options && options.delayMs) || 0);
  runNoteSequence([
    { frequency: base * 1.2, frequencyEnd: base * 0.95, duration: 70, type: "square", volume: 0.036 * softer, attack: 5e-3, release: 0.04, pan: -0.18, bus: "card" },
    { frequency: base * 0.92, frequencyEnd: base * 0.56, duration: 210, type: "triangle", volume: 0.056 * softer, attack: 0.01, release: 0.12, pan: 0.08, bus: "card" },
    { frequency: base * 0.66, frequencyEnd: Math.max(75, base * 0.38), duration: 260, type: "sawtooth", volume: 0.052 * softer, attack: 0.01, release: 0.18, pan: -0.04, bus: "card" }
  ], 125, { bus: "card", baseDelayMs: delay });
  window.setTimeout(() => {
    scheduleTone({
      frequency: 980,
      frequencyEnd: 720,
      duration: 85,
      type: "triangle",
      volume: 0.022 * softer,
      attack: 4e-3,
      release: 0.05,
      bus: "card"
    });
  }, delay + 36);
}
async function playCharacterCardBlurb(input = {}, options = {}) {
  const meta = normalizeCharacterAudioMeta(input);
  const signature = buildCharacterAudioSignature(meta);
  const contextLabel = String(options && options.context || "").toLowerCase();
  if (contextLabel.includes("round4-reveal") || contextLabel.includes("round4-finale")) {
    return { skipped: true, reason: "ceremony_blurbs_disabled", signature };
  }
  const now = Date.now();
  const throttleMs = Math.max(0, Number(options && options.throttleMs) || 0);
  if (throttleMs > 0 && audioState.lastCardBlurbSig === signature && now - audioState.lastCardBlurbAt < throttleMs) {
    return { skipped: true, signature };
  }
  audioState.lastCardBlurbSig = signature;
  audioState.lastCardBlurbAt = now;
  ensureAudioRunning();
  tryUnlockHtmlMediaStack();
  const requestToken = ++audioState.cardPlaybackToken;
  const snippetSpec = await resolveCharacterCardSnippetSpec(meta, { purpose: "entry-callout" });
  if (requestToken !== audioState.cardPlaybackToken) {
    return { skipped: true, reason: "superseded", signature };
  }
  if (snippetSpec && snippetSpec.__speechQuote) {
    const speechPlayed = playCardSpeechQuote(snippetSpec, meta, options);
    if (speechPlayed) {
      return {
        signature,
        meta,
        mode: String(snippetSpec.source || "speech-quote"),
        speech: snippetSpec,
        prompt: String(snippetSpec.displayText || snippetSpec.text || "").trim()
      };
    }
  }
  stopCardPlaybackElement();
  playNoAudioSadCue(meta, options);
  return {
    signature,
    meta,
    mode: "no-audio-fallback",
    prompt: buildNoAudioPromptText(meta, options)
  };
}
function pickHighestOVRCard(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return null;
  return entries.reduce((best, entry) => {
    if (!entry || typeof entry !== "object") return best;
    if (!best) return entry;
    const a = Number(entry.ovr) || 0;
    const b = Number(best.ovr) || 0;
    if (a !== b) return a > b ? entry : best;
    const aRank = Number(entry.eliteRank) || 999;
    const bRank = Number(best.eliteRank) || 999;
    return aRank < bRank ? entry : best;
  }, null);
}
function playHighestOVRCardBlurb(entries = [], options = {}) {
  const best = pickHighestOVRCard(entries);
  if (!best) return null;
  const dedupeKey = `${buildCharacterAudioSignature(best)}|${String(options && options.context || "")}`;
  if (options && options.dedupeFinale === true && audioState.lastFinaleAutoplaySig === dedupeKey) {
    return { skipped: true, reason: "duplicate_finale" };
  }
  if (options && options.dedupeFinale === true) {
    audioState.lastFinaleAutoplaySig = dedupeKey;
  }
  return playCharacterCardBlurb(best, options);
}
function emitFinaleMvpOverlayUpdate(options = {}, payload = {}) {
  const fn = options && typeof options.onOverlayUpdate === "function" ? options.onOverlayUpdate : null;
  if (!fn) return;
  try {
    fn(payload);
  } catch (error) {
  }
}
async function playFinaleMvpVictoryCallout(entries = [], options = {}) {
  const best = pickHighestOVRCard(entries);
  if (!best) return null;
  const meta = normalizeCharacterAudioMeta(best);
  const signature = buildCharacterAudioSignature(meta);
  const context = String(options && options.context || "finale-mvp-victory");
  const dedupeKey = `${signature}|${context}|victory`;
  if (options && options.dedupeFinale !== false && audioState.lastFinaleVictoryAutoplaySig === dedupeKey) {
    return { skipped: true, reason: "duplicate_finale_victory", signature };
  }
  if (options && options.dedupeFinale !== false) {
    audioState.lastFinaleVictoryAutoplaySig = dedupeKey;
  }
  emitFinaleMvpOverlayUpdate(options, {
    state: "loading",
    characterName: meta.character || meta.resolvedTitle || "MVP",
    subtitle: "Preparing MVP victory callout..."
  });
  ensureAudioRunning();
  tryUnlockHtmlMediaStack();
  const requestToken = ++audioState.cardSpeechToken;
  const speechSpec = await resolveCharacterCardSnippetSpec(meta, { purpose: "finale-mvp-victory" });
  if (requestToken !== audioState.cardSpeechToken) {
    return { skipped: true, reason: "superseded", signature };
  }
  if (speechSpec && speechSpec.__speechQuote) {
    const correctedName = String(speechSpec.correctedName || meta.resolvedTitle || meta.character || "").trim() || (meta.character || meta.resolvedTitle || "MVP");
    const narratorLead = String(options && options.narratorLeadText || "").trim();
    const resolvedPhrase = String(speechSpec.text || "").trim();
    emitFinaleMvpOverlayUpdate(options, {
      state: "ready",
      characterName: correctedName,
      phrase: resolvedPhrase,
      compositeLine: narratorLead ? `[Narrator]: ${narratorLead} [MVP]: "${resolvedPhrase}"` : "",
      classLabel: String(speechSpec.classLabel || "").trim(),
      voiceStyle: String(speechSpec.voiceStyle || "").trim(),
      temperament: String(speechSpec.temperament || "").trim(),
      variant: String(speechSpec.variant || "finale-mvp-victory")
    });
    try {
      await Promise.race([
        ensureVoiceManagerInitialized().catch(() => null),
        new Promise((resolve) => window.setTimeout(resolve, 500))
      ]);
      if (audioState.voiceEnabled !== false && audioState.muted !== true) {
        const prewarmCue = buildCardSpeechQuoteVoiceCue(speechSpec, meta, {
          ...options,
          context,
          throttleMs: 0,
          bypassCardEnabled: true,
          preemptVoice: true
        });
        if (prewarmCue) {
          await Promise.race([
            prefetchKokoroCueClipNow(prewarmCue, { source: "finale-mvp-victory" }),
            new Promise((resolve) => window.setTimeout(() => resolve({ ok: false, reason: "timeout" }), 450))
          ]);
        }
      }
    } catch (_mvpWarmError) {
    }
    const speechPlayed = playCardSpeechQuote(speechSpec, meta, {
      ...options,
      context,
      throttleMs: 0,
      bypassCardEnabled: true,
      preemptVoice: true
    });
    if (!speechPlayed && !(options && options.__retryingFinaleMvp === true)) {
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      return playFinaleMvpVictoryCallout(entries, {
        ...options,
        __retryingFinaleMvp: true,
        dedupeFinale: false
      });
    }
    if (speechPlayed) {
      emitFinaleMvpOverlayUpdate(options, {
        state: "speaking",
        characterName: correctedName,
        phrase: resolvedPhrase,
        compositeLine: narratorLead ? `[Narrator]: ${narratorLead} [MVP]: "${resolvedPhrase}"` : "",
        classLabel: String(speechSpec.classLabel || "").trim(),
        voiceStyle: String(speechSpec.voiceStyle || "").trim(),
        temperament: String(speechSpec.temperament || "").trim(),
        variant: String(speechSpec.variant || "finale-mvp-victory")
      });
      return {
        signature,
        meta,
        mode: String(speechSpec.source || "speech-fact"),
        speech: speechSpec,
        prompt: String(speechSpec.displayText || speechSpec.text || "").trim(),
        finaleVictory: true
      };
    }
  }
  stopCardPlaybackElement();
  playNoAudioSadCue(meta, { ...options, context });
  emitFinaleMvpOverlayUpdate(options, {
    state: "fallback",
    characterName: meta.character || meta.resolvedTitle || "MVP",
    phrase: speechSpec && speechSpec.__speechQuote ? String(speechSpec.text || "").trim() : "",
    subtitle: "MVP victory audio unavailable on this device."
  });
  return {
    signature,
    meta,
    mode: "no-audio-fallback",
    prompt: buildNoAudioPromptText(meta, { ...options, context }),
    finaleVictory: true
  };
}
function prefetchCharacterCardBlurbs(entries = [], options = {}) {
  return scheduleCharacterCardBlurbPrefetch(entries, options);
}
function publishGlobalAudioBridge() {
  window.__lobbyAudio = {
    version: "2026-02-24-audio-bridge2-mp3-xfade",
    ensureUnlocked() {
      unlockAudioFromGesture({ type: "bridge" });
      return audioState.unlocked === true;
    },
    ensureRunning() {
      return ensureAudioRunning();
    },
    isUnlocked() {
      return audioState.unlocked === true;
    },
    getState() {
      return {
        muted: audioState.muted,
        unlocked: audioState.unlocked,
        masterVolume: audioState.masterVolume,
        sfxVolume: audioState.sfxVolume,
        musicVolume: audioState.musicVolume,
        revealVolume: audioState.revealVolume,
        cardVolume: audioState.cardVolume,
        musicEnabled: audioState.musicEnabled,
        sfxEnabled: audioState.sfxEnabled,
        revealEnabled: audioState.revealEnabled,
        cardEnabled: audioState.cardEnabled,
        voiceEnabled: audioState.voiceEnabled,
        voiceExpressiveMode: KOKORO_ONLY_VOICE_SYSTEM ? true : audioState.voiceExpressiveMode,
        voiceUnlocked: audioState.voiceUnlocked,
        currentMusicScene: audioState.currentMusicScene
      };
    },
    setMusicScene(sceneKey, options = {}) {
      setMusicScene(sceneKey, options);
      return true;
    },
    playRound4RevealAccent(profile, stage) {
      playRound4RevealAccent(profile, stage);
      return true;
    },
    playCharacterCardBlurb(entry, options = {}) {
      return playCharacterCardBlurb(entry, options);
    },
    playHighestOVRCardBlurb(entries, options = {}) {
      return playHighestOVRCardBlurb(entries, options);
    },
    playFinaleMvpVictoryCallout(entries, options = {}) {
      return playFinaleMvpVictoryCallout(entries, options);
    },
    prefetchCharacterCardBlurbs(entries, options = {}) {
      return prefetchCharacterCardBlurbs(entries, options);
    },
    getCardClipStats() {
      return Promise.resolve(audioState.cardClipStats || buildCalloutEngineStatus());
    },
    enqueueVoiceCue(cue) {
      return enqueueVoiceCue(cue);
    },
    enqueueVoiceCues(cues, options = {}) {
      return enqueueVoiceCues(cues, options);
    },
    prefetchVoiceCues(cues, options = {}) {
      scheduleKokoroVoiceCuePrefetch(Array.isArray(cues) ? cues : [cues], {
        source: String(options && options.source || "bridge-prefetch"),
        delayMs: Math.max(0, Number(options && options.delayMs) || 0)
      });
      return true;
    },
    warmVoiceCuesNow(cues, options = {}) {
      return warmKokoroVoiceCuesNow(Array.isArray(cues) ? cues : [cues], {
        source: String(options && options.source || "bridge-warm"),
        limit: Math.max(0, Number(options && options.limit) || 12),
        concurrency: Math.max(1, Number(options && options.concurrency) || 3),
        onProgress: options && typeof options.onProgress === "function" ? options.onProgress : null,
        preserveOrder: options && options.preserveOrder === true
      });
    },
    clearVoiceQueue(reason = "bridge-clear", options = {}) {
      clearVoiceCues(reason, options);
      return true;
    },
    getVoiceState() {
      return getVoiceManager().getState();
    },
    prepareVoiceFallback(options = {}) {
      const engine = getKokoroVoiceEngine();
      if (!engine || typeof engine.prepareBrowserFallback !== "function") {
        return Promise.resolve({ ok: false, reason: "engine-missing" });
      }
      return engine.prepareBrowserFallback({
        voiceIds: Array.isArray(options && options.voiceIds) ? options.voiceIds : KOKORO_CURATED_VOICE_IDS,
        primeUtterance: options && options.primeUtterance === true,
        timeoutMs: Math.max(200, Number(options && options.timeoutMs) || 1200)
      });
    },
    openQuickPanel() {
      setAudioQuickPanelOpen(true);
      return true;
    }
  };
}
function appendText(parent, text) {
  parent.appendChild(document.createTextNode(text));
}
var CHAT_CLIENT_MAX_MESSAGES = 10;
var CHAT_CLIENT_PRUNE_BATCH = 1;
function getChatToneIndex(name = "") {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return 0;
  let hash = 0;
  for (let idx = 0; idx < normalized.length; idx += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(idx);
    hash |= 0;
  }
  return Math.abs(hash) % 6;
}
function normalizeChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((msg) => msg && typeof msg === "object" && typeof msg.player === "string" && typeof msg.text === "string").map((msg) => ({
    player: msg.player,
    text: msg.text,
    timestamp: Number(msg.timestamp) || Date.now(),
    isReaction: msg.isReaction === true
  }));
}
function pruneChatMessages(messages) {
  if (!Array.isArray(messages)) return { messages: [], prunedCount: 0 };
  const next = messages.slice();
  let prunedCount = 0;
  while (next.length > CHAT_CLIENT_MAX_MESSAGES) {
    const removeCount = Math.min(CHAT_CLIENT_PRUNE_BATCH, next.length);
    next.splice(0, removeCount);
    prunedCount += removeCount;
  }
  return { messages: next, prunedCount };
}
function isChatNearBottom(container, threshold = 56) {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}
function updateChatEraseNotice({ prunedCount = 0 } = {}) {
  const notice = document.getElementById("chatEraseNotice");
  if (!notice) return;
  if (prunedCount > 0) {
    const noun = prunedCount === 1 ? "message was" : "messages were";
    notice.textContent = `${prunedCount} older ${noun} permanently erased. Only latest 10 remain.`;
    notice.classList.add("recent");
    if (notice._resetTimer) {
      clearTimeout(notice._resetTimer);
    }
    notice._resetTimer = setTimeout(() => {
      notice.textContent = "Auto-erase active: only latest 10 messages are kept. Older messages are permanently deleted.";
      notice.classList.remove("recent");
    }, 4200);
    return;
  }
  if (!notice.textContent.trim()) {
    notice.textContent = "Auto-erase active: only latest 10 messages are kept. Older messages are permanently deleted.";
  }
}
function syncChatComposerState() {
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendBtn");
  if (!input || !sendBtn) return;
  const hasText = input.value.trim().length > 0;
  sendBtn.disabled = !hasText;
  sendBtn.setAttribute("aria-disabled", hasText ? "false" : "true");
}
function triggerTransientClass(element, className, duration = 220) {
  if (!element || !className) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => {
    element.classList.remove(className);
  }, Math.max(120, Number(duration) || 220));
}
function formatChatTimestamp(timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  try {
    return new Intl.DateTimeFormat(void 0, {
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(ts));
  } catch (error) {
    return "";
  }
}
function buildChatItem(msg) {
  const li = document.createElement("li");
  const isMine = msg.player === player.name;
  const toneIndex = getChatToneIndex(msg.player);
  li.className = `chat-row ${isMine ? "mine" : "theirs"}${msg.isReaction ? " is-reaction" : ""}`;
  li.setAttribute("role", "listitem");
  const bubble = document.createElement("article");
  bubble.className = `chat-bubble${msg.isReaction ? " reaction" : ""}`;
  if (!isMine) {
    bubble.classList.add(`chat-bubble-tone-${toneIndex}`);
  }
  if (!isMine) {
    const sender = document.createElement("span");
    sender.className = `chat-sender chat-sender-tone-${toneIndex}`;
    sender.textContent = msg.player;
    bubble.appendChild(sender);
  }
  const text = document.createElement("span");
  text.className = "chat-text";
  text.textContent = msg.text;
  bubble.appendChild(text);
  const timestamp = formatChatTimestamp(msg.timestamp);
  if (timestamp) {
    const meta = document.createElement("span");
    meta.className = "chat-meta";
    meta.textContent = timestamp;
    bubble.appendChild(meta);
  }
  li.appendChild(bubble);
  return li;
}
function renderChatMessages({ forceBottom = false } = {}) {
  const chatContainer = document.getElementById("chatMessages");
  if (!chatContainer) return;
  const shouldPinToBottom = forceBottom || isChatNearBottom(chatContainer);
  chatContainer.innerHTML = "";
  if (!roomState.messages.length) {
    const empty = document.createElement("li");
    empty.className = "chat-empty-state";
    empty.setAttribute("role", "listitem");
    empty.textContent = "No messages yet. Start the chaos.";
    chatContainer.appendChild(empty);
  } else {
    roomState.messages.forEach((msg) => {
      chatContainer.appendChild(buildChatItem(msg));
    });
  }
  if (shouldPinToBottom) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}
function getActiveLobbyTabName() {
  const active = document.querySelector(".tab-btn.active[data-tab]");
  return active ? String(active.getAttribute("data-tab") || "").trim() : "";
}
function isChatTabActive() {
  return isLobbyScreenActive() && getActiveLobbyTabName() === "chat";
}
function isMobileChatViewport() {
  return isLikelyMobileDevice() || window.innerWidth <= 900;
}
function isChatInputFocused() {
  const active = document.activeElement;
  return Boolean(active && active.id === "chatInput");
}
function syncLobbyFooterVisibility() {
  const footer = document.getElementById("lobbyActionsBar");
  const lobby = document.getElementById("lobby");
  const lobbyContent = lobby ? lobby.querySelector(".lobby-content") : null;
  const chatImmersive = isChatTabActive() && isMobileChatViewport();
  const chatFocus = chatImmersive && isChatInputFocused();
  if (footer) {
    const shouldShowFooter = isLobbyScreenActive() && !chatImmersive;
    footer.style.display = shouldShowFooter ? "" : "none";
  }
  if (lobby) {
    lobby.classList.toggle("is-chat-immersive", chatImmersive);
    lobby.classList.toggle("is-chat-input-focus", chatFocus);
  }
  if (lobbyContent) {
    lobbyContent.classList.toggle("is-chat-immersive", chatImmersive);
  }
  document.body.classList.toggle("chat-immersive-mode", chatImmersive);
  document.body.classList.toggle("chat-input-focus-mode", chatFocus);
}
function syncChatViewportForFocus({ forceBottom = false } = {}) {
  if (!isChatTabActive()) return;
  if (forceBottom) {
    renderChatMessages({ forceBottom: true });
    return;
  }
  const container = document.getElementById("chatMessages");
  if (!container) return;
  if (isChatNearBottom(container, 120)) {
    container.scrollTop = container.scrollHeight;
  }
}
function installChatLayoutController() {
  if (window.__chatLayoutControllerInstalled) return;
  window.__chatLayoutControllerInstalled = true;
  const handleLayoutUpdate = ({ forceBottom = false } = {}) => {
    syncLobbyFooterVisibility();
    if (forceBottom) syncChatViewportForFocus({ forceBottom: true });
  };
  document.addEventListener("lobbyTabChanged", (event) => {
    const tabName = event && event.detail ? event.detail.tabName : "";
    const forceBottom = tabName === "chat";
    handleLayoutUpdate({ forceBottom });
  });
  document.addEventListener("screenChanged", () => {
    handleLayoutUpdate({ forceBottom: false });
  });
  window.addEventListener("resize", () => {
    handleLayoutUpdate({ forceBottom: false });
  }, { passive: true });
  if (window.visualViewport) {
    const handleViewportShift = () => {
      syncLobbyFooterVisibility();
      if (isChatInputFocused()) {
        syncChatViewportForFocus({ forceBottom: true });
      }
    };
    window.visualViewport.addEventListener("resize", handleViewportShift, { passive: true });
    window.visualViewport.addEventListener("scroll", handleViewportShift, { passive: true });
  }
  const chatInput = document.getElementById("chatInput");
  if (chatInput) {
    chatInput.addEventListener("focus", () => {
      syncLobbyFooterVisibility();
      window.setTimeout(() => {
        syncChatViewportForFocus({ forceBottom: true });
      }, 40);
    });
    chatInput.addEventListener("blur", () => {
      window.setTimeout(() => {
        syncLobbyFooterVisibility();
      }, 120);
    });
  }
  handleLayoutUpdate({ forceBottom: false });
}
function clearReadyToggleArm() {
  readyToggleLockState.armed = false;
  if (readyToggleLockState.armTimer) {
    clearTimeout(readyToggleLockState.armTimer);
    readyToggleLockState.armTimer = null;
  }
}
function clearReadyTogglePending() {
  readyToggleLockState.pending = false;
  if (readyToggleLockState.pendingTimer) {
    clearTimeout(readyToggleLockState.pendingTimer);
    readyToggleLockState.pendingTimer = null;
  }
}
function getReadyCooldownRemainingMs() {
  return Math.max(0, Number(readyToggleLockState.cooldownUntil) - Date.now());
}
function scheduleReadyCooldownRefresh() {
  if (readyToggleLockState.cooldownTimer) {
    clearTimeout(readyToggleLockState.cooldownTimer);
    readyToggleLockState.cooldownTimer = null;
  }
  const remaining = getReadyCooldownRemainingMs();
  if (remaining <= 0) return;
  readyToggleLockState.cooldownTimer = setTimeout(() => {
    readyToggleLockState.cooldownTimer = null;
    updateReadyButtonUi(player.ready);
  }, remaining + 50);
}
function updateReadyButtonUi(isReady = false) {
  const readyBtn = document.getElementById("readyBtn");
  if (!readyBtn) return;
  const cooldownMs = getReadyCooldownRemainingMs();
  const armed = readyToggleLockState.armed === true && cooldownMs <= 0 && readyToggleLockState.pending !== true;
  const pending = readyToggleLockState.pending === true;
  readyBtn.className = "btn btn-ready";
  readyBtn.classList.toggle("pulsing", Boolean(isReady) && !armed && !pending && cooldownMs <= 0);
  readyBtn.classList.toggle("ready-lock-armed", armed);
  readyBtn.classList.toggle("ready-lock-pending", pending);
  readyBtn.classList.toggle("ready-lock-cooldown", cooldownMs > 0 && !pending);
  readyBtn.classList.toggle("btn-success", Boolean(isReady) && !armed && !pending && cooldownMs <= 0);
  if (pending) {
    readyBtn.disabled = true;
    readyBtn.innerHTML = '<span class="ready-lock-icon">\u23F3</span><span class="ready-indicator">\u2022</span><span class="ready-label">SYNCING...</span>';
    return;
  }
  if (cooldownMs > 0) {
    scheduleReadyCooldownRefresh();
    readyBtn.disabled = true;
    readyBtn.innerHTML = `<span class="ready-lock-icon">\u{1F512}</span><span class="ready-indicator">${isReady ? "\u2713" : "\u25CB"}</span><span class="ready-label">LOCKED ${Math.max(1, Math.ceil(cooldownMs / 1e3))}s</span>`;
    return;
  }
  if (readyToggleLockState.cooldownTimer) {
    clearTimeout(readyToggleLockState.cooldownTimer);
    readyToggleLockState.cooldownTimer = null;
  }
  readyBtn.disabled = false;
  if (armed) {
    readyBtn.innerHTML = `<span class="ready-lock-icon">\u{1F513}</span><span class="ready-indicator">${isReady ? "\u2713" : "\u25CB"}</span><span class="ready-label">CONFIRM ${isReady ? "UNREADY" : "READY"}</span>`;
    return;
  }
  if (isReady) {
    readyBtn.innerHTML = '<span class="ready-lock-icon">\u{1F512}</span><span class="ready-indicator">\u2713</span><span class="ready-label">READY</span>';
    return;
  }
  readyBtn.innerHTML = '<span class="ready-lock-icon">\u{1F510}</span><span class="ready-indicator">\u25CB</span><span class="ready-label">NOT READY</span>';
}
function isLobbyScreenActive() {
  const lobby = document.getElementById("lobby");
  return Boolean(lobby && lobby.classList.contains("active"));
}
function syncChatTabPingBadge() {
  const badge = document.getElementById("chatTabPing");
  if (!badge) return;
  const count = Math.max(0, Number(chatPingState.unreadCount) || 0);
  const show = count > 0;
  badge.hidden = !show;
  if (!show) {
    badge.textContent = "";
    badge.classList.remove("is-live");
    badge.removeAttribute("aria-label");
    return;
  }
  badge.textContent = count > 9 ? "9+" : String(count);
  badge.classList.add("is-live");
  badge.setAttribute("aria-label", `${count} unread chat ${count === 1 ? "message" : "messages"}`);
}
function resetChatTabPing() {
  chatPingState.unreadCount = 0;
  syncChatTabPingBadge();
}
function incrementChatTabPing(messageTimestamp) {
  const ts = Number(messageTimestamp) || Date.now();
  if (ts && ts <= (Number(chatPingState.lastMessageTs) || 0)) return;
  chatPingState.lastMessageTs = ts;
  chatPingState.unreadCount = Math.min(99, (Number(chatPingState.unreadCount) || 0) + 1);
  syncChatTabPingBadge();
}
function maybeHandleIncomingChatPing(msg) {
  if (!msg || msg.player === player.name) return;
  if (!isLobbyScreenActive()) return;
  if (getActiveLobbyTabName() === "chat") {
    resetChatTabPing();
    return;
  }
  incrementChatTabPing(msg.timestamp);
}
function stopDraftWaitIntelPreviewPolling() {
  if (draftWaitIntelPreviewState.pollTimer) {
    clearInterval(draftWaitIntelPreviewState.pollTimer);
    draftWaitIntelPreviewState.pollTimer = null;
  }
  draftWaitIntelPreviewState.pollStopAtMs = 0;
}
function resetDraftWaitIntelPreview({ hide = true, statusText = "Checking cached evaluator prep..." } = {}) {
  stopDraftWaitIntelPreviewPolling();
  draftWaitIntelPreviewState.receivedRound = null;
  draftWaitIntelPreviewState.requestRound = null;
  const panel = document.getElementById("draftWaitIntelPreview");
  const body = document.getElementById("draftWaitIntelPreviewBody");
  const status = document.getElementById("draftWaitIntelPreviewStatus");
  if (status) status.textContent = statusText;
  if (body) body.innerHTML = "";
  if (panel) panel.hidden = Boolean(hide);
}
function getEarlyIntelEmotionEmoji(entry = {}) {
  const confidence = Number(entry.confidence) || 0;
  const emotion = String(entry.emotion || "").toLowerCase();
  if (emotion.includes("mad")) return "&#x1F621;";
  if (emotion.includes("confused")) return "&#x1F615;";
  if (emotion.includes("disappointed")) return "&#x1F61E;";
  if (emotion.includes("amazed")) return "&#x1F929;";
  if (emotion.includes("happy")) return "&#x1F60A;";
  if (entry.ready === false) return "&#x23F3;";
  if (confidence >= 0.9) return "&#x1F92F;";
  if (confidence >= 0.75) return "&#x2728;";
  if (confidence >= 0.5) return "&#x1F60C;";
  return "&#x1F914;";
}
function renderDraftWaitIntelPreview(preview) {
  const panel = document.getElementById("draftWaitIntelPreview");
  const body = document.getElementById("draftWaitIntelPreviewBody");
  const status = document.getElementById("draftWaitIntelPreviewStatus");
  if (!panel || !body) return;
  const entries = Array.isArray(preview && preview.evaluations) ? preview.evaluations : [];
  const summary = preview && preview.summary && typeof preview.summary === "object" ? preview.summary : {};
  if (!entries.length) {
    panel.hidden = false;
    body.innerHTML = '<p class="draft-wait-intel-preview-empty">No cached evaluator prep was ready before the twist.</p>';
    if (status) status.textContent = "No cached preview ready in time.";
    return;
  }
  const avgConfidencePct = Number.isFinite(Number(summary.averageConfidence)) ? Math.round(Number(summary.averageConfidence) * 100) : null;
  const trustedCount = Number(summary.trustedCount) || 0;
  const totalEvalCount = Number(summary.totalCount) || entries.length;
  const readyCount = Number(summary.readyCount) || entries.filter((entry) => entry && entry.ready === true).length;
  body.innerHTML = `
    <div class="draft-wait-intel-preview-summary">
      <span><small>Ready</small><b>${readyCount}/${totalEvalCount}</b></span>
      <span><small>Trusted</small><b>${trustedCount}/${totalEvalCount}</b></span>
      <span><small>Confidence</small><b>${avgConfidencePct == null ? "n/a" : `${avgConfidencePct}%`}</b></span>
    </div>
    <div class="draft-wait-intel-preview-list">
      ${entries.map((entry, idx) => {
    const confidencePct = Number.isFinite(Number(entry.confidence)) ? Math.round(Number(entry.confidence) * 100) : null;
    const source = entry.ready === true ? entry.source ? String(entry.source) : "cache" : "warming";
    const note = entry.ready === true ? `${entry.contextPreseeded ? "Context ready" : "Resolver ready"}${entry.imageUrl ? " + portrait" : ""}${entry.imageSynthetic ? " (synthetic)" : ""}` : "Cached prep still warming. Twist has not been revealed yet.";
    const mood = getEarlyIntelEmotionEmoji(entry);
    return `
          <article class="draft-wait-intel-card" style="--draft-wait-intel-index:${idx};">
            <div class="draft-wait-intel-card-head">
              <strong>${escapeHtml(entry.character || `Pick ${idx + 1}`)}</strong>
              <span class="draft-wait-intel-card-mood" aria-hidden="true">${mood}</span>
            </div>
            <div class="draft-wait-intel-card-metrics">
              <span>${entry.ready === true ? "Ready" : "Status"} <b>${entry.ready === true ? "Yes" : "Warming"}</b></span>
              <span>Source <b>${escapeHtml(source)}</b></span>
              <span>${confidencePct == null ? "Confidence n/a" : `Confidence ${confidencePct}%`}</span>
            </div>
            <p>${escapeHtml(note)}</p>
          </article>
        `;
  }).join("")}
    </div>
  `;
  if (status) {
    status.textContent = `Cache-only preview while waiting${readyCount < totalEvalCount ? " (still warming...)" : ""}.`;
  }
  panel.hidden = false;
}
function startDraftWaitIntelPreviewPolling() {
  const scenarioScreen = document.getElementById("scenarioScreen");
  if (!scenarioScreen || !scenarioScreen.classList.contains("active")) return;
  if (!gameState.draftLocked) return;
  const currentRound = Number(gameState.currentRound) || 0;
  if (draftWaitIntelPreviewState.requestRound === currentRound && (draftWaitIntelPreviewState.pollTimer || draftWaitIntelPreviewState.receivedRound === currentRound)) {
    return;
  }
  resetDraftWaitIntelPreview({ hide: false, statusText: "Checking cached evaluator prep..." });
  draftWaitIntelPreviewState.pollStopAtMs = Date.now() + 3400;
  draftWaitIntelPreviewState.receivedRound = null;
  draftWaitIntelPreviewState.requestRound = currentRound;
  const requestPreview = () => {
    if (!socket || typeof socket.emit !== "function") return;
    if (!document.getElementById("scenarioScreen")?.classList.contains("active")) return;
    if (!gameState.draftLocked) return;
    if (Date.now() > draftWaitIntelPreviewState.pollStopAtMs) {
      stopDraftWaitIntelPreviewPolling();
      const status = document.getElementById("draftWaitIntelPreviewStatus");
      if (status && !draftWaitIntelPreviewState.receivedRound) {
        status.textContent = "No cached peek this time. Twist is next.";
      }
      return;
    }
    socket.emit("requestDraftWaitPreview");
  };
  requestPreview();
  draftWaitIntelPreviewState.pollTimer = setInterval(requestPreview, 450);
  addTimer(draftWaitIntelPreviewState.pollTimer);
}
function setPreRoundProgress(percent = 0, fetchLabel = "Preparing next phase\u2026") {
  const bounded = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const progressFill = document.getElementById("preRoundProgressFill");
  const progressPct = document.getElementById("preRoundProgressPct");
  const fetchEl = document.getElementById("preRoundFetchLabel");
  const progressTrack = document.querySelector("#preRoundLoading .pre-round-progress");
  if (progressFill) progressFill.style.width = `${bounded}%`;
  if (progressPct) progressPct.textContent = `${bounded}%`;
  if (fetchEl) fetchEl.textContent = fetchLabel;
  if (progressTrack) progressTrack.setAttribute("aria-valuenow", String(bounded));
  const milestone = Math.floor(bounded / 10) * 10;
  if (milestone >= 10 && milestone !== preRoundAudioState.lastMilestone) {
    preRoundAudioState.lastMilestone = milestone;
    playLoadingMilestoneSound(milestone);
  }
}
function hidePreRoundLoadingState() {
  const loading = document.getElementById("preRoundLoading");
  const messageEl = document.getElementById("preRoundMessage");
  if (loading) loading.style.display = "none";
  if (messageEl) messageEl.textContent = "\u26A1 Get Ready for Chaos \u26A1";
  preRoundAudioState.lastMilestone = -1;
  setPreRoundProgress(0, "Preparing next phase\u2026");
}
function buildCharacterFetchLabels(teamMap, { maxPlayers = 4, maxCharsPerPlayer = 2 } = {}) {
  if (!teamMap || typeof teamMap !== "object") return [];
  return Object.entries(teamMap).slice(0, maxPlayers).map(([playerName, picks]) => {
    const items = (Array.isArray(picks) ? picks : []).map((entry) => {
      if (entry && typeof entry === "object") {
        return entry.character || entry.name || entry.label || "";
      }
      return String(entry || "");
    }).map((name) => String(name).trim()).filter(Boolean).slice(0, maxCharsPerPlayer);
    if (!items.length) return null;
    return `${playerName}: ${items.join(", ")}`;
  }).filter(Boolean);
}
function buildCharacterFetchItems(teamMap, { maxPlayers = 5, maxCharsPerPlayer = 2 } = {}) {
  if (!teamMap || typeof teamMap !== "object") return [];
  return Object.entries(teamMap).slice(0, maxPlayers).flatMap(([playerName, picks]) => {
    return (Array.isArray(picks) ? picks : []).map((entry) => {
      if (entry && typeof entry === "object") {
        return entry.character || entry.name || entry.label || "";
      }
      return String(entry || "");
    }).map((name) => String(name).trim()).filter(Boolean).slice(0, maxCharsPerPlayer).map((character) => ({
      playerName,
      character,
      label: `${playerName}: ${character}`
    }));
  });
}
function resetVoteTallyLoadingState() {
  voteTallyLoadingState.active = false;
  voteTallyLoadingState.totalFetches = 0;
  voteTallyLoadingState.completedFetches = 0;
  if (voteTallyLoadingState.pulseTimer) {
    clearInterval(voteTallyLoadingState.pulseTimer);
    voteTallyLoadingState.pulseTimer = null;
  }
  if (voteTallyLoadingState.finalizeTimer) {
    clearInterval(voteTallyLoadingState.finalizeTimer);
    voteTallyLoadingState.finalizeTimer = null;
  }
}
function applyVoteTallyProgressUpdate(payload = {}) {
  if (!voteTallyLoadingState.active) return;
  const total = Math.max(1, Number(payload.total) || voteTallyLoadingState.totalFetches || 1);
  const completed = Math.max(0, Math.min(total, Number(payload.completed) || 0));
  voteTallyLoadingState.totalFetches = total;
  voteTallyLoadingState.completedFetches = completed;
  if (voteTallyLoadingState.pulseTimer) {
    clearInterval(voteTallyLoadingState.pulseTimer);
    voteTallyLoadingState.pulseTimer = null;
  }
  const ratio = total > 0 ? completed / total : 0;
  const progress = Math.max(voteTallyLoadingState.stallTarget, Math.min(96, Math.round(78 + ratio * 18)));
  const playerName = payload.playerName ? String(payload.playerName) : "";
  const character = payload.character ? String(payload.character) : "";
  const success = payload.success !== false;
  const statusPrefix = success ? "Fetched" : "Fallback";
  const statusText = playerName && character ? `${statusPrefix}: ${character} (${playerName})` : `Fetched ${completed}/${total} roster entries\u2026`;
  setPreRoundProgress(progress, `Fetching matchup intel\u2026 \u2022 ${statusText}`);
  playFetchCompleteSound(success);
  if (completed >= total) {
    if (!voteTallyLoadingState.finalizeTimer) {
      let pulse = 0;
      voteTallyLoadingState.finalizeTimer = setInterval(() => {
        const boundedPct = 96 + Math.round(Math.sin(pulse) * 1);
        setPreRoundProgress(Math.max(95, Math.min(98, boundedPct)), "Applying scoring rules and final tie checks\u2026");
        pulse += 0.9;
      }, 500);
      addTimer(voteTallyLoadingState.finalizeTimer);
    }
  }
}
function showPreRoundLoadingState({
  title,
  message,
  stages = [],
  progress = 0,
  showCountdown = false,
  countdownValue = ""
}) {
  const roundLabel = document.getElementById("roundLabel");
  const messageEl = document.getElementById("preRoundMessage");
  const countdown = document.getElementById("countdown");
  const loading = document.getElementById("preRoundLoading");
  if (roundLabel && title) roundLabel.textContent = title;
  if (messageEl && message) messageEl.textContent = message;
  if (countdown) {
    countdown.style.display = showCountdown ? "block" : "none";
    if (showCountdown) {
      countdown.style.fontSize = "10em";
      countdown.textContent = String(countdownValue);
    }
  }
  if (loading) {
    loading.style.display = "block";
  }
  const stageList = Array.isArray(stages) && stages.length ? stages : ["Fetching scenario data\u2026"];
  const stageIndex = Math.max(0, Math.min(stageList.length - 1, Math.floor(Math.max(0, Math.min(99, progress)) / 100 * stageList.length)));
  setPreRoundProgress(progress, stageList[stageIndex]);
}
function normalizePackMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const visuals = meta.visuals && typeof meta.visuals === "object" ? meta.visuals : {};
  return {
    id: meta.id ? String(meta.id) : "default",
    label: meta.label ? String(meta.label) : "Default",
    description: meta.description ? String(meta.description) : "",
    themeTags: Array.isArray(meta.themeTags) ? meta.themeTags.map((tag) => String(tag)).filter(Boolean).slice(0, 6) : [],
    visuals: {
      chipLabel: visuals.chipLabel ? String(visuals.chipLabel) : "",
      accentColor: visuals.accentColor ? String(visuals.accentColor) : "",
      tone: visuals.tone ? String(visuals.tone) : ""
    }
  };
}
function normalizeCategoryRegistryPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const categories = Array.isArray(payload.categories) ? payload.categories.map((entry) => ({
    id: String(entry && entry.id || "").trim().toLowerCase(),
    displayName: String(entry && entry.displayName || "").trim(),
    family: String(entry && entry.family || "unknown").trim(),
    riskLevel: String(entry && entry.riskLevel || "med").trim().toLowerCase(),
    version: String(entry && entry.version || payload.version || "v1").trim()
  })).filter((entry) => entry.id && entry.displayName) : [];
  return {
    version: String(payload.version || "v1").trim() || "v1",
    updatedAt: String(payload.updatedAt || "").trim(),
    categories
  };
}
function getCategoryRegistryRows() {
  const registry = roomState && roomState.categoryRegistry && typeof roomState.categoryRegistry === "object" ? roomState.categoryRegistry : null;
  return registry && Array.isArray(registry.categories) ? registry.categories : [];
}
function getCategoryEntryById(categoryId) {
  const id = String(categoryId || "").trim().toLowerCase();
  if (!id) return null;
  return getCategoryRegistryRows().find((entry) => entry && entry.id === id) || null;
}
function normalizeLockedCategoryPayload(payload = null) {
  if (!payload || typeof payload !== "object") return null;
  const id = String(payload.id || "").trim().toLowerCase();
  if (!id) return null;
  const fallback = getCategoryEntryById(id);
  return {
    id,
    displayName: String(payload.displayName || fallback && fallback.displayName || id),
    family: String(payload.family || fallback && fallback.family || "unknown"),
    riskLevel: String(payload.riskLevel || fallback && fallback.riskLevel || "med")
  };
}
function resolveLockedCategoryForUi() {
  const fromGame = normalizeLockedCategoryPayload(gameState && gameState.lockedCategory);
  if (fromGame) return fromGame;
  const fromRoomSettingId = String(roomState && roomState.settings && roomState.settings.categoryId || "").trim().toLowerCase();
  const fromRoomSettingEntry = fromRoomSettingId ? getCategoryEntryById(fromRoomSettingId) : null;
  if (fromRoomSettingEntry) {
    return {
      id: fromRoomSettingEntry.id,
      displayName: fromRoomSettingEntry.displayName,
      family: fromRoomSettingEntry.family,
      riskLevel: fromRoomSettingEntry.riskLevel
    };
  }
  return null;
}
function buildLockedCategoryLabel(lockedCategory = null) {
  const entry = normalizeLockedCategoryPayload(lockedCategory) || resolveLockedCategoryForUi();
  if (!entry) return "Auto / not locked";
  return `${entry.displayName} \u2022 ${entry.family} \u2022 risk ${entry.riskLevel}`;
}
function renderLockedCategoryContext() {
  const label = buildLockedCategoryLabel();
  const scenarioEl = document.getElementById("scenarioLockedCategory");
  const votingEl = document.getElementById("votingLockedCategory");
  const roundEl = document.getElementById("roundCategoryMeta");
  const finalEl = document.getElementById("finalLockedCategory");
  if (scenarioEl) scenarioEl.textContent = `Category: ${label}`;
  if (votingEl) votingEl.textContent = label;
  if (roundEl) roundEl.innerHTML = `<strong>Category:</strong> ${escapeHtml(label)}`;
  if (finalEl) {
    finalEl.innerHTML = `<span class="pack-meta-caption">Category:</span> ${escapeHtml(label)}`;
    finalEl.hidden = false;
  }
}
function setLockedCategoryContext(lockedCategory = null) {
  const normalized = normalizeLockedCategoryPayload(lockedCategory);
  if (normalized) {
    gameState.lockedCategory = normalized;
  }
  renderLockedCategoryContext();
}
function clearCategoryVoteCountdownTimer() {
  if (!categoryVoteCountdownTimer) return;
  clearInterval(categoryVoteCountdownTimer);
  categoryVoteCountdownTimer = null;
}
function updateCategoryDescription(categoryId) {
  const descriptionEl = document.getElementById("categoryDescription");
  if (!descriptionEl) return;
  const mode = String(roomState && roomState.settings && roomState.settings.categoriesMode || "smart_random").trim().toLowerCase();
  if (mode === "off") {
    descriptionEl.textContent = "Categories disabled for this lobby.";
    return;
  }
  if (mode === "group_vote") {
    descriptionEl.textContent = "Category will be chosen by group vote when the host starts the game.";
    return;
  }
  const entry = getCategoryEntryById(categoryId);
  if (!entry) {
    descriptionEl.textContent = mode === "smart_random" ? "Smart Random rotates categories with anti-repeat balancing." : "Select a category for this lobby.";
    return;
  }
  descriptionEl.textContent = `${entry.displayName} \u2022 ${entry.family} \u2022 risk ${entry.riskLevel}`;
}
function renderCategoryOptions() {
  const select = document.getElementById("categoryId");
  if (!select) return;
  const categories = getCategoryRegistryRows();
  const currentValue = String(roomState && roomState.settings && roomState.settings.categoryId || select.value || "").trim().toLowerCase();
  select.innerHTML = "";
  const autoOption = document.createElement("option");
  autoOption.value = "";
  autoOption.textContent = "Auto (based on mode)";
  select.appendChild(autoOption);
  categories.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = `${entry.displayName} [${entry.family}]`;
    select.appendChild(option);
  });
  select.value = categories.some((entry) => entry.id === currentValue) ? currentValue : "";
  updateCategoryDescription(select.value);
}
function applyCategorySettingsInputs(settings = {}) {
  const categoryModeInput = document.getElementById("categoriesMode");
  const categoryIdInput = document.getElementById("categoryId");
  const mode = String(settings && settings.categoriesMode || "smart_random").trim().toLowerCase();
  const categoryId = String(settings && settings.categoryId || "").trim().toLowerCase();
  if (categoryModeInput) categoryModeInput.value = mode || "smart_random";
  if (categoryIdInput) {
    if (!Array.from(categoryIdInput.options || []).some((option) => String(option.value || "").toLowerCase() === categoryId)) {
      categoryIdInput.value = "";
    } else {
      categoryIdInput.value = categoryId;
    }
    categoryIdInput.disabled = mode === "off" || mode === "smart_random" || mode === "group_vote";
  }
  updateCategoryDescription(categoryIdInput ? categoryIdInput.value : categoryId);
}
function renderCategoryTelemetrySummary(telemetry = null) {
  const node = document.getElementById("categoryTelemetrySummary");
  if (!node) return;
  const safe = telemetry && typeof telemetry === "object" ? telemetry : null;
  if (!safe) {
    node.textContent = "";
    return;
  }
  const sessions = Number(safe.voteSessionsStarted) || 0;
  const votes = Number(safe.votesCast) || 0;
  const changed = Number(safe.votesChanged) || 0;
  const blockedStarts = Number(safe.startBlockedByVote) || 0;
  const resumedStarts = Number(safe.startResumedAfterVote) || 0;
  const impact = safe.round4CategoryImpact && typeof safe.round4CategoryImpact === "object" ? safe.round4CategoryImpact : null;
  const impactText = impact && Number(impact.matches) > 0 ? ` \u2022 fairness avgFit ${Number(impact.avgCategoryFit || 0).toFixed(1)} avgImpact ${Number(impact.avgNetImpact || 0).toFixed(1)} over ${Number(impact.matches)} finals` : "";
  node.textContent = `Vote telemetry: sessions ${sessions}, votes ${votes} (${changed} changes), starts blocked ${blockedStarts}, starts resumed ${resumedStarts}${impactText}`;
}
function renderCategoryVotePanel(voteState = null) {
  const statusEl = document.getElementById("categoryVoteStatus");
  const selectEl = document.getElementById("categoryVoteChoice");
  const castBtn = document.getElementById("castCategoryVoteBtn");
  const metaEl = document.getElementById("categoryVoteMeta");
  if (!statusEl || !selectEl || !castBtn) return;
  const vote = voteState && typeof voteState === "object" ? voteState : null;
  const options = vote && Array.isArray(vote.options) ? vote.options : [];
  const active = Boolean(vote && vote.active === true && options.length);
  const isInRoom = Boolean(player && player.name && player.room);
  selectEl.innerHTML = "";
  if (!active) {
    clearCategoryVoteCountdownTimer();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No active options";
    selectEl.appendChild(option);
    castBtn.disabled = true;
    statusEl.textContent = "No active category vote.";
    if (metaEl) metaEl.textContent = "";
    renderCategoryVoteFullscreen(null);
    return;
  }
  options.forEach((entry) => {
    const option = document.createElement("option");
    const id = String(entry && entry.id || "").trim().toLowerCase();
    const displayName = String(entry && entry.displayName || id || "Unknown");
    const votes = Number(entry && entry.votes) || 0;
    option.value = id;
    option.textContent = `${displayName} (${votes})`;
    selectEl.appendChild(option);
  });
  const hasLocalChoice = options.some((entry) => String(entry && entry.id || "").trim().toLowerCase() === categoryVoteLocalChoice);
  if (hasLocalChoice) {
    selectEl.value = categoryVoteLocalChoice;
  } else if (options.length) {
    selectEl.value = String(options[0] && options[0].id || "").trim().toLowerCase();
    categoryVoteLocalChoice = String(selectEl.value || "").trim().toLowerCase();
  }
  castBtn.disabled = !isInRoom;
  const updateCountdown = () => {
    const endsAtMs = Number(vote && vote.endsAtMs) || 0;
    const secondsLeft = endsAtMs > 0 ? Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1e3)) : 0;
    statusEl.textContent = `Pre-game category vote active \u2022 ${Number(vote.voteCount) || 0}/${Number(vote.totalPlayers) || 0} votes \u2022 ${secondsLeft}s left`;
    if (secondsLeft <= 0) {
      clearCategoryVoteCountdownTimer();
    }
  };
  updateCountdown();
  clearCategoryVoteCountdownTimer();
  categoryVoteCountdownTimer = setInterval(updateCountdown, 1e3);
  if (metaEl) {
    const startedBy = String(vote.startedBy || "").trim();
    metaEl.textContent = startedBy ? `Started by ${startedBy}. Match start is paused until this vote locks.` : "Started by system. Match start is paused until this vote locks.";
  }
  renderCategoryVoteFullscreen(vote);
}
function renderCategoryVoteFullscreen(voteState = null) {
  const statusEl = document.getElementById("categoryVoteScreenStatus");
  const metaEl = document.getElementById("categoryVoteScreenMeta");
  const listEl = document.getElementById("categoryVoteScreenOptions");
  if (!statusEl || !metaEl || !listEl) return;
  const vote = voteState && typeof voteState === "object" ? voteState : null;
  const options = vote && Array.isArray(vote.options) ? vote.options : [];
  const active = Boolean(vote && vote.active === true && options.length);
  listEl.innerHTML = "";
  if (!active) {
    listEl.innerHTML = '<div class="category-vote-empty">Waiting for host to open a vote.</div>';
    statusEl.textContent = "Waiting for category vote...";
    metaEl.textContent = "The host can start a category vote when mode is Group Vote.";
    return;
  }
  const endsAtMs = Number(vote.endsAtMs) || 0;
  const secondsLeft = endsAtMs > 0 ? Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1e3)) : 0;
  statusEl.textContent = `Category vote active \u2022 ${Number(vote.voteCount) || 0}/${Number(vote.totalPlayers) || 0} votes \u2022 ${secondsLeft}s left`;
  const startedBy = String(vote.startedBy || "").trim();
  metaEl.textContent = startedBy ? `Started by ${startedBy}. Choose one category to continue.` : "Started by system. Choose one category to continue.";
  const maxVotes = Math.max(1, ...options.map((entry) => Number(entry && entry.votes) || 0));
  options.forEach((entry) => {
    const id = String(entry && entry.id || "").trim().toLowerCase();
    if (!id) return;
    const displayName = String(entry && entry.displayName || id);
    const votes = Number(entry && entry.votes) || 0;
    const family = String(entry && entry.family || "mixed");
    const riskLevel = String(entry && entry.riskLevel || "med");
    const votePct = Math.max(0, Math.min(100, Math.round(votes / maxVotes * 100)));
    const selected = categoryVoteLocalChoice && categoryVoteLocalChoice === id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `category-vote-option ${selected ? "is-selected" : ""}`;
    btn.dataset.categoryVoteId = id;
    btn.setAttribute("aria-label", `${displayName} (${votes} votes), family ${family}, risk ${riskLevel}`);
    btn.innerHTML = `
      <div class="category-vote-option-head">
        <strong>${escapeHtml(displayName)}</strong>
        <span class="category-vote-votes">${votes} vote${votes === 1 ? "" : "s"}</span>
      </div>
      <div class="category-vote-option-meta">
        <span>${escapeHtml(family)}</span>
        <span>Risk ${escapeHtml(riskLevel.toUpperCase())}</span>
      </div>
      <div class="category-vote-meter">
        <i style="width:${votePct}%"></i>
      </div>
    `;
    listEl.appendChild(btn);
  });
}
async function loadCategoryRegistryCatalog() {
  try {
    const response = await fetch("/api/categories", { cache: "force-cache" });
    if (!response || !response.ok) return;
    const payload = await response.json();
    roomState.categoryRegistry = normalizeCategoryRegistryPayload(payload);
    renderCategoryOptions();
    applyCategorySettingsInputs(roomState.settings || {});
  } catch (error) {
  }
}
function getPackCatalogPacks() {
  const catalog = roomState.packCatalog && typeof roomState.packCatalog === "object" ? roomState.packCatalog : null;
  return catalog && Array.isArray(catalog.packs) ? catalog.packs : [];
}
function getCatalogPackEntry(packId) {
  const id = String(packId || "").toLowerCase() || "default";
  return getPackCatalogPacks().find((entry) => entry && String(entry.id || "").toLowerCase() === id) || null;
}
function resolveActivePackMeta(incomingMeta = null) {
  const normalizedIncoming = normalizePackMeta(incomingMeta);
  if (normalizedIncoming) return normalizedIncoming;
  const fromGameState = normalizePackMeta(gameState.activePackMeta);
  if (fromGameState) return fromGameState;
  const fromRoom = normalizePackMeta(roomState.selectedPackMeta);
  if (fromRoom) return fromRoom;
  const packId = roomState && roomState.settings ? roomState.settings.contentPackId : "default";
  return normalizePackMeta(getCatalogPackEntry(packId)) || {
    id: "default",
    label: "Default",
    description: "Core LobbyWARS pack.",
    themeTags: [],
    visuals: { chipLabel: "CORE", accentColor: "", tone: "" }
  };
}
function buildPackChipMarkup(meta) {
  const pack = resolveActivePackMeta(meta);
  const chipLabel = pack.visuals && pack.visuals.chipLabel ? pack.visuals.chipLabel : pack.label;
  const accent = pack.visuals && pack.visuals.accentColor ? pack.visuals.accentColor : "";
  const style = accent ? ` style="--pack-accent:${escapeHtml(accent)}"` : "";
  return `<span class="pack-meta-pill"${style}>${escapeHtml(chipLabel)}</span> ${escapeHtml(pack.label)}`;
}
function updateContentPackDescription(selectedPackId) {
  const helpEl = document.getElementById("contentPackDescription");
  if (!helpEl) return;
  const selected = getCatalogPackEntry(selectedPackId || roomState.settings && roomState.settings.contentPackId);
  const featuredPackId = roomState.packCatalog && roomState.packCatalog.featuredPackId ? String(roomState.packCatalog.featuredPackId) : "";
  const isFeatured = selected && featuredPackId && String(selected.id) === featuredPackId;
  const baseDescription = selected && selected.description ? String(selected.description) : "Curated pack themes for scenarios, twists, and finals.";
  helpEl.textContent = isFeatured ? `Featured today: ${baseDescription}` : baseDescription;
}
function renderContentPackOptions() {
  const select = document.getElementById("contentPack");
  if (!select) return;
  const catalogPacks = getPackCatalogPacks();
  const fallbackOptions = [{ id: "default", label: "Default", description: "Core LobbyWARS pack.", visuals: { chipLabel: "CORE" } }];
  const packs = catalogPacks.length ? catalogPacks : fallbackOptions;
  const currentValue = String(roomState.settings && roomState.settings.contentPackId || select.value || "default");
  select.innerHTML = "";
  packs.forEach((entry) => {
    const option = document.createElement("option");
    const id = entry && entry.id ? String(entry.id) : "default";
    const label = entry && entry.label ? String(entry.label) : id;
    const chip = entry && entry.visuals && entry.visuals.chipLabel ? String(entry.visuals.chipLabel) : "";
    const featuredId = roomState.packCatalog && roomState.packCatalog.featuredPackId ? String(roomState.packCatalog.featuredPackId) : "";
    const featuredTag = featuredId && featuredId === id ? " (Featured)" : "";
    option.value = id;
    option.textContent = chip ? `${label} [${chip}]${featuredTag}` : `${label}${featuredTag}`;
    select.appendChild(option);
  });
  select.value = packs.some((entry) => String(entry && entry.id) === currentValue) ? currentValue : "default";
  updateContentPackDescription(select.value);
}
function setFinalPackMetaLine(meta) {
  const line = document.getElementById("finalPackMeta");
  if (!line) return;
  const pack = resolveActivePackMeta(meta);
  const tags = Array.isArray(pack.themeTags) && pack.themeTags.length ? ` <span class="pack-meta-tags">${escapeHtml(pack.themeTags.slice(0, 3).join(" \u2022 "))}</span>` : "";
  line.innerHTML = `<span class="pack-meta-caption">Pack:</span> ${buildPackChipMarkup(pack)}${tags}`;
  line.hidden = false;
}
function buildRoundScoringMetaText(packMeta = null) {
  const pack = resolveActivePackMeta(packMeta);
  const packSuffix = pack && pack.label ? ` \u2022 Pack: ${pack.label}` : "";
  return `<strong>Scoring:</strong> Community votes + contextual intel fit + other rule-based modifiers${escapeHtml(packSuffix)}`;
}
function joinRoom() {
  const name = document.getElementById("name").value.trim();
  const room = document.getElementById("room").value.trim().toUpperCase();
  const joinAsHost = document.getElementById("joinAsHost")?.checked === true;
  if (!name) {
    showToast("Please enter your name!", "warning");
    document.getElementById("name").focus();
    return;
  }
  if (!room) {
    showToast("Please enter a room code!", "warning");
    document.getElementById("room").focus();
    return;
  }
  if (name.length < 2) {
    showToast("Name must be at least 2 characters.", "warning");
    return;
  }
  if (room.length < 2) {
    showToast("Room code must be at least 2 characters.", "warning");
    return;
  }
  player.name = name;
  player.room = room;
  console.log(`Attempting to join room ${room} as ${name}${joinAsHost ? " (host)" : ""}`);
  socket.emit("joinRoom", { name, room, joinAsHost });
}
function leaveRoom() {
  if (confirm("Are you sure you want to leave? You'll disconnect from the room.")) {
    clearVoiceCues("leave-room", { includeActive: true });
    audioState.hasPlayedLobbyEntry = false;
    socket.disconnect();
    socket.connect();
    showScreen("join");
    document.getElementById("name").value = "";
    document.getElementById("room").value = "";
    const joinAsHost = document.getElementById("joinAsHost");
    if (joinAsHost) joinAsHost.checked = false;
    resetAllState();
  }
}
socket.on("connect", () => {
  console.log("\u2713 Socket connected:", socket.id);
  clearNetworkOutageIndicators();
  const round4Screen = document.getElementById("round4EvalScreen");
  const round4Active = Boolean(round4Screen && round4Screen.classList.contains("active"));
  if (isLobbyScreenActive() || round4Active) {
    showToast("Reconnected to server.", "info", 2200);
  }
  showConnectionDebugToast("connected");
});
socket.on("disconnect", (reason) => {
  updateNetworkOutageIndicators(reason, { showToastNotice: true });
  showConnectionDebugToast("disconnected", String(reason || "unknown"));
});
socket.on("connect_error", (error) => {
  const detail = error && error.message ? error.message : "connect_error";
  updateNetworkOutageIndicators(detail, { showToastNotice: true });
  showConnectionDebugToast("error", detail);
});
socket.on("joinError", (msg) => {
  showToast(msg, "error", 5e3);
});
socket.on("gameError", (msg) => {
  showToast(msg, "error", 5e3);
});
socket.on("roomData", (data) => {
  console.log("\u{1F4CD} Received roomData:", data);
  Object.assign(roomState, data);
  if (data && data.voiceConfig && typeof data.voiceConfig === "object") {
    const narratorVoiceId = normalizeKokoroVoiceId(data.voiceConfig.narratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) || DEFAULT_NARRATOR_VOICE_ID;
    const updatedBy = String(data.voiceConfig.updatedBy || "").trim();
    const updatedAt = Number(data.voiceConfig.updatedAt) || 0;
    if (updatedAt > 0) {
      applyQueuedKokoroNarratorVoice({
        narratorVoiceId,
        queuedBy: updatedBy,
        queuedAt: updatedAt
      }, { local: updatedBy === String(player && player.name || "") });
    } else if (normalizeKokoroVoiceId(audioState.kokoroNarratorVoiceId || DEFAULT_NARRATOR_VOICE_ID) !== narratorVoiceId) {
      setKokoroVoiceChoice("narrator", narratorVoiceId, { persist: true });
    }
  }
  roomState.packCatalog = data && data.packCatalog ? data.packCatalog : roomState.packCatalog;
  roomState.selectedPackMeta = normalizePackMeta(data && data.selectedPackMeta) || roomState.selectedPackMeta;
  if (data && data.settings && data.settings.categoryId) {
    const roomCategoryId = String(data.settings.categoryId || "").trim().toLowerCase();
    const roomCategory = getCategoryEntryById(roomCategoryId);
    if (roomCategory) {
      gameState.lockedCategory = {
        id: roomCategory.id,
        displayName: roomCategory.displayName,
        family: roomCategory.family,
        riskLevel: roomCategory.riskLevel
      };
    }
  }
  roomState.categoryRegistry = normalizeCategoryRegistryPayload(data && data.categoryRegistry) || roomState.categoryRegistry;
  roomState.categoryVote = data && data.categoryVote && typeof data.categoryVote === "object" ? data.categoryVote : null;
  roomState.categoryTelemetry = data && data.categoryTelemetry && typeof data.categoryTelemetry === "object" ? data.categoryTelemetry : roomState.categoryTelemetry;
  roomState.messages = normalizeChatMessages(data.messages);
  const prunedHistory = pruneChatMessages(roomState.messages);
  roomState.messages = prunedHistory.messages;
  updateChatEraseNotice({ prunedCount: prunedHistory.prunedCount });
  if (chatPingState.roomCode !== (player.room || "")) {
    chatPingState.roomCode = player.room || "";
    resetChatTabPing();
    clearKokoroNarratorPeerPing({ sync: false });
  } else {
    syncChatTabPingBadge();
  }
  const isHost = data.host === player.name;
  document.getElementById("roomCode").textContent = player.room;
  document.getElementById("playerCountBadge").textContent = `${data.players.length}/6`;
  const badge = document.getElementById("playerCountBadge");
  badge.classList.remove("available", "almost-full", "full");
  if (data.players.length >= 6) {
    badge.classList.add("full");
  } else if (data.players.length >= 5) {
    badge.classList.add("almost-full");
  } else {
    badge.classList.add("available");
  }
  const settingsContent = document.getElementById("settingsContent");
  const hostNote = document.getElementById("hostNote");
  const settingsReadonlyHome = document.getElementById("settingsReadonlyHome");
  const hostBadge = document.getElementById("hostBadge");
  renderContentPackOptions();
  renderCategoryOptions();
  renderCategoryVotePanel(roomState.categoryVote);
  renderCategoryTelemetrySummary(roomState.categoryTelemetry);
  renderLockedCategoryContext();
  if (data.settings) {
    const difficultyInput = document.getElementById("difficulty");
    const scenarioThemeInput = document.getElementById("scenarioTheme");
    const customScenarioInput = document.getElementById("customScenario");
    const contentPackInput = document.getElementById("contentPack");
    const plotTwistsInput = document.getElementById("plotTwists");
    const noPlotTwistsInput = document.getElementById("noPlotTwists");
    const noFinalScenarioTwistInput = document.getElementById("noFinalScenarioTwist");
    if (difficultyInput && data.settings.difficulty) difficultyInput.value = data.settings.difficulty;
    if (scenarioThemeInput && data.settings.scenarioTheme) scenarioThemeInput.value = data.settings.scenarioTheme;
    if (customScenarioInput && data.settings.customScenario !== void 0) customScenarioInput.value = data.settings.customScenario;
    if (contentPackInput && data.settings.contentPackId) contentPackInput.value = data.settings.contentPackId;
    if (plotTwistsInput && data.settings.plotTwists !== void 0) plotTwistsInput.checked = data.settings.plotTwists;
    if (noPlotTwistsInput && data.settings.plotTwists !== void 0) noPlotTwistsInput.checked = !Boolean(data.settings.plotTwists);
    if (noFinalScenarioTwistInput && data.settings.noFinalScenarioTwist !== void 0) {
      noFinalScenarioTwistInput.checked = Boolean(data.settings.noFinalScenarioTwist);
    }
    updateContentPackDescription(data.settings.contentPackId);
    applyCategorySettingsInputs(data.settings);
  }
  if (hostBadge) hostBadge.style.display = isHost ? "inline-flex" : "none";
  if (settingsReadonlyHome) settingsReadonlyHome.style.display = isHost ? "none" : "grid";
  if (isHost) {
    settingsContent.style.display = "block";
    hostNote.style.display = "none";
  } else {
    settingsContent.style.display = "none";
    hostNote.style.display = "block";
    document.getElementById("hostNameDisplay").textContent = data.host || "No host selected yet (a player must join as host)";
  }
  if (typeof window !== "undefined" && window.SettingsOS && typeof window.SettingsOS.refreshNowPlaying === "function") {
    window.SettingsOS.refreshNowPlaying();
  }
  const ul = document.getElementById("playerList");
  ul.innerHTML = "";
  data.players.forEach((p, idx) => {
    const li = document.createElement("li");
    li.className = `player-item ${p.ready ? "ready" : "not-ready"}`;
    li.setAttribute("role", "listitem");
    const readyBadge = document.createElement("span");
    readyBadge.className = "ready-badge";
    const nameWrap = document.createElement("span");
    if (p.name === data.host) {
      const hostStar = document.createElement("span");
      hostStar.className = "host-star";
      hostStar.textContent = "\u2605";
      nameWrap.appendChild(hostStar);
      appendText(nameWrap, " ");
    }
    const strong = document.createElement("strong");
    strong.textContent = p.name;
    nameWrap.appendChild(strong);
    if (p.name === player.name) {
      appendText(nameWrap, " ");
      const youBadge = document.createElement("span");
      youBadge.className = "you-badge";
      youBadge.textContent = "(YOU)";
      nameWrap.appendChild(youBadge);
    }
    const idxSpan = document.createElement("span");
    idxSpan.style.marginLeft = "auto";
    idxSpan.style.fontSize = "0.85em";
    idxSpan.style.opacity = "0.7";
    idxSpan.textContent = `#${idx + 1}`;
    li.appendChild(readyBadge);
    li.appendChild(nameWrap);
    li.appendChild(idxSpan);
    ul.appendChild(li);
  });
  if (!data.isGameActive) {
    console.log("\u2705 Showing lobby - game not active");
    showScreen("lobby");
    if (!audioState.hasPlayedLobbyEntry) {
      playJoinSound();
      audioState.hasPlayedLobbyEntry = true;
    }
    const startBtn = document.getElementById("startBtn");
    const readyBtn = document.getElementById("readyBtn");
    const minPlayersMsg = document.getElementById("minPlayersMsg");
    const hostWaiting = document.getElementById("hostWaiting");
    const currentPlayer = data.players.find((p) => p.name === player.name);
    if (isHost) {
      startBtn.style.display = "block";
      hostWaiting.style.display = "none";
      const readyCount = data.players.filter((p) => p.ready).length;
      const allReady = readyCount === data.players.length && data.players.length >= 3;
      if (allReady) {
        startBtn.disabled = false;
        startBtn.className = "btn btn-success pulsing-glow";
        minPlayersMsg.style.display = "none";
      } else {
        startBtn.disabled = true;
        startBtn.className = "btn";
        minPlayersMsg.style.display = "block";
        minPlayersMsg.innerHTML = `
          <strong>\u23F3 Waiting:</strong>
          ${readyCount}/${data.players.length} ready
          ${data.players.length < 3 ? "(Need 3+)" : ""}
        `;
      }
    } else {
      startBtn.style.display = "none";
      minPlayersMsg.style.display = "none";
      hostWaiting.style.display = "block";
      hostWaiting.textContent = data.host ? `\u23F3 Waiting for ${data.host} to start...` : "\u23F3 Waiting for someone to join as host...";
    }
    if (currentPlayer) {
      player.ready = Boolean(currentPlayer.ready);
      clearReadyToggleArm();
      clearReadyTogglePending();
      updateReadyButtonUi(player.ready);
    } else if (readyBtn) {
      player.ready = false;
      clearReadyToggleArm();
      clearReadyTogglePending();
      updateReadyButtonUi(false);
    }
  }
  renderChatMessages({ forceBottom: true });
});
socket.on("settingsUpdated", (settings) => {
  roomState.settings = settings;
  renderContentPackOptions();
  renderCategoryOptions();
  const difficulty = document.getElementById("difficulty");
  const scenarioTheme = document.getElementById("scenarioTheme");
  const customScenario = document.getElementById("customScenario");
  const contentPack = document.getElementById("contentPack");
  const plotTwists = document.getElementById("plotTwists");
  const noPlotTwists = document.getElementById("noPlotTwists");
  const noFinalScenarioTwist = document.getElementById("noFinalScenarioTwist");
  if (difficulty && settings.difficulty) difficulty.value = settings.difficulty;
  if (scenarioTheme && settings.scenarioTheme) scenarioTheme.value = settings.scenarioTheme;
  if (customScenario && settings.customScenario !== void 0) customScenario.value = settings.customScenario;
  if (contentPack && settings.contentPackId) contentPack.value = settings.contentPackId;
  if (plotTwists && settings.plotTwists !== void 0) plotTwists.checked = settings.plotTwists;
  if (noPlotTwists && settings.plotTwists !== void 0) noPlotTwists.checked = !Boolean(settings.plotTwists);
  if (noFinalScenarioTwist && settings.noFinalScenarioTwist !== void 0) {
    noFinalScenarioTwist.checked = Boolean(settings.noFinalScenarioTwist);
  }
  updateContentPackDescription(settings && settings.contentPackId);
  applyCategorySettingsInputs(settings || {});
  if (settings && settings.categoryId) {
    setLockedCategoryContext({ id: settings.categoryId });
  } else {
    renderLockedCategoryContext();
  }
  roomState.selectedPackMeta = normalizePackMeta(getCatalogPackEntry(settings && settings.contentPackId)) || roomState.selectedPackMeta;
  if (typeof window !== "undefined" && window.SettingsOS && typeof window.SettingsOS.refreshNowPlaying === "function") {
    window.SettingsOS.refreshNowPlaying();
  }
});
var SETTINGS_CHANGED_LABELS = {
  difficulty: "difficulty",
  scenarioTheme: "theme",
  contentPackId: "content pack",
  plotTwists: "plot twists",
  noFinalScenarioTwist: "final scenario/twist mode",
  customScenario: "custom scenario",
  categoriesMode: "categories mode",
  categoryId: "category",
  categoryVoteOptions: "category vote options",
  teamsMode: "teams mode",
  noVoting: "no voting mode"
};
function buildSettingsChangePingText(payload = {}) {
  const changedBy = String(payload.changedBy || "").trim();
  const changedKeys = Array.isArray(payload.changedKeys) ? payload.changedKeys.map((key) => String(key || "").trim()).filter(Boolean) : [];
  const labels = changedKeys.map((key) => SETTINGS_CHANGED_LABELS[key] || key).filter(Boolean);
  const uniqueLabels = Array.from(new Set(labels));
  const labelText = uniqueLabels.length ? uniqueLabels.join(", ") : "room settings";
  if (payload && payload.system === true) {
    return String(payload.summary || "Match complete: settings reset to defaults.");
  }
  if (changedBy && changedBy.toLowerCase() === String(player && player.name || "").toLowerCase()) {
    return `You updated ${labelText}.`;
  }
  if (changedBy) {
    return `${changedBy} updated ${labelText}.`;
  }
  return `Settings updated: ${labelText}.`;
}
socket.on("settingsChangePing", (payload) => {
  const message = buildSettingsChangePingText(payload);
  if (!message) return;
  try {
    playMessageSound();
  } catch (error) {
  }
  showToast(message, "info", 2600);
});
socket.on("categoryVoteStart", (payload) => {
  categoryVoteLocalChoice = "";
  roomState.categoryVote = payload && typeof payload === "object" ? payload : null;
  renderCategoryVotePanel(roomState.categoryVote);
  if (document.getElementById("categoryVoteScreen")) {
    showScreen("categoryVoteScreen");
  }
  showToast("Category vote started. Cast your vote before timeout.", "info", 2400);
});
socket.on("categoryVoteUpdate", (payload) => {
  roomState.categoryVote = payload && typeof payload === "object" ? payload : null;
  renderCategoryVotePanel(roomState.categoryVote);
  if (roomState.categoryVote && roomState.categoryVote.active === true && document.getElementById("categoryVoteScreen")) {
    showScreen("categoryVoteScreen");
  }
});
socket.on("categoryVoteLocked", (payload) => {
  categoryVoteLocalChoice = "";
  roomState.categoryVote = null;
  renderCategoryVotePanel(null);
  const winner = payload && payload.winner && typeof payload.winner === "object" ? payload.winner : null;
  if (winner && winner.id) {
    const nextSettings = {
      ...roomState.settings || {},
      categoryId: String(winner.id || "").trim().toLowerCase()
    };
    roomState.settings = nextSettings;
    applyCategorySettingsInputs(nextSettings);
    setLockedCategoryContext(winner);
    showToast(`Category locked: ${String(winner.displayName || winner.id)}.`, "info", 2600);
    return;
  }
  renderLockedCategoryContext();
  showToast("Category vote locked.", "info", 2200);
});
var handleNarratorVoiceQueuedSocket = (payload) => {
  if (!payload || typeof payload !== "object") return;
  applyQueuedKokoroNarratorVoice({
    narratorVoiceId: payload.narratorVoiceId,
    queuedBy: payload.queuedBy,
    queuedAt: payload.queuedAt
  }, { local: String(payload.queuedBy || "") === String(player && player.name || "") });
};
socket.on("narratorVoiceQueued", handleNarratorVoiceQueuedSocket);
socket.on("kokoroNarratorQueued", handleNarratorVoiceQueuedSocket);
function toggleReady() {
  const cooldownMs = getReadyCooldownRemainingMs();
  if (readyToggleLockState.pending || cooldownMs > 0) {
    updateReadyButtonUi(player.ready);
    return;
  }
  if (!readyToggleLockState.armed) {
    readyToggleLockState.armed = true;
    if (readyToggleLockState.armTimer) {
      clearTimeout(readyToggleLockState.armTimer);
    }
    readyToggleLockState.armTimer = setTimeout(() => {
      readyToggleLockState.armTimer = null;
      readyToggleLockState.armed = false;
      updateReadyButtonUi(player.ready);
    }, READY_TOGGLE_ARM_WINDOW_MS);
    updateReadyButtonUi(player.ready);
    const now = Date.now();
    if (now - Number(readyToggleLockState.lastHintAt || 0) > 900) {
      readyToggleLockState.lastHintAt = now;
      showToast(`Tap again to confirm ${player.ready ? "not ready" : "ready"}.`, "info", 1500);
    }
    return;
  }
  clearReadyToggleArm();
  readyToggleLockState.pending = true;
  readyToggleLockState.cooldownUntil = Date.now() + READY_TOGGLE_COOLDOWN_MS;
  if (readyToggleLockState.pendingTimer) {
    clearTimeout(readyToggleLockState.pendingTimer);
  }
  readyToggleLockState.pendingTimer = setTimeout(() => {
    readyToggleLockState.pendingTimer = null;
    clearReadyTogglePending();
    updateReadyButtonUi(player.ready);
  }, READY_TOGGLE_PENDING_TIMEOUT_MS);
  updateReadyButtonUi(player.ready);
  playReadyToggleSound(!player.ready);
  socket.emit("toggleReady");
}
function updateSettingsBatch(partialSettings = {}) {
  if (roomState.host !== player.name) return;
  const settings = { ...roomState.settings };
  Object.entries(partialSettings || {}).forEach(([key, value]) => {
    settings[key] = value;
  });
  if (Object.prototype.hasOwnProperty.call(partialSettings || {}, "contentPackId")) {
    updateContentPackDescription(settings.contentPackId);
  }
  socket.emit("updateSettings", settings);
}
function updateSetting(key, value) {
  updateSettingsBatch({ [key]: value });
}
function sendMessage() {
  const input = document.getElementById("chatInput");
  if (!input) return;
  const sendBtn = document.getElementById("chatSendBtn");
  const composer = document.querySelector(".chat-input-modern");
  const message = input.value.trim();
  if (!message) return;
  triggerTransientClass(sendBtn, "send-burst", 260);
  triggerTransientClass(composer, "composer-sent", 260);
  playMessageSound();
  socket.emit("sendMessage", message);
  input.value = "";
  syncChatComposerState();
  input.focus();
}
function sendReaction(emoji) {
  playMessageSound();
  socket.emit("sendReaction", emoji);
}
socket.on("newMessage", (msg) => {
  const cleanMessage = normalizeChatMessages([msg])[0];
  if (!cleanMessage) return;
  const serverPrunedCount = Math.max(0, Number(msg.prunedCount) || 0);
  if (serverPrunedCount > 0 && roomState.messages.length > 0) {
    roomState.messages.splice(0, Math.min(serverPrunedCount, roomState.messages.length));
  }
  updateChatEraseNotice({ prunedCount: serverPrunedCount });
  roomState.messages.push(cleanMessage);
  const localPruned = pruneChatMessages(roomState.messages);
  roomState.messages = localPruned.messages;
  renderChatMessages();
  maybeHandleIncomingChatPing(cleanMessage);
  if (msg.player !== player.name) {
    playMessageSound();
  }
});
function sendStartGame() {
  socket.emit("startGame");
}
function castCategoryVote(explicitCategoryId = "") {
  const select = document.getElementById("categoryVoteChoice");
  const categoryId = String(explicitCategoryId || select && select.value || "").trim().toLowerCase();
  if (!categoryId) {
    showToast("Select a category option first.", "warning", 1800);
    return;
  }
  categoryVoteLocalChoice = categoryId;
  if (select) select.value = categoryId;
  renderCategoryVoteFullscreen(roomState.categoryVote);
  socket.emit("castCategoryVote", { categoryId });
  showToast("Vote submitted.", "info", 1400);
}
socket.on("gameStarting", (data) => {
  resetDraftWaitIntelPreview({ hide: true });
  gameState.totalRounds = data.totalRounds;
  gameState.activePackMeta = normalizePackMeta(data && data.packMeta) || resolveActivePackMeta();
  gameState.myTeam = [];
  gameState.draftEntryCount = 0;
  gameState.draftLocked = false;
  gameState.myFinalTeam = [];
  gameState.voted = false;
  gameState.voteLocked = false;
  gameState.draftWarnings = {};
  setLockedCategoryContext(data && data.lockedCategory ? data.lockedCategory : null);
  playPhaseShiftSound();
  showToast("\u{1F389} Game starting! Get ready!", "info");
  const finalPackMeta = document.getElementById("finalPackMeta");
  if (finalPackMeta) {
    finalPackMeta.hidden = true;
    finalPackMeta.innerHTML = "";
  }
  const finalLockedCategory = document.getElementById("finalLockedCategory");
  if (finalLockedCategory) {
    finalLockedCategory.hidden = true;
    finalLockedCategory.innerHTML = "";
  }
  showScreen("preRound");
});
socket.on("roundStart", (data) => {
  resetCharacterCalloutSessionState("round-start");
  clearVoiceCues("round-start", { includeActive: true });
  enqueueVoiceCues(Array.isArray(data && data.voiceCues) ? data.voiceCues : [], {
    fallback: () => buildPhaseVoiceCues("roundStart", data)
  });
  resetDraftWaitIntelPreview({ hide: true });
  gameState.currentRound = data.roundNumber;
  gameState.myTeam = [];
  gameState.draftEntryCount = 0;
  gameState.draftLocked = false;
  gameState.allDrafts = {};
  gameState.voted = false;
  gameState.draftWarnings = {};
  clearTimers();
  const isFinal = data.isFinalRound;
  playPhaseShiftSound();
  if (isFinal) {
    console.log("Round 4 starting - skipping preRound countdown");
    return;
  }
  hidePreRoundLoadingState();
  document.getElementById("roundLabel").textContent = `\u{1F4CD} ROUND ${data.roundNumber} OF 3`;
  let countdown = 3;
  document.getElementById("countdown").textContent = countdown;
  document.getElementById("countdown").style.fontSize = "10em";
  document.getElementById("countdown").style.display = "block";
  const timer = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      document.getElementById("countdown").textContent = countdown;
      playCountdownTick(countdown);
    } else {
      playCountdownTick(0);
      clearInterval(timer);
    }
  }, 1e3);
  addTimer(timer);
  showScreen("preRound");
});
socket.on("scenarioRevealed", (data) => {
  clearTimers();
  clearVoiceCues("scenario-revealed", { includeActive: true });
  gameState.currentScenario = data.scenario;
  gameState.activePackMeta = normalizePackMeta(data && data.packMeta) || resolveActivePackMeta();
  gameState.myTeam = [];
  gameState.myDraftSlots = buildFallbackDraftSlotsFromTeam();
  gameState.draftActiveSlotIndex = 0;
  gameState.draftEntryCount = 0;
  gameState.draftLocked = false;
  gameState.voteLocked = false;
  gameState.currentVoteChoice = null;
  setLockedCategoryContext(data && data.lockedCategory ? data.lockedCategory : null);
  syncDraftEntryComposerVisibility();
  document.getElementById("currentRound").textContent = gameState.currentRound;
  document.getElementById("scenarioText").textContent = `BUILD A TEAM TO: ${data.scenario}`;
  const wordApiIndicator = document.getElementById("wordApiIndicator");
  if (wordApiIndicator) {
    const sourceLabel = typeof data.wordApiSource === "string" && data.wordApiSource.trim() ? data.wordApiSource.trim() : "Fallback Word Pool";
    const sourceIndex = Number.isFinite(Number(data.wordApiSourceIndex)) ? Number(data.wordApiSourceIndex) : null;
    const sourceTotal = Number.isFinite(Number(data.wordApiSourceTotal)) ? Number(data.wordApiSourceTotal) : null;
    const sourceSuffix = sourceIndex && sourceTotal ? ` (API ${sourceIndex}/${sourceTotal})` : "";
    const activePack = resolveActivePackMeta(data && data.packMeta);
    wordApiIndicator.textContent = `Auto-fill source: ${sourceLabel}${sourceSuffix} | Pack: ${activePack.label}`;
  }
  const myTeamList = document.getElementById("myTeam");
  if (myTeamList) myTeamList.innerHTML = "";
  renderMyDraftSlots();
  const livePicksList = document.getElementById("livePicksList");
  if (livePicksList) livePicksList.innerHTML = "";
  const charInput = document.getElementById("charInput");
  if (charInput) {
    charInput.value = "";
    charInput.focus();
  }
  let warningEl = document.getElementById("draftWarning");
  if (!warningEl) {
    warningEl = document.createElement("div");
    warningEl.id = "draftWarning";
    warningEl.style.cssText = `
      display: none;
      padding: 12px;
      margin: 15px auto;
      max-width: 350px;
      border-left: 4px solid;
      border-radius: 6px;
      font-size: 0.9em;
      font-weight: bold;
    `;
    charInput.parentElement.insertBefore(warningEl, charInput.nextSibling);
  }
  syncDraftActionControls();
  syncDraftComposerUi();
  if (document.getElementById("draftCounter")) {
    document.getElementById("draftCounter").textContent = "(0/2)";
    document.getElementById("draftCounter").style.color = "#666";
  }
  showScreen("scenarioScreen");
  playDraftSound();
  enqueueVoiceCues(Array.isArray(data && data.voiceCues) ? data.voiceCues : [], {
    fallback: () => buildPhaseVoiceCues("scenario", data)
  });
  let timeLeft = data.draftTimeRemaining;
  document.getElementById("draftTimer").textContent = timeLeft;
  const draftTimer = setInterval(() => {
    timeLeft--;
    const timerEl = document.getElementById("draftTimer");
    if (timerEl) {
      timerEl.textContent = timeLeft;
      if (timeLeft <= 10) {
        timerEl.style.color = "#ff5252";
        timerEl.style.fontWeight = "bold";
      }
    }
    if (timeLeft <= 0) {
      clearInterval(draftTimer);
      updateAutoFillWarning();
    }
  }, 1e3);
  addTimer(draftTimer);
});
function buildFallbackDraftSlotsFromTeam() {
  const team = Array.isArray(gameState.myTeam) ? gameState.myTeam : [];
  const slots = [];
  for (let i = 0; i < 2; i += 1) {
    const character = String(team[i] || "").trim();
    slots.push({
      slotIndex: i,
      character,
      filled: Boolean(character),
      autoFilled: false,
      editable: Boolean(character),
      editLocked: false,
      lockReason: "",
      editedCount: 0,
      updatedAtMs: 0
    });
  }
  return slots;
}
function getNarratorLeadLineFromVoiceCues(cues = []) {
  const list = Array.isArray(cues) ? cues : [];
  for (let i = 0; i < list.length; i += 1) {
    const cue = list[i] && typeof list[i] === "object" ? list[i] : null;
    if (!cue) continue;
    const type = String(cue.type || "").toLowerCase();
    if (type !== "narration" && type !== "round4") continue;
    const line = String(cue.subtitleText || cue.text || "").replace(/\s+/g, " ").trim();
    if (line) return line;
  }
  return "Final results are in.";
}
function getMyDraftSlots() {
  const slots = Array.isArray(gameState.myDraftSlots) && gameState.myDraftSlots.length ? gameState.myDraftSlots : buildFallbackDraftSlotsFromTeam();
  const normalized = [];
  for (let i = 0; i < 2; i += 1) {
    const raw = slots[i] && typeof slots[i] === "object" ? slots[i] : {};
    const character = String(raw.character || "").trim();
    const autoFilled = raw.autoFilled === true;
    const editLocked = raw.editLocked === true || autoFilled;
    normalized.push({
      slotIndex: i,
      character,
      filled: Boolean(character),
      autoFilled,
      editable: Boolean(character) && !editLocked,
      editLocked,
      lockReason: editLocked ? String(raw.lockReason || (autoFilled ? "auto_fill" : "locked")) : "",
      editedCount: Math.max(0, Number(raw.editedCount) || 0),
      updatedAtMs: Number(raw.updatedAtMs) || 0
    });
  }
  gameState.myDraftSlots = normalized;
  return normalized;
}
function countFilledDraftSlotsClient() {
  return getMyDraftSlots().filter((slot) => slot && slot.filled).length;
}
function getNextEditableDraftSlotIndex() {
  const slots = getMyDraftSlots();
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (!slot || !slot.filled) return i;
  }
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot && slot.editable) return i;
  }
  return 0;
}
function syncDraftSlotSelectionBounds({ preserveInput = true } = {}) {
  const slots = getMyDraftSlots();
  let nextIndex = Number.isFinite(Number(gameState.draftActiveSlotIndex)) ? Math.max(0, Math.min(1, Number(gameState.draftActiveSlotIndex))) : getNextEditableDraftSlotIndex();
  const activeSlot = slots[nextIndex];
  if (gameState.draftLocked || !activeSlot || activeSlot.filled && activeSlot.editLocked) {
    nextIndex = getNextEditableDraftSlotIndex();
  }
  gameState.draftActiveSlotIndex = nextIndex;
  if (!preserveInput) {
    const charInput = document.getElementById("charInput");
    if (charInput) {
      const slot = slots[nextIndex];
      charInput.value = slot && slot.filled ? String(slot.character || "") : "";
    }
  }
}
function getDraftSlotModeLabel(slot) {
  if (!slot) return "Choose a slot";
  if (gameState.draftLocked) return "Team locked";
  if (!slot.filled) return `Pick ${slot.slotIndex + 1}: Add`;
  if (slot.editLocked) return `Pick ${slot.slotIndex + 1} locked`;
  return `Pick ${slot.slotIndex + 1}: Edit`;
}
function syncDraftComposerUi() {
  const slots = getMyDraftSlots();
  syncDraftSlotSelectionBounds({ preserveInput: true });
  const activeIndex = Math.max(0, Math.min(1, Number(gameState.draftActiveSlotIndex) || 0));
  const activeSlot = slots[activeIndex] || slots[0] || null;
  const charInput = document.getElementById("charInput");
  const submitBtn = document.getElementById("draftSubmitBtn") || document.querySelector(".btn-submit-draft");
  const clearBtn = document.getElementById("draftClearBtn");
  const modeEl = document.getElementById("draftComposerMode");
  const hintEl = document.getElementById("draftComposerHint");
  const summaryEl = document.getElementById("draftSlotSummary");
  const tabButtons = [
    document.getElementById("draftSlotTab0"),
    document.getElementById("draftSlotTab1")
  ];
  tabButtons.forEach((btn, idx) => {
    if (!btn) return;
    const slot = slots[idx];
    const active = idx === activeIndex;
    btn.classList.toggle("is-active", active);
    btn.classList.toggle("is-filled", Boolean(slot && slot.filled));
    btn.classList.toggle("is-locked", Boolean(slot && slot.editLocked));
    btn.setAttribute("aria-selected", active ? "true" : "false");
    const label = slot && slot.filled ? `Pick ${idx + 1}: ${slot.character}` : `Pick ${idx + 1}: empty`;
    btn.title = slot && slot.editLocked ? `${label} (locked)` : label;
  });
  if (modeEl) modeEl.textContent = getDraftSlotModeLabel(activeSlot);
  if (hintEl) {
    if (gameState.draftLocked) {
      hintEl.textContent = "Team locked. Waiting for others.";
    } else if (activeSlot && activeSlot.editLocked) {
      hintEl.textContent = `Pick ${activeIndex + 1} is locked. Select the other slot or lock.`;
    } else if (slots.every((slot) => slot && slot.filled)) {
      hintEl.textContent = "Both picks ready. Edit either, then lock.";
    } else {
      hintEl.textContent = "Fill 2 picks. Edit before lock.";
    }
  }
  if (summaryEl) {
    const filled = slots.filter((slot) => slot && slot.filled).length;
    const lockedSlots = slots.filter((slot) => slot && slot.editLocked).length;
    const editableFilled = Math.max(0, filled - lockedSlots);
    const summaryParts = [`Picks ${filled}/2`];
    if (filled > 0) summaryParts.push(`${editableFilled} editable`);
    if (lockedSlots > 0) summaryParts.push(`${lockedSlots} locked`);
    summaryEl.classList.toggle("is-visible", filled > 0 || lockedSlots > 0);
    summaryEl.textContent = summaryParts.join(" \u2022 ");
  }
  if (charInput) {
    const nextPlaceholder = activeSlot && activeSlot.filled && !activeSlot.editLocked ? `Edit pick ${activeIndex + 1}...` : activeSlot && activeSlot.editLocked ? `Pick ${activeIndex + 1} locked` : `Pick ${activeIndex + 1}...`;
    charInput.placeholder = nextPlaceholder;
    charInput.disabled = gameState.draftLocked || Boolean(activeSlot && activeSlot.editLocked);
  }
  if (submitBtn) {
    submitBtn.disabled = gameState.draftLocked || Boolean(activeSlot && activeSlot.editLocked);
    if (activeSlot && activeSlot.filled && !activeSlot.editLocked && !gameState.draftLocked) {
      submitBtn.textContent = "\u21BA";
      submitBtn.title = `Replace Pick ${activeIndex + 1}`;
      submitBtn.setAttribute("aria-label", `Replace Pick ${activeIndex + 1}`);
    } else {
      submitBtn.textContent = "\u2713";
      submitBtn.title = activeSlot && !activeSlot.filled ? `Submit Pick ${activeIndex + 1}` : "Submit character";
      submitBtn.setAttribute("aria-label", activeSlot && !activeSlot.filled ? `Submit Pick ${activeIndex + 1}` : "Submit character");
    }
  }
  if (clearBtn) {
    clearBtn.disabled = gameState.draftLocked || !charInput || !String(charInput.value || "").trim();
  }
}
function renderMyDraftSlots() {
  const myTeamList = document.getElementById("myTeam");
  if (!myTeamList) return;
  const slots = getMyDraftSlots();
  syncDraftSlotSelectionBounds({ preserveInput: true });
  const activeIndex = Math.max(0, Math.min(1, Number(gameState.draftActiveSlotIndex) || 0));
  const frag = document.createDocumentFragment();
  slots.forEach((slot, idx) => {
    const li = document.createElement("li");
    li.className = "draft-slot-card";
    if (!slot.filled) li.classList.add("is-empty");
    if (idx === activeIndex) li.classList.add("is-active");
    if (slot.editLocked) li.classList.add("is-locked");
    if (slot.autoFilled) li.classList.add("is-autofill");
    const head = document.createElement("div");
    head.className = "draft-slot-card-head";
    const titleWrap = document.createElement("div");
    titleWrap.className = "draft-slot-card-title";
    const pill = document.createElement("span");
    pill.className = "draft-slot-pill";
    pill.textContent = `Pick ${idx + 1}`;
    const state = document.createElement("span");
    state.className = "draft-slot-state";
    state.textContent = slot.filled ? slot.editLocked ? "Locked" : "Ready" : "Open";
    titleWrap.appendChild(pill);
    titleWrap.appendChild(state);
    head.appendChild(titleWrap);
    const body = document.createElement("div");
    body.className = "draft-slot-card-body";
    const value = document.createElement("div");
    value.className = "draft-slot-value";
    value.textContent = slot.filled ? slot.character : "Open slot";
    body.appendChild(value);
    const meta = document.createElement("div");
    meta.className = "draft-slot-meta";
    if (slot.autoFilled) {
      const chip = document.createElement("span");
      chip.className = "draft-slot-chip autofill";
      chip.textContent = "Auto-filled";
      meta.appendChild(chip);
    }
    if (slot.editLocked) {
      const chip = document.createElement("span");
      chip.className = "draft-slot-chip locked";
      chip.textContent = slot.lockReason === "auto_fill" ? "Edit locked" : "Locked";
      meta.appendChild(chip);
    }
    if ((Number(slot.editedCount) || 0) > 1) {
      const chip = document.createElement("span");
      chip.className = "draft-slot-chip";
      chip.textContent = `Edited ${Number(slot.editedCount)}x`;
      meta.appendChild(chip);
    }
    if (meta.childNodes.length) body.appendChild(meta);
    li.appendChild(head);
    li.appendChild(body);
    const actions = document.createElement("div");
    actions.className = "draft-slot-card-actions";
    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = `draft-slot-action-btn ${idx === activeIndex ? "is-primary" : ""}`;
    selectBtn.textContent = idx === activeIndex ? "Selected" : slot.filled && !slot.editLocked ? "Edit" : "Select";
    selectBtn.disabled = gameState.draftLocked || slot.filled && slot.editLocked;
    selectBtn.onclick = () => selectDraftSlot(idx, { focus: true, populate: true });
    actions.appendChild(selectBtn);
    li.appendChild(actions);
    frag.appendChild(li);
  });
  myTeamList.innerHTML = "";
  myTeamList.appendChild(frag);
  syncDraftComposerUi();
}
function selectDraftSlot(slotIndex, { focus = false, populate = true } = {}) {
  const safeIndex = Math.max(0, Math.min(1, Number(slotIndex) || 0));
  const slots = getMyDraftSlots();
  const slot = slots[safeIndex];
  if (slot && slot.filled && slot.editLocked) {
    syncDraftComposerUi();
    return;
  }
  gameState.draftActiveSlotIndex = safeIndex;
  if (populate) {
    const charInput = document.getElementById("charInput");
    if (charInput) {
      charInput.value = slot && slot.filled ? String(slot.character || "") : "";
      if (focus && !charInput.disabled) {
        charInput.focus();
        try {
          charInput.setSelectionRange(0, charInput.value.length);
        } catch (error) {
        }
      }
    }
  }
  updateDraftWarning("", false);
  renderMyDraftSlots();
}
function clearDraftInputField() {
  const charInput = document.getElementById("charInput");
  if (!charInput || charInput.disabled) return;
  charInput.value = "";
  updateDraftWarning("", false);
  syncDraftComposerUi();
  try {
    charInput.focus();
  } catch (error) {
  }
}
function setMyDraftSlotsFromPayload(playerDraftSlotsMap = {}) {
  const rows = playerDraftSlotsMap && typeof playerDraftSlotsMap === "object" ? playerDraftSlotsMap[player.name] : null;
  if (!Array.isArray(rows)) {
    gameState.myDraftSlots = buildFallbackDraftSlotsFromTeam();
    return;
  }
  gameState.myDraftSlots = rows.slice(0, 2).map((slot, index) => ({
    slotIndex: index,
    character: String(slot && slot.character || "").trim(),
    filled: slot && slot.filled === true ? true : Boolean(String(slot && slot.character || "").trim()),
    autoFilled: slot && slot.autoFilled === true,
    editable: slot && slot.editable === true,
    editLocked: slot && slot.editLocked === true,
    lockReason: String(slot && slot.lockReason || "").trim(),
    editedCount: Math.max(0, Number(slot && slot.editedCount) || 0),
    updatedAtMs: Number(slot && slot.updatedAtMs) || 0
  }));
  while (gameState.myDraftSlots.length < 2) {
    gameState.myDraftSlots.push({
      slotIndex: gameState.myDraftSlots.length,
      character: "",
      filled: false,
      autoFilled: false,
      editable: false,
      editLocked: false,
      lockReason: "",
      editedCount: 0,
      updatedAtMs: 0
    });
  }
}
function initializeInteractiveDomBindings() {
  const charInput = document.getElementById("charInput");
  if (charInput) {
    charInput.addEventListener("keypress", handleDraftInput);
    charInput.addEventListener("input", handleDraftChange);
  }
  setMyDraftSlotsFromPayload({});
  renderMyDraftSlots();
  syncDraftComposerUi();
  const chatInput = document.getElementById("chatInput");
  if (chatInput) {
    chatInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      sendMessage();
    });
    chatInput.addEventListener("input", () => {
      syncChatComposerState();
    });
    syncChatComposerState();
  }
  const categoryVoteBtn = document.getElementById("castCategoryVoteBtn");
  if (categoryVoteBtn) {
    categoryVoteBtn.addEventListener("click", () => {
      castCategoryVote();
    });
  }
  const categoryVoteChoice = document.getElementById("categoryVoteChoice");
  if (categoryVoteChoice) {
    categoryVoteChoice.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      castCategoryVote();
    });
  }
  const categoryVoteScreenOptions = document.getElementById("categoryVoteScreenOptions");
  if (categoryVoteScreenOptions) {
    categoryVoteScreenOptions.addEventListener("click", (event) => {
      const button = event.target && event.target.closest("[data-category-vote-id]");
      if (!button) return;
      const categoryId = String(button.dataset.categoryVoteId || "").trim().toLowerCase();
      castCategoryVote(categoryId);
    });
  }
  document.querySelectorAll(".reaction-btn-modern").forEach((button) => {
    button.addEventListener("click", () => {
      triggerTransientClass(button, "reaction-pop", 240);
      const composer = document.querySelector(".chat-composer-modern");
      triggerTransientClass(composer, "composer-react", 240);
    });
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeInteractiveDomBindings, { once: true });
} else {
  initializeInteractiveDomBindings();
}
function handleDraftChange(e) {
  const char = e.target.value.trim();
  syncDraftComposerUi();
  if (!char) {
    updateDraftWarning("", false);
    return;
  }
  const charLower = char.toLowerCase();
  const activeSlotIndex = Math.max(0, Math.min(1, Number(gameState.draftActiveSlotIndex) || 0));
  const mySlots = getMyDraftSlots();
  const isDuplicate = mySlots.some(
    (slot, idx) => idx !== activeSlotIndex && slot && slot.filled && String(slot.character || "").toLowerCase() === charLower
  );
  const otherPlayersHave = gameState.allDraftsList.some(
    (p) => p.name !== player.name && String(p.character || "").toLowerCase() === charLower
  );
  if (isDuplicate || otherPlayersHave) {
    updateDraftWarning(char, true);
  } else {
    updateDraftWarning(char, false);
  }
}
function handleDraftInput(e) {
  if (e.key === "Enter" && e.target.value.trim()) {
    submitDraft(e.target.value.trim());
  }
}
function syncDraftEntryComposerVisibility() {
  const draftInputSticky = document.querySelector(".draft-input-sticky");
  const scenarioScreen = document.getElementById("scenarioScreen");
  if (!draftInputSticky || !scenarioScreen) return;
  const shouldHideComposer = gameState.draftLocked === true;
  draftInputSticky.classList.toggle("is-hidden", shouldHideComposer);
  scenarioScreen.classList.toggle("draft-input-hidden", shouldHideComposer);
  draftInputSticky.setAttribute("aria-hidden", shouldHideComposer ? "true" : "false");
}
function stopDraftWaitTicker() {
  if (!draftLockVisualState.waitTicker) return;
  clearInterval(draftLockVisualState.waitTicker);
  draftLockVisualState.waitTicker = null;
}
function stopDraftUrgencyTicker() {
  if (!draftLockVisualState.urgencyTicker) return;
  clearInterval(draftLockVisualState.urgencyTicker);
  draftLockVisualState.urgencyTicker = null;
}
function ensureDraftUrgencyTicker() {
  if (draftLockVisualState.urgencyTicker) return;
  draftLockVisualState.urgencyTicker = setInterval(() => {
    if (gameState.draftLocked || gameState.draftEntryCount < 2) {
      stopDraftUrgencyTicker();
      return;
    }
    syncDraftActionControls();
  }, 1e3);
  addTimer(draftLockVisualState.urgencyTicker);
}
function setDraftWaitVisual(isLocked) {
  const waitVisual = document.getElementById("draftWaitVisual");
  const waitStatus = document.getElementById("draftWaitStatus");
  const livePicksSection = document.querySelector(".live-picks-section");
  const myTeamList = document.getElementById("myTeam");
  if (!waitVisual) return;
  if (!isLocked) {
    waitVisual.style.display = "none";
    waitVisual.classList.remove("waiting-active");
    if (waitStatus) {
      waitStatus.textContent = "";
    } else {
      waitVisual.textContent = "";
    }
    if (livePicksSection) livePicksSection.classList.remove("draft-live-erased");
    if (myTeamList) myTeamList.classList.remove("draft-team-locked");
    stopDraftWaitTicker();
    resetDraftWaitIntelPreview({ hide: true, statusText: "Checking cached evaluator prep..." });
    draftLockVisualState.waitDotIndex = 0;
    return;
  }
  if (livePicksSection) livePicksSection.classList.add("draft-live-erased");
  if (myTeamList) myTeamList.classList.add("draft-team-locked");
  waitVisual.style.display = "block";
  waitVisual.classList.add("waiting-active");
  const emojiCycle = ["\u23F3", "\u26A1", "\u{1F300}", "\u{1F525}"];
  const renderWaitingText = () => {
    const dotCount = draftLockVisualState.waitDotIndex % 3 + 1;
    const dots = ".".repeat(dotCount);
    const emoji = emojiCycle[draftLockVisualState.waitEmojiIndex % emojiCycle.length];
    const statusText = `${emoji} WAITING FOR SLOWER PLAYERS${dots}`;
    if (waitStatus) {
      waitStatus.textContent = statusText;
    } else {
      waitVisual.textContent = statusText;
    }
    draftLockVisualState.waitDotIndex += 1;
    draftLockVisualState.waitEmojiIndex += 1;
  };
  renderWaitingText();
  startDraftWaitIntelPreviewPolling();
  if (draftLockVisualState.waitTicker) return;
  draftLockVisualState.waitTicker = setInterval(renderWaitingText, 760);
  addTimer(draftLockVisualState.waitTicker);
}
function syncDraftActionControls() {
  const lockBtn = document.getElementById("lockDraftBtn");
  const charInput = document.getElementById("charInput");
  const submitBtn = document.querySelector(".btn-submit-draft");
  const isLocked = gameState.draftLocked === true;
  const isReadyToLock = !isLocked && gameState.draftEntryCount >= 2;
  if (lockBtn) {
    lockBtn.classList.remove("pulsing-glow", "draft-lock-ready", "draft-lock-shake");
    if (isLocked) {
      lockBtn.disabled = true;
      lockBtn.textContent = "\u2705 TEAM LOCKED!";
      lockBtn.style.display = "block";
      lockBtn.className = "btn btn-success btn-lock-draft";
      lockBtn.setAttribute("aria-pressed", "true");
    } else if (gameState.draftEntryCount >= 2) {
      lockBtn.disabled = false;
      lockBtn.textContent = "\u{1F512} LOCK TEAM";
      lockBtn.style.display = "block";
      lockBtn.className = "btn btn-success btn-lock-draft";
      lockBtn.setAttribute("aria-pressed", "false");
    } else {
      lockBtn.disabled = true;
      lockBtn.textContent = `\u{1F513} LOCK TEAM (${gameState.draftEntryCount}/2)`;
      lockBtn.style.display = gameState.draftEntryCount > 0 ? "block" : "none";
      lockBtn.className = "btn btn-success btn-lock-draft";
      lockBtn.setAttribute("aria-pressed", "false");
    }
    if (isReadyToLock) {
      if (!draftLockVisualState.availableSince) {
        draftLockVisualState.availableSince = Date.now();
      }
      ensureDraftUrgencyTicker();
      const readyDurationMs = Date.now() - draftLockVisualState.availableSince;
      lockBtn.classList.add("pulsing-glow", "draft-lock-ready");
      if (readyDurationMs >= 9e3) {
        lockBtn.classList.add("draft-lock-shake");
      }
    } else {
      draftLockVisualState.availableSince = 0;
      stopDraftUrgencyTicker();
    }
  }
  if (charInput) {
    charInput.disabled = isLocked;
    if (isLocked) {
      charInput.blur();
    }
  }
  if (submitBtn) {
    submitBtn.disabled = isLocked;
    submitBtn.setAttribute("aria-pressed", isLocked ? "true" : "false");
  }
  setDraftWaitVisual(isLocked);
  renderMyDraftSlots();
  syncDraftComposerUi();
}
function submitDraft(char) {
  if (gameState.draftLocked) {
    showToast("\u{1F512} Your team is already locked in!", "info");
    return;
  }
  const trimmed = String(char || "").trim();
  if (!trimmed) {
    showToast("\u26A0\uFE0F Enter a character first!", "warning", 1800);
    return;
  }
  const slots = getMyDraftSlots();
  syncDraftSlotSelectionBounds({ preserveInput: true });
  let activeSlotIndex = Math.max(0, Math.min(1, Number(gameState.draftActiveSlotIndex) || 0));
  let activeSlot = slots[activeSlotIndex];
  if (!activeSlot || activeSlot.filled && activeSlot.editLocked) {
    activeSlotIndex = getNextEditableDraftSlotIndex();
    activeSlot = slots[activeSlotIndex];
  }
  if (activeSlot && activeSlot.filled && activeSlot.editLocked) {
    playErrorSound();
    showToast(`\u{1F512} Pick ${activeSlotIndex + 1} is locked and can\u2019t be edited.`, "warning", 2600);
    return;
  }
  const charLower = trimmed.toLowerCase();
  const isDupOwn = slots.some((slot, idx) => idx !== activeSlotIndex && slot && slot.filled && String(slot.character || "").toLowerCase() === charLower);
  const isDupOther = gameState.allDraftsList.some(
    (p) => p.name !== player.name && String(p.character || "").toLowerCase() === charLower
  );
  const isDupAcrossRounds = gameState.allCharactersDrafted.includes(charLower);
  const isEdit = Boolean(activeSlot && activeSlot.filled);
  if (isDupOwn) {
    playErrorSound();
    showToast(`\u274C You already drafted "${trimmed}" in your other slot! Auto-filling instead...`, "error", 4e3);
  } else if (isDupAcrossRounds) {
    playErrorSound();
    showToast(`\u274C You already drafted "${trimmed}" in a previous round! Auto-filling instead...`, "error", 4e3);
  } else if (isDupOther) {
    playErrorSound();
    showToast(`\u274C "${trimmed}" was picked by another player! Auto-filling instead...`, "error", 4e3);
  } else {
    playDraftSound();
  }
  if (isEdit) {
    socket.emit("editDraftCharacter", {
      slotIndex: activeSlotIndex,
      character: trimmed
    });
  } else {
    if (gameState.draftEntryCount >= 2) {
      showToast("\u26A0\uFE0F Both picks are full. Select a slot to edit or lock your team.", "warning", 2600);
      return;
    }
    socket.emit("draftCharacter", trimmed);
  }
  const charInput = document.getElementById("charInput");
  if (charInput) {
    const keepText = isEdit && activeSlot && activeSlot.filled && activeSlot.editLocked;
    if (!keepText) charInput.value = "";
    if (!charInput.disabled) charInput.focus();
  }
  updateDraftWarning("", false);
  syncDraftComposerUi();
}
function lockDraft() {
  if (gameState.draftLocked) return;
  if (gameState.draftEntryCount < 2) {
    playErrorSound();
    showToast("\u26A0\uFE0F You must have 2 characters to lock in!", "warning");
    return;
  }
  playDraftSound();
  socket.emit("lockDraft");
  gameState.draftLocked = true;
  syncDraftActionControls();
  showToast("\u{1F512} Your team is locked in!", "info");
}
socket.on("draftError", (message) => {
  showToast(message, "error");
});
socket.on("draftUpdate", (data) => {
  gameState.allDraftsList = data.allDrafts || [];
  const picksList = document.getElementById("livePicksList");
  if (!picksList) return;
  picksList.innerHTML = "";
  [...Array.isArray(data.allDrafts) ? data.allDrafts : []].forEach((pick, idx) => {
    const li = document.createElement("li");
    const slotLabel = Number.isFinite(Number(pick && pick.slotIndex)) ? ` [${Number(pick.slotIndex) + 1}]` : "";
    const autoFillBadge = pick.autoFilled ? " \u{1F504} (auto-filled)" : "";
    const editBadge = (Number(pick && pick.editedCount) || 0) > 0 ? ` \u270F\uFE0F x${Number(pick.editedCount)}` : "";
    li.textContent = `${pick.name}${slotLabel} \u2192 ${pick.character}${autoFillBadge}${editBadge}`;
    li.classList.add("live-pick");
    if (pick.autoFilled) li.classList.add("live-pick-duplicate");
    li.style.animationDelay = `${idx * 0.05}s`;
    picksList.appendChild(li);
  });
  picksList.scrollTop = 0;
  updateLivePicksCount(data.allDrafts.length);
  const myTeamList = document.getElementById("myTeam");
  gameState.myTeam = (Array.isArray(data.allDrafts) ? data.allDrafts : []).filter((p) => p.name === player.name).sort((a, b) => (Number(a && a.slotIndex) || 0) - (Number(b && b.slotIndex) || 0)).map((p) => p.character);
  setMyDraftSlotsFromPayload(data.playerDraftSlots || {});
  const reportedEntryCount = Number(data.playerEntryCounts && data.playerEntryCounts[player.name]);
  gameState.draftEntryCount = Number.isFinite(reportedEntryCount) ? reportedEntryCount : countFilledDraftSlotsClient();
  syncDraftEntryComposerVisibility();
  if (gameState.draftLocked !== true && gameState.draftEntryCount < 2) {
    const nextOpen = getNextEditableDraftSlotIndex();
    if (Number.isFinite(Number(nextOpen))) {
      gameState.draftActiveSlotIndex = nextOpen;
    }
  }
  updateDraftCounter();
  renderMyDraftSlots();
  syncDraftActionControls();
  syncDraftComposerUi();
});
socket.on("draftSuccess", (data) => {
  console.log(`\u2713 Drafted: ${data.character} (${data.teamSize}/2)`);
  if (data && data.unchanged) {
    showToast(`\u2713 Pick ${Number(data.slotIndex) + 1} unchanged`, "info", 1200);
    return;
  }
  if (data && Number.isFinite(Number(data.slotIndex))) {
    const nextSlot = (Number(data.teamSize) || 0) >= 2 ? Number(data.slotIndex) : Math.min(1, Number(data.slotIndex) + 1);
    gameState.draftActiveSlotIndex = nextSlot;
  }
  const charInput = document.getElementById("charInput");
  if (charInput && !charInput.disabled) {
    charInput.value = "";
  }
  syncDraftComposerUi();
});
socket.on("playerLocked", (data) => {
  if (data.phase === "DRAFT") {
    if (data.playerName === player.name) {
      gameState.draftLocked = true;
      syncDraftActionControls();
    }
    showToast(`\u{1F512} ${data.playerName} locked in!`, "info", 2e3);
  }
});
socket.on("categoryRevealed", (data) => {
  clearTimers();
  clearVoiceCues("category-revealed", { includeActive: true });
  stopDraftWaitIntelPreviewPolling();
  resetDraftWaitIntelPreview({ hide: true });
  setLockedCategoryContext(data && data.lockedCategory ? data.lockedCategory : null);
  const categoryLabel = String(
    data && data.categoryLabel || data && data.lockedCategory && (data.lockedCategory.label || data.lockedCategory.name || data.lockedCategory.slug) || "Open Category"
  ).trim() || "Open Category";
  const categoryEl = document.getElementById("categoryRevealText");
  if (categoryEl) categoryEl.textContent = categoryLabel;
  enqueueVoiceCues(Array.isArray(data && data.voiceCues) ? data.voiceCues : [], {
    fallback: () => buildPhaseVoiceCues("category", data)
  });
  showScreen("categoryScreen");
  playPhaseShiftSound();
  showToast(`\u{1F3F7}\uFE0F Category: ${categoryLabel}`, "info", 1800);
});
socket.on("plotTwistRevealed", (data) => {
  clearTimers();
  clearVoiceCues("twist-revealed", { includeActive: true });
  gameState.currentTwist = data.twist;
  setLockedCategoryContext(data && data.lockedCategory ? data.lockedCategory : null);
  document.getElementById("twistText").textContent = `"${data.twist}"`;
  stopDraftWaitIntelPreviewPolling();
  resetDraftWaitIntelPreview({ hide: true });
  enqueueVoiceCues(Array.isArray(data && data.voiceCues) ? data.voiceCues : [], {
    fallback: () => buildPhaseVoiceCues("twist", data)
  });
  showScreen("twistScreen");
  playTwistSound();
  showToast("\u{1F300} Plot twist incoming!", "warning");
});
socket.on("votingPhaseStart", (data) => {
  clearTimers();
  stopDraftWaitIntelPreviewPolling();
  resetDraftWaitIntelPreview({ hide: true });
  playPhaseShiftSound();
  const charInput = document.getElementById("charInput");
  if (charInput) charInput.value = "";
  gameState.voted = false;
  gameState.voteLocked = false;
  gameState.currentVoteChoice = null;
  setLockedCategoryContext(data && data.lockedCategory ? data.lockedCategory : null);
  const scenarioDisplay = document.getElementById("votingScenario");
  const twistDisplay = document.getElementById("votingTwist");
  const safeScenario = data.scenario || "No scenario available";
  const safeTwist = data.twist || "No twist this round";
  if (scenarioDisplay) scenarioDisplay.textContent = safeScenario;
  if (twistDisplay) twistDisplay.textContent = safeTwist;
  const grid = document.getElementById("votingTeams");
  if (grid) grid.innerHTML = "";
  data.teams.forEach((team, idx) => {
    if (!team.team || team.team.length === 0) {
      return;
    }
    if (team.name === player.name) {
      return;
    }
    const card = document.createElement("button");
    card.type = "button";
    card.className = "vote-card";
    card.dataset.teamName = String(team.name || "");
    card.style.animationDelay = `${idx * 0.1}s`;
    card.onclick = () => castVote(team.name);
    const cardHead = document.createElement("div");
    cardHead.className = "vote-card-head";
    const title = document.createElement("h3");
    title.textContent = `${team.name}`;
    cardHead.appendChild(title);
    const voteBadge = document.createElement("span");
    voteBadge.className = "vote-badge";
    voteBadge.textContent = String(team.votes || 0);
    cardHead.appendChild(voteBadge);
    card.appendChild(cardHead);
    const teamList = document.createElement("ul");
    teamList.className = "team-display";
    team.team.forEach((member) => {
      const li = document.createElement("li");
      li.textContent = member;
      teamList.appendChild(li);
    });
    card.appendChild(teamList);
    if (grid) grid.appendChild(card);
  });
  if (grid && grid.children.length === 0) {
    const msg = document.createElement("p");
    msg.textContent = "(Your own team isn't shown\u2014no voting for yourself!)";
    msg.style.cssText = "color: #999; font-size: 1.1em; margin: 20px; font-weight: bold;";
    grid.appendChild(msg);
  }
  const lockSection = document.getElementById("voteLockSection");
  if (lockSection) {
    lockSection.style.display = "none";
  }
  const lockBtn = document.getElementById("lockVoteBtn");
  if (lockBtn) {
    lockBtn.style.display = "none";
    lockBtn.disabled = true;
    lockBtn.textContent = "\u{1F512} LOCK MY VOTE";
    lockBtn.className = "btn btn-success btn-lock-vote";
  }
  const votedIndication = document.getElementById("votedIndication");
  if (votedIndication) votedIndication.style.display = "none";
  const voteLockNotice = document.getElementById("voteLockNotice");
  if (voteLockNotice) voteLockNotice.style.display = "block";
  updateVoteStatusBadge("Select Team");
  showScreen("votingScreen");
  showToast("\u2696\uFE0F Time to vote. Community vote + intel fit decides this round.", "info", 4200);
  let timeLeft = Math.max(5, Number(data && data.votingTimeRemaining) || 30);
  document.getElementById("voteTimer").textContent = timeLeft;
  const voteTimer = setInterval(() => {
    timeLeft--;
    const timerEl = document.getElementById("voteTimer");
    if (timerEl) {
      timerEl.textContent = timeLeft;
      if (timeLeft <= 10) {
        timerEl.style.color = "#ff5252";
      }
    }
    if (timeLeft <= 0) clearInterval(voteTimer);
  }, 1e3);
  addTimer(voteTimer);
});
socket.on("draftWaitIntelPreview", (data) => {
  if (!data || typeof data !== "object") return;
  if (!document.getElementById("scenarioScreen")?.classList.contains("active")) return;
  if (!gameState.draftLocked) return;
  const incomingRound = Number(data.roundNumber) || 0;
  const activeRound = Number(gameState.currentRound) || 0;
  if (incomingRound && activeRound && incomingRound !== activeRound) return;
  draftWaitIntelPreviewState.receivedRound = incomingRound || activeRound || null;
  renderDraftWaitIntelPreview(data);
  const summary = data && data.summary && typeof data.summary === "object" ? data.summary : {};
  const readyCount = Number(summary.readyCount) || 0;
  const totalCount = Number(summary.totalCount) || 0;
  if (totalCount > 0 && readyCount >= totalCount) {
    stopDraftWaitIntelPreviewPolling();
  }
});
socket.on("round4Start", (data) => {
  resetCharacterCalloutSessionState("round4-start");
  clearVoiceCues("round4-start", { includeActive: true });
  setLockedCategoryContext(data && data.lockedCategory ? data.lockedCategory : null);
  console.log("\u{1F3AE} Round 4 Start event received:", data);
  clearTimers();
  playPhaseShiftSound();
  try {
    const finalTeams = data && data.finalTeams && typeof data.finalTeams === "object" ? data.finalTeams : {};
    const prefetchEntries = Object.entries(finalTeams).flatMap(([ownerName, roster]) => Array.isArray(roster) ? roster.map((character) => ({ character, ownerName })) : []);
    if (prefetchEntries.length) {
      scheduleCharacterCardBlurbPrefetch(prefetchEntries, {
        context: "round4-start",
        maxEntries: 18,
        warmTop: 10,
        voiceWarmTop: 12,
        immediate: true
      });
    }
  } catch (prefetchError) {
  }
  if (typeof window.initRound4Evaluation === "function") {
    window.initRound4Evaluation(data);
  } else {
    console.error("\u274C Round 4 evaluation function not found");
  }
  enqueueVoiceCues(Array.isArray(data && data.voiceCues) ? data.voiceCues : [], {
    fallback: () => buildPhaseVoiceCues("round4Start", data)
  });
});
function castVote(playerName) {
  playVoteSound();
  socket.emit("castVote", playerName);
  gameState.voted = true;
  gameState.currentVoteChoice = playerName;
  document.querySelectorAll(".vote-card").forEach((card) => {
    const cardName = String(card.dataset.teamName || "").trim();
    if (cardName === playerName) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  });
  const lockBtn = document.getElementById("lockVoteBtn");
  const lockSection = document.getElementById("voteLockSection");
  if (lockBtn && lockSection) {
    lockSection.style.display = "block";
    lockBtn.style.display = "inline-block";
    lockBtn.disabled = false;
  }
  updateVoteStatusBadge(`Voting for ${playerName}`);
  showToast(`\u2713 Selected ${playerName}! Click LOCK when ready.`, "info", 2e3);
}
function lockVote() {
  if (!gameState.voted) {
    playErrorSound();
    showToast("\u26A0\uFE0F Please select a team first!", "warning");
    return;
  }
  playDraftSound();
  socket.emit("lockVote");
  gameState.voteLocked = true;
  const lockBtn = document.getElementById("lockVoteBtn");
  if (lockBtn) {
    lockBtn.disabled = true;
    lockBtn.textContent = "\u2713 VOTE LOCKED";
    lockBtn.className = "btn btn-success";
  }
  updateVoteStatusBadge();
  showToast("\u{1F512} Your vote is locked!", "info", 2e3);
}
socket.on("voteUpdate", (voteCount) => {
  document.querySelectorAll(".vote-card").forEach((card) => {
    const playerName = String(card.dataset.teamName || "").trim();
    const badge = card.querySelector(".vote-badge");
    if (badge) badge.textContent = voteCount[playerName] || 0;
  });
});
socket.on("voteLockUpdate", (data) => {
  const statusDiv = document.getElementById("voteLockStatus");
  if (statusDiv) {
    statusDiv.textContent = `\u{1F512} ${data.lockedPlayers.length}/${data.totalPlayers} votes locked`;
    if (data.lockedPlayers.length === data.totalPlayers) {
      statusDiv.textContent = "\u2713 All votes locked! Tallying results...";
      statusDiv.style.color = "#4caf50";
    }
  }
});
function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function buildMissingWinnerImage() {
  const text = "Womp Womp, Shoulda picked a real thing bro";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#2b2b2b"/>
          <stop offset="100%" stop-color="#1d1d1d"/>
        </linearGradient>
      </defs>
      <rect width="360" height="360" fill="url(#bg)" rx="22"/>
      <text x="180" y="150" fill="#f5f5f5" font-size="20" font-family="Arial, sans-serif" text-anchor="middle">Womp Womp,</text>
      <text x="180" y="185" fill="#f5f5f5" font-size="20" font-family="Arial, sans-serif" text-anchor="middle">Shoulda picked a</text>
      <text x="180" y="220" fill="#f5f5f5" font-size="20" font-family="Arial, sans-serif" text-anchor="middle">real thing bro</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function formatNameList(names) {
  const safeNames = names.map(escapeHtml);
  if (safeNames.length <= 1) return safeNames[0] || "";
  if (safeNames.length === 2) return `${safeNames[0]} & ${safeNames[1]}`;
  return `${safeNames.slice(0, -1).join(", ")}, & ${safeNames[safeNames.length - 1]}`;
}
function getRoundLeaders(roundPoints = {}) {
  const entries = Object.entries(roundPoints || {});
  if (entries.length === 0) {
    return { leaders: [], maxPoints: 0, isTie: false };
  }
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const maxPoints = sorted[0][1];
  const leaders = sorted.filter(([, score]) => score === maxPoints).map(([name]) => name);
  return {
    leaders,
    maxPoints,
    isTie: leaders.length > 1
  };
}
function showVoteTallyLoading(payload = {}) {
  resetVoteTallyLoadingState();
  const trigger = payload && payload.trigger ? payload.trigger : "timer";
  const triggerText = trigger === "all_locked" ? "All votes locked. Finalizing scores now\u2026" : "Voting window closed. Finalizing scores\u2026";
  const fetchQueue = buildCharacterFetchLabels(payload.fetchQueue || {}, {
    maxPlayers: 5,
    maxCharsPerPlayer: 2
  });
  const fetchItems = buildCharacterFetchItems(payload.fetchQueue || {}, {
    maxPlayers: 5,
    maxCharsPerPlayer: 2
  });
  const totalFetches = Math.max(1, fetchItems.length);
  voteTallyLoadingState.active = true;
  voteTallyLoadingState.totalFetches = totalFetches;
  voteTallyLoadingState.completedFetches = 0;
  voteTallyLoadingState.stallTarget = 78;
  showPreRoundLoadingState({
    title: "\u23F3 TALLYING ROUND RESULTS",
    message: triggerText,
    stages: [
      "Verifying locked votes\u2026",
      "Fetching matchup intel for submitted teams\u2026",
      "Applying scoring rules and tie checks\u2026"
    ],
    progress: 52,
    showCountdown: false
  });
  let progress = 52;
  let queueIndex = 0;
  const ramp = setInterval(() => {
    progress = Math.min(voteTallyLoadingState.stallTarget, progress + 1);
    const stageText = progress < 64 ? "Verifying locked votes\u2026" : progress < 74 ? "Fetching matchup intel for submitted teams\u2026" : "Waiting on roster intel fetches\u2026";
    const fetchContext = fetchQueue.length ? fetchQueue[queueIndex % fetchQueue.length] : "";
    queueIndex += 1;
    const label = fetchContext ? `${stageText} \u2022 Fetching: ${fetchContext}` : stageText;
    setPreRoundProgress(progress, label);
    if (progress >= voteTallyLoadingState.stallTarget) {
      clearInterval(ramp);
      let pulse = 0;
      voteTallyLoadingState.pulseTimer = setInterval(() => {
        if (!voteTallyLoadingState.active || voteTallyLoadingState.completedFetches > 0) {
          clearInterval(voteTallyLoadingState.pulseTimer);
          voteTallyLoadingState.pulseTimer = null;
          return;
        }
        const pulsePct = 77 + Math.round(Math.sin(pulse) * 1);
        const boundedPct = Math.max(76, Math.min(79, pulsePct));
        const rotatingContext = fetchQueue.length ? fetchQueue[queueIndex % fetchQueue.length] : "";
        queueIndex += 1;
        const pulseLabel = rotatingContext ? `Queueing roster intel\u2026 \u2022 Fetching: ${rotatingContext}` : "Queueing roster intel\u2026";
        setPreRoundProgress(boundedPct, pulseLabel);
        pulse += 0.65;
      }, 600);
      addTimer(voteTallyLoadingState.pulseTimer);
    }
  }, 160);
  addTimer(ramp);
  showScreen("preRound");
}
function categorizeBreakdownLines(lines = []) {
  const groups = {
    vote: [],
    intel: [],
    core: []
  };
  (Array.isArray(lines) ? lines : []).forEach((line) => {
    const normalized = String(line || "").toLowerCase();
    if (/vote|runner-up|tied for most|didn't vote/.test(normalized)) {
      groups.vote.push(line);
      return;
    }
    if (/intel|relevance|adaptability|confidence|trusted/.test(normalized)) {
      groups.intel.push(line);
      return;
    }
    groups.core.push(line);
  });
  return groups;
}
function dedupeBreakdownLines(lines = []) {
  const seen = /* @__PURE__ */ new Set();
  return (Array.isArray(lines) ? lines : []).filter((line) => {
    const normalized = String(line || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
function extractLinePoints(line) {
  const text = String(line || "");
  const matches = text.match(/[+-]\d+/g);
  if (!matches || !matches.length) return 0;
  return Number(matches[matches.length - 1]) || 0;
}
function formatSignedNumber(value) {
  const numeric = Number(value) || 0;
  return numeric >= 0 ? `+${numeric}` : `${numeric}`;
}
function summarizeBreakdown(lines = []) {
  const grouped = categorizeBreakdownLines(lines);
  const sum = (arr) => Array.isArray(arr) ? arr.reduce((acc, line) => acc + extractLinePoints(line), 0) : 0;
  const votePoints = sum(grouped.vote);
  const intelPoints = sum(grouped.intel);
  const corePoints = sum(grouped.core);
  const totalAbs = Math.max(1, Math.abs(votePoints) + Math.abs(intelPoints) + Math.abs(corePoints));
  return {
    grouped,
    votePoints,
    intelPoints,
    corePoints,
    votePct: Math.max(8, Math.round(Math.abs(votePoints) / totalAbs * 100)),
    intelPct: Math.max(8, Math.round(Math.abs(intelPoints) / totalAbs * 100)),
    corePct: Math.max(8, Math.round(Math.abs(corePoints) / totalAbs * 100)),
    totalAbs
  };
}
function compactBreakdownLine(line, maxLength = 64) {
  const cleaned = String(line || "").replace(/\s*[+-]\d+\s*$/, "").replace(/^\s*(full team|vote share|round intel bonus|avg relevance|trusted intel)\s*[:|-]?\s*/i, "").trim();
  if (!cleaned) return "No scoring note.";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trim()}\u2026`;
}
function buildRadialSliceData(lines = [], emptyLabel = "No scoring notes.") {
  const safeLines = dedupeBreakdownLines(lines);
  const topLine = safeLines[0] || "";
  const topPoints = extractLinePoints(topLine);
  return {
    note: compactBreakdownLine(topLine || emptyLabel),
    notePoints: topLine ? formatSignedNumber(topPoints) : "\xB10",
    rawTopPoints: topPoints,
    hasLines: safeLines.length > 0,
    moreCount: Math.max(0, safeLines.length - 1)
  };
}
function buildRadialSliceHiddenNotesLabel(slice, laneKey = "vote") {
  const safeSlice = slice && typeof slice === "object" ? slice : {};
  const moreCount = Math.max(0, Number(safeSlice.moreCount) || 0);
  if (moreCount <= 0) {
    if (laneKey === "intel") return "No hidden intel notes";
    if (laneKey === "core") return "No hidden modifier notes";
    return "No hidden vote notes";
  }
  if (laneKey === "intel") return `+${moreCount} hidden intel notes`;
  if (laneKey === "core") return `+${moreCount} hidden modifier notes`;
  return `+${moreCount} hidden vote notes`;
}
function getRadialBubblePrimaryNote(slice, impactLabel) {
  const safeSlice = slice && typeof slice === "object" ? slice : {};
  if (String(impactLabel || "").toLowerCase() === "boost" && safeSlice.hasLines !== true) {
    return "N/A";
  }
  return String(safeSlice.note || "No scoring note.");
}
function getImpactDescriptor(points = 0) {
  if (points > 0) return "Boost";
  if (points < 0) return "Drag";
  return "Neutral";
}
function getRadialShares(summary) {
  const voteAbs = Math.abs(Number(summary.votePoints) || 0);
  const intelAbs = Math.abs(Number(summary.intelPoints) || 0);
  const coreAbs = Math.abs(Number(summary.corePoints) || 0);
  const total = voteAbs + intelAbs + coreAbs;
  if (!total) {
    return { vote: 34, intel: 33, core: 33 };
  }
  const vote = Math.round(voteAbs / total * 100);
  const intel = Math.round(intelAbs / total * 100);
  let core = 100 - vote - intel;
  if (core < 0) core = 0;
  const delta = 100 - (vote + intel + core);
  core += delta;
  return { vote, intel, core };
}
function getRoundTier(roundScore = 0) {
  const score = Number(roundScore) || 0;
  if (score >= 80) return "elite";
  if (score >= 60) return "diamond";
  if (score >= 45) return "high";
  if (score >= 20) return "mid";
  if (score >= 0) return "low";
  return "black";
}
function getRoundTierLabel(roundTier = "low") {
  if (roundTier === "elite") return "ELITE TIER";
  if (roundTier === "diamond") return "DIAMOND TIER";
  if (roundTier === "high") return "GOLD TIER";
  if (roundTier === "mid") return "SILVER TIER";
  if (roundTier === "low") return "BRONZE TIER";
  return "BLACK TIER";
}
function getEvalModeBadgeLabel(mode) {
  const normalized = String(mode || "").toLowerCase();
  if (normalized === "context") return "CE";
  if (normalized === "context_shadow") return "SHADOW";
  if (normalized === "legacy") return "LEGACY";
  return normalized ? normalized.toUpperCase() : "UNKNOWN";
}
function buildRoundIntelDiagnosticsMarkup(roundIntelDiagnostics = {}, roundIntelSummary = {}) {
  const rows = Object.entries(roundIntelDiagnostics || {});
  if (!rows.length) return "";
  const markup = rows.map(([playerName, diag]) => {
    const safeDiag = diag && typeof diag === "object" ? diag : {};
    const summary = roundIntelSummary && roundIntelSummary[playerName] ? roundIntelSummary[playerName] : null;
    const avgConfidence = Number.isFinite(Number(safeDiag.avgConfidence)) ? Math.round(Number(safeDiag.avgConfidence) * 100) : summary && Number.isFinite(Number(summary.averageConfidence)) ? Math.round(Number(summary.averageConfidence) * 100) : 0;
    const trustedCount = Number(safeDiag.trustedCount) || 0;
    const evaluationCount = Number(safeDiag.evaluationCount) || 0;
    const engineModes = Array.isArray(safeDiag.engineModes) ? safeDiag.engineModes : [];
    const contextStatuses = Array.isArray(safeDiag.contextStatuses) ? safeDiag.contextStatuses : [];
    const contextStatusLabels = Array.isArray(safeDiag.contextStatusLabels) ? safeDiag.contextStatusLabels : [];
    const shadowStatuses = Array.isArray(safeDiag.shadowStatuses) ? safeDiag.shadowStatuses : [];
    const statusText = contextStatusLabels[0] || contextStatuses[0] || shadowStatuses[0] || "n/a";
    const modeBadge = getEvalModeBadgeLabel(engineModes[0]);
    const avgResolver = Number.isFinite(Number(safeDiag.avgResolverConfidence)) ? Math.round(Number(safeDiag.avgResolverConfidence) * 100) : null;
    const avgContext = Number.isFinite(Number(safeDiag.avgContextConfidence)) ? Math.round(Number(safeDiag.avgContextConfidence) * 100) : null;
    const topRiskFlags = Array.isArray(safeDiag.topRiskFlags) ? safeDiag.topRiskFlags : [];
    const topRiskText = topRiskFlags.length ? topRiskFlags.slice(0, 2).map((row) => `${row.flag}x${row.count}`).join(", ") : "none";
    return `
      <details class="results-intel-row">
        <summary class="results-intel-row-summary" aria-label="Toggle evaluator summary for ${escapeHtml(playerName)}">
          <div class="results-intel-row-left">
            <strong>${escapeHtml(playerName)}</strong>
            <small>Engine ${escapeHtml(modeBadge)} | ${escapeHtml(statusText)}</small>
          </div>
          <div class="results-intel-row-right">
            <span class="results-intel-badge">${escapeHtml(modeBadge)}</span>
            <span class="results-intel-confidence">${avgConfidence}%</span>
          </div>
        </summary>
        <div class="results-intel-row-body">
          <div class="results-intel-mini-grid" aria-label="Evaluator trace details">
            <span><b>Trusted</b> ${trustedCount}/${evaluationCount}</span>
            <span><b>Resolve</b> ${avgResolver == null ? "n/a" : `${avgResolver}%`}</span>
            <span><b>Context</b> ${avgContext == null ? "n/a" : `${avgContext}%`}</span>
            <span><b>Risks</b> ${escapeHtml(topRiskText)}</span>
          </div>
        </div>
      </details>
    `;
  }).join("");
  return `
    <details class="results-intel-panel">
      <summary class="results-intel-panel-summary" aria-label="Toggle evaluator trace panel">
        <div class="results-intel-panel-title-wrap">
          <strong>Evaluator Trace</strong>
          <small>Per-player engine + trust summary</small>
        </div>
        <span class="results-intel-panel-count">${rows.length}</span>
      </summary>
      <div class="results-intel-panel-body">
        ${markup}
      </div>
    </details>
  `;
}
function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = (angleDeg - 90) * (Math.PI / 180);
  return {
    x: Number((cx + radius * Math.cos(angleRad)).toFixed(2)),
    y: Number((cy + radius * Math.sin(angleRad)).toFixed(2))
  };
}
function buildDonutSlicePath(cx, cy, innerRadius, outerRadius, startDeg, endDeg) {
  const sweep = Math.max(0.2, endDeg - startDeg);
  const safeEnd = startDeg + Math.min(359.8, sweep);
  const largeArc = safeEnd - startDeg > 180 ? 1 : 0;
  const outerStart = polarToCartesian(cx, cy, outerRadius, startDeg);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, safeEnd);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, safeEnd);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startDeg);
  return `M ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
}
function buildInteractiveRingMarkup(shares, labels) {
  const start = -90;
  const voteEnd = start + shares.vote / 100 * 360;
  const intelEnd = voteEnd + shares.intel / 100 * 360;
  const coreEnd = start + 360;
  const votePath = buildDonutSlicePath(90, 90, 42, 68, start, voteEnd);
  const intelPath = buildDonutSlicePath(90, 90, 42, 68, voteEnd, intelEnd);
  const corePath = buildDonutSlicePath(90, 90, 42, 68, intelEnd, coreEnd);
  return `
    <svg class="radial-ring-svg" viewBox="0 0 180 180" aria-label="Score contribution ring">
      <circle class="radial-ring-track" cx="90" cy="90" r="68"></circle>
      <path class="ring-segment vote" role="button" tabindex="0" data-tone="vote" aria-pressed="false" aria-label="${labels.vote}" d="${votePath}"></path>
      <path class="ring-segment intel" role="button" tabindex="0" data-tone="intel" aria-pressed="false" aria-label="${labels.intel}" d="${intelPath}"></path>
      <path class="ring-segment core" role="button" tabindex="0" data-tone="core" aria-pressed="false" aria-label="${labels.core}" d="${corePath}"></path>
    </svg>
  `;
}
function initializeRadialMaps(root) {
  if (!root) return;
  const maps = root.querySelectorAll(".breakdown-radial-map");
  maps.forEach((map) => {
    const segments = Array.from(map.querySelectorAll(".ring-segment"));
    if (!segments.length) return;
    const keyToggle = map.querySelector(".radial-key-toggle");
    const activateTone = (tone) => {
      map.setAttribute("data-active-tone", tone || "none");
      segments.forEach((segment) => {
        segment.setAttribute("aria-pressed", segment.dataset.tone === tone ? "true" : "false");
      });
    };
    const setKeyOpen = (isOpen) => {
      map.setAttribute("data-key-open", isOpen ? "true" : "false");
      if (keyToggle) keyToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    };
    segments.forEach((segment) => {
      segment.addEventListener("click", () => {
        const tone = segment.dataset.tone;
        const current = map.getAttribute("data-active-tone") || "none";
        const nextTone = current === tone ? null : tone;
        playSliceInteractionSound(tone, nextTone === null);
        activateTone(nextTone);
      });
      segment.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        const tone = segment.dataset.tone;
        const current = map.getAttribute("data-active-tone") || "none";
        const nextTone = current === tone ? null : tone;
        playSliceInteractionSound(tone, nextTone === null);
        activateTone(nextTone);
      });
    });
    if (keyToggle) {
      keyToggle.addEventListener("click", () => {
        const isOpen = map.getAttribute("data-key-open") === "true";
        scheduleTone({ frequency: isOpen ? 330 : 520, duration: 55, type: "triangle", volume: 0.085 });
        setKeyOpen(!isOpen);
      });
    }
    activateTone(null);
    setKeyOpen(true);
  });
}
function buildRoundWinnerHTML(data, isFinalRound = false) {
  const winnerInfo = getRoundLeaders(data.roundPoints);
  if (!winnerInfo.leaders.length) {
    return {
      html: "<h2>\u{1F3C1} Round complete</h2>",
      isTie: false
    };
  }
  if (winnerInfo.isTie) {
    const names = formatNameList(winnerInfo.leaders);
    const tieHeadline = winnerInfo.leaders.length === 2 ? `${names} tied for first!` : `${names} all tied for first!`;
    const tieSubtitle = isFinalRound ? "Photo finish. The evaluator called this one dead even." : "No daylight between them this round.";
    return {
      html: `
        <h2>\u{1F91D} ${tieHeadline}</h2>
        <p class="winner-round-score">+${winnerInfo.maxPoints} POINTS EACH</p>
        <p class="winner-subtitle">${tieSubtitle}</p>
      `,
      isTie: true
    };
  }
  const winnerName = escapeHtml(winnerInfo.leaders[0]);
  const headline = isFinalRound ? `\u{1F3C6} ${winnerName} WINS THE FINAL ROUND! \u{1F3C6}` : `\u{1F3C6} ${winnerName} WINS! \u{1F3C6}`;
  return {
    html: `
      <h2>${headline}</h2>
      <p class="winner-round-score">+${winnerInfo.maxPoints} POINTS</p>
    `,
    isTie: false
  };
}
socket.on("roundResults", (data) => {
  resetVoteTallyLoadingState();
  clearTimers();
  clearVoiceCues("round-results", { includeActive: true });
  gameState.activePackMeta = normalizePackMeta(data && data.packMeta) || resolveActivePackMeta();
  setLockedCategoryContext(data && data.lockedCategory ? data.lockedCategory : null);
  playWinSound();
  document.getElementById("resultRound").textContent = data.round;
  const winnerBox = document.getElementById("roundWinner");
  const winnerView = buildRoundWinnerHTML(data, false);
  if (winnerBox) {
    winnerBox.classList.remove("tie", "animate-in");
    winnerBox.innerHTML = winnerView.html;
    if (winnerView.isTie) winnerBox.classList.add("tie");
    void winnerBox.offsetWidth;
    winnerBox.classList.add("animate-in");
  }
  const breakdownContainer = document.getElementById("resultsBreakdown");
  if (breakdownContainer) {
    let breakdownHTML = "";
    const sorted = [...data.leaderboard].sort((a, b) => b.roundScore - a.roundScore);
    const topRoundScore = sorted.length ? sorted[0].roundScore : 0;
    sorted.forEach((playerEntry, idx) => {
      const summary = summarizeBreakdown(playerEntry.breakdown);
      const grouped = summary.grouped;
      const voteLines = dedupeBreakdownLines(grouped.vote || []);
      const intelLines = dedupeBreakdownLines(grouped.intel || []);
      const modifierLines = dedupeBreakdownLines(grouped.core || []);
      const voteSlice = buildRadialSliceData(voteLines, "No vote-based changes.");
      const intelSlice = buildRadialSliceData(intelLines, "No intel-fit changes.");
      const coreSlice = buildRadialSliceData(modifierLines, "No extra modifiers applied.");
      const voteImpact = getImpactDescriptor(summary.votePoints);
      const intelImpact = getImpactDescriptor(summary.intelPoints);
      const coreImpact = getImpactDescriptor(summary.corePoints);
      const shares = getRadialShares(summary);
      const roundTier = getRoundTier(playerEntry.roundScore);
      const roundTierLabel = getRoundTierLabel(roundTier);
      const ringMarkup = buildInteractiveRingMarkup(shares, {
        vote: `Votes ${formatSignedNumber(summary.votePoints)} points, ${shares.vote}% of swing`,
        intel: `Intel ${formatSignedNumber(summary.intelPoints)} points, ${shares.intel}% of swing`,
        core: `Other ${formatSignedNumber(summary.corePoints)} points, ${shares.core}% of swing`
      });
      breakdownHTML += `
        <div class="player-breakdown ${playerEntry.roundScore === topRoundScore ? "top-score" : ""}" style="--result-index:${idx};">
          <details class="player-breakdown-dropdown">
            <summary class="breakdown-summary-row" aria-label="Open detailed score breakdown for ${playerEntry.name}">
              <span class="breakdown-toggle-arrow" aria-hidden="true"></span>
              <span class="breakdown-header">${playerEntry.name}</span>
              <span class="breakdown-points">${formatSignedNumber(playerEntry.roundScore)} pts</span>
            </summary>
            <div class="breakdown-details" aria-label="Detailed score notes">
              <div
                class="breakdown-radial-map tier-${roundTier}"
                data-active-tone="none"
                data-key-open="true"
                aria-label="Radial score map with votes, intel fit, and other modifiers"
              >
                <button type="button" class="radial-key-toggle" aria-expanded="true" aria-label="Toggle chart key">Key</button>
                <aside class="radial-key-panel" aria-label="Chart legend">
                  <h6>Chart Key</h6>
                  <div class="key-item vote"><span></span> Votes = community picks</div>
                  <div class="key-item intel"><span></span> Intel = scenario/twist fit</div>
                  <div class="key-item core"><span></span> Other = rule modifiers</div>
                </aside>
                <div class="radial-ring-wrap">
                  ${ringMarkup}
                </div>
                <div class="radial-center">
                  <b class="radial-tier-label">${roundTierLabel}</b>
                  <span>Momentum</span>
                  <strong>${formatSignedNumber(playerEntry.roundScore)}</strong>
                </div>

                <article
                  class="radial-bubble vote"
                >
                  <h5>Votes ${formatSignedNumber(summary.votePoints)} \u2022 ${shares.vote}%</h5>
                  <p><b>${voteImpact}:</b> ${escapeHtml(getRadialBubblePrimaryNote(voteSlice, voteImpact))}</p>
                  <small>${escapeHtml(buildRadialSliceHiddenNotesLabel(voteSlice, "vote"))}</small>
                </article>

                <article
                  class="radial-bubble intel"
                >
                  <h5>Intel ${formatSignedNumber(summary.intelPoints)} \u2022 ${shares.intel}%</h5>
                  <p><b>${intelImpact}:</b> ${escapeHtml(getRadialBubblePrimaryNote(intelSlice, intelImpact))}</p>
                  <small>${escapeHtml(buildRadialSliceHiddenNotesLabel(intelSlice, "intel"))}</small>
                </article>

                <article
                  class="radial-bubble core"
                >
                  <h5>Other ${formatSignedNumber(summary.corePoints)} \u2022 ${shares.core}%</h5>
                  <p><b>${coreImpact}:</b> ${escapeHtml(getRadialBubblePrimaryNote(coreSlice, coreImpact))}</p>
                  <small>${escapeHtml(buildRadialSliceHiddenNotesLabel(coreSlice, "core"))}</small>
                </article>
              </div>
            </div>
          </details>
        </div>
      `;
    });
    breakdownContainer.innerHTML = breakdownHTML;
    initializeRadialMaps(breakdownContainer);
  }
  const scoringMeta = document.getElementById("roundScoringMeta");
  if (scoringMeta) {
    scoringMeta.innerHTML = buildRoundScoringMetaText(data && data.packMeta);
  }
  const intelSummaryContainer = document.getElementById("resultsIntelSummary");
  if (intelSummaryContainer) {
    const diagnosticsMarkup = buildRoundIntelDiagnosticsMarkup(data.roundIntelDiagnostics || {}, data.roundIntelSummary || {});
    if (diagnosticsMarkup) {
      intelSummaryContainer.style.display = "block";
      intelSummaryContainer.innerHTML = diagnosticsMarkup;
    } else {
      intelSummaryContainer.style.display = "none";
      intelSummaryContainer.innerHTML = "";
    }
  }
  const resultsDetails = document.getElementById("resultsDetails");
  if (resultsDetails) {
    resultsDetails.style.display = "block";
  }
  const readyButton = document.getElementById("nextRoundReadyBtn");
  if (readyButton) {
    readyButton.style.display = "inline-block";
    readyButton.disabled = false;
    readyButton.textContent = "\u2713 READY FOR NEXT ROUND";
  }
  showScreen("resultsScreen");
  showToast(winnerView.isTie ? "\u{1F91D} Tie at the top (votes + intel)!" : "\u{1F4CA} Round results are in (votes + intel)!", "info");
  enqueueVoiceCues(Array.isArray(data && data.voiceCues) ? data.voiceCues : []);
});
socket.on("voteTallying", (data) => {
  clearTimers();
  showVoteTallyLoading(data || {});
});
socket.on("voteTallyProgress", (payload) => {
  applyVoteTallyProgressUpdate(payload || {});
});
function readyForNextRound() {
  socket.emit("readyForNextRound");
  const readyButton = document.getElementById("nextRoundReadyBtn");
  if (readyButton) {
    readyButton.disabled = true;
    readyButton.textContent = "\u2713 READY";
    showToast("Waiting for other players...", "info");
  }
}
socket.on("finalRoundResults", (data) => {
  clearTimers();
  clearVoiceCues("final-round-results", { includeActive: true });
  gameState.activePackMeta = normalizePackMeta(data && data.packMeta) || resolveActivePackMeta();
  setLockedCategoryContext(data && data.lockedCategory ? data.lockedCategory : null);
  playWinSound();
  const tie = data && data.isTie === true;
  enqueueVoiceCues(Array.isArray(data && data.voiceCues) ? data.voiceCues : [], {
    fallback: () => buildPhaseVoiceCues("finalResults", data)
  });
  showToast(tie ? "\u{1F91D} Final round locked with a tie." : "\u{1F3C1} Final round tally locked.", "info", 2200);
});
socket.on("gameEnded", (data) => {
  resetCharacterCalloutSessionState("game-ended");
  clearTimers();
  clearVoiceCues("game-ended", { includeActive: true });
  gameState.activePackMeta = normalizePackMeta(data && data.packMeta) || resolveActivePackMeta();
  setLockedCategoryContext(data && data.lockedCategory ? data.lockedCategory : null);
  playWinSound();
  const finalGameEndedVoiceCues = Array.isArray(data && data.voiceCues) ? data.voiceCues : [];
  let finalGameEndedVoiceQueued = false;
  setTimeout(() => createConfetti(), 300);
  setFinalPackMetaLine(data && data.packMeta);
  const finalStandings = Array.isArray(data && data.finalLeaderboard) ? data.finalLeaderboard : [];
  const placeholderImage = buildMissingWinnerImage();
  const winnerGallery = document.getElementById("finalWinnerCharacters");
  const finalContainerRoot = document.querySelector(".final-container-modern");
  if (finalContainerRoot) {
    finalContainerRoot.classList.remove("from-round4-archive");
    finalContainerRoot.classList.remove("squad-open");
    finalContainerRoot.removeAttribute("data-final-view");
    const staleArchiveBackbar = finalContainerRoot.querySelector(".final-archive-backbar");
    if (staleArchiveBackbar) staleArchiveBackbar.remove();
  }
  if (winnerGallery && finalContainerRoot) {
    const dockedFinalList = winnerGallery.querySelector("#finalLeaderboard");
    const dockedFinalActions = winnerGallery.querySelector(".final-actions-modern");
    if (dockedFinalList) finalContainerRoot.appendChild(dockedFinalList);
    if (dockedFinalActions) finalContainerRoot.appendChild(dockedFinalActions);
  }
  if (winnerGallery) {
    const legacyWinnerCharacters = Array.isArray(data.winnerCharacters) ? data.winnerCharacters : [];
    const championCharacters = Array.isArray(data.winnerTeamCharacters) && data.winnerTeamCharacters.length ? data.winnerTeamCharacters : legacyWinnerCharacters;
    const eliteShowcaseCharacters = Array.isArray(data.eliteFinalSix) && data.eliteFinalSix.length ? data.eliteFinalSix : championCharacters;
    const finalCategoryActive = Boolean(resolveLockedCategoryForUi());
    const eliteMeta = data && data.eliteFinalSixMeta && typeof data.eliteFinalSixMeta === "object" ? data.eliteFinalSixMeta : {};
    const usingGlobalEliteShowcase = Array.isArray(data.eliteFinalSix) && data.eliteFinalSix.length > 0;
    try {
      const prefetchPool = [].concat(Array.isArray(eliteShowcaseCharacters) ? eliteShowcaseCharacters : []).concat(Array.isArray(championCharacters) ? championCharacters : []);
      if (prefetchPool.length) {
        scheduleCharacterCardBlurbPrefetch(prefetchPool, {
          context: "final-screen",
          maxEntries: 18,
          warmTop: 10,
          voiceWarmTop: 12,
          immediate: true
        });
      }
    } catch (prefetchError) {
    }
    if (eliteShowcaseCharacters.length || championCharacters.length) {
      const stats = data && data.winnerTeamStats ? data.winnerTeamStats : {};
      const safeMVP = escapeHtml(stats.mvp || "N/A");
      const winnerMvpLookup = String(stats.mvp || "").trim().toLowerCase();
      const winnerMvpEntry = championCharacters.find((entry) => String(entry && entry.character || "").trim().toLowerCase() === winnerMvpLookup) || championCharacters.slice().sort((a, b) => (Number(b && b.ovr) || 0) - (Number(a && a.ovr) || 0))[0] || eliteShowcaseCharacters.slice().sort((a, b) => (Number(b && b.ovr) || 0) - (Number(a && a.ovr) || 0))[0] || null;
      const winnerMvpOverlayNameRaw = String(winnerMvpEntry && winnerMvpEntry.character || stats.mvp || "MVP").trim() || "MVP";
      const winnerMvpOverlayName = escapeHtml(winnerMvpOverlayNameRaw);
      const winnerMvpOverlayImageRaw = winnerMvpEntry && winnerMvpEntry.imageUrl ? String(winnerMvpEntry.imageUrl).trim() : "";
      const winnerMvpOverlayImage = winnerMvpOverlayImageRaw.startsWith("//") ? `https:${winnerMvpOverlayImageRaw}` : winnerMvpOverlayImageRaw || placeholderImage;
      const safeChampionName = escapeHtml(data && data.winner && data.winner.name || "Champion");
      const teamOVR = Number(stats.teamOVR) || 0;
      const round4Points = Number(stats.round4Points) || 0;
      const chemistryBonus = Number(stats.chemistryBonus) || 0;
      const chemistryLabel = chemistryBonus >= 0 ? `+${chemistryBonus}` : String(chemistryBonus);
      const rarityScore = Number(stats.rarityScore) || 0;
      const pickCountForRarity = Number(stats.picks) || championCharacters.length || 6;
      const rarityMax = Math.max(1, pickCountForRarity * 7);
      const rarityPercent = Math.max(0, Math.min(100, Math.round(rarityScore / rarityMax * 100)));
      const rarityGems = "\u25C6".repeat(Math.max(1, Math.min(5, Math.round(rarityPercent / 20))));
      const avgDraftValue = championCharacters.length ? Math.round(
        championCharacters.reduce((acc, entry) => acc + (Number(entry && entry.valueVsDraftExpected) || 0), 0) / championCharacters.length
      ) : 0;
      const avgDraftValueLabel = avgDraftValue >= 0 ? `+${avgDraftValue}` : `${avgDraftValue}`;
      const powerIndex = Math.max(
        0,
        Math.round(teamOVR * 0.54 + round4Points * 0.34 + rarityScore * 0.18 + chemistryBonus * 2.25)
      );
      const powerTier = powerIndex >= 140 ? "S+" : powerIndex >= 120 ? "S" : powerIndex >= 98 ? "A" : powerIndex >= 82 ? "B" : "C";
      const teamOvrClass = teamOVR >= 92 ? "ovr-elite" : teamOVR >= 86 ? "ovr-high" : teamOVR >= 78 ? "ovr-mid" : "ovr-low";
      const showcaseAverageOVR = Number(eliteMeta.averageOVR) || (eliteShowcaseCharacters.length ? Math.round(eliteShowcaseCharacters.reduce((sum, entry) => sum + (Number(entry && entry.ovr) || 0), 0) / eliteShowcaseCharacters.length) : 0);
      const showcaseTeamsRepresented = Number(eliteMeta.teamsRepresented) || new Set(
        eliteShowcaseCharacters.map((entry) => entry && entry.ownerName).filter(Boolean)
      ).size;
      const championEliteCount = Number(eliteMeta.championMembers) || eliteShowcaseCharacters.filter((entry) => entry && entry.isChampionMember).length;
      const winnerScore = Number(finalStandings[0] && finalStandings[0].score) || 0;
      const runnerScore = Number(finalStandings[1] && finalStandings[1].score);
      const finalMargin = Number.isFinite(runnerScore) ? winnerScore - runnerScore : null;
      const finalMarginLabel = finalMargin == null ? "No runner-up data" : finalMargin === 0 ? "Photo-finish tie" : `Final margin ${finalMargin > 0 ? "+" : ""}${finalMargin}`;
      const bridgeNarrative = usingGlobalEliteShowcase ? "Round 4 reveals where everyone lands. Final Results now splits the score champion from the league-wide elite OVR showcase so both payoffs stay readable." : "Round 4 locks placement. Final Results closes the ceremony with standings and the champion squad breakdown.";
      const podiumPreviewMarkup = finalStandings.slice(0, 3).map((entry, idx) => {
        const safeName = escapeHtml(entry && entry.name ? entry.name : `Player ${idx + 1}`);
        const score = Number(entry && entry.score) || 0;
        const rankLabel = idx === 0 ? "Champion" : idx === 1 ? "Runner-up" : "3rd";
        return `
          <li class="final-podium-preview-row">
            <span class="final-podium-preview-rank">${rankLabel}</span>
            <span class="final-podium-preview-name">${safeName}</span>
            <strong class="final-podium-preview-score">${score} pts</strong>
          </li>
        `;
      }).join("");
      const compactSlots = eliteShowcaseCharacters.map((entry, index) => {
        const safeName = escapeHtml(entry && entry.character ? entry.character : "Unknown");
        const rawImage = entry && entry.imageUrl ? String(entry.imageUrl).trim() : "";
        const imageUrl = rawImage.startsWith("//") ? `https:${rawImage}` : rawImage || placeholderImage;
        const ownerName = entry && entry.ownerName ? String(entry.ownerName) : "";
        const ownerAbbr = ownerName ? ownerName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 3).toUpperCase() : "";
        const isChampionMember = entry && entry.isChampionMember === true;
        const eliteRank = Number(entry && entry.eliteRank) || index + 1;
        return `
          <div class="winner-compact-slot ${rawImage ? "" : "missing"} ${isChampionMember ? "champion-member" : "non-champion"}" data-slot="${index + 1}" title="${safeName}${ownerName ? ` \u2022 ${escapeHtml(ownerName)}` : ""}">
            <img
              src="${escapeHtml(imageUrl)}"
              alt="${safeName}"
              loading="lazy"
              decoding="async"
              onerror="this.onerror=null;this.src='${placeholderImage}';this.closest('.winner-compact-slot')?.classList.add('missing');"
            >
            <span class="winner-compact-index">${eliteRank}</span>
            ${ownerAbbr ? `<span class="winner-compact-owner ${isChampionMember ? "champion" : ""}" aria-label="Owned by ${escapeHtml(ownerName)}">${escapeHtml(ownerAbbr)}</span>` : ""}
          </div>
        `;
      }).join("");
      const expandedSlots = eliteShowcaseCharacters.map((entry, index) => {
        const safeName = escapeHtml(entry && entry.character ? entry.character : "Unknown");
        const rawImage = entry && entry.imageUrl ? String(entry.imageUrl).trim() : "";
        const imageUrl = rawImage.startsWith("//") ? `https:${rawImage}` : rawImage || placeholderImage;
        const rarity = escapeHtml(entry && entry.rarity ? entry.rarity : "Bronze");
        const rarityRaw = String(entry && entry.rarity ? entry.rarity : "bronze").toLowerCase();
        const rarityClass = rarityRaw.includes("legend") ? "rarity-legendary" : rarityRaw.includes("epic") ? "rarity-epic" : rarityRaw.includes("rare") ? "rarity-rare" : "rarity-common";
        const ovr = Number(entry && entry.ovr) || 0;
        const ovrTier = escapeHtml(entry && entry.ovrTierLabel ? entry.ovrTierLabel : "Tiered");
        const source = escapeHtml(entry && entry.infoSource ? entry.infoSource : "unknown");
        const sourceRaw = String(entry && entry.infoSource ? entry.infoSource : "").toLowerCase();
        const sourceClass = sourceRaw.includes("wikipedia") || sourceRaw.includes("wikidata") ? "source-wiki" : sourceRaw.includes("web") ? "source-web" : sourceRaw.includes("llm") ? "source-llm" : "source-unknown";
        const characterType = escapeHtml(entry && entry.characterType ? entry.characterType : "balanced");
        const draftRound = Number(entry && entry.draftRound) || Math.floor(index / 2) + 1;
        const draftPick = Number(entry && entry.pickNumberInRound) || index % 2 + 1;
        const expectedAtDraft = Number(entry && entry.expectedAtDraft) || 0;
        const expectedNearEnd = Number(entry && entry.expectedNearEnd) || 0;
        const valueDraft = Number(entry && entry.valueVsDraftExpected) || 0;
        const valueLate = Number(entry && entry.valueVsLateExpected) || 0;
        const valueDraftLabel = valueDraft >= 0 ? `+${valueDraft}` : `${valueDraft}`;
        const valueLateLabel = valueLate >= 0 ? `+${valueLate}` : `${valueLate}`;
        const ovrToneClass = ovr >= 94 ? "ovr-elite" : ovr >= 86 ? "ovr-high" : ovr >= 78 ? "ovr-mid" : "ovr-low";
        const draftedAtMs = Number(entry && entry.draftedAtMs);
        const draftedAtLabel = Number.isFinite(draftedAtMs) ? `${(draftedAtMs / 1e3).toFixed(1)}s` : "n/a";
        const draftOrderLabel = Number.isFinite(Number(entry && entry.globalDraftOrder)) ? `#${Number(entry.globalDraftOrder)}` : "n/a";
        const insightA = escapeHtml(entry && Array.isArray(entry.notes) && entry.notes[0] ? entry.notes[0] : "Role fit stabilized under final scenario pressure.");
        const insightB = escapeHtml(entry && Array.isArray(entry.notes) && entry.notes[1] ? entry.notes[1] : "Draft value remained resilient into endgame.");
        const originalScenario = escapeHtml(entry && entry.originalScenario ? entry.originalScenario : "N/A");
        const originalTwist = escapeHtml(entry && entry.originalTwist ? entry.originalTwist : "N/A");
        const ownerName = escapeHtml(entry && entry.ownerName ? entry.ownerName : "Unknown Team");
        const ownerFinalRank = Number(entry && entry.ownerFinalRank) || 0;
        const eliteRank = Number(entry && entry.eliteRank) || index + 1;
        const isChampionMember = entry && entry.isChampionMember === true;
        const evalTrustPct = Math.max(0, Math.min(100, Number(entry && entry.evalTrustPct) || 0));
        const evalStatusLabel = escapeHtml(entry && entry.evalStatusLabel ? entry.evalStatusLabel : entry && entry.evalStatus ? entry.evalStatus : "n/a");
        const evalEngineMode = escapeHtml(entry && entry.evalEngineMode ? entry.evalEngineMode : "legacy");
        const categoryStatusRaw = String(entry && entry.categoryStatus ? entry.categoryStatus : "").trim().toLowerCase();
        const categoryStatusLabelRaw = String(entry && entry.categoryStatusLabel ? entry.categoryStatusLabel : "").trim();
        const normalizedCategoryStatus = categoryStatusRaw.replace(/[\s-]+/g, "_");
        const categoryMeta = normalizedCategoryStatus === "in_category" ? { label: "IN CATEGORY", icon: "[+]", tone: "pos" } : normalizedCategoryStatus === "borderline" || normalizedCategoryStatus === "borderline_entry" ? { label: "BORDERLINE ENTRY", icon: "[~]", tone: "neutral" } : normalizedCategoryStatus === "not_in_category" || normalizedCategoryStatus === "out_of_category" ? { label: "NOT IN CATEGORY", icon: "[-]", tone: "neg" } : { label: categoryStatusLabelRaw || "CATEGORY N/A", icon: "-", tone: "neutral" };
        const submetaRight = finalCategoryActive ? `<span class="winner-char-trace winner-char-category ${categoryMeta.tone}">${escapeHtml(`${categoryMeta.label} ${categoryMeta.icon}`)}</span>` : `<span class="winner-char-trace">${evalEngineMode.toUpperCase()} ${evalTrustPct}%</span>`;
        const backGridTraceOrCategory = finalCategoryActive ? `<div><span>Category</span><strong>${escapeHtml(`${categoryMeta.label} ${categoryMeta.icon}`)}</strong></div>` : `<div><span>Trace</span><strong>${evalEngineMode.toUpperCase()} ${evalTrustPct}%</strong></div>`;
        return `
          <article class="winner-char-card winner-flip-card ${rarityClass} tier-${ovrToneClass} ${rawImage ? "" : "missing"} ${isChampionMember ? "champion-member" : ""}" data-slot="${index + 1}" role="button" tabindex="0" aria-label="Flip ${safeName} card">
            <div class="winner-flip-inner">
              <div class="winner-flip-face winner-flip-front">
                <span class="winner-slot">${eliteRank}</span>
                <div class="winner-char-frame">
                  <img
                    src="${escapeHtml(imageUrl)}"
                    alt="${safeName}"
                    loading="lazy"
                    decoding="async"
                    onerror="this.onerror=null;this.src='${placeholderImage}';this.closest('article')?.classList.add('missing');"
                  >
                </div>
                <figcaption>${safeName}</figcaption>
                <div class="winner-char-meta">
                  <span class="winner-char-ovr ${ovrToneClass}">OVR ${ovr}</span>
                  <span class="winner-char-rarity">${rarity}</span>
                </div>
                <div class="winner-char-submeta">
                  <span class="winner-char-source ${sourceClass}">${source}</span>
                  <span class="winner-char-type">${characterType}</span>
                  <span class="winner-char-owner ${isChampionMember ? "champion" : ""}">${ownerName}</span>
                  ${submetaRight}
                </div>
                <div class="winner-char-elite-badges">
                  <span class="winner-char-badge elite-rank">Elite #${eliteRank}</span>
                  ${ownerFinalRank ? `<span class="winner-char-badge team-rank">Team #${ownerFinalRank}</span>` : ""}
                  ${isChampionMember ? '<span class="winner-char-badge champion">Champion</span>' : ""}
                </div>
                <div class="winner-flip-hint">Tap to flip</div>
              </div>
              <div class="winner-flip-face winner-flip-back">
                <div class="winner-back-title">${safeName}</div>
                <div class="winner-back-grid">
                  <div><span>Elite Rank</span><strong>#${eliteRank}</strong></div>
                  <div><span>Owner</span><strong>${ownerName}</strong></div>
                  <div><span>Tier</span><strong>${ovrTier}</strong></div>
                  <div><span>Type</span><strong>${characterType}</strong></div>
                  <div><span>Source</span><strong>${source}</strong></div>
                  <div><span>Draft</span><strong>R${draftRound} \xB7 Pick ${draftPick}</strong></div>
                  ${backGridTraceOrCategory}
                  <div><span>Status</span><strong>${evalStatusLabel}</strong></div>
                  <div><span>Global Slot</span><strong>${draftOrderLabel}</strong></div>
                  <div><span>Locked At</span><strong>${draftedAtLabel}</strong></div>
                  <div><span>EV @ Draft</span><strong>${expectedAtDraft}</strong></div>
                  <div><span>EV Near End</span><strong>${expectedNearEnd}</strong></div>
                  <div><span>Value vs Draft</span><strong class="${valueDraft >= 0 ? "plus" : "minus"}">${valueDraftLabel}</strong></div>
                  <div><span>Value vs Late</span><strong class="${valueLate >= 0 ? "plus" : "minus"}">${valueLateLabel}</strong></div>
                </div>
                <div class="winner-back-origin">Drafted Into: ${originalScenario}</div>
                <div class="winner-back-origin">Twist Context: ${originalTwist}</div>
                <ul class="winner-back-notes">
                  <li>${insightA}</li>
                  <li>${insightB}</li>
                </ul>
              </div>
            </div>
          </article>
        `;
      }).join("");
      winnerGallery.innerHTML = `
        <section class="winner-squad-stage" aria-label="${usingGlobalEliteShowcase ? "Global Top 6 Profiles showcase" : "Champion squad stage"}">
          <button class="winner-squad-compact" type="button" aria-expanded="false" aria-controls="winnerSquadExpanded" aria-label="${usingGlobalEliteShowcase ? "Expand Top 6 Profiles showcase" : "Expand Champion Squad"}">
            <div class="winner-compact-title">${usingGlobalEliteShowcase ? "\u{1F3C6} GLOBAL TOP 6 PROFILES" : "\u{1F3C6} TOP 6 PROFILES"}</div>
            <div class="winner-compact-lineup">${compactSlots}</div>
            <div class="winner-compact-stats" aria-label="${usingGlobalEliteShowcase ? "Champion and Top 6 showcase stats" : "Champion stats"}">
              <span class="winner-stat-chip champion">Champion: ${safeChampionName}</span>
              <span class="winner-stat-chip mvp">MVP: ${safeMVP}</span>
              <span class="winner-stat-chip ovr ${teamOvrClass}">Champion Team OVR: ${teamOVR}</span>
              <span class="winner-stat-chip">Champion Chemistry: ${chemistryLabel}</span>
              <span class="winner-stat-chip">Champion Rarity: ${rarityScore}</span>
              <span class="winner-stat-chip">Champion Power Index: ${powerIndex}</span>
              <span class="winner-stat-chip">Avg Draft Value: ${avgDraftValueLabel}</span>
              ${usingGlobalEliteShowcase ? `<span class="winner-stat-chip elite-meta">Top 6 Avg OVR: ${showcaseAverageOVR}</span>` : ""}
              ${usingGlobalEliteShowcase ? `<span class="winner-stat-chip elite-meta">Teams in Top 6: ${showcaseTeamsRepresented}</span>` : ""}
              ${usingGlobalEliteShowcase ? `<span class="winner-stat-chip elite-meta">Champion Picks in Top 6: ${championEliteCount}/6</span>` : ""}
            </div>
            <div class="winner-compact-hint">${usingGlobalEliteShowcase ? "Tap to open global Top 6 showcase \u2022 Tap cards to flip" : "Tap to morph into full squad intel \u2022 Tap cards to flip"}</div>
          </button>
          <div id="winnerSquadExpanded" class="winner-squad-shell winner-squad-shell-expanded" role="region" aria-label="${usingGlobalEliteShowcase ? "Global Top 6 Profiles showcase expanded" : "Champion team expanded"}" aria-hidden="true">
          <button class="winner-squad-close" type="button" aria-label="${usingGlobalEliteShowcase ? "Close Global Top 6 Profiles Showcase" : "Close Champion Squad"}">\u2715</button>
          <div class="winner-squad-banner">${usingGlobalEliteShowcase ? "\u{1F3C6} GLOBAL TOP 6 PROFILES \u2022 LEAGUE SHOWCASE" : "\u{1F3C6} TOP 6 PROFILES \u2022 CHAMPION BREAKDOWN"}</div>
          <div class="winner-squad-tools">
            <button class="winner-flip-all" type="button" aria-pressed="false">\u{1F0CF} FLIP ALL</button>
          </div>
          <div class="winner-expanded-stats" aria-label="Champion detail stats">
            <div class="winner-expanded-stat mvp wide"><span>MVP</span><strong>${safeMVP} (${Number(stats.mvpOVR) || 0} OVR)</strong></div>
            <div class="winner-expanded-stat team-ovr"><span>Champion Team OVR</span><strong class="${teamOvrClass}">${teamOVR}</strong></div>
            <div class="winner-expanded-stat power"><span>Champion Power Index</span><strong>${powerIndex}</strong><em>Tier ${powerTier}</em></div>
            <div class="winner-expanded-stat rarity wide"><span>Champion Rarity Score</span><div class="rarity-topline"><strong>${rarityScore}</strong><strong class="rarity-rareplus">Rare+: ${Number(stats.rarePlusCount) || 0}/${Number(stats.picks) || championCharacters.length}</strong></div><div class="rarity-meter" aria-hidden="true"><span style="width:${rarityPercent}%"></span></div><div class="rarity-gems" aria-label="Rarity intensity">${rarityGems}</div></div>
            <div class="winner-expanded-stat"><span>Champion Chemistry</span><strong>${chemistryLabel}</strong></div>
            <div class="winner-expanded-stat"><span>Avg Draft Value</span><strong class="${avgDraftValue >= 0 ? "plus" : "minus"}">${avgDraftValueLabel}</strong></div>
            ${usingGlobalEliteShowcase ? `<div class="winner-expanded-stat elite wide"><span>Top 6 Profiles Snapshot</span><strong>Avg OVR ${showcaseAverageOVR} \u2022 Teams ${showcaseTeamsRepresented}</strong><em>Champion entries in Top 6: ${championEliteCount}/6</em></div>` : ""}
          </div>
          <div class="winner-char-gallery">
            ${expandedSlots}
          </div>
          <div class="winner-squad-footer">${usingGlobalEliteShowcase ? "Top 6 Profiles by final OVR. Champion result remains score-based." : "Top 6 Profiles."}</div>
          </div>
        </section>
      `;
      const initialSquadStage = winnerGallery.querySelector(".winner-squad-stage");
      if (initialSquadStage) {
        const ceremonyShell = document.createElement("section");
        ceremonyShell.className = "final-ceremony-shell";
        ceremonyShell.innerHTML = `
          <header class="final-ceremony-hero" aria-label="Round 4 to final bridge summary">
            <div class="final-ceremony-eyebrow">Round 4 -> Final Ceremony</div>
            <h2 class="final-ceremony-headline">${safeChampionName} closes the match</h2>
            <p class="final-ceremony-subtitle">${bridgeNarrative}</p>
            <div class="final-ceremony-kpis" aria-label="Champion quick summary">
              <span class="final-ceremony-kpi champion">Champion ${safeChampionName}</span>
              <span class="final-ceremony-kpi">Champion R4 ${round4Points} pts</span>
              <span class="final-ceremony-kpi ${teamOvrClass}">Champion Team OVR ${teamOVR}</span>
              <span class="final-ceremony-kpi">Champion Power ${powerIndex}</span>
              <span class="final-ceremony-kpi">${finalMarginLabel}</span>
              ${usingGlobalEliteShowcase ? `<span class="final-ceremony-kpi">Top 6 Split ${championEliteCount}/6</span>` : ""}
            </div>
            <section class="final-ceremony-mvp-callout" data-final-mvp-callout data-state="idle" aria-label="MVP victory callout">
              <div class="final-ceremony-mvp-avatar-wrap">
                <img class="final-ceremony-mvp-avatar" src="${escapeHtml(winnerMvpOverlayImage)}" alt="${winnerMvpOverlayName} portrait" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${placeholderImage}';">
              </div>
              <div class="final-ceremony-mvp-bubble">
                <div class="final-ceremony-mvp-bubble-top">
                  <span class="final-ceremony-mvp-chip">MVP Voice</span>
                  <strong class="final-ceremony-mvp-name" data-final-mvp-callout-name>${winnerMvpOverlayName}</strong>
                </div>
                <p class="final-ceremony-mvp-line" data-final-mvp-callout-line>Preparing victory callout...</p>
                <small class="final-ceremony-mvp-meta" data-final-mvp-callout-meta>Winner-only phrase set - archetype-shaped</small>
              </div>
            </section>
          </header>
          <div class="final-ceremony-tabs" role="tablist" aria-label="Final result views">
            <button type="button" class="final-ceremony-tab is-active" data-final-view="story" role="tab" aria-selected="true" aria-controls="finalCeremonyPanelStory">Bridge</button>
            <button type="button" class="final-ceremony-tab" data-final-view="elite" role="tab" aria-selected="false" aria-controls="finalCeremonyPanelElite">Top 6 Profiles</button>
            <button type="button" class="final-ceremony-tab" data-final-view="standings" role="tab" aria-selected="false" aria-controls="finalCeremonyPanelStandings">Standings</button>
          </div>
          <section id="finalCeremonyPanelStory" class="final-ceremony-panel is-active" data-final-panel="story" role="tabpanel" aria-label="Bridge summary">
            <div class="final-bridge-grid">
              <article class="final-bridge-card">
                <h3>Ceremony Handoff</h3>
                <p>Round 4 handles the placement drama. Final Results now gives three clean views so mobile players can focus one layer at a time.</p>
                <ul class="final-bridge-list">
                  <li>MVP: ${safeMVP}</li>
                  <li>Champion Chemistry: ${chemistryLabel} | Champion Rarity: ${rarityScore}</li>
                  <li>Avg Draft Value: ${avgDraftValueLabel} | Power Tier: ${powerTier}</li>
                  ${usingGlobalEliteShowcase ? `<li>Top 6 Avg OVR: ${showcaseAverageOVR} | Teams: ${showcaseTeamsRepresented}</li>` : ""}
                </ul>
              </article>
              <article class="final-bridge-card podium">
                <h3>Podium Preview</h3>
                <ol class="final-podium-preview" aria-label="Top finish preview">
                  ${podiumPreviewMarkup || '<li class="final-podium-preview-empty">Standings unavailable.</li>'}
                </ol>
                <div class="final-bridge-actions">
                  <button type="button" class="final-bridge-jump" data-final-jump="elite">Open Top 6 Profiles</button>
                  <button type="button" class="final-bridge-jump alt" data-final-jump="standings">Open Standings</button>
                </div>
              </article>
            </div>
          </section>
          <section id="finalCeremonyPanelElite" class="final-ceremony-panel" data-final-panel="elite" role="tabpanel" aria-label="Top 6 Profiles showcase" hidden></section>
          <section id="finalCeremonyPanelStandings" class="final-ceremony-panel" data-final-panel="standings" role="tabpanel" aria-label="Final standings" hidden>
            <div class="final-standings-intro">
              <div>
                <strong>Scoreboard Verdict</strong>
                <p>Score-based final standings with per-round breakdowns (separate from the Top 6 OVR showcase).</p>
              </div>
              <button type="button" class="final-bridge-jump alt" data-final-jump="elite">Back to Top 6 Profiles</button>
            </div>
            <div id="finalStandingsMount"></div>
          </section>
          <div class="final-ceremony-actions-tray" aria-label="Final actions">
            <div id="finalActionsMount"></div>
          </div>
        `;
        const elitePanel = ceremonyShell.querySelector('[data-final-panel="elite"]');
        if (elitePanel) elitePanel.appendChild(initialSquadStage);
        winnerGallery.innerHTML = "";
        winnerGallery.appendChild(ceremonyShell);
      }
      const compactButton = winnerGallery.querySelector(".winner-squad-compact");
      const expandedShell = winnerGallery.querySelector(".winner-squad-shell-expanded");
      const closeButton = winnerGallery.querySelector(".winner-squad-close");
      const flipAllButton = winnerGallery.querySelector(".winner-flip-all");
      const finalContainer = document.querySelector(".final-container-modern");
      const squadStage = winnerGallery.querySelector(".winner-squad-stage");
      const flipCards = winnerGallery.querySelectorAll(".winner-flip-card");
      const setFlipAllState = (flipped) => {
        if (!flipCards || !flipCards.length) return;
        flipCards.forEach((card) => {
          card.classList.toggle("is-flipped", flipped === true);
        });
        if (flipAllButton) {
          flipAllButton.setAttribute("aria-pressed", flipped === true ? "true" : "false");
          flipAllButton.textContent = flipped === true ? "\u21BA SHOW FRONTS" : "\u{1F0CF} FLIP ALL";
        }
      };
      const closeExpanded = () => {
        if (!expandedShell || !compactButton) return;
        expandedShell.classList.remove("is-open");
        expandedShell.setAttribute("aria-hidden", "true");
        compactButton.setAttribute("aria-expanded", "false");
        if (finalContainer) finalContainer.classList.remove("squad-open");
        if (squadStage) squadStage.classList.remove("expanded");
        setFlipAllState(false);
      };
      const openExpanded = () => {
        if (!expandedShell || !compactButton) return;
        expandedShell.classList.add("is-open");
        expandedShell.setAttribute("aria-hidden", "false");
        compactButton.setAttribute("aria-expanded", "true");
        if (finalContainer) finalContainer.classList.add("squad-open");
        if (squadStage) squadStage.classList.add("expanded");
      };
      if (compactButton) {
        compactButton.addEventListener("click", openExpanded);
      }
      if (closeButton) {
        closeButton.addEventListener("click", closeExpanded);
      }
      if (flipAllButton) {
        flipAllButton.addEventListener("click", () => {
          const shouldFlip = flipAllButton.getAttribute("aria-pressed") !== "true";
          setFlipAllState(shouldFlip);
        });
      }
      if (flipCards && flipCards.length) {
        flipCards.forEach((card) => {
          card.addEventListener("click", () => {
            card.classList.toggle("is-flipped");
            if (flipAllButton) {
              const allFlipped = Array.from(flipCards).every((tile) => tile.classList.contains("is-flipped"));
              flipAllButton.setAttribute("aria-pressed", allFlipped ? "true" : "false");
              flipAllButton.textContent = allFlipped ? "\u21BA SHOW FRONTS" : "\u{1F0CF} FLIP ALL";
            }
          });
          card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              card.classList.toggle("is-flipped");
              if (flipAllButton) {
                const allFlipped = Array.from(flipCards).every((tile) => tile.classList.contains("is-flipped"));
                flipAllButton.setAttribute("aria-pressed", allFlipped ? "true" : "false");
                flipAllButton.textContent = allFlipped ? "\u21BA SHOW FRONTS" : "\u{1F0CF} FLIP ALL";
              }
            }
          });
        });
      }
      const ceremonyTabs = Array.from(winnerGallery.querySelectorAll(".final-ceremony-tab"));
      const ceremonyPanels = Array.from(winnerGallery.querySelectorAll(".final-ceremony-panel"));
      const ceremonyJumpButtons = Array.from(winnerGallery.querySelectorAll("[data-final-jump]"));
      const setCeremonyView = (requestedView) => {
        const view = ["story", "elite", "standings"].includes(String(requestedView)) ? String(requestedView) : "story";
        if (view !== "elite") closeExpanded();
        ceremonyTabs.forEach((tabButton) => {
          const active = (tabButton.getAttribute("data-final-view") || "") === view;
          tabButton.classList.toggle("is-active", active);
          tabButton.setAttribute("aria-selected", active ? "true" : "false");
        });
        ceremonyPanels.forEach((panel) => {
          const active = (panel.getAttribute("data-final-panel") || "") === view;
          panel.classList.toggle("is-active", active);
          panel.hidden = !active;
        });
        if (finalContainer) finalContainer.setAttribute("data-final-view", view);
      };
      ceremonyTabs.forEach((tabButton) => {
        tabButton.addEventListener("click", () => {
          setCeremonyView(tabButton.getAttribute("data-final-view") || "story");
        });
      });
      ceremonyJumpButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setCeremonyView(button.getAttribute("data-final-jump") || "story");
        });
      });
      setCeremonyView("story");
    } else {
      winnerGallery.innerHTML = "";
    }
  }
  let final = document.getElementById("finalLeaderboard");
  if (!final) {
    const fallbackFinalContainer = document.querySelector(".final-container-modern");
    if (fallbackFinalContainer) {
      final = document.createElement("ol");
      final.id = "finalLeaderboard";
      final.className = "leaderboard-modern";
      fallbackFinalContainer.appendChild(final);
    }
  }
  if (!final) {
    showScreen("finalScreen");
    showToast("Game Over! Check the results!", "info");
    return;
  }
  final.innerHTML = "";
  finalStandings.forEach((entry, idx) => {
    const li = document.createElement("li");
    li.className = "leaderboard-entry final-entry";
    const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
    const medal = medals[idx] || "*";
    const emoji = idx === 0 ? "CHAMPION" : idx === 1 ? "RUNNER-UP" : "TOP 3";
    const breakdown = entry.breakdown.map((pts, round) => `R${round + 1}: ${pts}`).join(" | ");
    li.innerHTML = `
      <div class="final-entry-content">
        <div class="final-entry-header">
          <span class="medal">${medal}</span>
          <span class="name">${entry.name}</span>
          <span class="score">${entry.score}pts</span>
          <span class="emoji">${emoji}</span>
        </div>
        <div class="final-entry-detail">${breakdown}</div>
      </div>
    `;
    final.appendChild(li);
  });
  if (winnerGallery) {
    const standingsMount = winnerGallery.querySelector("#finalStandingsMount");
    const actionsMount = winnerGallery.querySelector("#finalActionsMount");
    const finalActions = document.querySelector(".final-actions-modern");
    if (standingsMount) standingsMount.appendChild(final);
    if (actionsMount && finalActions) actionsMount.appendChild(finalActions);
  }
  let renderedInRound4Ceremony = false;
  try {
    if (typeof window.renderRound4FinaleCeremony === "function") {
      renderedInRound4Ceremony = window.renderRound4FinaleCeremony(data) === true;
    }
  } catch (round4FinaleError) {
    console.warn("[final results] round4 finale render failed:", round4FinaleError);
  }
  if (renderedInRound4Ceremony) {
    showToast("Final verdict revealed inside Round 4. Full archive is available.", "info");
    return;
  }
  try {
    if (window.__lobbyAudio && typeof window.__lobbyAudio.setMusicScene === "function") {
      window.__lobbyAudio.setMusicScene("finale", { force: true, transition: "crescendo", exclusive: true });
    }
  } catch (finalMusicError) {
    console.warn("[final results] music scene failed:", finalMusicError);
  }
  if (!finalGameEndedVoiceQueued) {
    enqueueVoiceCues(finalGameEndedVoiceCues, {
      fallback: () => buildPhaseVoiceCues("gameEnded", data)
    });
    finalGameEndedVoiceQueued = true;
  }
  showScreen("finalScreen");
  try {
    const finalNarratorLeadText = getNarratorLeadLineFromVoiceCues(Array.isArray(data && data.voiceCues) ? data.voiceCues : []);
    const mvpCalloutNode = winnerGallery ? winnerGallery.querySelector("[data-final-mvp-callout]") : null;
    const mvpCalloutNameNode = winnerGallery ? winnerGallery.querySelector("[data-final-mvp-callout-name]") : null;
    const mvpCalloutLineNode = winnerGallery ? winnerGallery.querySelector("[data-final-mvp-callout-line]") : null;
    const mvpCalloutMetaNode = winnerGallery ? winnerGallery.querySelector("[data-final-mvp-callout-meta]") : null;
    const updateFinalMvpOverlay = (payload = {}) => {
      if (!mvpCalloutNode) return;
      const state = String(payload && payload.state || "idle");
      mvpCalloutNode.setAttribute("data-state", state);
      if (mvpCalloutNameNode && payload && payload.characterName) {
        mvpCalloutNameNode.textContent = String(payload.characterName);
      }
      if (mvpCalloutLineNode) {
        const line = String(payload && (payload.phrase || payload.compositeLine || payload.subtitle) || "").trim();
        if (line) mvpCalloutLineNode.textContent = line;
      }
      if (mvpCalloutMetaNode) {
        const bits = [];
        if (payload && payload.classLabel) bits.push(String(payload.classLabel));
        if (payload && payload.temperament) bits.push(String(payload.temperament).replace(/_/g, " "));
        else if (payload && payload.voiceStyle) bits.push(String(payload.voiceStyle));
        if (state === "speaking") bits.push("MVP victory callout");
        if (!bits.length) bits.push("Winner-only phrase set - archetype-shaped");
        mvpCalloutMetaNode.textContent = bits.join(" - ");
      }
    };
    if (window.__lobbyAudio && typeof window.__lobbyAudio.playFinaleMvpVictoryCallout === "function") {
      try {
        if (typeof window.__lobbyAudio.ensureUnlocked === "function") window.__lobbyAudio.ensureUnlocked();
        if (typeof window.__lobbyAudio.ensureRunning === "function") window.__lobbyAudio.ensureRunning();
      } catch (_audioReadyError) {
      }
      const finaleRoster = Array.isArray(data && data.winnerTeamCharacters) && data.winnerTeamCharacters.length ? data.winnerTeamCharacters : Array.isArray(data && data.eliteFinalSix) ? data.eliteFinalSix : [];
      const mvpDelayMs = Math.max(
        520,
        Math.min(1900, 520 + Math.round((String(finalNarratorLeadText || "").length || 0) * 14))
      );
      Promise.resolve(window.__lobbyAudio.playFinaleMvpVictoryCallout(finaleRoster, {
        context: "final-screen-mvp-victory",
        dedupeFinale: true,
        delayMs: mvpDelayMs,
        narratorLeadText: finalNarratorLeadText,
        onOverlayUpdate: updateFinalMvpOverlay
      })).then((audioResult) => {
        if (!audioResult || audioResult.mode !== "no-audio-fallback") return;
        const prompt = String(audioResult.prompt || "").trim() || "MVP victory callout unavailable.";
        const sig = `${audioResult.signature || ""}|${prompt}`;
        if (audioState.lastFinaleNoAudioToastSig === sig) return;
        audioState.lastFinaleNoAudioToastSig = sig;
        showToast(`Voice: ${prompt}`, "info", 2400);
      }).catch(() => {
      });
    }
  } catch (finalAudioError) {
    console.warn("[final results] audio cue failed:", finalAudioError);
  }
  showToast("Game Over! Check the results!", "info");
  if (!finalGameEndedVoiceQueued) {
    enqueueVoiceCues(finalGameEndedVoiceCues, {
      fallback: () => buildPhaseVoiceCues("gameEnded", data)
    });
    finalGameEndedVoiceQueued = true;
  }
});
function sendPlayAgain() {
  socket.emit("playAgain");
  showToast("Starting new game with same players...", "info");
}
function openFinalResultsArchive() {
  resetCharacterCalloutSessionState("open-final-archive");
  const finalContainer = document.querySelector(".final-container-modern");
  if (finalContainer) {
    finalContainer.classList.add("from-round4-archive");
    if (!finalContainer.querySelector(".final-archive-backbar")) {
      const backbar = document.createElement("div");
      backbar.className = "final-archive-backbar";
      backbar.innerHTML = `
        <button type="button" class="final-archive-backbtn" onclick="returnToRound4Finale()">
          <span aria-hidden="true">\u2190</span>
          <span>Back to Round 4 Finale</span>
        </button>
        <div class="final-archive-backmeta">
          <strong>Final Results Archive</strong>
          <small>Detailed archive view (Round 4 remains the primary finale)</small>
        </div>
      `;
      finalContainer.insertBefore(backbar, finalContainer.firstChild);
    }
  }
  showScreen("finalScreen");
  const standingsTab = document.querySelector('.final-ceremony-tab[data-final-view="standings"]');
  if (standingsTab && typeof standingsTab.click === "function") {
    standingsTab.click();
  }
}
function returnToRound4Finale() {
  resetCharacterCalloutSessionState("return-round4-finale");
  showScreen("round4EvalScreen");
  const finale = document.querySelector(".eval-finale-ceremony");
  if (finale) {
    try {
      const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      finale.scrollIntoView(reduceMotion ? { block: "start" } : { behavior: "smooth", block: "start" });
    } catch (error) {
    }
  }
}
function goToLobby() {
  if (confirm("Are you sure? This will return to the lobby.")) {
    resetCharacterCalloutSessionState("go-to-lobby");
    clearVoiceCues("go-to-lobby", { includeActive: true });
    clearTimers();
    resetDraftWaitIntelPreview({ hide: true });
    chatPingState.roomCode = "";
    resetChatTabPing();
    audioState.hasPlayedLobbyEntry = false;
    resetAllState();
    socket.disconnect();
    socket.connect();
    showScreen("join");
    document.getElementById("name").value = "";
    document.getElementById("room").value = "";
  }
}
window.addEventListener("beforeunload", () => {
  clearVoiceCues("beforeunload", { includeActive: true });
  socket.disconnect();
});
function exposeWindowUiActions() {
  window.joinRoom = joinRoom;
  window.leaveRoom = leaveRoom;
  window.showHelp = showHelp;
  window.closeHelp = closeHelp;
  window.switchLobbyTab = switchLobbyTab;
  window.toggleAccordion = toggleAccordion;
  window.toggleScenario = toggleScenario;
  window.toggleResultsDetails = toggleResultsDetails;
  window.toggleReady = toggleReady;
  window.updateSetting = updateSetting;
  window.updateSettingsBatch = updateSettingsBatch;
  window.updateContentPackDescription = updateContentPackDescription;
  window.sendMessage = sendMessage;
  window.sendReaction = sendReaction;
  window.sendStartGame = sendStartGame;
  window.submitDraft = submitDraft;
  window.selectDraftSlot = selectDraftSlot;
  window.clearDraftInputField = clearDraftInputField;
  window.lockDraft = lockDraft;
  window.lockVote = lockVote;
  window.readyForNextRound = readyForNextRound;
  window.sendPlayAgain = sendPlayAgain;
  window.openFinalResultsArchive = openFinalResultsArchive;
  window.returnToRound4Finale = returnToRound4Finale;
  window.goToLobby = goToLobby;
}
function runInitStep(stepName = "", fn = null) {
  if (typeof fn !== "function") return;
  try {
    fn();
  } catch (error) {
    console.error(`[startup:init] ${stepName} failed:`, error);
  }
}
exposeWindowUiActions();
runInitStep("installAudioUnlockHandlers", installAudioUnlockHandlers);
runInitStep("setupAudioControls", setupAudioControls);
runInitStep("installChatLayoutController", installChatLayoutController);
runInitStep("updateReadyButtonUi", () => updateReadyButtonUi(Boolean(player.ready)));
runInitStep("runStartupBootstrapPreflight", () => {
  void runStartupBootstrapPreflight();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && audioState.unlocked) {
    ensureAudioRunning();
    applyAudioLevels();
  }
  syncMusicLoopState();
});
exposeWindowUiActions();
if (shouldAutoOpenRound4Loading()) {
  window.setTimeout(() => {
    openRound4LoadingDebugView();
  }, 0);
}
