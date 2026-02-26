function hashVoiceCueSeed(input = '') {
  const text = String(input || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash >>> 0);
}

export function pickVoiceCueVariant(list = [], seed = '') {
  const options = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!options.length) return '';
  return String(options[hashVoiceCueSeed(seed) % options.length] || '');
}

function detectTwistConnectorPhrase(twist = '') {
  const raw = String(twist || '').trim();
  if (!raw) return { connector: '', remainder: '' };
  const parts = raw.split(/\s+/).filter(Boolean);
  const connector = String(parts[0] || '').toUpperCase();
  const known = new Set(['WITH', 'UNDER', 'DURING', 'WHILE', 'USING', 'WITHOUT', 'AS', 'ON', 'IN', 'BY', 'THROUGH', 'AMID', 'AGAINST', 'AFTER', 'BEFORE', 'INSIDE', 'OUTSIDE', 'NO', 'ONLY', 'BUT']);
  if (!known.has(connector)) return { connector: '', remainder: raw };
  return { connector, remainder: parts.slice(1).join(' ').trim() };
}

export function buildFallbackRoundStartLead(roundNumber, scenario = '', twist = '') {
  return pickVoiceCueVariant([
    `Round ${roundNumber}!`,
    `Round ${roundNumber}... let's go!`,
    `Round ${roundNumber}! Here we go!`,
    `Round ${roundNumber} is live!`
  ], `roundstart:${roundNumber}:${scenario}:${twist}`);
}

export function buildFallbackScenarioLead(roundNumber, scenario = '') {
  const variantsByRound = {
    1: ['The scenario?', 'Your scenario?', 'Scenario check!'],
    2: ["This round's scenario?", 'Your challenge?', 'Scenario drop!'],
    3: ['Scenario time!', "Here's the scenario!", 'The setup?']
  };
  const pool = variantsByRound[roundNumber] || ['The scenario?', 'Scenario check!', "Here's the scenario!"];
  return pickVoiceCueVariant(pool, `scenario:${roundNumber}:${scenario}`);
}

export function buildFallbackTwistLine(twist = '', roundNumber = 0) {
  const safeTwist = String(twist || '').trim().replace(/[.]+$/g, '');
  const spokenTwist = String(safeTwist || '').split('|')[0].trim();
  if (!spokenTwist) return '';
  const { connector, remainder } = detectTwistConnectorPhrase(spokenTwist);
  if (connector) {
    if (remainder) {
      if (connector === 'BUT') {
        const flourish = pickVoiceCueVariant(['...', '!', '!!'], `twist-flourish:${roundNumber}:${spokenTwist}`);
        return `${connector}${flourish} ${remainder}!`;
      }
      return `${connector} ${remainder}!`;
    }
    return `${connector}!`;
  }
  const prefix = pickVoiceCueVariant(['BUT...', 'AND...', 'NOW...'], `twist-prefix:${roundNumber}:${spokenTwist}`);
  return `${prefix} ${spokenTwist}!`;
}

export function buildFallbackRound4PreludeLine(scenario = '', twist = '') {
  const safeScenario = String(scenario || '').trim().replace(/[.]+$/g, '');
  const safeTwist = String(twist || '').trim().replace(/[.]+$/g, '');
  if (!safeScenario && !safeTwist) {
    return pickVoiceCueVariant([
      'Round 4! Full team final check!',
      'Round 4! Final team evaluation incoming!',
      'Final check! The full team is up next!'
    ], 'round4-prelude:fallback');
  }
  const twistLine = buildFallbackTwistLine(safeTwist, 4);
  const mission = safeScenario || 'face the final evaluation';
  return pickVoiceCueVariant([
    `Round 4! Your full team has to ${mission}${twistLine ? `. ${twistLine}` : '!'}`,
    `So... your full team now has to ${mission}${twistLine ? `. ${twistLine}` : '!'}`,
    `Final brief! Full squad mission: ${mission}${twistLine ? `. ${twistLine}` : '!'}`,
    `Here we go... full team task: ${mission}${twistLine ? `. ${twistLine}` : '!'}`
  ], `round4-prelude:${safeScenario}:${safeTwist}`);
}

export function buildFallbackRound4BriefLine(scenario = '', twist = '') {
  const safeScenario = String(scenario || '').trim().replace(/[.]+$/g, '');
  const safeTwist = String(twist || '').trim().replace(/[.]+$/g, '');
  const parts = [];
  if (safeScenario) {
    const lead = pickVoiceCueVariant(['Scenario locked:', 'Mission:', 'Target objective:'], `round4-scenario-lead:${safeScenario}`);
    parts.push(`${lead} ${safeScenario}.`);
  }
  if (safeTwist) {
    parts.push(buildFallbackTwistLine(safeTwist, 4));
  }
  return parts.length ? parts.join(' ').replace(/\s+/g, ' ').trim() : 'Final brief incoming!';
}
