// settings.js — Settings OS wiring (client-side only)
// This file is intentionally UI-focused and integrates with existing app.js bindings.
// It does NOT own authoritative room state; it simply reflects + helps navigate settings.

// Public API (used by app.js when room data arrives)
window.SettingsOS = {
  refreshNowPlaying
};

document.addEventListener('DOMContentLoaded', () => {
  bindCollections();
  bindModeCards();
  bindCarouselArrows();
  bindPowerStrip();
  bindSheetControls();
  // Bind carousel arrow buttons for mode card scrolling
  function bindCarouselArrows() {
    const track = $('modeCardTrack');
    if (!track) return;

    const root = document.querySelector('#settingsTab .settings-os') || document;
    const prev = root.querySelector('[data-carousel-arrow="prev"]');
    const next = root.querySelector('[data-carousel-arrow="next"]');

    function scrollByStep(dir) {
      // Scroll almost a full “viewport” of the track; keeps swipe behavior intact.
      const step = Math.max(220, Math.floor(track.clientWidth * 0.85));
      track.scrollBy({ left: dir * step, behavior: 'smooth' });
    }

    if (prev) prev.addEventListener('click', () => scrollByStep(-1));
    if (next) next.addEventListener('click', () => scrollByStep(1));

    // Optional polish: hide arrows if not scrollable
    function syncArrowState() {
      const maxScroll = track.scrollWidth - track.clientWidth;
      const left = track.scrollLeft;

      if (prev) prev.disabled = left <= 2;
      if (next) next.disabled = left >= (maxScroll - 2);
    }

    track.addEventListener('scroll', syncArrowState, { passive: true });
    window.addEventListener('resize', syncArrowState);
    syncArrowState();
  }
  bindRequestHost();
  refreshNowPlaying();

  // Keep Now Playing in sync with user edits
  for (const id of ['difficulty', 'scenarioTheme', 'contentPack', 'plotTwists', 'customScenario']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('change', refreshNowPlaying);
    el.addEventListener('input', () => {
      // Keep this light; only update in realtime for text inputs
      if (id === 'customScenario') refreshNowPlaying();
    });
  }
});

function $(id) {
  return document.getElementById(id);
}

function bindCollections() {
  const track = $('modeCardTrack');
  if (!track) return;

  const pills = Array.from(document.querySelectorAll('.settings-collections-track .collection-pill'));
  if (!pills.length) return;

  function setActiveCollection(collection) {
    pills.forEach((btn) => {
      const isActive = btn.dataset.collection === collection;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const cards = Array.from(track.querySelectorAll('.mode-card[data-collection]'));
    cards.forEach((card) => {
      const match = card.dataset.collection === collection;
      card.style.display = match ? '' : 'none';
    });

    // Snap back to start for the new collection
    track.scrollTo({ left: 0, behavior: 'smooth' });
  }

  pills.forEach((btn) => {
    btn.addEventListener('click', () => setActiveCollection(btn.dataset.collection || 'core'));
  });

  // Initialize
  const active = pills.find((b) => b.classList.contains('active')) || pills[0];
  setActiveCollection(active.dataset.collection || 'core');
}

function bindModeCards() {
  const track = $('modeCardTrack');
  if (!track) return;

  track.addEventListener('click', (e) => {
    const card = e.target.closest('.mode-card');
    if (!card) return;
    openMode(card.dataset.mode || 'coreRules');
  });

  track.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.mode-card');
    if (!card) return;
    e.preventDefault();
    openMode(card.dataset.mode || 'coreRules');
  });

  // Read-only preview cards: show a toast if available
  const lockedCards = Array.from(document.querySelectorAll('.settings-os-home-readonly .mode-card.is-locked'));
  lockedCards.forEach((card) => {
    card.addEventListener('click', () => {
      if (typeof window.showToast === 'function') {
        window.showToast('Only the host can edit settings. You can still preview what’s coming.', 'info');
      }
    });
  });
}

function bindPowerStrip() {
  const root = document.querySelector('#settingsTab .settings-os');
  if (!root) return;

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    if (action === 'openCoreRules') {
      openMode('coreRules');
      return;
    }

    if (action === 'openAudio') {
      const audioDeck = document.querySelector('#settingsTab .audio-control-deck');
      if (audioDeck) {
        audioDeck.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    if (action === 'openSecondScreen') {
      if (typeof window.showToast === 'function') {
        window.showToast('Second Screen is marked Coming Soon.', 'info');
      }
      return;
    }
  });
}

function bindSheetControls() {
  const sheet = $('modeInspector');
  if (!sheet) return;

  // Close on backdrop click
  const backdrop = sheet.querySelector('.mode-sheet-backdrop');
  backdrop?.addEventListener('click', () => closeSheet());

  // Close / reset buttons
  sheet.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    if (action === 'closeSheet') closeSheet();
    if (action === 'resetMode') resetCoreRules();
  });

  // ESC closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });
}

