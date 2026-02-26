import { ARCHETYPES } from './archetypes.js';
import { clamp } from './coreUtils.js';

const BASE = Object.freeze({
  voiceHints: [],
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  punctuationStyle: 'neutral'
});

// `voiceHints` are legacy browser-speech hints and are ignored in the Kokoro-only build.
// Rate/pitch/volume/punctuationStyle remain active for archetype prosody + text styling.
export const ARCHETYPE_SPEECH_PRESETS = Object.freeze({
  [ARCHETYPES.NARRATOR]: { voiceHints: ['neural', 'natural', 'narrator', 'serena', 'aria', 'jenny'], rate: 0.97, pitch: 0.95, volume: 0.95, punctuationStyle: 'dramatic' },
  [ARCHETYPES.ANNOUNCER]: { voiceHints: ['neural', 'natural', 'enhanced', 'aria', 'guy', 'davis'], rate: 1.03, pitch: 1.0, volume: 0.98, punctuationStyle: 'staccato' },
  [ARCHETYPES.HEROIC]: { voiceHints: ['natural', 'enhanced', 'davis', 'guy', 'jenny'], rate: 0.93, pitch: 0.89, volume: 0.99, punctuationStyle: 'dramatic' },
  [ARCHETYPES.VILLAIN]: { voiceHints: ['natural', 'enhanced', 'david', 'mark', 'daniel'], rate: 0.84, pitch: 0.76, volume: 0.97, punctuationStyle: 'dramatic' },
  [ARCHETYPES.MYSTERIOUS]: { voiceHints: ['natural', 'neural', 'sara', 'jenny', 'aria'], rate: 0.88, pitch: 0.9, volume: 0.92, punctuationStyle: 'dramatic' },
  [ARCHETYPES.CHAOTIC]: { voiceHints: ['enhanced', 'aria', 'zira', 'samantha'], rate: 1.21, pitch: 1.16, volume: 0.99, punctuationStyle: 'staccato' },
  [ARCHETYPES.ROBOTIC]: { voiceHints: ['microsoft', 'google', 'online', 'zira', 'heera'], rate: 0.99, pitch: 0.85, volume: 0.93, punctuationStyle: 'staccato' },
  [ARCHETYPES.CORPORATE]: { voiceHints: ['natural', 'neural', 'jenny', 'guy', 'davis'], rate: 1.0, pitch: 0.97, volume: 0.92, punctuationStyle: 'neutral' },
  [ARCHETYPES.REGAL]: { voiceHints: ['natural', 'enhanced', 'libby', 'victoria', 'david'], rate: 0.9, pitch: 0.85, volume: 0.97, punctuationStyle: 'dramatic' },
  [ARCHETYPES.ANCIENT]: { voiceHints: ['natural', 'enhanced', 'grandma', 'david', 'fred'], rate: 0.86, pitch: 0.82, volume: 0.94, punctuationStyle: 'dramatic' },
  [ARCHETYPES.SPOOKY]: { voiceHints: ['natural', 'enhanced', 'samantha', 'victoria', 'zira'], rate: 0.82, pitch: 0.78, volume: 0.88, punctuationStyle: 'dramatic' },
  [ARCHETYPES.CUTE]: { voiceHints: ['natural', 'neural', 'aria', 'jenny', 'samantha'], rate: 1.07, pitch: 1.18, volume: 0.96, punctuationStyle: 'neutral' },
  [ARCHETYPES.KID_CARTOON]: { voiceHints: ['natural', 'enhanced', 'aria', 'samantha', 'zira'], rate: 1.18, pitch: 1.24, volume: 1.0, punctuationStyle: 'staccato' },
  [ARCHETYPES.GRUFF]: { voiceHints: ['david', 'guy', 'mark', 'daniel'], rate: 0.93, pitch: 0.82, volume: 0.98, punctuationStyle: 'neutral' },
  [ARCHETYPES.SWEET]: { voiceHints: ['jenny', 'aria', 'sara', 'victoria'], rate: 1.0, pitch: 1.1, volume: 0.95, punctuationStyle: 'neutral' },
  [ARCHETYPES.SCIENTIST]: { voiceHints: ['natural', 'enhanced', 'guy', 'davis', 'jenny'], rate: 1.04, pitch: 0.98, volume: 0.93, punctuationStyle: 'neutral' },
  [ARCHETYPES.WESTERN]: { voiceHints: ['guy', 'david', 'mark'], rate: 0.97, pitch: 0.88, volume: 0.96, punctuationStyle: 'staccato' },
  [ARCHETYPES.PIRATE]: { voiceHints: ['david', 'mark', 'fred'], rate: 0.94, pitch: 0.86, volume: 1.0, punctuationStyle: 'dramatic' },
  [ARCHETYPES.SPORTY]: { voiceHints: ['neural', 'natural', 'guy', 'aria', 'jenny'], rate: 1.12, pitch: 1.02, volume: 0.99, punctuationStyle: 'staccato' },
  [ARCHETYPES.ABSURD]: { voiceHints: ['natural', 'enhanced', 'aria', 'guy', 'zira'], rate: 1.05, pitch: 1.04, volume: 0.96, punctuationStyle: 'neutral' },
  [ARCHETYPES.MEME]: { voiceHints: ['natural', 'enhanced', 'zira', 'aria'], rate: 1.2, pitch: 1.16, volume: 1.0, punctuationStyle: 'staccato' },
  [ARCHETYPES.OBJECT]: { voiceHints: ['microsoft', 'online', 'google', 'davis'], rate: 1.02, pitch: 0.94, volume: 0.92, punctuationStyle: 'neutral' },
  [ARCHETYPES.CREATURE]: { voiceHints: ['samantha', 'victoria', 'zira', 'aria'], rate: 0.98, pitch: 1.14, volume: 0.97, punctuationStyle: 'dramatic' },
  [ARCHETYPES.MONSTER]: { voiceHints: ['david', 'mark', 'zira'], rate: 0.88, pitch: 0.8, volume: 1.0, punctuationStyle: 'dramatic' },
  [ARCHETYPES.COSMIC]: { voiceHints: ['natural', 'neural', 'libby', 'jenny', 'davis'], rate: 0.95, pitch: 0.99, volume: 0.94, punctuationStyle: 'dramatic' },
  [ARCHETYPES.DETECTIVE]: { voiceHints: ['guy', 'david', 'jenny'], rate: 0.96, pitch: 0.92, volume: 0.94, punctuationStyle: 'neutral' },
  [ARCHETYPES.COMMANDER]: { voiceHints: ['guy', 'davis', 'david', 'natural'], rate: 0.98, pitch: 0.88, volume: 1.0, punctuationStyle: 'staccato' },
  [ARCHETYPES.MAGICAL]: { voiceHints: ['natural', 'neural', 'victoria', 'sara', 'jenny'], rate: 0.97, pitch: 1.06, volume: 0.95, punctuationStyle: 'dramatic' },
  [ARCHETYPES.CELEBRITY]: { voiceHints: ['natural', 'enhanced', 'aria', 'guy', 'jenny'], rate: 1.03, pitch: 1.01, volume: 0.97, punctuationStyle: 'neutral' },
  [ARCHETYPES.STEALTHY]: { voiceHints: ['natural', 'neural', 'david', 'jenny'], rate: 0.96, pitch: 0.9, volume: 0.9, punctuationStyle: 'dramatic' },
  [ARCHETYPES.MENTOR]: { voiceHints: ['natural', 'enhanced', 'davis', 'libby', 'jenny'], rate: 0.93, pitch: 0.93, volume: 0.94, punctuationStyle: 'neutral' },
  [ARCHETYPES.TRICKSTER]: { voiceHints: ['natural', 'enhanced', 'aria', 'zira', 'guy'], rate: 1.14, pitch: 1.09, volume: 0.98, punctuationStyle: 'staccato' }
});

