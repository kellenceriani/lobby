function writeAsciiToView(view, offset, text) {
  for (let idx = 0; idx < text.length; idx += 1) {
    view.setUint8(offset + idx, text.charCodeAt(idx));
  }
}

export function encodeAudioPathSegment(filename = '') {
  return String(filename || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export function buildSilentWavDataUri(durationMs = 90) {
  try {
    const sampleRate = 8000;
    const sampleCount = Math.max(1, Math.round((Math.max(10, Number(durationMs) || 90) / 1000) * sampleRate));
    const dataSize = sampleCount;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeAsciiToView(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAsciiToView(view, 8, 'WAVE');
    writeAsciiToView(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    writeAsciiToView(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    for (let idx = 0; idx < dataSize; idx += 1) {
      view.setUint8(44 + idx, 128);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let idx = 0; idx < bytes.length; idx += 1) {
      binary += String.fromCharCode(bytes[idx]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  } catch (error) {
    return '';
  }
}

export function getAudioCategoryMeta(category = 'sfx') {
  const key = String(category || 'sfx').toLowerCase();
  if (key === 'music') return { enabledKey: 'musicEnabled', volumeKey: 'musicVolume', gainKey: 'musicGain', label: 'Music' };
  if (key === 'reveal') return { enabledKey: 'revealEnabled', volumeKey: 'revealVolume', gainKey: 'revealGain', label: 'Reveal' };
  if (key === 'card' || key === 'cards' || key === 'blurb' || key === 'voice') return { enabledKey: 'cardEnabled', volumeKey: 'cardVolume', gainKey: 'cardGain', label: 'Callouts' };
  return { enabledKey: 'sfxEnabled', volumeKey: 'sfxVolume', gainKey: 'sfxGain', label: 'UI' };
}
