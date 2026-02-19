const {
  CHARACTER_TYPES,
  POWER_LEVELS,
  CAPABILITY_TRAIT_KEYWORDS,
  INTENT_KEYWORD_GROUPS,
  INTENT_TO_TRAITS,
  TWIST_EFFECT_RULES,
  TYPE_INTENT_AFFINITY,
  DOMAIN_RULES,
  TITLE_KEYWORDS,
  ROLE_KEYWORDS
} = require('../core/constants');
const {
  tokenize,
  countOverlap,
  normalizeKeywordToken,
  getMeaningfulTokens,
  expandKeywords,
  getCharacterAbilityHints
} = require('../core/textUtils');
function buildKeywordFitDetails(sourceText, targetText) {
  const sourceTokens = getMeaningfulTokens(sourceText);
  const targetTokens = getMeaningfulTokens(targetText);
  const expandedSource = expandKeywords(sourceTokens);
  const expandedTargetSet = new Set(expandKeywords(targetTokens));

  const directMatches = sourceTokens.filter(token => targetTokens.includes(token));
  const expandedMatches = expandedSource.filter(token => expandedTargetSet.has(token));
  const uniqueMatches = Array.from(new Set([...directMatches, ...expandedMatches]))
    .filter(token => token.length >= 3)
    .slice(0, 14);

  return {
    directCount: directMatches.length,
    expandedCount: expandedMatches.length,
    totalCount: uniqueMatches.length,
    matchedKeywords: uniqueMatches
  };
}

function inferIntentGroups(text) {
  const normalizedText = String(text || '').toLowerCase();
  const tokens = getMeaningfulTokens(normalizedText, 180);
  const tokenSet = new Set(tokens);
  const intents = [];

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORD_GROUPS)) {
    const hasIntent = keywords.some(keyword => {
      const key = normalizeKeywordToken(keyword);
      return key && tokenSet.has(key);
    });
    if (hasIntent) intents.push(intent);
  }

  return intents;
}

function buildInfoCorpus(info, character = '') {
  if (!info && !character) return '';

  const abilityHints = getCharacterAbilityHints(character, info);

  return [
    character || '',
    info && info.title ? info.title : '',
    info && info.description ? info.description : '',
    info && info.profession ? info.profession : '',
    info && info.wikidataDescription ? info.wikidataDescription : '',
    info && Array.isArray(info.aliases) ? info.aliases.join(' ') : '',
    info && Array.isArray(info.categories) ? info.categories.join(' ') : '',
    abilityHints.join(' ')
  ].join(' ');
}

function mapFitCountToPoints(count) {
  if (count >= 14) return 10;
  if (count >= 10) return 8;
  if (count >= 7) return 6;
  if (count >= 4) return 4;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
}

function mapFitCountToDraftBonus(count) {
  if (count >= 7) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}

function getDomainMatches(scenario, twist, description) {
  const scenarioTokens = tokenize(`${scenario} ${twist}`);
  const descriptionTokens = tokenize(description);
  const scenarioText = scenarioTokens.join(' ');
  const descriptionText = descriptionTokens.join(' ');
  return DOMAIN_RULES.filter(rule =>
    rule.keywords.some(kw => scenarioText.includes(kw)) &&
    rule.keywords.some(kw => descriptionText.includes(kw))
  ).map(rule => rule.label);
}

function detectPowerClass(character, info) {
  const text = `${character || ''} ${info && info.title ? info.title : ''} ${info && info.description ? info.description : ''}`.toLowerCase();
  if (POWER_LEVELS.cosmic.some(name => text.includes(name))) return 'cosmic';
  if (POWER_LEVELS.godlike.some(name => text.includes(name))) return 'godlike';
  if (POWER_LEVELS.superhuman.some(name => text.includes(name))) return 'superhuman';
  if (POWER_LEVELS.enhanced.some(name => text.includes(name))) return 'enhanced';
  return 'normal';
}

