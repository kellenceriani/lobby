function cleanText(value, maxLen = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(8, maxLen - 3)).trim()}...`;
}

function makeCue({
  id,
  type = 'narration',
  text = '',
  archetype,
  intensity,
  priority,
  subtitleText,
  dedupeKey
} = {}) {
  const spoken = cleanText(text);
  if (!spoken) return null;
  const cue = {
    id: String(id || `${type}:${spoken.toLowerCase()}`),
    type: String(type || 'narration'),
    text: spoken,
    dedupeKey: String(dedupeKey || `${type}:${spoken.toLowerCase()}`)
  };
  if (subtitleText) cue.subtitleText = cleanText(subtitleText, 160);
  if (archetype) cue.archetype = String(archetype);
  if (Number.isFinite(Number(intensity))) cue.intensity = Math.max(0, Math.min(1, Number(intensity)));
  if (Number.isFinite(Number(priority))) cue.priority = Number(priority);
  return cue;
}

function compactList(list) {
  return (Array.isArray(list) ? list : []).filter(Boolean);
}

function cleanScenarioOrTwist(value, maxLen = 170) {
  const cleaned = cleanText(value, maxLen).replace(/[.]+$/g, '').trim();
  const normalized = String(cleaned || '').toUpperCase();
  if (!normalized) return '';
  if (normalized === 'NO PLOT TWIST' || normalized === 'NO FINAL SCENARIO' || normalized === 'NO FINAL TWIST' || normalized === 'NONE' || normalized === 'N/A') {
    return '';
  }
  return cleaned;
}

function hashSeed(input = '') {
  const text = String(input || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash >>> 0);
}

function pickVariant(options = [], seed = '') {
  const list = Array.isArray(options) ? options.filter(Boolean) : [];
  if (!list.length) return '';
  const idx = hashSeed(seed) % list.length;
  return String(list[idx] || '');
}

function detectTwistConnector(twist = '') {
  const raw = String(twist || '').trim();
  if (!raw) return { connector: '', remainder: '' };
  const parts = raw.split(/\s+/).filter(Boolean);
  const first = String(parts[0] || '').toUpperCase();
  const connectors = new Set(['WITH', 'UNDER', 'DURING', 'WHILE', 'USING', 'WITHOUT', 'AS', 'ON', 'IN', 'BY', 'THROUGH', 'AMID', 'AGAINST', 'AFTER', 'BEFORE', 'INSIDE', 'OUTSIDE', 'NO', 'ONLY', 'BUT']);
  if (!connectors.has(first)) return { connector: '', remainder: raw };
  return {
    connector: first,
    remainder: parts.slice(1).join(' ').trim()
  };
}

function buildRoundStartLead(round = 1, seed = '') {
  return pickVariant([
    `Round ${round}!`,
    `Round ${round}... let's go!`,
    `Round ${round}! Here we go!`,
    `Round ${round} is live!`
  ], `round-start:${round}:${seed}`);
}

function buildScenarioLead(round = 1, scenario = '') {
  const variantsByRound = {
    1: ['The scenario?', 'Your scenario?', 'Scenario check!'],
    2: ['This round\'s scenario?', 'Your challenge?', 'Scenario drop!'],
    3: ['Scenario time!', 'Here\'s the scenario!', 'The setup?']
  };
  const pool = variantsByRound[round] || ['The scenario?', 'Scenario check!', 'Here\'s the scenario!'];
  return pickVariant(pool, `scenario-lead:${round}:${scenario}`);
}

function buildTwistLine(twist = '', round = 0) {
  const safeTwist = cleanScenarioOrTwist(twist, 170);
  const spokenTwist = String(safeTwist || '').split('|')[0].trim();
  if (!spokenTwist) return '';
  const { connector, remainder } = detectTwistConnector(spokenTwist);
  if (connector) {
    if (remainder) {
      if (connector === 'BUT') {
        const flourish = pickVariant(['...', '!', '!!'], `twist-flourish:${round}:${spokenTwist}`);
        return `${connector}${flourish} ${remainder}!`;
      }
      return `${connector} ${remainder}!`;
    }
    return `${connector}!`;
  }
  const prefix = pickVariant(['BUT...', 'AND...', 'NOW...'], `twist-prefix:${round}:${spokenTwist}`);
  return `${prefix} ${spokenTwist}!`;
}

