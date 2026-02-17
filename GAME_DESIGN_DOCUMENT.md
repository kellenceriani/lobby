# TEAM CHAOS: MULTIPLAYER GAME DESIGN DOCUMENT

**Project Name:** Team Chaos - Real-Time Team Construction Party Game  
**Version:** 1.0.0  
**Date:** February 16, 2026  
**Status:** Architecture & Design Phase  
**Tech Stack:** Node.js (Express), Socket.io, Vanilla JavaScript, HTML5/CSS3  
**Deployment:** Railway.com (GitHub: kellenceriani/lobby)  
**Domain:** lobby.lineupwars.com  
**Game Type:** Real-time Multiplayer Party Game (2-6 players)  
**Session Duration:** 12-18 minutes (3 rounds, ~4-6 minutes per round)

---

## TABLE OF CONTENTS

1. [Executive Overview](#executive-overview)
2. [Core Game Concept](#core-game-concept)
3. [Technical Architecture](#technical-architecture)
4. [Lobby System Design](#lobby-system-design)
5. [Game Mechanics & Round Flow](#game-mechanics--round-flow)
6. [UI/UX Design Specifications](#uiux-design-specifications)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Deployment & Infrastructure](#deployment--infrastructure)
9. [Critical Considerations & Constraints](#critical-considerations--constraints)
10. [Future Extensibility](#future-extensibility)

---

## EXECUTIVE OVERVIEW

### Project Objective

**Team Chaos** is a real-time, multiplayer party game designed for 2-6 players to simultaneously draft fictional characters to solve randomly-generated scenarios, vote on team viability, and compete for points across multiple rounds. It combines the rapid decision-making and social chaos of Jackbox.tv with the character-drafting strategy of LineupWars, wrapped in a dynamic, unpredictable game experience where every decision matters and laughs are guaranteed.

### Core Value Proposition

- **Real-time social gameplay:** Players draft simultaneously while seeing live picks from others
- **Scenario-driven chaos:** Each round presents a new impossible scenario (defeat aliens, win a cooking show, escape prison underwater) that forces creative team building
- **Free-form character drafting:** Players type any character from any medium—no predefined pool, no restrictions
- **Accessibility:** Play from any device with a browser; no app downloads, no prior knowledge needed
- **Streamer-friendly:** Built for content creators—visually dynamic, full of surprising moments and player reactions
- **High replayability:** 150+ scenarios × random plot twists × player-generated character combinations ensure no two games are identical

### Success Criteria

✅ Lobby system handles 2-6 concurrent players with zero crashes  
✅ Real-time synchronization of player state during character drafting  
✅ Round transitions happen within 2 seconds; all players see identical scenario  
✅ Game completes 3 full rounds without state corruption or orphaned sockets  
✅ Voting results tallied within 1 second of voting window close  
✅ Sub-1-second latency for player actions (draft, vote)  
✅ Final leaderboard accurately reflects all 3 rounds of scoring  
✅ All players, regardless of connection quality, see synchronized rounds  
✅ Graceful handling when players disconnect mid-round (auto-fill or sit out)  

---

## CORE GAME CONCEPT

### What is Team Chaos?

**Team Chaos** is a 3-round party game where players race against the clock to draft fictional characters designed to succeed in absurd, randomly-generated scenarios. 

**The Loop (Per Round, ~4 minutes):**

1. **Scenario Revealed** (2 seconds) - "Build a team to WIN A COOKING COMPETITION"
2. **Draft Phase** (45 seconds) - All players simultaneously type character names they want on their team
3. **Plot Twist** (2 seconds) - Surprise modifier adds new challenge - "BUT IT'S UNDERWATER"
4. **Voting Phase** (30 seconds) - Players vote on whose team would win, based on scenario logic
5. **Results & Points** (10 seconds) - Winner (most votes) gets points; second place gets half; others get minimal points
6. **Repeat** - 3 rounds total, then final leaderboard

**Core Design Philosophy:**
- **Real-time simultaneous action** (all players drafting at once creates urgency)
- **Scenario-driven chaos** (scenarios change evaluation context)
- **Free-form character input** (any character from any medium—movies, comics, history, books, cartoons, real people)
- **Social voting** (group consensus determines winners, creates discussion moments)
- **Quick decision loops** (45-second drafts prevent overthinking)
- **No setup required** (no character knowledge needed; creativity beats game knowledge)

### Game Experience Flow

```
1. LANDING PAGE / JOIN
   └─> Player visits lobby.lineupwars.com
   └─> Enters Name + Room Code (or creates new room)
   
2. LOBBY
   └─> Sees other players join in real-time
   └─> Host selects difficulty/optional modes
   └─> "START GAME" button glows when 2+ players ready
   
3. PRE-ROUND (5 seconds)
   └─> All players see: "GET READY FOR ROUND 1"
   └─> Countdown timer "3... 2... 1..."
   
4. SCENARIO REVEAL (2 seconds)
   └─> Large text: "WIN A COOKING COMPETITION"
   └─> Thematic background/description
   └─> Draft timer begins countdown
   
5. CHARACTER DRAFT (45 seconds)
   └─> All players draft simultaneously
   └─> See real-time draft picks: "[Alice] picked BATMAN"
   └─> Available characters dim as picked
   └─> Timer counts down in top-right
   
6. PLOT TWIST REVEAL (2 seconds)
   └─> "WAIT! BUT IT'S UNDERWATER!"
   └─> Screen shakes, sound effect
   └─> Teams reframe with new context
   
7. VOTING PHASE (30 seconds)
   └─> All players vote: "Whose team would win?"
   └─> Can vote for themselves or others
   └─> See vote counts updating real-time
   
8. RESULTS SCREEN (10 seconds)
   └─> Round winner displayed  
   └─> Vote breakdown shown
   └─> Points tallied to leaderboard
   
9. REPEAT → Rounds 2 & 3 (same format, new scenarios)
   
10. FINAL LEADERBOARD (20 seconds)
    └─> Rank all players by total points
    └─> Show win counts per player
    └─> "[ALEX] WON WITH 450 POINTS"
    
11. RETURN TO LOBBY OR PLAY AGAIN?
    └─> Button to start new game with same players
    └─> Or return to lobby to invite others
```

### Design Inspiration Sources

**From Jackbox.tv:**
- Real-time simultaneous player interactions
- Voting as primary mechanic (social, consensus-based)
- Quick round timers (urgency + pacing)
- Leaderboards that drive competition
- Streamer-friendly moments (chaos, surprise reveals)

**From LineupWars (UniverseBattle):**
- Character drafting with roles/constraints
- Mid-game surprise reveals (universe mid-draft → plot twist mid-scenario)
- Scenario-based context changing gameplay
- Chaos modifiers that shift strategy

**From Chat-Based Party Games:**
- Social discussion as primary mechanic
- Scenario-driven team building
- Competitive voting/consensus

**Novel Innovations:**
- **Simultaneous free-form input** (all players type characters at once, no predefined pool)
- **Plot twist mechanic** (scenario changes mid-draft, forces adaptive thinking)
- **Social voting** (outcomes determined by group consensus, not computer algorithm)
- **Accessibility by design** (any character works; creativity beats game knowledge)
- **Session persistence** (same players play multiple rounds, leaderboard grows)

---

## TECHNICAL ARCHITECTURE

### Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER (Browser)                   │
├─────────────────────────────────────────────────────────────┤
│ • HTML5 Templates (index.html)                              │
│ • Client-side JS (lobby.js, game.js, ui.js)                │
│ • CSS3 (style.css - Comic Sans party aesthetic)             │
│ • Socket.io Client Library                                 │
└────────────────────┬────────────────────────────────────────┘
                     │ WebSocket (Socket.io)
┌────────────────────▼────────────────────────────────────────┐
│               SERVER LAYER (Node.js/Express)                │
├─────────────────────────────────────────────────────────────┤
│ • Express.js HTTP Server                                    │
│ • Socket.io Server (real-time comm)                         │
│ • Room Management System                                    │
│ • Game State Manager                                        │
│ • Player State Manager                                      │
│ • Game Logic Engines (modular by game type)                 │
│ • Event Handlers & Middleware                              │
└────────────────────┬────────────────────────────────────────┘
                     │ In-Memory Data Structure
┌────────────────────▼────────────────────────────────────────┐
│              STATE MANAGEMENT (In-Memory)                   │
├─────────────────────────────────────────────────────────────┤
│ • rooms = { [roomCode]: RoomState }                         │
│ • RoomState = { players[], settings, gameState, activeGame }
│ • PlayerState = { id, name, char, ready, team, score }     │
│ • GameState = { type, startTime, activeRound, results }    │
└─────────────────────────────────────────────────────────────┘
```

### Data Structures

#### **Room Object** (In-Memory)
```javascript
rooms[roomCode] = {
  roomCode: 'ABC123',
  createdAt: timestamp,
  lastActivity: timestamp,
  settings: {
    maxPlayers: 6,
    currentPlayers: 3,
    difficulty: 'normal' | 'hard' | 'chaotic',  // Changes plot twist frequency/severity
    scenarioTheme: 'all' | 'action' | 'comedy'  // Filter scenario types
  },
  players: [
    {
      id: 'socket123',
      name: 'Alice',
      avatar: '🎩',                             // Emoji avatar selected in lobby
      isHost: true,
      connectionStatus: 'connected' | 'disconnected' | 'left',
      joinedAt: timestamp,
      roundStats: {
        round1: { draftedChars: ['Batman', 'Gordon Ramsay'], votes: 2, points: 150 },
        round2: { ... },
        round3: { ... }
      },
      totalPoints: 426,
      stats: { 
        totalGamesPlayed: 0,
        wins: 0,
        mostCreativeTeams: 0
      }
    },
    // ... more players
  ],
  activeGame: null | GameInstance
}
```

#### **GameInstance Object**
```javascript
GameInstance = {
  id: 'game_20260216_abc123',
  roomCode: 'ABC123',
  startedAt: timestamp,
  currentRound: 1,
  totalRounds: 3,
  state: 'setup' | 'scenario-reveal' | 'draft' | 'plot-twist' | 'voting' | 'results' | 'ended',
  
  rounds: [
    {
      roundNumber: 1,
      scenario: {
        baseScenario: 'Win a cooking competition',
        plotTwist: 'But it\'s underwater',
        difficultyMultiplier: 1.0,
        theme: 'comedy'
      },
      characterPool: ['Batman', 'Gordon Ramsay', 'SpongeBob', 'Sherlock Holmes', ...],
      
      draftData: {
        'socket123': {
          player: 'Alice',
          pickedChars: ['Batman', 'Gordon Ramsay'],
          pickOrder: [1, 3],
          synergies: 0.8
        },
        'socket456': {
          player: 'Bob',
          pickedChars: ['SpongeBob', 'Martha Stewart'],
          pickOrder: [2, 4],
          synergies: 0.6
        },
        // ... more players
      },
      
      votes: {
        // { playerName: voteCount, ... } - who won the round
        'Alice': 3,
        'Bob': 1,
        'Charlie': 2
      },
      
      roundWinner: 'Alice',
      roundPoints: {
        'Alice': 200,
        'Bob': 100,
        'Charlie': 150
      }
    },
    // Round 2 & 3 follow same structure
  ]
}
```

#### **Scenario Object**
```javascript
{
  id: 'cook-comp-01',
  name: 'Win a cooking competition',
  description: 'Build a team to win a professional cooking competition.',
  category: 'comedy',
  difficulty: 1,
  plotTwists: [
    'But it\'s underwater',
    'But all ingredients are desserts',
    'But you only have 30 seconds',
    'But judges are from different worlds'
  ]
}
```

**Note:** Players freely type character names during the draft phase. No predefined character database exists. Characters are player-generated text input only.

### Server-Side Socket Events (Concise)

**Lobby Listeners:**
- `playerJoined` → Update player list with animation (bounce new player in)
- `settingsUpdated` → Reflect host setting changes (difficulty, theme)
- `gameStarting(countdown)` → Show countdown "3... 2... 1..."

**Game Listeners:**
- `roundStart(scenario, characterPool)` → Display scenario, show character grid, start draft timer
- `plotTwistRevealed(twist)` → Screen shake/animation, display plot twist
- `draftUpdate(playerName, character)` → Show "[Alice] picked BATMAN" in real-time
- `votingPhaseStart()` → Change UI to voting interface, show player teams
- `voteUpdate(voteCount)` → Show live vote tally updating
- `roundResults(results)` → Show winner animation, leaderboard update
- `gameEnded(finalLeaderboard)` → Show final results screen, confetti effect
- `playerDisconnected(playerName)` → Show "[Name] left the game" notification

---

## LOBBY SYSTEM DESIGN

### Lobby States & Transitions

```
┌──────────────┐
│   JOINING    │ ← Player enters Name
└──────┬───────┘
       │ ✓ Room exists or created
┌──────▼─────────────────────────┐
│   LOBBY (Waiting for Start)     │
├─────────────────────────────────┤
│ • Player list (live updates)   │
│ • Host settings panel          │
│ • "START GAME" button          │
│ • Chat/Emote reactions        │
└──────┬──────────────────────────┘
       │ Host clicks START
┌──────▼──────────────────────────┐
│   GAME ACTIVE (Round 1-3)       │
│  • Scenario display             │
│  • Character draft              │
│  • Voting                       │
│  • Results                      │
└──────┬──────────────────────────┘
       │ After Round 3
┌──────▼──────────────────────────┐
│   FINAL RESULTS                 │
│  • Leaderboard                  │
│  • Highlight moments            │
│  • Play Again / Leave           │
└─────────────────────────────────┘
```

### Lobby UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  🎮 TEAM CHAOS              Players: 4/6    [HOST - ALEX]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  PLAYERS IN LOBBY           GAME SETTINGS (Host Only)       │
│  ┌────────────────────┐    ┌──────────────────────────────┐ │
│  │ 🎩 Alice (Ready)   │    │ 📊 Difficulty: Normal        │ │
│  │ 🤖 Bob (Not Ready) │    │ 🎬 Scenario Theme: All       │ │
│  │ 👽 Charlie (Ready) │    │ 🔄 Plot Twists: On           │ │
│  │ 🦄 Diana (Ready)   │    │                              │ │
│  │                    │    │ (Settings locked when game)  │ │
│  │ [✓ 3/4 players]    │    └──────────────────────────────┘ │
│  └────────────────────┘                                      │
│                                                              │
│  CHAT/REACTIONS                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 🎩: hype hype hype!!                                  │ │
│  │ 👽: who's gonna win? 🤔                               │ │
│  │ 🦄: [reacted with 😂] to Alice's message              │ │
│  └─────────────────────┬──────────────────────────────────┘ │
│  [💬 Chat] [😂 React] [👏 Cheer]                            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │              [← LEAVE ROOM]  [START GAME →]           │ │
│  │                                                        │ │
│  │  (START GAME enabled when 2+ players, all ready)     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Lobby Features

#### **Feature 1: Player Capacity (6 Max)**

**Validation:**
- Reject joinRoom if `players.length >= 6`
- Display "Players: X/6" in header
- When full, show "Room is full" on join screen

**Visual Feedback:**
- Green for < 6 players
- Yellow for 5 players
- Red/locked for 6 players

#### **Feature 2: Host Settings Panel**

Only visible to the host. Allows configuration:

1. **Difficulty Level**
   - Easy: Plot twists rare, 60-second drafts
   - Normal: Plot twists every round, 45-second drafts
   - Hard: Multiple twists, chaotic scenarios, 30-second drafts
   - Chaotic: Complete madness (randomized timers, scenario changes mid-draft)

2. **Scenario Theme**
   - All: Mix of action, comedy, science fiction
   - Action: Intense, conflict-driven scenarios
   - Comedy: Absurd, funny scenarios only
   - Sports: Competitive gaming scenarios

3. **Plot Twist Frequency**
   - Off (no twists, standard draft)
   - Normal (one twist per round)
   - Frequent (multiple twists, adds chaos)

**Settings Lock:** Once START GAME is clicked, settings become locked/uneditable (prevent host from changing mid-game).

#### **Feature 3: Chat (Optional for MVP)**

Real-time communication while waiting:

- **Messages:** Optional 100-char max text messages
- **Display:** Last 3 messages visible in lobby
- **Purpose:** Players can joke/hype before starting (builds social momentum)

**Note:** Chat is optional for MVP. If time-constrained, skip this feature; core game doesn't require it.

#### **Feature 4: Ready States**

Players individually become "ready" when clicking on the host's "ready check" button:

```
Status: [✓ READY] or [ ] NOT READY

START GAME requirements:
- 2-6 players connected
- All players have clicked [✓ READY]
- Host clicks START GAME button
```

Visual progression:
- 1 player, not ready: "[Players ready: 0/1] Need one more..." (gray button)
- 2 players, 1 ready: "[Players ready: 1/2]" (yellow)
- 2+ players, all ready: "[Players ready: 2/2]" (GREEN GLOWING button)

#### **Feature 5: Join Animation & Feedback**

When a player joins:
- Player list bounces
- Name slides in from right
- Sound effect (optional: "DING!")
- Chat shows: "[ALICE] joined the room!"

When a player leaves:
- Name fades/slides out
- Chat shows: "[ALICE] left the room"

---

## GAME MECHANICS & ROUND FLOW

### The Core Game Loop (One Round, ~4 Minutes)

**Team Chaos** repeats this loop 3 times. Each round follows this sequence:

#### **Phase 1: Scenario Reveal (2 seconds)**

- Screen fades to black
- Audio stinger/tension music
- Large text appears: **"WIN A COOKING COMPETITION"**
- Background image theme-loads (kitchen imagery, etc.)
- Description displayed: "Build a team to win a professional cooking competition..."

**Interaction:** Players read and absorb scenario. No decisions yet.

#### **Phase 2: Character Draft (45 seconds)**

- **Free-form input:** Players type character names from ANY medium (movies, TV, books, history, cartoons, games, real people, etc.)
- **No constraints:** Type anything—"Batman," "Gordon Ramsay," "The Queen," "SpongeBob," "Marie Curie," "Goku" — all valid
- **Real-time feed:** When someone types a character, show "[ALICE] picked Batman" in a live draft feed (visible to all)
- **No validation:** Server accepts any text input; doesn't check if character "exists" in a database
- **Draft count:** Each player picks exactly 2 characters (fixed, not variable)
- **Team size:** All teams are 2 characters (consistent, fair)
- **Timer:** Visible countdown in top-right: "45 seconds remaining..."
- **Auto-complete:** If timer hits 0 and player hasn't picked 2, they auto-forfeit remaining slots (team is incomplete, less competitive)

**Gameplay Loop:**
1. Player reads scenario (e.g., "Win a cooking competition")
2. Player types first character that fits (e.g., "Gordon Ramsay")
3. Player sees other players' picks in real-time (builds excitement/competition)
4. Player types second character (e.g., "Julia Child")
5. Repeat across all players simultaneously → Chaotic, fast-paced

**Chaos Factor 1:** Because everyone drafts simultaneously, it's a race. Popular characters get picked fast. There's urgency and reactivity.

#### **Phase 3: Plot Twist Reveal (2 seconds)**

Screen shakes. Red highlight. New text appears:

**"WAIT! BUT IT'S UNDERWATER!"**

- Original scenario remains visible (faded)
- Twist displayed prominently
- Audio cue (dramatic sting, alarm, woosh)
- Players' drafted characters remain locked (can't change picks)
- New context now applies to the teams they just built

**Chaos Factor 2:** This changes the evaluation framework. A character you picked might now be worse/better. Comedic realization moment.

#### **Phase 4: Voting Phase (30 seconds)**

All players now vote on whose team would **WIN** the modified scenario.

**Voting Interface:**

```
┌─────────────────────────────────────┐
│  WHO WILL WIN: [COOKING + UNDERWATER]? │
├─────────────────────────────────────┤
│                                     │
│  🎩 ALICE       [Batman, Ramsay]   │
│  → 👊 [VOTE] (0 votes)              │
│                                     │
│  🤖 BOB         [SpongeBob, Martha] │
│  → 👊 [VOTE] (2 votes)              │
│                                     │
│  👽 CHARLIE     [Sherlock, Oprah]   │
│  → 👊 [VOTE] (1 votes)              │
│                                     │
│  🦄 DIANA       [Marie Curie, Dwayne]│
│  → 👊 [VOTE] (0 votes)              │
│                                     │
│  Timer: 28 seconds remaining        │
│                                     │
└─────────────────────────────────────┘
```

**Voting Rules:**
- Vote for ANY player (including yourself)
- Each player gets ONE vote
- Votes visible in real-time (vote counts update live as people vote)

**Chaos Factor 3:** Social voting creates moments. If someone picks ridiculous characters and somehow wins with votes, they're the hero. If someone builds a seemingly "perfect" team and loses, it's funny. Voting IS the judgment system.

#### **Phase 5: Results & Points (10 seconds)**

Round concludes. Display:

```
┌──────────────────────────────────────┐
│  ✨ ROUND 1 RESULTS ✨              │
├──────────────────────────────────────┤
│                                      │
│  🏆 ROUND WINNER: BOB                │
│     Team: [Gordon Ramsay, Julia]    │
│     Votes: 3/4  +150 points          │
│                                      │
│  2nd Place: 🎩 ALICE                 │
│     Team: [Batman, Sherlock]         │
│     Votes: 1/4  +50 points           │
│                                      │
│  Leaderboard After Round 1:          │
│  1. BOB ........... 150 points       │
│  2. ALICE ......... 50 points        │
│  3. CHARLIE ....... 0 points         │
│  4. DIANA ......... 0 points         │
│                                      │
│          [Continue to Round 2...]    │
│                                      │
└──────────────────────────────────────┘
```

**Points Calculation (Simplified):**
- **Most votes = 150 points** (winner of round)
- **Second most votes = 50 points** (runner-up)  
- **All others = 0 points** (stay in game for remaining rounds)
- **No hidden algorithms:** Voting is the sole scoring mechanism

### Round Repetition (Rounds 2 & 3)

Rounds 2 and 3 follow identical flow to Round 1:
- New random scenario
- New plot twist  
- New voting & winner

### Final Leaderboard & Game End (20 seconds)

After Round 3:

```
┌──────────────────────────────────┐
│    🎉 FINAL RESULTS 🎉          │
├──────────────────────────────────┤
│                                  │
│  1st: BOB ............ 350 pts   │
│       (2 round wins)             │
│                                  │
│  2nd: ALICE ......... 300 pts    │
│       (1 round win)              │
│                                  │
│  3rd: CHARLIE ....... 220 pts    │
│                                  │
│  4th: DIANA ......... 150 pts    │
│                                  │
│  [PLAY AGAIN]  [LEAVE]          │
│                                  │
└──────────────────────────────────┘
```

**Options:**
- **[PLAY AGAIN]** - Reset to new 3-round game (same players)
- **[LEAVE]** - Return to lobby or exit room

### Game Design Philosophy  

**Why This Works:**

1. **Fast Pacing** - ~4 min per round, 3 rounds = 12 min total. Perfect for streaming, parties, casual play.

2. **Simultaneous Action** - Everyone drafting at once creates real-time chaos. No "waiting for Bob to pick a character."

3. **Social Voting** - Players vote on winning teams, creating group discussion and hilarity. Voting is the core mechanic that determines winners.

4. **Plot Twist Mechanic** - Mid-draft surprise forces players to adapt. "Win a cooking competition" becomes "Win a cooking competition underwater"—changes evaluation entirely.

5. **Free-Form Character Input** - Any character from any medium. No learning curve, no restricted pool. Players use creativity, not game knowledge.

6. **Accessibility** - No setup, no prior knowledge needed, fun with any group size (2-6 players).

7. **Comeback Potential** - A player can lose Rounds 1 & 2 but win Round 3 and still place second overall. Keeps everyone engaged.

8. **Streamer-Friendly** - Visual, dynamic, social, with clear drama (voting) and moments (unexpected wins).

---

## UI/UX DESIGN SPECIFICATIONS

### Visual Design System

#### **Aesthetic: Party Game Chaos**

**Design Goals:** High energy, accessible, streamer-friendly, instant visual feedback

- **Font:** Comic Sans MS (playful, chaos, nostalgic)
- **Color Palette:**
  - Primary buttons: Vibrant neon pink (#ff4081)
  - Secondary: Electric purple (#6f42c1)
  - Backgrounds: Dark gradient for contrast  
  - Text: White for readability
  - Timer/alerts: Orange (#ffaa00)
  - Winners: Lime green (#00ff00)

- **Layout:** Rounded corners (20px), dashed borders, clear hover states

- **Animations (Minimal MVP):**
  - **Scenario reveal:** Fade in
  - **Plot twist:** Red flash + large centered text
  - **Character draft feed:** New picks appear in real-time
  - **Results screen:** Slide up animation

#### **Responsive Design**

- **Mobile (< 600px):** Stack vertically, large touch targets
- **Tablet & Desktop:** Full layout with sidebars
- **All devices:** Readable text, clickable buttons (minimum 48px height)

### Key Screens (Overview Only)

**1. Join Page:** Name + Room Code input, "ENTER" button

**2. Lobby:** Player list, host settings (difficulty, theme), ready check button, start game button

**3. Scenario Reveal (2 sec):** Large centered scenario text + description (fade in)

**4. Draft Phase (45 sec):** 
- Input field for character name
- Live feed showing other players' picks
- Timer countdown in corner
- "SUBMIT" button for each pick

**5. Plot Twist (2 sec):** Red overlay, large centered "@Twist text (fade in from bottom)

**6. Voting Phase (30 sec):** 
- All player teams listed
- Vote button next to each player
- Real-time vote count updates
- Timer

**7. Round Results (10 sec):** Winner, points, leaderboard, "Continue" button

**8. Final Leaderboard (20 sec):** All players ranked with total points, "Play Again" or "Leave" button

---

## IMPLEMENTATION ROADMAP

**MVP Scope: Playable 3-round game, 2-6 players, no database required**

### Phase 1: Lobby Infrastructure (Week 1)

- [ ] Build join page (name + room code)
- [ ] Implement player list + player joins/leaves
- [ ] Add ready check (all players must ready before start)
- [ ] Add host difficulty settings (Easy/Normal/Hard)
- [ ] Lock settings when game starts

**Test:** 6 players join, ready up, settings update correctly

### Phase 2: Round Structure & Server State (Week 1-2)

- [ ] Build server-side round state machine (scenario → draft → twist → voting → results)
- [ ] Implement timers (45s draft, 30s voting, 2s transitions)
- [ ] Auto-transition between phases
- [ ] Randomly select & broadcast scenario + plot twist to all players

**Test:** All players see same scenario/twist, transitions happen on time

### Phase 3: Character Drafting (Week 2)

- [ ] Build draft UI (text input + submit button)
- [ ] Server accepts any player-typed character name
- [ ] Real-time draft feed ("Alice typed Batman")
- [ ] Track 2 characters per player
- [ ] Auto-timeout at 45 seconds

**Test:** 6 players type characters simultaneously, all see live feed, no race conditions

### Phase 4: Voting & Results (Week 2-3)

- [ ] Build voting interface (all players/teams visible, vote buttons)
- [ ] Track votes in real-time, update counts
- [ ] Calculate round winner (most votes = 150 pts, 2nd place = 50 pts)
- [ ] Display results, leaderboard after each round

**Test:** Voting works, scoring is correct, leaderboard updates

### Phase 5: Full Game Flow & Polish (Week 3)

- [ ] Chain all phases seamlessly (3 rounds → final leaderboard)
- [ ] Add basic transitions/animations
- [ ] Implement "Play Again" + "Leave Room"
- [ ] Test mobile responsiveness

**Test:** Full 6-player game plays without crashes, all sequences work

### Phase 6: Deployment (Week 3-4)

- [ ] Deploy to Railway
- [ ] Test on lobby.lineupwars.com
- [ ] Load test with 10+ players
- [ ] Play 5+ test games, gather feedback
- [ ] Fix critical bugs

---

## DEPLOYMENT & INFRASTRUCTURE

### Current Setup

- **Server:** Railway (Hobby Plan ~$5/month)
- **Domain:** lobby.lineupwars.com
- **Deployment:** GitHub → Railway auto-deploy
- **Database:** None (session state in-memory, games expire after 30 min inactivity)

### Server Requirements for Team Chaos

**Estimated Resource Usage (per concurrent game):**
- **Memory:** 100-150 MB base + 2-5 MB per room (room state in RAM)
- **CPU:** Minimal (single core can handle 50+ concurrent rooms before bottlenecking)
- **Bandwidth:** ~20-50 KB/sec per player (socket.io efficient; small JSON payloads)
- **Concurrent capacity:** ~50-100 simultaneous rooms (300-600 players) on Hobby tier

**Example Load Capacity:**
- 50 concurrent games × 6 players = 300 players online
- At 12-minute average game duration = ~25-30 new games/hour
- Peak storage: ~100 MB (all rooms + leaderboard data)

**Cost Projection:**
- Hobby Plan: $5/month (baseline)
- Usage scales: 100-500 concurrent games/day = still $5-10/month
- Only upgrade if 1000+ daily active users

### Code Deployment Pipeline

```
1. Developer pushes to GitHub (main branch)
   └─> github.com/kellenceriani/lobby

2. Railway GitHub webhook triggers
   └─> Automatic build starts

3. Railway builds Node.js app
   └─> npm install
   └─> npm start (node server.js)

4. App goes live
   └─> DNS points to new version
   └─> Existing sockets gracefully close (reconnect flow)
   └─> New players connect to new version

5. Deployment complete (~1-2 minutes)
```

**Graceful Shutdown Strategy:**
- On deploy, server sends "server restarting in 10s" message to all clients
- Clients reconnect automatically after 5s
- Active games saved to localStorage/client memory (optional, for session recovery)

### Monitoring & Debugging

**Essential Metrics:**
- Concurrent player count (per room, total)
- Average game duration
- Error rate (socket failures, timeout disconnects)
- Memory usage over time
- CPU usage spike detection

**Current Logging Setup:**
```javascript
console.log(`[${roomCode}] Player ${name} joined. Players: ${count}/6`);
console.log(`[${roomCode}] Game started. Round 1 scenario loaded.`);
console.log(`[${roomCode}] Draft complete. Plot twist: ${twist}`);
console.log(`[${roomCode}] Voting complete. Winner: ${winner}. Points: ${points}`);
console.log(`[${roomCode}] Game ended. Duration: ${duration}ms`);
```

**Railway Dashboard Monitoring:**
- Check CPU/memory graphs for anomalies
- Monitor deploy logs for build failures
- Watch error logs for socket exception spikes
- Track uptime/downtime

**Recommended Future Additions:**
- Sentry (error tracking) - free tier = 5,000 errors/month
- Logtail (log aggregation) - $5-20/month depending on volume
- Google Analytics 4 (player behavior) - free

### Railway Upgrade Timeline

**Recommendation:** Stay on trial for first 2-3 weeks of beta. Upgrade before 30 days if:
- Beta players active daily
- No critical bugs
- Server stable (< 1% error rate)

**Upgrade Checklist (Week 3-4):**
1. ✅ Verify app stability (play 20+ test games, no crashes)
2. ✅ Monitor resource usage (confirm Hobby tier sufficient)
3. ✅ Set up monitoring (basic console logging)
4. ✅ Backup codebase (GitHub already does this)
5. ✅ Upgrade to Hobby Plan on Railway dashboard
6. ✅ Add payment method (credit card)
7. ✅ Monitor first week on paid plan

---

## CRITICAL CONSIDERATIONS & CONSTRAINTS

### Socket.io Real-Time Synchronization

**Challenge:** Multiple players drafting simultaneously = race conditions + out-of-sync states

**Solution: Optimistic UI + Server Validation**

```javascript
// CLIENT: Optimistic immediate feedback
socket.on('draftCharacter', (character) => {
  // Immediately disable button and show pick to user
  ui.disableCharacter(character);
  ui.addToDraftFeed(`You picked ${character}`);
  
  // Send to server
  socket.emit('playerDraft', character);
});

// SERVER: Validate and broadcast to room
socket.on('playerDraft', (character) => {
  const room = rooms[socket.data.room];
  
  // Check if character already picked (race condition check)
  if (room.rounds[currentRound].pickedChars.includes(character)) {
    socket.emit('draftError', 'Character already picked');
    return;
  }
  
  // Assign to player
  room.rounds[currentRound].playerPicks[socket.id].push(character);
  
  // Broadcast to ALL players
  io.to(room.roomCode).emit('characterPicked', {
    playerName: socket.data.name,
    character: character
  });
});

// CLIENT: Receive server confirmation
socket.on('characterPicked', ({ playerName, character }) => {
  ui.greyOutCharacter(character);
  ui.updateDraftFeed(`${playerName} picked ${character}`);
});
```

**Key Points:**
- Client immediately shows feedback (feels responsive)
- Server validates and broadcasts truth to all clients
- If client was wrong, server broadcasts correction
- All players see authoritative state from server

### Scenario & Plot Twist Synchronization

**Challenge:** Ensure all players see IDENTICAL scenario and twist, at the SAME time

**Solution: Server-side random generation + broadcast**

```javascript
// SERVER: Generate round scenario (happens server-side, BEFORE broadcast)
const generateRound = (roomCode) => {
  const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
  const twist = scenario.twists[Math.floor(Math.random() * scenario.twists.length)];
  const characterPool = shuffleArray(CHARACTER_DATABASE).slice(0, 12);
  
  // Broadcast to ALL players simultaneously
  io.to(roomCode).emit('roundStart', {
    scenario: scenario.name,
    description: scenario.description,
    plotTwist: twist,
    characters: characterPool,
    draftTimeLimit: 45000, // 45 seconds in ms
    roundNumber: currentRound
  });
};

// CLIENT: All players receive identical data
socket.on('roundStart', (roundData) => {
  ui.displayScenario(roundData.scenario);
  ui.displayCharacterPool(roundData.characters);
  ui.startDraftTimer(roundData.draftTimeLimit);
});
```

**Critical:** Never generate random data on client. Always server-side + broadcast.

### Disconnect Handling

**Challenge:** Player disconnects mid-round. What happens to their picks/votes?

**Solution: Auto-fill mechanism**

```javascript
socket.on('disconnect', () => {
  const room = rooms[socket.data.room];
  const player = room.players.find(p => p.id === socket.id);
  
  player.connectionStatus = 'disconnected';
  
  // Notify room
  io.to(room.roomCode).emit('playerDisconnected', {
    playerName: player.name
  });
  
  // If mid-draft: auto-complete their picks with random remaining characters
  if (gameState.currentPhase === 'draft' && player.pickedCount < 2) {
    const remaining = availableCharacters(room);
    while (player.pickedCount < 2 && remaining.length > 0) {
      const randomChar = remaining.pop();
      player.picks.push(randomChar);
    }
    io.to(room.roomCode).emit('autoPicked', {
      playerName: player.name,
      character: randomChar
    });
  }
  
  // If mid-voting: remove vote (or auto-vote random)
  if (gameState.currentPhase === 'voting' && !player.voted) {
    const randomVote = room.players[Math.floor(Math.random() * room.players.length)];
    player.vote = randomVote.id;
  }
  
  // Auto-reconnect window: 2 minutes
  // If they reconnect within 2 min, restore their game state
  setTimeout(() => {
    if (player.connectionStatus === 'disconnected') {
      room.players = room.players.filter(p => p.id !== socket.id);
      io.to(room.roomCode).emit('playerLeftRoom', player.name);
    }
  }, 2 * 60 * 1000);
});
```

### Room Cleanup

**Challenge:** Rooms accumulate in memory if games end but players linger

**Solution: Timer-based cleanup**

```javascript
const cleanupRoom = (roomCode) => {
  const room = rooms[roomCode];
  const connectedPlayers = room.players.filter(p => p.connectionStatus === 'connected');
  
  if (connectedPlayers.length === 0) {
    // Schedule deletion after 30 min inactivity
    setTimeout(() => {
      if (rooms[roomCode] && rooms[roomCode].players.filter(p => p.connectionStatus === 'connected').length === 0) {
        delete rooms[roomCode];
        console.log(`Room ${roomCode} cleaned up (30 min inactivity)`);
      }
    }, 30 * 60 * 1000);
  }
};
```

### Scalability Analysis

**Current Architecture Limits:**

| Metric | Limit | Notes |
|--------|-------|-------|
| Concurrent rooms | 50-100 | Limited by socket.io per instance |
| Concurrent players | 300-600 | 6 players × 50-100 rooms |
| Total characters in DB | 500 | No database, just in-memory array |
| Scenarios | 200 | Can expand indefinitely |
| Simultaneous drafts | No issue | All in-memory, fast |
| Voting calculations | < 100ms | Simple vote aggregation |

**When to Scale:**
- **500+ daily active users** → Consider load balancing (multiple Railway instances)
- **5000+ daily active users** → Add Redis cache for character pool
- **10,000+ daily users** → Move room state to Postgres, add vertical scaling

**For MVP (Week 1-4):** Single Railway instance is sufficient. No additional infrastructure needed.

---

## CRITICAL TECHNICAL PATTERNS

---

## CRITICAL TECHNICAL REQUIREMENTS

### 1. Real-Time Synchronization

**Challenge:** Multiple players drafting simultaneously creates race conditions.

**Key Principle:** Server is source of truth. Client shows optimistic UI, but server validates all actions.

**Draft Example:**
- Client: Player types "Batman" and sees it immediately in their draft
- Client: Emits `playerDraft('Batman')` to server
- Server: Validates that "Batman" hasn't already been drafted this round
- Server: Records pick and broadcasts to all players
- Result: All players see consistent state

### 2. Scenario & Plot Twist Distribution

**Key Principle:** Never generate random data on the client.

- Server generates scenario + plot twist at round start (server-side random)
- Server broadcasts both to all players simultaneously
- Result: All players see identical content at the same time

### 3. Disconnect Handling

**Simple approach for MVP:**
- If player disconnects, mark them as "away" 
- If mid-draft: auto-fill their remaining picks with blank/empty slots
- If mid-voting: skip their vote (or auto-vote for random player)
- If they reconnect within 2 minutes: restore their game state
- If they don't reconnect: remove them from the game

### 4. Room Cleanup

- Games expire after 30 minutes of inactivity (no connected players)
- Rooms are deleted from memory after expiration
- Prevents memory leaks from forgotten/abandoned games

### 5. Scalability

**MVP capacity (single node):**
- ~50-100 concurrent games
- ~300-600 concurrent players
- Single Railway Hobby instance is sufficient

---

## SCENARIO & CONTENT FRAMEWORK

### Scenario Structure

Each scenario consists of:
- **Base scenario:** Main objective (e.g., "Win a cooking competition")
- **Plot twists:** 2-4 surprise modifiers (e.g., "But it's underwater")
- **Difficulty:** Easy/Normal/Hard (impacts twist severity)

### Sample Scenarios

**Action:**
- Defeat alien invasion
- Escape a sinking ship
- Survive a zombie apocalypse

**Comedy:**
- Win a cooking competition
- Host a talk show for 1 hour
- Teach a college class

**Sports:**
- Win the World Cup
- Coach a championship team
- Win a poker championship

**Note:** Exact scenario count will grow post-MVP. Starting estimate: 50-100 base scenarios with 2-4 twists each = 100-400 total combinations.

---

### Feature Tier 1: Content Expansion (Post-Launch)

**Scenario Packs:**
- Action pack: 50+ action-oriented scenarios
- Comedy pack: 50+ absurd/funny scenarios
- Sports pack: 20+ sports-themed scenarios
- Anime pack: 30+ anime-inspired scenarios
- Marvel/DC pack: 25+ superhero scenarios
- Custom pack: User-submitted scenarios (moderated, paid DLC?)

**Character Expansion:**
- Extend from 100 to 500+ characters
- Community voting on new characters
- Character variants (e.g., "Batman - Year One" vs "Batman - Dark Knight Returns")
- Cosmetic skins/outfits for characters

### Feature Tier 2: Social & Competitive (Month 2-3)

**Persistent Leaderboards (requires database):**
- All-time highest scores
- Weekly/seasonal rankings
- Win streaks
- "Most Creative Wins" / "Most Funny Votes" badges
- Rank up system (Bronze → Silver → Gold → Platinum)

**Player Profiles:**
- Stats dashboard (games played, win rate, favorite scenarios)
- Achievement badges (won 5 games, drafted 10 characters, etc.)
- Avatar customization
- Add friends / view friend stats

**Replay System:**
- Save game footage (last 5 games)
- Share replays as clips
- Timestamp key moments (big plays, upsets, etc.)

### Feature Tier 3: Advanced Gameplay (Month 4+)

**Scenario Editor:**
- Host creates custom scenarios
- Upload custom character pools
- Set custom timers/voting rules
- Share with friends

**Tournament Mode:**
- Multiple games in bracket format
- Accumulate points across games
- Final leaderboard for tournament
- Spectator mode (players eliminated from round can watch)

**AI Opponent:**
- Bot fills empty slot if < 2 players
- Bot "drafts" characters with strategy
- Bot votes based on scenario logic
- Adjustable difficulty levels

**Voice/Video Integration:**
- Use Discord for voice (embed link in lobby)
- Future: Direct in-game voice chat (WebRTC)
- Reactions + voice creates maximum chaos

### Feature Tier 4: Platform Integration (Month 5+)

**Twitch Integration:**
- Auto-create Twitch alerts on victories
- Streamer mode (hide chat, optimize for 1080p)
- Channel points integration (allow viewers to vote/influence draft)

**Discord Bot:**
- `/start [players]` to create game link
- Reaction-based voting on Discord
- Leaderboard commands
- Integration with Discord roles/servers

**Mobile App:**
- React Native port (90% code reuse from web)
- Push notifications (game ready, results)
- Offline character browser

### Feature Tier 5: Monetization (When applicable)

**Free-to-Play Model:**
- Base game free
- Character cosmetics ($0.99-2.99 each)
- Scenario packs ($4.99)
- Battle pass for cosmetics ($9.99/season)

**Premium Subscription:**
- $4.99/month: Early access to new scenarios
- Exclusive cosmetics/badges
- Private room creation
- Ad-free experience

**No Pay-to-Win:** All mechanics remain balanced. Spending = cosmetics only.

---

## SUMMARY & MVP LAUNCH CHECKLIST

### What is "MVP Complete"?

**Definition:** "2-6 players can join a room, play 3 complete rounds of Team Chaos, vote on winners, see final leaderboard, and play again—without crashes, desync, or confusion."

### Pre-Launch Validation Checklist

**Lobby Phase:**
- [ ] Players can join with name + room code
- [ ] Max 6 players enforced (7th player rejected)
- [ ] Player list updates in real-time
- [ ] Host difficulty settings work (Easy/Normal/Hard)
- [ ] Settings locked when game starts
- [ ] "START GAME" button appears only when 2+ players ready

**Game Flow:**
- [ ] Scenario displays correctly (all players see same text)
- [ ] Plot twist reveals (text appears clearly)
- [ ] Draft timer counts down (45 sec)
- [ ] All players see each other's character picks in real-time
- [ ] Voting interface shows all player teams
- [ ] Vote counts update in real-time
- [ ] Round results display with correct winner
- [ ] Leaderboard updates after each round

**Full Game:**
- [ ] Complete 3-round game works start to finish
- [ ] No crashes or errors
- [ ] Final leaderboard displays correctly
- [ ] "PLAY AGAIN" resets to new game
- [ ] "LEAVE" exits cleanly

**Stability:**
- [ ] 6 concurrent players play full game without crashes
- [ ] Reconnecting mid-game doesn't break state
- [ ] No console errors on deployed version

**Manual Testing:**
- [ ] Test with 2, 4, 6 players
- [ ] Game is fun and engaging
- [ ] All controls/buttons work
- [ ] Visual feedback is clear (who drafted what, who voted for who)

### Go-Live Plan

**Week 1: Soft Launch (10-20 beta testers)**
- Deploy current version to Railway
- Invite friends to play
- Gather feedback on UX, difficulty, fun factor
- Monitor error logs for crashes
- Bug fix daily (48-hour turnaround)

**Week 2: Open Feedback (50+ testers, if applicable)**
- Fix major bugs from Week 1
- Add top 3 requested features (quick wins)
- Refine UI based on feedback
- Polish animations

**Week 3: Content Expansion (Optional)**
- Add 20-30 new scenarios
- Expand character pool to 150+
- Increase variety of plot twists
- Rebalance scoring if needed

**Week 4: Official Launch**
- Announce to friends/social media
- Promote as "free multiplayer party game"
- Monitor for sustained uptake
- Plan next features based on usage

### Success Metrics (Post-Launch)

**Week 1-2 (Beta):**
- 100% of games complete without crashes
- Average session duration: 12-18 minutes (expected)
- 90%+ of players express they'd play again
- < 5% of players report bugs

**Month 1:**
- 100+ unique players
- 500+ complete games
- < 1% crash rate
- Positive Discord/feedback feedback

**Month 3 (If scaling):**
- 1000+ monthly active users
- 5000+ games played
- Minimal churn (70%+ retention)
- Ready to upgrade deployment tier if needed

### Ongoing Maintenance

**Daily (Week 1-4):**
- Monitor error logs
- Check memory usage
- Respond to bug reports within 4 hours
- Deploy hotfixes if critical issues found

**Weekly (After Week 4):**
- Review usage metrics
- Tally player feedback
- Plan feature updates
- Minor content additions (new scenarios, characters)

**Monthly:**
- Major feature additions (leaderboards, achievements, etc.)
- Seasonal content drops
- Community highlights (best team compositions, funniest moments)

---

## CLOSING STATEMENT

**Team Chaos** is designed to be the Jackbox.tv of multiplayer character drafting. It's:

- **Simple to learn:** Join a room, type characters, vote on winners, compete
- **Accessible:** No character knowledge needed; any name from any medium works
- **Hilarious:** Absurd scenarios + unexpected plot twists + social voting = memorable moments
- **Quick to play:** 3 rounds × ~4 min ≈ 12 minutes per session (perfect for streams, parties)
- **Replayable:** 100+ scenarios × random plot twists × creative character combinations
- **Social:** Every round has chaos (drafting), discussion (voting), and drama (results)

The core innovation is **free-form simultaneous drafting + democratic voting**, which creates:
- Real-time chaos (everyone typing at once)
- Accessibility (any character works)
- Group engagement (everyone votes on winners)
- Memorable moments (unexpected wins, creative teams, upsets)

This is a game designed to be **played together, watched together, laughed at together.**

---

**Document Version:** 1.1 - TEAM CHAOS (Production-Ready)
**Last Updated:** February 16, 2026  
**Status:** Design Complete - Ready for Development  
**Next Phase:** Phase 1 - Lobby Infrastructure  
**Author:** Kellen Ceriani

**Key Changes from v1.0:**
- Free-form character input (removed hardcoded pool)
- Simplified scoring (voting-based only, no synergy algorithm)
- Removed chat/reactions from MVP (optional post-launch)
- Streamlined Content and Technical sections
- Focused on MVP-critical features only

**License:** All original game design, mechanics, code, and intellectual property owned by Kellen Ceriani.

---