function detectCharacterType(character, info) {
  const lower = `${character} ${info ? info.description || '' : ''}`.toLowerCase();
  const profession = info && info.profession ? info.profession.toLowerCase() : '';

  if (profession) {
    if (profession.includes('warrior') || profession.includes('fighter') || profession.includes('soldier') || profession.includes('martial')) {
      return { type: 'combat', statBonus: CHARACTER_TYPES.combat.statBonus };
    }
    if (profession.includes('scientist') || profession.includes('professor') || profession.includes('inventor') || profession.includes('genius') || profession.includes('engineer')) {
      return { type: 'intelligence', statBonus: CHARACTER_TYPES.intelligence.statBonus };
    }
    if (profession.includes('speedster') || profession.includes('fast') || profession.includes('speed')) {
      return { type: 'speed', statBonus: CHARACTER_TYPES.speed.statBonus };
    }
    if (profession.includes('tank') || profession.includes('defender') || profession.includes('guardian') || profession.includes('protector')) {
      return { type: 'tank', statBonus: CHARACTER_TYPES.tank.statBonus };
    }
    if (profession.includes('healer') || profession.includes('medic') || profession.includes('support')) {
      return { type: 'support', statBonus: CHARACTER_TYPES.support.statBonus };
    }
  }

  for (const [type, data] of Object.entries(CHARACTER_TYPES)) {
    if (data.keywords.some(kw => lower.includes(kw))) return { type, statBonus: data.statBonus };
  }

  return { type: 'balanced', statBonus: {} };
}

function inferThreatDemandLevel(text) {
  const normalized = String(text || '').toLowerCase();
  if (/cosmic|universal|multiverse|apocalypse|extinction|planetary|galaxy|god/.test(normalized)) return 3;
  if (/invasion|catastrophe|war|world|destroy|annihilat|armageddon|disaster/.test(normalized)) return 2;
  if (/fight|battle|threat|danger|survive|hostile|crisis/.test(normalized)) return 1;
  return 0;
}

function getPowerFitPoints(powerClass, threatLevel) {
  if (threatLevel <= 0) return 0;
  if (threatLevel === 3) {
    if (powerClass === 'cosmic') return 3;
    if (powerClass === 'godlike') return 2;
    if (powerClass === 'superhuman') return 1;
    return 0;
  }
  if (threatLevel === 2) {
    if (powerClass === 'cosmic' || powerClass === 'godlike') return 3;
    if (powerClass === 'superhuman') return 2;
    if (powerClass === 'enhanced') return 1;
    return 0;
  }
  if (powerClass === 'cosmic' || powerClass === 'godlike' || powerClass === 'superhuman') return 2;
  if (powerClass === 'enhanced') return 1;
  return 0;
}

function getProfessionIntentMatches(professionText, targetIntents) {
  if (!professionText || !targetIntents.length) return [];
  const professionIntents = inferIntentGroups(professionText);
  return targetIntents.filter(intent => professionIntents.includes(intent));
}

function calculateCapabilityFit(character, info, scenario, twist) {
  if (!info) {
    return {
      scenario: { points: 0, reasons: [] },
      twist: { points: 0, reasons: [] },
      totalPoints: 0
    };
  }

  const sourceText = buildInfoCorpus(info, character).toLowerCase();
  const sourceIntents = inferIntentGroups(sourceText);
  const typeData = detectCharacterType(character, info);
  const type = typeData && typeData.type ? typeData.type : 'balanced';
  const typeAffinity = TYPE_INTENT_AFFINITY[type] || TYPE_INTENT_AFFINITY.balanced;
  const professionText = info.profession ? String(info.profession).toLowerCase() : '';
  const powerClass = detectPowerClass(character, info);

  const evaluateTarget = (targetText, domainMatches) => {
    const targetIntents = inferIntentGroups(targetText || '');
    const intentMatches = targetIntents.filter(intent => sourceIntents.includes(intent));
    const roleMatches = targetIntents.filter(intent => typeAffinity.includes(intent));
    const professionMatches = getProfessionIntentMatches(professionText, targetIntents);
    const threatLevel = inferThreatDemandLevel(targetText || '');
    const powerFit = getPowerFitPoints(powerClass, threatLevel);

    let points = 0;
    const reasons = [];

    if (intentMatches.length) {
      points += Math.min(3, intentMatches.length + 1);
      reasons.push(`intent alignment: ${intentMatches.join(', ')}`);
    }

    if (domainMatches.length) {
      points += Math.min(2, domainMatches.length);
      reasons.push(`domain alignment: ${domainMatches.join(', ')}`);
    }

    if (roleMatches.length) {
      points += Math.min(2, roleMatches.length);
      reasons.push(`type alignment: ${type}`);
    }

    if (professionMatches.length) {
      points += 1;
      reasons.push(`profession fit: ${professionMatches.join(', ')}`);
    }

    if (powerFit > 0) {
      points += Math.min(2, powerFit);
      reasons.push(`power-level fit (${powerClass})`);
    }

    return {
      points: Math.min(8, points),
      reasons,
      intentMatches,
      roleMatches,
      professionMatches,
      threatLevel,
      powerFit
    };
  };

  const scenarioDomains = getDomainMatches(scenario, '', sourceText);
  const twistDomains = getDomainMatches('', twist, sourceText);
  const scenarioResult = evaluateTarget(scenario || '', scenarioDomains);
  const twistResult = evaluateTarget(twist || '', twistDomains);

  return {
    scenario: scenarioResult,
    twist: twistResult,
    totalPoints: Math.min(14, scenarioResult.points + twistResult.points)
  };
}

