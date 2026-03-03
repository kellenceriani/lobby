const createDefaultGameState = () => ({
  currentRound: 0,
  totalRounds: 4,
  myTeam: [],
  myDraftSlots: [],
  draftActiveSlotIndex: 0,
  draftEntryCount: 0,
  currentScenario: '',
  currentTwist: '',
  allDrafts: {},
  allDraftsList: [],
  allCharactersDrafted: [],
  draftLocked: false,
  votes: {},
  voted: false,
  voteLocked: false,
  currentVoteChoice: null,
  leaderboard: [],
  myFinalTeam: [],
  draftWarnings: {},
  activePackMeta: null
});

export const player = { name: '', room: '', ready: false };
export const roomState = {
  host: null,
  settings: {},
  players: [],
  messages: [],
  packCatalog: null,
  selectedPackMeta: null,
  categoryRegistry: null,
  categoryVote: null,
  categoryTelemetry: null
};
export const gameState = createDefaultGameState();

export const activeTimers = [];
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
  roomState.packCatalog = null;
  roomState.selectedPackMeta = null;
  roomState.categoryRegistry = null;
  roomState.categoryVote = null;
  roomState.categoryTelemetry = null;
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
