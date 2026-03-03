import { ARCHETYPES } from './archetypes.js';
import {
  pickVoiceCueVariant,
  buildFallbackRoundStartLead,
  buildFallbackScenarioLead,
  buildFallbackTwistLine,
  buildFallbackRound4PreludeLine
} from './phaseVoiceCueFallbacks.js';

export function buildPhaseVoiceCuesWithState(kind = '', data = {}, gameState = {}) {
  const safe = data && typeof data === 'object' ? data : {};
  const gs = gameState && typeof gameState === 'object' ? gameState : {};
  const roundNumber = Number(safe.roundNumber) || Number(gs.currentRound) || 0;
  const scenario = String(safe.scenario || gs.currentScenario || '').trim();
  const twist = String(safe.twist || gs.currentTwist || '').trim();
  const kindKey = String(kind || '').toLowerCase();

  if (kindKey === 'roundstart') {
    if (safe.isFinalRound === true || roundNumber === 4) {
      const finaleLead = buildFallbackRound4PreludeLine(scenario, twist);
      return [{
        type: 'round4',
        text: finaleLead,
        subtitleText: finaleLead,
        archetype: ARCHETYPES.NARRATOR,
        intensity: 0.62,
        priority: 78,
        dedupeKey: `phase:round4:start:${roundNumber}`
      }];
    }
    return [{
      type: 'narration',
      text: buildFallbackRoundStartLead(roundNumber, scenario, twist),
      subtitleText: `Round ${roundNumber}!`,
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.58,
      priority: 62,
      dedupeKey: `phase:round:start:${roundNumber}`
    }];
  }

  if (kindKey === 'scenario') {
    if (!scenario) return [];
    return [{
      type: 'narration',
      text: `${buildFallbackScenarioLead(roundNumber, scenario)} ${scenario}${pickVoiceCueVariant(['.', '!', '...'], `scenario-punct:${roundNumber}:${scenario}`)}`,
      subtitleText: `Scenario: ${scenario}`,
      archetype: ARCHETYPES.NARRATOR,
      intensity: 0.6,
      priority: 70,
      dedupeKey: `phase:scenario:${roundNumber}:${scenario.toLowerCase()}`
    }];
  }

  if (kindKey === 'category') {
    const lockedCategory = safe && safe.lockedCategory && typeof safe.lockedCategory === 'object'
      ? safe.lockedCategory
      : null;
    const category = String(
      safe.categoryLabel
      || (lockedCategory && (lockedCategory.label || lockedCategory.name || lockedCategory.slug))
      || ''
    ).trim();
    if (!category) return [];
    return [{
      type: 'narration',
      text: `Category locked: ${category}.`,
      subtitleText: `Category: ${category}`,
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.62,
      priority: 68,
      dedupeKey: `phase:category:${roundNumber}:${category.toLowerCase()}`
    }];
  }

  if (kindKey === 'twist') {
    if (!twist) return [];
    return [{
      type: 'twist',
      text: buildFallbackTwistLine(twist, roundNumber),
      subtitleText: `Twist: ${twist}`,
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.74,
      priority: 76,
      dedupeKey: `phase:twist:${roundNumber}:${twist.toLowerCase()}`
    }];
  }

  if (kindKey === 'round4start') {
    const cues = [];
    if (scenario) {
      cues.push({
        type: 'round4',
        text: `Scenario: ${scenario}.`,
        subtitleText: `Scenario: ${scenario}`,
        archetype: ARCHETYPES.NARRATOR,
        intensity: 0.62,
        priority: 84,
        dedupeKey: `round4:start:scenario:${(scenario || '').toLowerCase()}`
      });
    }
    if (twist) {
      const spokenTwist = String(twist || '').split('|')[0].trim();
      if (spokenTwist) {
        cues.push({
          type: 'round4',
          text: `Twist: ${spokenTwist}.`,
          subtitleText: `Twist: ${twist}`,
          archetype: ARCHETYPES.NARRATOR,
          intensity: 0.62,
          priority: 84,
          dedupeKey: `round4:start:twist:${String(twist || '').toLowerCase()}`
        });
      }
    }
    return cues;
  }

  if (kindKey === 'round4evaluated') {
    return [{
      type: 'round4',
      text: 'Round four results are in.',
      subtitleText: 'Round 4 complete - reveal starting',
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.62,
      priority: 80,
      dedupeKey: `round4:evaluated:${safe.isTie === true ? 'tie' : 'clear'}:${String(safe.evaluationId || '')}`
    }];
  }

  if (kindKey === 'finalresults') {
    return [{
      type: 'round4',
      text: safe && safe.isTie ? 'Final round tally locked. Tie result.' : 'Final round tally locked.',
      subtitleText: safe && safe.isTie ? 'Final round tie locked' : 'Final round tally locked',
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.55,
      priority: 60,
      dedupeKey: `round4:finalresults:${safe && safe.isTie ? 'tie' : 'normal'}`
    }];
  }

  if (kindKey === 'gameended') {
    const winnerName = String(safe && safe.winner && safe.winner.name || '').trim();
    return [{
      type: 'round4',
      text: winnerName ? `${winnerName} wins the match.` : 'Match complete. Final results are live.',
      subtitleText: winnerName ? `${winnerName} wins the match` : 'Match complete',
      archetype: ARCHETYPES.ANNOUNCER,
      intensity: 0.66,
      priority: 72,
      dedupeKey: `game:end:${winnerName.toLowerCase()}`
    }];
  }

  return [];
}