function buildCapabilityProfile(character, info) {
  const corpus = buildInfoCorpus(info, character).toLowerCase();
  const tokenSet = new Set(getMeaningfulTokens(corpus, 320));
  const typeData = detectCharacterType(character, info);
  const powerClass = detectPowerClass(character, info);
  const traits = {};

  Object.entries(CAPABILITY_TRAIT_KEYWORDS).forEach(([trait, keywords]) => {
    const matches = keywords.reduce((count, keyword) => {
      const key = normalizeKeywordToken(keyword);
      return key && tokenSet.has(key) ? count + 1 : count;
    }, 0);
    traits[trait] = Math.min(3, matches);
  });

  if (typeData.type === 'combat') {
    traits.combat = Math.min(3, (traits.combat || 0) + 1);
    traits.power = Math.min(3, (traits.power || 0) + 1);
  }
  if (typeData.type === 'speed') {
    traits.speed = Math.min(3, (traits.speed || 0) + 1);
    traits.mobility = Math.min(3, (traits.mobility || 0) + 1);
  }
  if (typeData.type === 'intelligence') {
    traits.intelligence = Math.min(3, (traits.intelligence || 0) + 1);
    traits.engineering = Math.min(3, (traits.engineering || 0) + 1);
  }
  if (typeData.type === 'support') {
    traits.adaptability = Math.min(3, (traits.adaptability || 0) + 1);
    traits.control = Math.min(3, (traits.control || 0) + 1);
  }
  if (typeData.type === 'tank') {
    traits.durability = Math.min(3, (traits.durability || 0) + 1);
  }
  if (typeData.type === 'versatile' || typeData.type === 'balanced') {
    traits.adaptability = Math.min(3, (traits.adaptability || 0) + 1);
  }

  if (powerClass === 'cosmic' || powerClass === 'godlike') {
    traits.power = Math.min(3, (traits.power || 0) + 1);
    traits.durability = Math.min(3, (traits.durability || 0) + 1);
    traits.space = Math.min(3, (traits.space || 0) + 1);
  }

  if (info) {
    traits.adaptability = Math.max(1, traits.adaptability || 0);
    traits.control = Math.max(1, traits.control || 0);
    traits.intelligence = Math.max(1, traits.intelligence || 0);
  }

  const rankedTraits = Object.entries(traits)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([trait]) => trait);

  return {
    traits,
    rankedTraits,
    type: typeData.type,
    powerClass
  };
}

