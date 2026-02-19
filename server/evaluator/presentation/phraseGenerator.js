const PHRASE_BANKS = {
  mad: [
    "This is not a real character.",
    "That input breaks the rules.",
    "I cannot score what isn't readable.",
    "Invalid pick. Try a real name next time.",
    "Nope. That does not qualify.",
    "This fails basic validation.",
    "That is not scorable input.",
    "We need an actual character here.",
    "This pick is disallowed.",
    "Hard stop. Invalid submission."
  ],
  disappointed: [
    "This crosses the line. Disqualified.",
    "Not acceptable. Pick something else.",
    "That content is not allowed here.",
    "We can do better than that.",
    "No score for offensive input.",
    "That choice is blocked.",
    "Disappointing, and disallowed.",
    "Invalid for content reasons.",
    "Not cool. Try again next round.",
    "This one is rejected."
  ],
  confused: [
    "I am not sure how this helps the scenario.",
    "This is a puzzling pick.",
    "The fit is unclear.",
    "This feels off-theme.",
    "I do not see the strategy yet.",
    "An odd choice for this twist.",
    "I am missing the connection here.",
    "This one is hard to justify.",
    "Interesting, but not convincing.",
    "Not sure this belongs."
  ],
  neutral: [
    "Solid, serviceable pick.",
    "Works fine for the prompt.",
    "Reasonable selection.",
    "Not flashy, but effective.",
    "Neutral value here.",
    "This does the job.",
    "A steady, safe choice.",
    "It fits well enough.",
    "Average, but acceptable.",
    "Clean, straightforward pick."
  ],
  happy: [
    "This is a smart fit.",
    "Great synergy for the scenario.",
    "Now we are cooking.",
    "Strong choice for the twist.",
    "Nice upgrade to the roster.",
    "This adds real value.",
    "Solid pick with purpose.",
    "You understood the assignment.",
    "That is a good call.",
    "This helps your team a lot."
  ],
  amazed: [
    "Excellent read on the scenario.",
    "Big brain pick.",
    "You are playing chess here.",
    "This is a power move.",
    "That is a sharp selection.",
    "You found a strong angle.",
    "This pick raises the ceiling.",
    "You are cooking now.",
    "This is clean and clever.",
    "Very strong synergy."
  ],
  mindBlown: [
    "This is game-changing.",
    "An elite pick for this scenario.",
    "That might decide the round.",
    "Legendary selection.",
    "You just leveled up the team.",
    "That is a massive swing.",
    "Peak synergy. Huge value.",
    "I was not ready for that.",
    "Top-tier decision.",
    "This could win it all."
  ]
};

function getRandomPhrase(emotion) {
  const phrases = PHRASE_BANKS[emotion] || PHRASE_BANKS.neutral;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

module.exports = { getRandomPhrase };