function bindRequestHost() {
  const btn = document.querySelector('#settingsReadonlyHome [data-action="requestHost"]');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (typeof window.showToast === 'function') {
      window.showToast('Tip: ask the host in chat to open Settings and apply changes.', 'info');
    }
    // Optional: switch to chat tab if ui.js exposes the helper
    if (typeof window.switchLobbyTab === 'function') {
      window.switchLobbyTab('chat');
    }
  });
}

function openMode(modeKey) {
  // Right now, only "coreRules" is fully wired (it shows the existing inputs).
  // Other modes are placeholders; we keep the sheet structure ready for future expansion.
  const sheet = $('modeInspector');
  if (!sheet) return;

  const title = $('modeSheetTitle');
  const sub = $('modeSheetSub');

  if (modeKey === 'coreRules') {
    if (title) title.textContent = 'Core Rules';
    if (sub) sub.textContent = 'Adjust foundational game settings.';
    openSheet();
    return;
  }

  if (title) title.textContent = 'Coming Soon';
  if (sub) sub.textContent = 'This mode is a placeholder in the UI right now.';
  openSheet();

  if (typeof window.showToast === 'function') {
    window.showToast('This mode is a placeholder (Coming Soon).', 'info');
  }
}

function openSheet() {
  const sheet = $('modeInspector');
  if (!sheet) return;

  sheet.hidden = false;
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('settings-sheet-open');

  // Prevent iOS “scroll bleed”
  document.documentElement.style.overscrollBehaviorY = 'contain';
}

function closeSheet() {
  const sheet = $('modeInspector');
  if (!sheet || sheet.hidden) return;

  sheet.hidden = true;
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('settings-sheet-open');
  document.documentElement.style.overscrollBehaviorY = '';
}

function resetCoreRules() {
  // Keep these aligned with your server defaults / app.js expectations.
  const defaults = {
    difficulty: 'normal',
    scenarioTheme: 'all',
    contentPackId: 'default',
    plotTwists: true,
    customScenario: ''
  };

  // Update UI fields (if present)
  if ($('difficulty')) $('difficulty').value = defaults.difficulty;
  if ($('scenarioTheme')) $('scenarioTheme').value = defaults.scenarioTheme;
  if ($('contentPack')) $('contentPack').value = defaults.contentPackId;
  if ($('plotTwists')) $('plotTwists').checked = defaults.plotTwists;
  if ($('customScenario')) $('customScenario').value = defaults.customScenario;

  // Push settings to host/server if updateSetting exists
  if (typeof window.updateSetting === 'function') {
    window.updateSetting('difficulty', defaults.difficulty);
    window.updateSetting('scenarioTheme', defaults.scenarioTheme);
    window.updateSetting('contentPackId', defaults.contentPackId);
    window.updateSetting('plotTwists', defaults.plotTwists);
    window.updateSetting('customScenario', defaults.customScenario);
  }

  if (typeof window.updateContentPackDescription === 'function') {
    window.updateContentPackDescription(defaults.contentPackId);
  }

  refreshNowPlaying();
}

function refreshNowPlaying() {
  const difficulty = $('difficulty')?.value || 'normal';
  const theme = $('scenarioTheme')?.value || 'all';
  const packSelect = $('contentPack');
  const packLabel = packSelect?.selectedOptions?.[0]?.textContent?.trim()
    || packSelect?.value
    || 'Default';
  const plotTwistsOn = $('plotTwists') ? Boolean($('plotTwists').checked) : true;

  const difficultyLabel = ({
    easy: 'Easy',
    normal: 'Normal',
    hard: 'Hard'
  })[difficulty] || difficulty;

  const themeLabel = ({
    all: 'All',
    food: 'Food',
    action: 'Action',
    adventure: 'Adventure',
    sports: 'Sports',
    performance: 'Performance',
    absurd: 'Absurd'
  })[theme] || theme;

  // "Mode" is a future concept; keep "Classic" for now.
  const modeLabelEl = $('nowModeLabel');
  if (modeLabelEl) modeLabelEl.textContent = 'Classic';

  const diffEl = $('nowDifficultyLabel');
  if (diffEl) diffEl.textContent = difficultyLabel;

  const packEl = $('nowPackLabel');
  if (packEl) packEl.textContent = packLabel.replace(/\s*\(.*?\)\s*$/, '') || packLabel;

  // Chips
  const chipTwists = $('chipPlotTwists');
  if (chipTwists) chipTwists.classList.toggle('chip-muted', !plotTwistsOn);

  // Status line “premium” text (optional)
  const status = $('settingsStatusLine');
  if (status) status.textContent = `Difficulty: ${difficultyLabel} • Theme: ${themeLabel} • Pack: ${packEl ? packEl.textContent : packLabel}`;
}