function inferScenarioRequirements(scenario) {
  const scenarioText = String(scenario || '').toLowerCase();
  const intents = inferIntentGroups(scenarioText);
  const required = new Set();
  const pathways = [];

  const addPathway = (label, traits) => {
    const normalizedTraits = Array.from(new Set((traits || []).filter(Boolean)));
    if (!normalizedTraits.length) return;
    const signature = `${label}:${normalizedTraits.join('|')}`;
    if (pathways.some(path => `${path.label}:${path.traits.join('|')}` === signature)) return;
    pathways.push({ label, traits: normalizedTraits });
  };

  intents.forEach(intent => {
    (INTENT_TO_TRAITS[intent] || []).forEach(trait => required.add(trait));
    addPathway(`${intent} pathway`, INTENT_TO_TRAITS[intent] || []);
  });

  if (/space|moon|galaxy|planet|orbit/.test(scenarioText)) addPathway('space specialist', ['space', 'adaptability', 'control']);
  if (/save|defeat|prevent|protect|threat|invasion|apocalypse|dragon|monster|war|battle/.test(scenarioText)) addPathway('frontline fighter', ['combat', 'power', 'durability']);
  if (/solve|mystery|investigate|uncover|decode|detective|secret/.test(scenarioText)) addPathway('detective analyst', ['intelligence', 'control', 'stealth']);
  if (/build|design|construct|repair|invent|create/.test(scenarioText)) addPathway('builder engineer', ['engineering', 'control', 'intelligence']);

  if (!required.size) {
    required.add('adaptability');
    required.add('control');
    addPathway('generalist path', ['adaptability', 'control', 'intelligence']);
  }

  addPathway('universal adaptive path', ['adaptability', 'control', 'intelligence']);

  return {
    intents,
    requiredTraits: Array.from(required),
    pathways
  };
}

function evaluateScenarioFeasibility(profile, requirements) {
  const traits = profile && profile.traits ? profile.traits : {};
  const requiredTraits = requirements && Array.isArray(requirements.requiredTraits)
    ? requirements.requiredTraits
    : [];

  if (!requiredTraits.length) {
    return {
      score: 5,
      canDo: true,
      thrive: false,
      matchedTraits: [],
      missingTraits: [],
      reasons: ['insufficient scenario constraints; baseline feasibility applied']
    };
  }

  const pathways = requirements && Array.isArray(requirements.pathways)
    ? requirements.pathways
    : [];

  const evaluatePath = (pathwayTraits) => {
    const targetTraits = Array.isArray(pathwayTraits) && pathwayTraits.length ? pathwayTraits : requiredTraits;
    const traitValues = targetTraits.map(trait => traits[trait] || 0);
    const achieved = traitValues.reduce((sum, value) => sum + value, 0);
    const maxPossible = Math.max(1, targetTraits.length * 3);
    const normalized = achieved / maxPossible;
    const coveredCount = traitValues.filter(value => value >= 1).length;
    const strongCount = traitValues.filter(value => value >= 2).length;
    const flexibility = Math.min(2, ((traits.adaptability || 0) + (traits.control || 0)) / 2);
    const coverageBonus = targetTraits.length > 0 ? (coveredCount / targetTraits.length) * 2 : 0;
    const strongBonus = targetTraits.length > 0 ? (strongCount / targetTraits.length) * 1.5 : 0;
    const score = Math.max(0, Math.min(10, Math.round((normalized * 7) + coverageBonus + strongBonus + flexibility)));

    return { score, targetTraits };
  };

  const pathEvaluations = (pathways.length ? pathways : [{ label: 'required traits', traits: requiredTraits }])
    .map(path => ({ label: path.label || 'pathway', ...evaluatePath(path.traits) }));

  const bestPath = pathEvaluations.sort((a, b) => b.score - a.score)[0];

  const matchedTraits = [];
  const missingTraits = [];
  bestPath.targetTraits.forEach(trait => {
    const traitScore = traits[trait] || 0;
    if (traitScore >= 2) matchedTraits.push(trait);
    if (traitScore === 0) missingTraits.push(trait);
  });

  const score = Math.max(profile ? 2 : 0, bestPath.score);
  return {
    score,
    canDo: score >= 3,
    thrive: score >= 7,
    matchedTraits,
    missingTraits,
    reasons: [`best path: ${bestPath.label}`]
  };
}

function inferTwistEffects(twist) {
  const text = String(twist || '').toLowerCase();
  const helps = new Set();
  const hurts = new Set();
  const labels = [];
  let severity = 0;

  TWIST_EFFECT_RULES.forEach(rule => {
    const triggered = rule.keywords.some(keyword => text.includes(keyword));
    if (!triggered) return;

    (rule.helps || []).forEach(trait => helps.add(trait));
    (rule.hurts || []).forEach(trait => hurts.add(trait));
    labels.push(rule.label);
    severity = Math.max(severity, rule.severity || 1);
  });

  return {
    helps: Array.from(helps),
    hurts: Array.from(hurts),
    labels,
    severity: severity || 1,
    affects: labels.length > 0
  };
}

