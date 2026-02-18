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

export function resetAllState() {
  resetPlayer();
  resetRoomState();
  resetGameState();
  clearTimers();
}
