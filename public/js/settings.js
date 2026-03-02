// settings.js — Settings OS wiring (client-side only)
// This file is intentionally UI-focused and integrates with existing app.js bindings.
// It does NOT own authoritative room state; it simply reflects + helps navigate settings.

// Public API (used by app.js when room data arrives)
window.SettingsOS = {
  refreshNowPlaying
};

function initializeSettingsOsBindings() {
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSettingsOsBindings, { once: true });
} else {
  initializeSettingsOsBindings();
}

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
    // If locked, show preview modal
    if (card.classList.contains('is-locked')) {
      openModePreview(card.dataset.mode || 'coreRules');
      return;
    }
    openMode(card.dataset.mode || 'coreRules');
  });

  track.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.mode-card');
    if (!card) return;
    e.preventDefault();
    if (card.classList.contains('is-locked')) {
      openModePreview(card.dataset.mode || 'coreRules');
      return;
    }
    openMode(card.dataset.mode || 'coreRules');
  });
  // Also bind for locked cards in the read-only section (not in #modeCardTrack)
  const readonlyLockedCards = Array.from(document.querySelectorAll('.settings-os-home-readonly .mode-card.is-locked'));
  readonlyLockedCards.forEach((card) => {
    card.addEventListener('click', (e) => {
      openModePreview(card.dataset.mode || 'coreRules');
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModePreview(card.dataset.mode || 'coreRules');
      }
    });
  });
}