function evaluateTwistImpact(profile, twist) {
  const traits = profile && profile.traits ? profile.traits : {};
  const effects = inferTwistEffects(twist);
  const adaptationBuffer = Math.round(((traits.adaptability || 0) + (traits.control || 0)) / 2);

  let helpScore = 0;
  effects.helps.forEach(trait => {
    const traitScore = traits[trait] || 0;
    helpScore += traitScore >= 2 ? traitScore + 1 : traitScore;
  });

  let penalty = 0;
  effects.hurts.forEach(trait => {
    const traitScore = traits[trait] || 0;
    penalty += Math.max(0, effects.severity - traitScore);
  });

  const rawImpact = helpScore - penalty + adaptationBuffer;
  const impactScore = Math.max(-4, Math.min(4, Math.round(rawImpact / 2)));

  return {
    impactScore,
    affects: effects.affects,
    helps: impactScore >= 2,
    hurts: impactScore <= -2,
    neutral: !(impactScore >= 2) && !(impactScore <= -2),
    helpTraits: effects.helps,
    hurtTraits: effects.hurts,
    reasons: effects.labels.length ? [`twist factors: ${effects.labels.join(', ')}`] : []
  };
}

function assessScenarioAndTwist(character, info, scenario, twist) {
  if (!info) {
    return {
      profile: null,
      requirements: inferScenarioRequirements(scenario),
      scenarioFeasibility: {
        score: 0,
        canDo: false,
        thrive: false,
        matchedTraits: [],
        missingTraits: ['unknown profile'],
        reasons: ['no character data available']
      },
      twistImpact: {
        impactScore: 0,
        affects: false,
        helps: false,
        hurts: false,
        neutral: true,
        helpTraits: [],
        hurtTraits: [],
        reasons: ['no character data available']
      }
    };
  }

  const profile = buildCapabilityProfile(character, info);
  const requirements = inferScenarioRequirements(scenario);
  const scenarioFeasibility = evaluateScenarioFeasibility(profile, requirements);
  const twistImpact = evaluateTwistImpact(profile, twist);

  return {
    profile,
    requirements,
    scenarioFeasibility,
    twistImpact
  };
}

