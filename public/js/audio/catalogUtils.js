export function buildKokoroCatalogSignature(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return '';
  return entries
    .map((entry) => `${String(entry && entry.id || '')}|${String(entry && entry.name || '')}|${String(entry && entry.overallGrade || '')}`)
    .join('||');
}

export function buildKokoroFallbackCatalogEntry(id = '', presetMetaById = {}) {
  const voiceId = String(id || '').trim();
  const meta = presetMetaById && presetMetaById[voiceId] ? presetMetaById[voiceId] : null;
  const isUk = voiceId.startsWith('bf_') || voiceId.startsWith('bm_');
  return {
    id: voiceId,
    name: meta && meta.shortName ? meta.shortName : (voiceId || 'Voice'),
    language: isUk ? 'en-gb' : 'en-us',
    overallGrade: '',
    roleHint: meta && meta.roleHint ? meta.roleHint : ''
  };
}

export function buildKokoroFallbackCatalog(curatedVoiceIds = [], presetMetaById = {}) {
  if (!Array.isArray(curatedVoiceIds) || !curatedVoiceIds.length) return [];
  return curatedVoiceIds.map((id) => buildKokoroFallbackCatalogEntry(id, presetMetaById));
}

export function buildKokoroCuratedCatalog(rawCatalog = [], curatedVoiceIds = [], presetMetaById = {}) {
  if (!Array.isArray(curatedVoiceIds) || !curatedVoiceIds.length) return [];
  if (!Array.isArray(rawCatalog) || !rawCatalog.length) {
    return buildKokoroFallbackCatalog(curatedVoiceIds, presetMetaById);
  }
  const byId = new Map();
  rawCatalog.forEach((entry) => {
    const id = String(entry && entry.id || '').trim();
    if (!id) return;
    byId.set(id, {
      ...entry,
      roleHint: (presetMetaById[id] && presetMetaById[id].roleHint) || ''
    });
  });
  return curatedVoiceIds.map((id) => byId.get(id) || buildKokoroFallbackCatalogEntry(id, presetMetaById));
}

export function formatKokoroCatalogLabel(entry = {}, presetMetaById = {}) {
  const id = String(entry && entry.id || '').trim();
  const preset = presetMetaById && presetMetaById[id] ? presetMetaById[id] : null;
  if (preset && preset.menuLabel) return preset.menuLabel;
  const name = String(entry && entry.name || id || 'Voice').trim();
  const lang = String(entry && entry.language || '').trim();
  const grade = String(entry && entry.overallGrade || '').trim();
  const roleHint = String(entry && entry.roleHint || '').trim();
  const parts = [name];
  if (lang) parts.push(lang.toUpperCase());
  if (grade) parts.push(grade);
  if (roleHint) parts.push(roleHint);
  return parts.join(' - ');
}

export function buildVoiceCatalogSignature(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return '';
  return entries
    .map((entry) => `${entry && entry.id ? entry.id : ''}|${entry && entry.qualityScore != null ? entry.qualityScore : ''}`)
    .join('||');
}

export function sortVoiceCatalogEntries(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return [];
  return entries.slice().sort((a, b) => {
    const scoreDiff = Number(b && b.qualityScore || 0) - Number(a && a.qualityScore || 0);
    if (scoreDiff) return scoreDiff;
    return String(a && a.name || '').localeCompare(String(b && b.name || ''));
  });
}