function buildRound4PreludeLine(scenario = '', twist = '') {
  const safeScenario = cleanScenarioOrTwist(scenario, 120);
  const safeTwist = cleanScenarioOrTwist(twist, 120);
  if (!safeScenario && !safeTwist) {
    return pickVariant([
      'Round 4! Full team final check!',
      'Round 4! Final team evaluation incoming!',
      'Final check! The full team is up next!'
    ], 'round4-prelude:fallback');
  }
  const twistConnectorLine = buildTwistLine(safeTwist, 4);
  const mission = safeScenario ? `${safeScenario}` : 'face the final evaluation';
  return pickVariant([
    `Round 4! Your full team has to ${mission}${twistConnectorLine ? `. ${twistConnectorLine}` : '!'}`,
    `So... your full team now has to ${mission}${twistConnectorLine ? `. ${twistConnectorLine}` : '!'}`,
    `Final brief! Full squad mission: ${mission}${twistConnectorLine ? `. ${twistConnectorLine}` : '!'}`,
    `Here we go... full team task: ${mission}${twistConnectorLine ? `. ${twistConnectorLine}` : '!'}`
  ], `round4-prelude:${safeScenario}:${safeTwist}`);
}

function buildRound4BriefLine(scenario = '', twist = '') {
  const safeScenario = cleanScenarioOrTwist(scenario, 150);
  const safeTwist = cleanScenarioOrTwist(twist, 150);
  const scenarioLead = safeScenario
    ? pickVariant(['Scenario locked:', 'Mission:', 'Target objective:'], `round4-scenario:${safeScenario}`)
    : '';
  const twistLead = safeTwist
    ? (buildTwistLine(safeTwist, 4) || `BUT... ${safeTwist}!`)
    : '';
  const parts = [];
  if (safeScenario) parts.push(`${scenarioLead} ${safeScenario}.`);
  if (twistLead) parts.push(twistLead);
  if (!parts.length) return 'Final brief incoming!';
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function buildRoundStartVoiceCues({ roundNumber, isFinalRound, scenario, twist } = {}) {
  const round = Number(roundNumber) || 0;
  if (isFinalRound === true || round === 4) {
    const safeScenario = cleanScenarioOrTwist(scenario, 120);
    const safeTwist = cleanScenarioOrTwist(twist, 120);
    const finaleLead = buildRound4PreludeLine(safeScenario, safeTwist);
    return compactList([
      makeCue({
        id: `round4-start-pre`,
        type: 'round4',
        text: finaleLead,
        subtitleText: finaleLead,
        priority: 78,
        intensity: 0.62,
        dedupeKey: `phase:round4:start`
      })
    ]);
  }
  return compactList([
    makeCue({
      id: `round-${round}-start`,
      type: 'narration',
      text: buildRoundStartLead(round, `${scenario || ''}|${twist || ''}`),
      subtitleText: `Round ${round}!`,
      priority: 62,
      intensity: 0.58,
      dedupeKey: `phase:round:start:${round}`
    })
  ]);
}

function buildScenarioVoiceCues({ roundNumber, scenario } = {}) {
  const round = Number(roundNumber) || 0;
  const safeScenario = cleanScenarioOrTwist(scenario, 170);
  if (!safeScenario) return [];
  return compactList([
    makeCue({
      id: `round-${round}-scenario`,
      type: 'narration',
      text: `${buildScenarioLead(round, safeScenario)} ${safeScenario}${pickVariant(['.', '!', '...'], `scenario-punct:${round}:${safeScenario}`)}`,
      subtitleText: `Scenario: ${safeScenario}`,
      priority: 70,
      intensity: 0.62,
      dedupeKey: `phase:scenario:${round}:${safeScenario.toLowerCase()}`
    })
  ]);
}

function buildCategoryRevealVoiceCues({ roundNumber, category } = {}) {
  const round = Number(roundNumber) || 0;
  const safeCategory = cleanScenarioOrTwist(category, 120);
  if (!safeCategory) return [];
  return compactList([
    makeCue({
      id: `round-${round}-category`,
      type: 'narration',
      text: `Category locked: ${safeCategory}.`,
      subtitleText: `Category: ${safeCategory}`,
      priority: 68,
      intensity: 0.6,
      dedupeKey: `phase:category:${round}:${safeCategory.toLowerCase()}`
    })
  ]);
}

function buildTwistVoiceCues({ roundNumber, twist } = {}) {
  const round = Number(roundNumber) || 0;
  const safeTwist = cleanScenarioOrTwist(twist, 170);
  if (!safeTwist) return [];
  return compactList([
    makeCue({
      id: `round-${round}-twist`,
      type: 'twist',
      text: buildTwistLine(safeTwist, round),
      subtitleText: `Twist: ${safeTwist}`,
      priority: 76,
      intensity: 0.76,
      dedupeKey: `phase:twist:${round}:${safeTwist.toLowerCase()}`
    })
  ]);
}

function buildRound4StartVoiceCues({ scenario, twist } = {}) {
  const safeScenario = cleanScenarioOrTwist(scenario, 150);
  const safeTwist = cleanScenarioOrTwist(twist, 150);
  const cues = [];
  if (safeScenario) {
    cues.push(makeCue({
      id: 'round4-cinematic-scenario',
      type: 'round4',
      text: `Scenario: ${safeScenario}.`,
      subtitleText: `Scenario: ${safeScenario}`,
      priority: 84,
      intensity: 0.62,
      dedupeKey: `round4:start:scenario:${safeScenario.toLowerCase()}`
    }));
  }
  if (safeTwist) {
    cues.push(makeCue({
      id: 'round4-cinematic-twist',
      type: 'round4',
      text: `Twist: ${String(safeTwist).split('|')[0].trim()}.`,
      subtitleText: `Twist: ${safeTwist}`,
      priority: 84,
      intensity: 0.62,
      dedupeKey: `round4:start:twist:${safeTwist.toLowerCase()}`
    }));
  }
  return compactList(cues);
}

function buildRound4EvaluatedVoiceCues({ evaluationId, isTie } = {}) {
  return compactList([
    makeCue({
      id: `round4-evaluated-${String(evaluationId || 'n/a')}`,
      type: 'round4',
      text: 'Round four results are in.',
      subtitleText: 'Round 4 evaluation complete',
      priority: 80,
      intensity: 0.62,
      dedupeKey: `round4:evaluated:${String(evaluationId || '')}:${isTie ? 'tie' : 'normal'}`
    })
  ]);
}

function buildFinalRoundResultsVoiceCues({ isTie } = {}) {
  return compactList([
    makeCue({
      id: `final-round-results-${isTie ? 'tie' : 'normal'}`,
      type: 'round4',
      text: isTie ? 'Final round tally locked. Tie result.' : 'Final round tally locked.',
      subtitleText: isTie ? 'Final round tie locked' : 'Final round tally locked',
      priority: 60,
      intensity: 0.55,
      dedupeKey: `round4:finalresults:${isTie ? 'tie' : 'normal'}`
    })
  ]);
}

function buildGameEndedVoiceCues({ winner } = {}) {
  const winnerName = cleanText(winner && winner.name ? winner.name : '', 80);
  return compactList([
    makeCue({
      id: `game-ended-${winnerName || 'unknown'}`,
      type: 'round4',
      text: winnerName ? `${winnerName} wins the match.` : 'Match complete. Final results are live.',
      subtitleText: winnerName ? `${winnerName} wins the match` : 'Match complete',
      priority: 72,
      intensity: 0.66,
      dedupeKey: `game:end:${winnerName.toLowerCase()}`
    })
  ]);
}

module.exports = {
  makeCue,
  buildRoundStartVoiceCues,
  buildScenarioVoiceCues,
  buildCategoryRevealVoiceCues,
  buildTwistVoiceCues,
  buildRound4StartVoiceCues,
  buildRound4EvaluatedVoiceCues,
  buildFinalRoundResultsVoiceCues,
  buildGameEndedVoiceCues
};
