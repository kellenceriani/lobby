export function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function clampAudioLevel(value, fallback = 1) {
  return clamp(value, 0, 1, fallback);
}

export function clampAudioPan(value) {
  return clamp(value, -1, 1, 0);
}

export function clampAudioRate(value, fallback = 1) {
  return clamp(value, 0.5, 2.5, fallback);
}

export function nowMs() {
  return Date.now();
}

export function normalizeTrimmedText(value = '') {
  return String(value || '').trim();
}

export function normalizeCollapsedText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function hashString(input = '') {
  const text = String(input || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash >>> 0);
}