// Show a read-only/preview modal for locked cards
function openModePreview(modeKey) {
  const sheet = $('modeInspector');
  if (!sheet) return;
  const title = $('modeSheetTitle');
  const sub = $('modeSheetSub');
  const body = sheet.querySelector('.mode-sheet-body');
  if (!body) return;

  // Remove all children from body
  while (body.firstChild) body.removeChild(body.firstChild);

if (modeKey === 'coreRules') {
  if (title) title.textContent = ' Core Rules (Preview)';
  if (sub) sub.textContent = '👀 View-only preview. Only the host can edit.';

  // Render a disabled version of the core rules UI
  const preview = document.createElement('div');
  preview.className = 'core-rules-preview';
  preview.innerHTML = `
    <details class="mode-acc" open>
      <summary class="mode-acc-summary">
        <span class="mode-acc-title"> Basics</span>
        <span class="mode-acc-hint"> Most common settings</span>
      </summary>
      <div class="mode-acc-content">
        <div class="settings-grid">
          <div class="field">
            <label for="preview-difficulty"><strong>🎚️ Difficulty</strong></label>
            <select id="preview-difficulty" disabled aria-label="Game difficulty">
              <option value="easy">🟢 Easy (60s)</option>
              <option value="normal">🟡 Normal (45s)</option>
              <option value="hard">🔴 Hard (35s)</option>
            </select>
          </div>

          <div class="field">
            <label for="preview-scenarioTheme"><strong>🎭 Theme</strong></label>
            <select id="preview-scenarioTheme" disabled aria-label="Scenario theme">
              <option value="all">🎲 All (Random)</option>
              <option value="food">🍳 Food & Cooking</option>
              <option value="action">⚔️ Action & Combat</option>
              <option value="adventure">🗺️ Adventure</option>
              <option value="sports">🏆 Sports & Games</option>
              <option value="performance">🎤 Performance</option>
              <option value="absurd">🌀 Weird & Absurd</option>
            </select>
          </div>

          <div class="field field-wide">
            <label for="preview-contentPack"><strong>📦 Content Pack</strong></label>
            <select id="preview-contentPack" disabled aria-label="Content pack selection">
              <option value="default"> Default [CORE]</option>
            </select>
            <p class="field-help">👁️ Preview only</p>
          </div>

          <div class="field field-wide">
            <label for="preview-customScenario"><strong>✏️ Custom Scenario</strong></label>
            <input
              type="text"
              id="preview-customScenario"
              placeholder="Enter custom scenario..."
              maxlength="60"
              disabled
              aria-label="Custom scenario"
            />
            <p class="field-help">📝 Optional — if set, this becomes the scenario for the round.</p>
          </div>
        </div>
      </div>
    </details>

    <details class="mode-acc">
      <summary class="mode-acc-summary">
        <span class="mode-acc-title">🛠️ Advanced</span>
        <span class="mode-acc-hint"> More control, less clutter</span>
      </summary>
      <div class="mode-acc-content">
        <div class="advanced-placeholder">
          <p>⚙️ This section is intentionally structured to scale as you add advanced modes (Teams, No Voting, Category Priority, Scenario/Twist seeding, etc.).</p>
          <ul class="soon-list" role="list">
            <li><strong>👥 Teams Mode</strong> (2v2 / 3v3)</li>
            <li><strong>🤖 No Voting</strong> (AI-only)</li>
            <li><strong>⭐ Category Feature</strong> (priority evaluation)</li>
            <li><strong>🧠 Scenario/Twist Entries</strong> (player-seeded)</li>
          </ul>
        </div>
      </div>
    </details>

    <details class="mode-acc">
      <summary class="mode-acc-summary">
        <span class="mode-acc-title">🎉 Party</span>
        <span class="mode-acc-hint"> Group decisions & voting</span>
      </summary>
      <div class="mode-acc-content">
        <div class="advanced-placeholder">
          <p>🧑‍🤝‍🧑 Future: enable “Party Selection” so the lobby votes on modes/settings, with clean mobile UI.</p>
        </div>
      </div>
    </details>

    <details class="mode-acc">
      <summary class="mode-acc-summary">
        <span class="mode-acc-title">🧪 Experimental</span>
        <span class="mode-acc-hint"> Dev/Test &  Second Screen</span>
      </summary>
      <div class="mode-acc-content">
        <div class="advanced-placeholder">
          <p>🧪 Future: Dev/Test mode with dummy data, and a 📲 Jackbox-style Second Screen pairing flow.</p>
        </div>
      </div>
    </details>

    <div class="preview-locked-banner">
      <span class="chip chip-muted">🔒 Locked</span>
      <span class="chip">👀 Preview</span>
      <span class="preview-locked-msg">⛔ Selections are disabled. Only the host can edit core rules.</span>
    </div>
  `;
  body.appendChild(preview);

  // Set values to match current settings
  const difficulty = $('difficulty')?.value || 'normal';
  const theme = $('scenarioTheme')?.value || 'all';
  const pack = $('contentPack')?.value || 'default';
  const customScenario = $('customScenario')?.value || '';
  body.querySelector('#preview-difficulty').value = difficulty;
  body.querySelector('#preview-scenarioTheme').value = theme;
  body.querySelector('#preview-contentPack').value = pack;
  body.querySelector('#preview-customScenario').value = customScenario;
  openSheet();
  return;
}

// Coming Soon preview
if (title) title.textContent = '🚧 Coming Soon (Preview)';
if (sub) sub.textContent = '🧱 This mode is a placeholder in the UI right now.';

const soon = document.createElement('div');
soon.className = 'coming-soon-preview';
soon.innerHTML = `
  <div class="coming-soon-banner">

    <ul class="soon-features-list">
      <li><strong> Teams Mode</strong> <span class="chip chip-muted">⚔️ 2v2 / 3v3</span></li>
      <li><strong> No Voting</strong> <span class="chip chip-muted">🧠 AI-only</span></li>
      <li><strong> Category Feature</strong> <span class="chip chip-muted">🎯 Priority Evaluation</span></li>
      <li><strong> Scenario/Twist Entries</strong> <span class="chip chip-muted">✍️ Player-seeded</span></li>
      <li><strong> Party Selection</strong> <span class="chip chip-muted">🗳️ Lobby Voting</span></li>
      <li><strong> Second Screen</strong> <span class="chip chip-muted">📺 TV/Pairing</span></li>
      <li><strong> Dev/Test Mode</strong> <span class="chip chip-muted">🔬 Experimental</span></li>
      <li><strong> Solo Challenge</strong> <span class="chip chip-muted">📆 Daily Mode</span></li>
      <li><strong> Competitive Integrity</strong> <span class="chip chip-muted">⚖️ Fair Play</span></li>
    </ul>

    <div class="preview-locked-banner" style="margin-top:12px;">
      <span class="chip">👀 Preview</span>
      <span class="chip chip-muted">🔒 Locked</span>
    </div>

    <p class="coming-soon-footer">✨ Stay tuned for future updates!</p>
  </div>
`;
body.appendChild(soon);
openSheet();
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

  // Push settings to host/server in one socket update when possible.
  if (typeof window.updateSettingsBatch === 'function') {
    window.updateSettingsBatch({ ...defaults });
  } else if (typeof window.updateSetting === 'function') {
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
    easy: 'Easy (60s)',
    normal: 'Normal (45s)',
    hard: 'Hard (35s)'
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

  // In the summary bar, "Mode" reflects the selected scenario theme.
  const modeLabelEl = $('nowModeLabel');
  if (modeLabelEl) modeLabelEl.textContent = themeLabel;

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