export function getSpeechPresetForArchetype(archetype, { expressive = true } = {}) {
  const key = String(archetype || '').trim();
  const preset = ARCHETYPE_SPEECH_PRESETS[key] || BASE;
  if (expressive !== false) {
    return { ...BASE, ...preset };
  }
  return {
    ...BASE,
    ...preset,
    // Neutral mode keeps a clear "host" personality rather than flattening to dry default TTS.
    rate: clamp((Number(preset.rate) * 0.45) + 0.62, 0.92, 1.16, 1.03),
    pitch: clamp((Number(preset.pitch) * 0.5) + 0.5, 0.9, 1.12, 0.98),
    volume: clamp((Number(preset.volume) * 0.6) + 0.36, 0.9, 1, 0.96),
    punctuationStyle: 'host'
  };
}

function maybeTrimSentence(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function stylizeVoiceCueText(text = '', archetype, { expressive = true, cueType = 'entry' } = {}) {
  let next = maybeTrimSentence(text);
  if (!next) return '';
  if (!expressive) {
    // Neutral mode still speaks with a strong default host personality.
    if (cueType === 'twist') {
      next = next.replace(/^Twist revealed:\s*/i, 'Alright, twist revealed... ');
      if (!/[.!?]$/.test(next)) next = `${next}.`;
    } else if (cueType === 'narration' || cueType === 'round4') {
      if (!/^Alright[,.]/i.test(next) && !/^Okay[,.]/i.test(next)) {
        next = `Alright, ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
      }
      next = next.replace(/^Round (\d+) begins\.?$/i, 'Alright, round $1 begins.');
      next = next.replace(/^Final evaluation begins\.?$/i, 'Alright. Final evaluation begins.');
      next = next.replace(/^Scenario:\s+/i, 'Scenario... ');
      next = next.replace(/^Twist:\s+/i, 'Twist... ');
      if (!/[.!?]$/.test(next)) next = `${next}.`;
    } else if (cueType === 'entry') {
      // Keep quote/fact content intact, but add pacing punctuation for a host-like read.
      next = next.replace(/^([^:]{2,40}):\s+/, '$1, ');
      next = next.replace(/:\s+/g, ', ');
      next = next.replace(/\.\s+/g, '. ');
      if (!/[.!?]$/.test(next) && next.length > 14) next = `${next}.`;
    }
    return next;
  }

  const preset = getSpeechPresetForArchetype(archetype, { expressive: true });
  const punctuation = preset.punctuationStyle || 'neutral';

  if (punctuation === 'dramatic') {
    if (!/[.!?]$/.test(next)) next = `${next}.`;
    if (cueType === 'round4' || cueType === 'narration') {
      next = next.replace(/:\s+/g, '... ');
    }
  } else if (punctuation === 'staccato') {
    next = next.replace(/\s+-\s+/g, ', ');
    if (cueType === 'twist') {
      next = next.replace(/^Twist revealed:\s*/i, 'Twist revealed. ');
    }
  }

  if (archetype === ARCHETYPES.VILLAIN && !/\.\.\./.test(next) && next.length > 20) {
    next = next.replace(/:\s+/g, '... ').replace(/,\s+/g, '... ').replace(/\. /g, '... ');
  }
  if ((archetype === ARCHETYPES.SPOOKY || archetype === ARCHETYPES.MYSTERIOUS) && cueType === 'entry') {
    next = next.replace(/:\s+/g, '... ');
    next = next.replace(/,\s+/g, '... ');
    if (!/[.!?]$/.test(next)) next = `${next}...`;
  }
  if (archetype === ARCHETYPES.HEROIC && cueType === 'entry') {
    next = next.replace(/:\s+/g, '. ');
    next = next.replace(/\s{2,}/g, ' ');
    if (!/[.!?]$/.test(next)) next = `${next}.`;
  }
  if (archetype === ARCHETYPES.ROBOTIC && cueType === 'entry') {
    next = next.replace(/:\s+/g, '. ');
    next = next.replace(/,\s+/g, '. ');
    const robotAdjacent = /\b(robot|android|cyborg|droid|protocol|unit|system|module|core|online|ai)\b/i.test(next);
    if (robotAdjacent && next.length > 12 && !/\bbeep\b/i.test(next)) {
      next = `Beep. ${next}`;
    }
  }
  if (archetype === ARCHETYPES.CUTE && cueType === 'entry' && !/[!?]$/.test(next)) {
    next = `${next}!`;
  }
  if (archetype === ARCHETYPES.KID_CARTOON && cueType === 'entry') {
    next = next.replace(/^([^:]{2,32}):\s+/i, '$1! ');
    if (!/[!?]$/.test(next)) next = `${next}!`;
  }
  if (archetype === ARCHETYPES.CHAOTIC && cueType === 'entry') {
    next = next.replace(/:\s+/g, '! ');
    next = next.replace(/,\s+/g, ', ');
    if (!/[!?]$/.test(next)) next = `${next}!`;
  }
  if (archetype === ARCHETYPES.ANNOUNCER && (cueType === 'narration' || cueType === 'round4') && !/^Alright[,.]/i.test(next)) {
    next = `Alright, ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
  }

  if (next.length > 180) {
    next = `${next.slice(0, 177).trim()}...`;
  }
  return next;
}