function scoreRelevance(character, info, scenario, twist) {
  if (!info) return { points: 0, note: null };
  const sourceText = buildInfoCorpus(info, character).toLowerCase();
  const scenarioFit = buildKeywordFitDetails(sourceText, scenario);
  const twistFit = buildKeywordFitDetails(sourceText, twist);
  const scenarioDomains = getDomainMatches(scenario, '', sourceText);
  const twistDomains = getDomainMatches('', twist, sourceText);

  const sourceIntents = inferIntentGroups(sourceText);
  const scenarioIntents = inferIntentGroups(scenario);
  const twistIntents = inferIntentGroups(twist);
  const matchedScenarioIntents = scenarioIntents.filter(intent => sourceIntents.includes(intent));
  const matchedTwistIntents = twistIntents.filter(intent => sourceIntents.includes(intent));
  const uniqueMatchedIntents = Array.from(new Set([...matchedScenarioIntents, ...matchedTwistIntents]));

  const assessment = assessScenarioAndTwist(character, info, scenario, twist);
  const capability = calculateCapabilityFit(character, info, scenario, twist);

  const scenarioPoints = mapFitCountToPoints(scenarioFit.totalCount);
  const twistPoints = mapFitCountToPoints(twistFit.totalCount);
  const domainPoints = Math.min(8, (scenarioDomains.length + twistDomains.length) * 2);
  const intentPoints = Math.min(6, uniqueMatchedIntents.length * 2);
  const capabilityPoints = Math.min(8, capability.totalPoints);

  const feasibility = assessment.scenarioFeasibility;
  const twistImpact = assessment.twistImpact;
  const scenarioFeasibilityPoints = feasibility.score >= 9 ? 4 : feasibility.score >= 7 ? 3 : feasibility.score >= 5 ? 2 : feasibility.score >= 3 ? 1 : 0;
  const twistImpactPoints = twistImpact.helps ? Math.min(4, Math.max(1, twistImpact.impactScore)) : twistImpact.hurts ? -Math.min(4, Math.abs(twistImpact.impactScore)) : 0;
  const precisionBonus = (scenarioFit.totalCount >= 6 && twistFit.totalCount >= 4) ? 2 : 0;

  const total = Math.max(-6, Math.min(24, scenarioPoints + twistPoints + domainPoints + intentPoints + precisionBonus + capabilityPoints + scenarioFeasibilityPoints + twistImpactPoints));

  const noteParts = [];
  if (scenarioFit.totalCount > 0 || twistFit.totalCount > 0) noteParts.push(`Keyword fit: S${scenarioFit.totalCount}/T${twistFit.totalCount}`);
  if (uniqueMatchedIntents.length) noteParts.push(`Intent fit: ${uniqueMatchedIntents.join(', ')}`);
  if (capability.totalPoints >= 4) noteParts.push(`Thrive potential: +${capability.totalPoints} capability fit`);
  noteParts.push(`Scenario feasibility: ${feasibility.canDo ? 'can do' : 'struggles'} (${feasibility.score}/10)`);
  if (twistImpact.affects) noteParts.push(`Twist impact: ${twistImpact.helps ? 'helps' : twistImpact.hurts ? 'hurts' : 'neutral'} (${twistImpact.impactScore})`);

  return {
    points: total,
    note: noteParts.length ? noteParts.join(' | ') : 'Limited direct overlap with scenario/twist.',
    scenario: {
      matchCount: scenarioFit.totalCount,
      matchedKeywords: scenarioFit.matchedKeywords,
      capabilityScore: capability.scenario.points,
      capabilityReasons: capability.scenario.reasons,
      feasibilityScore: feasibility.score,
      canDo: feasibility.canDo,
      thrive: feasibility.thrive,
      requiredTraits: assessment.requirements.requiredTraits,
      matchedTraits: feasibility.matchedTraits,
      missingTraits: feasibility.missingTraits
    },
    twist: {
      matchCount: twistFit.totalCount,
      matchedKeywords: twistFit.matchedKeywords,
      capabilityScore: capability.twist.points,
      capabilityReasons: capability.twist.reasons,
      impactScore: twistImpact.impactScore,
      affects: twistImpact.affects,
      helps: twistImpact.helps,
      hurts: twistImpact.hurts,
      helpTraits: twistImpact.helpTraits,
      hurtTraits: twistImpact.hurtTraits,
      impactReasons: twistImpact.reasons
    },
    profile: assessment.profile ? {
      topTraits: assessment.profile.rankedTraits,
      type: assessment.profile.type,
      powerClass: assessment.profile.powerClass
    } : null
  };
}

function calculateDraftedFitBonus(info, scenario, twist, character) {
  const sourceText = buildInfoCorpus(info, character);
  const scenarioFit = buildKeywordFitDetails(sourceText, scenario || '');
  const twistFit = buildKeywordFitDetails(sourceText, twist || '');

  return {
    scenario: mapFitCountToDraftBonus(scenarioFit.totalCount),
    twist: mapFitCountToDraftBonus(twistFit.totalCount)
  };
}

