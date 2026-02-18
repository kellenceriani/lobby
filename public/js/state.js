const createDefaultGameState = () => ({
  currentRound: 0,
  totalRounds: 4,
  myTeam: [],
  currentScenario: '',
  currentTwist: '',
  allDrafts: {},
  allDraftsList: [],
  allCharactersDrafted: [],
  votes: {},
  voted: false,
  voteLocked: false,
  currentVoteChoice: null,
  leaderboard: [],
  myFinalTeam: [],
  draftWarnings: {}
});

export const player = { name: '', room: '', ready: false };
export const roomState = { host: null, settings: {}, players: [], messages: [] };
export const gameState = createDefaultGameState();

export const round4State = {
  scenario: '',
  twist: '',
  allTeamEvaluations: {},
  finalLeaderboard: [],
  currentCharIndex: 0,
  totalTeams: 0,
  totalCharacters: 0,
  isEvaluating: false,
  scenarioVisible: true
};

export const activeTimers = [];
export let toastQueue = [];
export let devMode = false;
export let isLoading = false;

export function setLoading(value) {
  isLoading = value;
}

export function clearTimers() {
  activeTimers.forEach(timerId => clearInterval(timerId));
  activeTimers.length = 0;
}

export function addTimer(timerId) {
  activeTimers.push(timerId);
}

export function resetPlayer() {
  player.name = '';
  player.room = '';
  player.ready = false;
}

export function resetRoomState() {
  roomState.host = null;
  roomState.settings = {};
  roomState.players = [];
  roomState.messages = [];
}

export function resetGameState() {
  Object.assign(gameState, createDefaultGameState());
}

export function resetRound4State() {
  round4State.scenario = '';
  round4State.twist = '';
  round4State.allTeamEvaluations = {};
  round4State.finalLeaderboard = [];
  round4State.currentCharIndex = 0;
  round4State.totalTeams = 0;
  round4State.totalCharacters = 0;
  round4State.isEvaluating = false;
  round4State.scenarioVisible = true;
}

export function resetAllState() {
  resetPlayer();
  resetRoomState();
  resetGameState();
  clearTimers();
}
