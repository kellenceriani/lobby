# LobbyWARS Documentation Hub

This folder contains active planning docs plus older implementation notes. The current
core direction is the Context Engine (non-LLM evaluator path), not the earlier live-AI runtime plan.

## Current Priority Docs (read first)

1. `AI_CORE_MIGRATION_PLAN.md` - active Context Engine core plan and weighting standards
2. `FUTURE_IMPLEMENTATIONS_ROADMAP.md` - active roadmap and priority sequencing
3. `GAME_DESIGN_DOCUMENT.md` - game rules, pacing, and round flow
4. `ARCHITECTURE.md` - codebase structure and module ownership
5. `EVALUATOR_TUNING_GUIDE.md` - evaluator tuning and calibration notes

## Supporting Docs

- `SOCKET_EVENT_CONTRACT.md` - client/server event contracts
- `RUNBOOK.md` - safer workflow guidance for larger changes
- `MASTER_EXECUTION_ROADMAP.md` - broader execution planning notes
- `ROUND_RESULTS_UI_BLUEPRINTS.md` - results UI direction notes

## Legacy / Historical Notes (use with caution)

These may still contain useful ideas, but parts can be outdated relative to the current Context Engine implementation:

- `ROUND4_AI_EVALUATOR_SPEC.md`
- `OVR_CHEMISTRY_IMPROVEMENTS.md`
- `IMPLEMENTATION_COMPLETE.md`

## Rule

If docs and code diverge, code is authoritative.

## Free Voice System (Client-side TTS)

LobbyWARS now supports a fully free voice cue system that runs on the client using the browser's Web Speech API (`window.speechSynthesis`).

- Server emits optional text-only `voiceCues` in existing socket payloads (round start, scenario, twist, Round 4, finals).
- Client speaks cues locally using OS/browser voices (no paid APIs, no server-side audio generation).
- Voice selection prefers higher-quality local voices when available (for example voices labeled `Neural`, `Natural`, `Enhanced`, `Premium`).
- Entry/card blurbs use deterministic archetype classification + expressive prosody presets (rate/pitch/punctuation styling).
- If speech synthesis is unavailable, the game continues normally with no voice playback.

### Enhanced Adaptive Neural Voices (Hybrid)

LobbyWARS now supports an **adaptive neural voice** backend for more human-like narration and archetype voice cues.

- Uses a server-side adaptive TTS router (`/api/tts/*`) with provider stacks (Edge Neural, optional Piper, optional HTTP bridges for Chatterbox/OpenVoice/XTTS/Parler/F5/E2/Spark/Fish/Zonos).
- Keeps the existing `VoiceManager` queue/unlock/mute controls and falls back to browser Web Speech when no neural provider is available.
- Narration uses a curated 4-voice cast (2 female + 2 male). Entry/card cues auto-route by archetype across prioritized TTS stacks.
- Audio clips are cached (client and server) to reduce repeat latency after first synthesis.

### Platform Notes

- Voice quality and available voices vary by browser + OS.
- Neural voice quality/latency depends on configured providers, network/local runtime availability, and device/browser playback conditions.
- iOS Safari requires a user gesture before voice/music can reliably play. Use the in-game audio controls (`Tap to Enable Voice` / any audio control tap).
- Browser autoplay/speech restrictions can interrupt queued cues during rapid phase changes; the queue is intentionally conservative and clears on major game phase transitions.

### Tuning Archetypes

- Archetypes: `public/js/audio/archetypes.js`
- Classifier heuristics: `public/js/audio/classifyArchetype.js`
- Voice/pitch/rate presets + stylizer: `public/js/audio/archetypePresets.js`
- Queueing + voice selection logic: `public/js/audio/voiceManager.js`