function scoreNameSignals(character, validation, scenario, twist) {
  const signals = [];
  let points = 0;
  const wordCount = validation.wordCount || 0;
  const trimmed = character.trim();
  const lower = trimmed.toLowerCase();

  if (wordCount >= 4) { points -= 2; signals.push('long name'); }
  if (TITLE_KEYWORDS.some(title => lower.includes(`${title} `) || lower.endsWith(` ${title}`))) { points += 2; signals.push('title/honorific'); }
  if (ROLE_KEYWORDS.some(role => lower.includes(role))) { points += 2; signals.push('role keyword'); }
  if (/\d/.test(lower)) { points -= 3; signals.push('numeric token'); }
  if (trimmed.length <= 3) { points -= 2; signals.push('very short name'); }
  if (/-|\'/.test(trimmed)) { points += 1; signals.push('distinct formatting'); }

  const scenarioTokens = tokenize(`${scenario} ${twist}`);
  const nameTokens = tokenize(trimmed);
  const nameOverlap = countOverlap(nameTokens, scenarioTokens);
  if (nameOverlap > 0) {
    points += 3;
    signals.push('name matches scenario/twist');
  }

  const note = signals.length ? `Name signals: ${signals.join(', ')}.` : 'Name signals: minimal.';
  return { points, note };
}

function calculateScenarioFit(character, info, scenario, twist) {
  const scenarioText = `${scenario} ${twist}`.toLowerCase();
  const characterText = buildInfoCorpus(info, character).toLowerCase();
  const overlap = countOverlap(tokenize(characterText), tokenize(scenarioText));
  const semanticFit = buildKeywordFitDetails(characterText, scenarioText);
  const capability = calculateCapabilityFit(character, info, scenario, twist);
  const assessment = assessScenarioAndTwist(character, info, scenario, twist);

  let multiplier = 1.0;
  if (semanticFit.totalCount >= 14 || overlap >= 6) multiplier = 1.25;
  else if (semanticFit.totalCount >= 9 || overlap >= 4) multiplier = 1.18;
  else if (semanticFit.totalCount >= 4 || overlap >= 1) multiplier = 1.1;

  if (capability.totalPoints >= 10) multiplier += 0.12;
  else if (capability.totalPoints >= 7) multiplier += 0.08;
  else if (capability.totalPoints >= 4) multiplier += 0.05;

  if (assessment.scenarioFeasibility.thrive) multiplier = Math.max(multiplier, 1.24);
  else if (!assessment.scenarioFeasibility.canDo) multiplier = Math.min(multiplier, 0.96);

  if (assessment.twistImpact.helps) multiplier += 0.05;
  else if (assessment.twistImpact.hurts) multiplier -= 0.06;

  if (!info && overlap === 0) multiplier = 0.9;

  return Math.max(0.8, Math.min(1.35, multiplier));
}

function calculateScenarioFitValue(character, info, scenario, twist) {
  if (!info) return 0.92;
  const overlap = buildKeywordFitDetails(buildInfoCorpus(info, character).toLowerCase(), `${scenario || ''} ${twist || ''}`).totalCount;
  const capability = calculateCapabilityFit(character, info, scenario, twist);
  const assessment = assessScenarioAndTwist(character, info, scenario, twist);

  let multiplier = 0.95;
  if (overlap >= 14) multiplier = 1.24;
  else if (overlap >= 9) multiplier = 1.16;
  else if (overlap >= 5) multiplier = 1.1;
  else if (overlap >= 2) multiplier = 1.04;

  if (capability.totalPoints >= 10) multiplier = Math.max(multiplier, 1.2);
  else if (capability.totalPoints >= 7) multiplier = Math.max(multiplier, 1.14);
  else if (capability.totalPoints >= 4) multiplier = Math.max(multiplier, 1.08);

  if (assessment.scenarioFeasibility.thrive) multiplier = Math.max(multiplier, 1.24);
  else if (assessment.scenarioFeasibility.canDo) multiplier = Math.max(multiplier, 1.1);
  else multiplier = Math.min(multiplier, 0.97);

  if (assessment.twistImpact.helps) multiplier += 0.04;
  if (assessment.twistImpact.hurts) multiplier -= 0.05;

  return Math.max(0.85, Math.min(1.3, multiplier));
}

function getScenarioFitExplanation(multiplier) {
  if (multiplier >= 1.2) return 'Perfect scenario fit: 20% bonus multiplier';
  if (multiplier >= 1.1) return 'Excellent scenario fit: 10% bonus multiplier';
  if (multiplier >= 1.05) return 'Good scenario fit: 5% bonus multiplier';
  if (multiplier >= 1.0) return 'Neutral scenario fit: no penalty or bonus';
  if (multiplier >= 0.95) return 'Slight scenario mismatch: 5% penalty';
  return `Poor scenario fit: ${Math.round((1 - multiplier) * 100)}% penalty`;
}

module.exports = {
  buildKeywordFitDetails,
  inferIntentGroups,
  buildInfoCorpus,
  getDomainMatches,
  calculateCapabilityFit,
  assessScenarioAndTwist,
  scoreRelevance,
  calculateDraftedFitBonus,
  scoreNameSignals,
  calculateScenarioFit,
  calculateScenarioFitValue,
  getScenarioFitExplanation
};
