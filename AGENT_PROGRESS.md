# Poker Trainer — Agent Progress Board
<!--
  SINGLE SOURCE OF TRUTH for all agents.
  When you complete a task: change status → DONE, fill "Output", update "Unblocks".
  When you start a task: change status → IN_PROGRESS, fill "Agent".
  Never modify another agent's IN_PROGRESS task without checking dependencies first.
-->

**Schema:**
```
[ ] TODO  |  [~] IN_PROGRESS  |  [x] DONE  |  [!] BLOCKED (reason)
```

---

## EPIC 0 — Foundation (already exists)
> Reference: `AGENT_MEMORY.md` for full schema and event contract.

| ID | Task | Status | Agent | Output | Unblocks |
|----|------|--------|-------|--------|----------|
| F-01 | GameManager state machine (preflop→showdown) | [x] DONE | Game Loop | `server/game/GameManager.js` | all |
| F-02 | Deck utils (create, shuffle, validate, getUsedCards) | [x] DONE | Hybrid Dealer | `server/game/Deck.js` | HD-01, QA-01 |
| F-03 | Socket.io server + room management | [x] DONE | Real-time | `server/index.js` | RT-01 |
| F-04 | React client scaffold (App, PokerTable, CoachSidebar) | [x] DONE | Frontend | `client/src/` | FE-01 |
| F-05 | Socket event contract defined | [x] DONE | Architect | `AGENT_MEMORY.md § Socket Event Contract` | all |

---

## EPIC 1 — CONFIG_PHASE (Hybrid Hand Pre-Game Setup)
> Goal: Coach can define hole cards / board cards (or leave as `null`) **before** `startGame`.
> Adds `status: 'CONFIG_PHASE'` and `HandConfiguration` to `TableState`.

**Dependency chain:**
```
A-01 (schema) → HD-01 (fill-gaps algo) → GL-01 (startGame upgrade)
                                        → RT-01 (new socket events)
                                        → FE-01 (config UI)
                                        → QA-01 (collision tests)
```

| ID | Task | Depends On | Status | Agent | Output | Unblocks |
|----|------|-----------|--------|-------|--------|----------|
| A-01 | Define `HandConfiguration` schema + extend `TableState` with `config_phase` flag | F-01, F-05 | [x] DONE | Architect | `## HandConfiguration Schema` + `config`/`config_phase` fields added to `## Game State Schema` in `AGENT_MEMORY.md` | HD-01, GL-01, RT-01, FE-01 |
| HD-01 | `generateHand(config)` — Fill-the-Gaps algo: replace `null` slots with collision-free random cards | A-01, F-02 | [x] DONE | Hybrid Dealer | `server/game/HandGenerator.js` | GL-01, QA-01 |
| GL-01 | Upgrade `startGame()` to accept `HandConfiguration`, call `generateHand`, enter `CONFIG_PHASE` flow | HD-01, A-01 | [x] DONE | Game Loop | Updated `server/game/GameManager.js`: `config_phase`/`config`/`_full_board` in `_initState`; new `openConfigPhase()` and `updateHandConfig(config)`; `startGame()` calls `generateHand` when config present (mode≠rng); `_advanceStreet()` reveals board from `_full_board` street-by-street; `getPublicState()` exposes `config_phase` + sanitised `config` + board sliced by phase | RT-01, QA-01 |
| RT-01 | Add Socket events: `open_config_phase`, `update_hand_config`, `start_configured_hand` | A-01, F-03 | [x] DONE | Real-time | Added 3 handlers to `server/index.js`; added events to `### Client → Server` table in `AGENT_MEMORY.md` | FE-01 |
| FE-01 | Pre-Game Config UI: per-player card slots + board slots, each slot = CardPicker or "random" | RT-01, A-01 | [x] DONE | Frontend Architect | `client/src/components/HandConfigPanel.jsx`; 3 emit helpers added to `client/src/hooks/useSocket.js` (`openConfigPhase`, `updateHandConfig`, `startConfiguredHand`) | FE-02 |
| FE-02 | Integrate `HandConfigPanel` into `CoachSidebar` (show only in `waiting` phase) | FE-01 | [x] DONE | Frontend Architect | Updated `client/src/components/CoachSidebar.jsx`: added `HandConfigPanel` import; destructured `config_phase` from `gameState`; in GAME CONTROLS section, when `phase==='WAITING' && config_phase` renders `<HandConfigPanel gameState={gameState} emit={emit} />`; when `phase==='WAITING' && !config_phase` shows "Configure Hand" `btn-gold` button calling `emit.openConfigPhase()`; when `phase!=='WAITING'` shows normal controls unchanged | — |
| QA-01 | Unit tests: `generateHand` with 0/partial/full manual input, collision detection, 52-card exhaustion | HD-01, GL-01 | [x] DONE | QA Validator | `server/game/__tests__/HandGenerator.test.js` (47 tests, 11 describe blocks); `server/game/__tests__/GameManager.config.test.js` (76 tests, 13 describe blocks). Bug found: `startGame()` mutates state before calling `generateHand` — on failure, phase is left as 'preflop' (not rolled back to 'waiting'); undoAction() can recover. | — |

---

## EPIC 2 — Showdown & Winner Resolution
> Goal: At showdown, evaluate hands, declare winner automatically (RNG mode) or let coach pick (manual mode).

**Dependency chain:**
```
A-02 (hand rank schema) → GL-02 (evaluator) → GL-03 (auto-award)
                                              → RT-02 (showdown event)
                                              → FE-03 (showdown UI)
```

| ID | Task | Depends On | Status | Agent | Output | Unblocks |
|----|------|-----------|--------|-------|--------|----------|
| A-02 | Define hand rank schema (ROYAL_FLUSH … HIGH_CARD) and showdown payload | F-05 | [x] DONE | Architect | `## Hand Rank Schema` added to `AGENT_MEMORY.md` | GL-02, FE-03 |
| GL-02 | Hand evaluator: given 2 hole + 5 board → returns rank + kickers | A-02, F-02 | [x] DONE | Game Loop | `server/game/HandEvaluator.js` | GL-03, QA-02 |
| GL-03 | Auto-award at showdown: call evaluator for all active players, split pot on tie | GL-02 | [x] DONE | Game Loop | Updated `server/game/GameManager.js`: added `evaluate`/`compareHands` import; `showdown_result: null` in `_initState`, `startGame`, `resetForNextHand`; new `_resolveShowdown()` method; `_advanceStreet()` calls `_resolveShowdown()` when `nextPhase==='showdown'`; `getPublicState()` exposes `showdown_result` | RT-02 |
| RT-02 | Emit `showdown_result` event with ranked hands + winner(s) | GL-03 | [x] DONE | Real-time | Added secondary `showdown_result` emission in `server/index.js` after `place_bet`, `force_next_street`, and `award_pot` handlers' `broadcastState` calls; emits when `phase === 'showdown' && showdown_result !== null` | FE-03 |
| FE-03 | Showdown UI: reveal all cards, highlight winner, show hand rank labels | RT-02, A-02 | [x] DONE | Frontend Architect | `PlayerSeat.jsx`: added `showdownResult`+`isWinner` props; hand-rank badge (10px pill, gold border/text for winner, muted for others); winner seat gets gold glow `boxShadow`. `PokerTable.jsx`: derives `showdownResult`/`isShowdown`/`winnerIds` from `gameState`; passes `showdownResult`+`isWinner` to each `PlayerSeat`; adds centered showdown banner (winner name(s), hand description, pot awarded, "Next Hand" btn for coach only). | — |
| QA-02 | Unit tests: evaluator correctness (all 9 hand ranks), tie-breaking, split pot | GL-02 | [x] DONE | QA Validator | `server/game/__tests__/HandEvaluator.test.js` | — |

---

## EPIC 3 — Side Pots (All-In Edge Cases)
> Goal: Handle multiple all-in players correctly with side pot calculation.

| ID | Task | Depends On | Status | Agent | Output | Unblocks |
|----|------|-----------|--------|-------|--------|----------|
| A-03 | Define `SidePot[]` schema: `{ amount, eligiblePlayerIds[] }` | EPIC 2 complete | [x] DONE | Architect | `## SidePot Schema` added to `AGENT_MEMORY.md`: `SidePot` object; `total_contributed` added to Player Schema; `side_pots: []` added to Game State Schema; `buildSidePots` algorithm (5-step, with concrete 3-player example); extended `ShowdownResult` for per-pot evaluation; Server→Client note (no new events) | GL-04, QA-03 |
| GL-04 | Side pot calculator: build pots from all-in levels | A-03, GL-03 | [x] DONE | Game Loop | `server/game/SidePotCalculator.js` | GL-05 |
| GL-05 | Integrate side pots into `awardPot` + `_advanceStreet` | GL-04 | [x] DONE | Game Loop | Updated `GameManager.js`: added `buildSidePots` import; `side_pots: []` in `_initState`/`startGame`/`resetForNextHand`; `total_contributed: 0` in `addPlayer`/`startGame`/`resetForNextHand`; `_postBlind` + `placeBet` (call/raise) increment `total_contributed`; `_resolveShowdown` rewritten with side-pot path (multi-pot award per eligible set) and single-pot fallback; `side_pots` exposed in `getPublicState()` | RT-03 |
| RT-03 | Broadcast side pot breakdown in `game_state` | GL-05 | [x] DONE | Real-time | No code change needed — `side_pots` array is already included in `GameManager.getPublicState()` return value and flows through the existing `broadcastState` → `game_state` emission automatically. | FE-04 |
| FE-04 | Render side pot chips on table | RT-03 | [x] DONE | Frontend Architect | Updated `client/src/components/PokerTable.jsx`: added side pot breakdown below main pot chip — renders per-pot amount + eligible player names (only when `side_pots.length > 0`) | — |
| QA-03 | Tests: 2/3-way all-in, partial coverage, side pot distribution | GL-05 | [x] DONE | QA Validator | `server/game/__tests__/SidePot.test.js` (20 tests, 6 suites: no-split cases, 2-player all-in, 3-player all-in, folded players, edge cases, hasFolded detection) | — |

---

## EPIC 4 — Multi-Hand Session & Statistics
> Goal: Track hand history across multiple hands; show coach stats per player.

| ID | Task | Depends On | Status | Agent | Output | Unblocks |
|----|------|-----------|--------|-------|--------|----------|
| A-04 | Define `SessionStats` schema: hands played, VPIP, PFR, win%, net chips | EPIC 2 complete | [x] DONE | Architect | Added `## SessionStats Schema` to `AGENT_MEMORY.md`: `SessionStats` per-player object (handsPlayed, handsWon, netChips, VPIP, PFR, WTSD, WSD); `SessionState` top-level object; 6 calculation rules; `session_stats` Server→Client socket event added | GL-06, FE-05 |
| GL-06 | `SessionManager.js`: wrap GameManager, accumulate stats per player across hands | A-04, GL-03 | [x] DONE | Game Loop | `server/game/SessionManager.js`: wraps GameManager; `startGame` captures dealt-in players + initialises preflop tracking; `trackPreflopAction` (call→VPIP, raise→VPIP+PFR); `endHand` commits VPIP/PFR/WTSD/WSD/handsWon/netChips from final state; `resetForNextHand` calls endHand then delegates; `getSessionStats()` → SessionState; all GM methods proxied; `state` getter | RT-04 |
| RT-04 | Emit `session_stats` after each hand ends | GL-06 | [x] DONE | Real-time | Updated server/index.js: SessionManager swap + session_stats emit after reset_hand | FE-05 |
| FE-05 | Stats panel in CoachSidebar: VPIP/PFR table per player | RT-04 | [x] DONE | Frontend | Added `sessionStats` state + `session_stats` listener to `useSocket.js`; passed `sessionStats` prop via `App.jsx` to `CoachSidebar`; added SECTION 6 "SESSION STATS" panel in `CoachSidebar.jsx` with per-player cards showing hands played/won, net chips (green/red), VPIP/PFR/WTSD/WSD % grid; also wired missing emit helpers (`openConfigPhase`/`updateHandConfig`/`startConfiguredHand`) into `App.jsx` emit bundle | — |
| QA-04 | Tests: stat accumulation across 5 hands, player leave/rejoin | GL-06 | [x] DONE | QA Validator | `server/game/__tests__/SessionManager.test.js` | — |

---

## EPIC 5 — QA Stress Suite
> Goal: Full integration test sweep before any "release".

| ID | Task | Depends On | Status | Agent | Output | Unblocks |
|----|------|-----------|--------|-------|--------|----------|
| QA-05 | Stress: 1000 random hands end-to-end, no crash, valid state at each step | EPIC 1–3 complete | [x] DONE | QA Validator | `server/game/__tests__/stress.test.js` | — |
| QA-06 | Edge: heads-up (2 players), 9-player table, coach-only room | QA-05 | [x] DONE | QA Validator | `server/game/__tests__/edge_cases.test.js` | — |
| QA-07 | Socket: player disconnects mid-hand, reconnects, undo after reconnect | RT-01, RT-02 | [x] DONE | QA Validator | `server/game/__tests__/disconnect.test.js` | — |

---

## EPIC 6 — Database Layer
> Goal: Persist hand history, player actions, and session stats to SQLite. Expose REST API for history queries.

| ID | Task | Depends On | Status | Agent | Output | Unblocks |
|----|------|-----------|--------|-------|--------|----------|
| DB-01 | Install `better-sqlite3`; create `server/db/Database.js` (singleton + schema) and `server/db/HandLogger.js` (full logging API) | EPIC 4 | [x] DONE | DB Layer | `server/db/Database.js`, `server/db/HandLogger.js` | DB-02, DB-04 |
| DB-02 | Wire HandLogger into `server/index.js`: log hand start/actions/end; add REST endpoints; graceful shutdown | DB-01 | [x] DONE | Real-time | Updated `server/index.js`: HandLogger import, activeHands Map, startHand on start_game/start_configured_hand, recordAction on place_bet, endHand on reset_hand, SIGINT/SIGTERM handlers, 4 REST routes | DB-03 |
| DB-03 | Client history hook + CoachSidebar Section 7 HISTORY panel | DB-02 | [x] DONE | Frontend | `client/src/hooks/useHistory.js`, Section 7 in `CoachSidebar.jsx` with collapsible history list + expandable hand detail view | — |
| DB-04 | `server/db/__tests__/HandLogger.test.js` — 9 suites, in-memory SQLite mock | DB-01 | [x] DONE | QA Validator | 43 tests, all passing | — |

---

## EPIC 7 — Coach Hierarchy, Sync Resilience & Data Quality
> Goal: Enforce single-coach rule, freeze timer on pause/disconnect, protect against late-action races, persist manual-scenario flag.

| ID | Task | Depends On | Status | Agent | Output | Unblocks |
|----|------|-----------|--------|-------|--------|----------|
| E7-01 | Single coach enforcement: second coach → spectator; spectator gets view-only game_state; reconnect validates isCoach flag | EPIC 6 | [x] DONE | Real-time | `server/index.js` join_room handler | — |
| E7-02 | Timer pause/resume with saved remainder: `clearActionTimer({saving})` + `startActionTimer({resumeRemaining})`; `toggle_pause` uses both | EPIC 6 | [x] DONE | Real-time | `server/index.js` timer functions + toggle_pause | — |
| E7-03 | Ghost-coach auto-pause: coach disconnect → `gm.state.paused=true`, save timer, emit `coach_disconnected` | E7-02 | [x] DONE | Real-time | `server/index.js` disconnect handler | — |
| E7-04 | Late-action race: cancel timer before placeBet; capture streetBeforeBet; emit `sync_error` for turn/pause rejections | E7-02 | [x] DONE | Real-time | `server/index.js` place_bet handler | — |
| E7-05 | Showdown undo: save action snapshot BEFORE phase transition → undoAction restores river state correctly | EPIC 2 | [x] DONE | Game Loop | `server/game/GameManager.js` `_advanceStreet()` | — |
| E7-06 | adjustStack validation: reject stack below total_bet_this_round during active betting phases | EPIC 1 | [x] DONE | Game Loop | `server/game/GameManager.js` `adjustStack()` | — |
| E7-07 | generateHand returns `{ error }` instead of throwing; supports snake_case config + string player IDs; dual return format | EPIC 1 | [x] DONE | Game Loop | `server/game/HandGenerator.js` | — |
| E7-08 | `is_manual_scenario` DB column: Database.js schema + migration; HandLogger.recordAction API; index.js wiring | DB-01 | [x] DONE | DB Layer | `server/db/Database.js`, `server/db/HandLogger.js`, `server/index.js` | — |
| E7-09 | QA: update HandGenerator/config/qa_checklist tests to match new APIs; 610/610 passing | E7-05–E7-08 | [x] DONE | QA Validator | 610 tests passing in 12 suites | — |

---

## Epic 9 — Frontend UI Sync (2026-03-14)

| Task | Description | Status |
|------|-------------|--------|
| E9-01 | useSocket.js: action_timer, coach_disconnected, sync_error, playlist_state listeners | ✅ DONE |
| E9-02 | useSocket.js: isSpectator state + room_joined handler update | ✅ DONE |
| E9-03 | useSocket.js: 8 new playlist/scenario emit helpers | ✅ DONE |
| E9-04 | BettingControls.jsx: button spam protection (pendingBet state + disabled on click) | ✅ DONE |
| E9-05 | BettingControls.jsx: raise input validation (disable RAISE if amount out of range) | ✅ DONE |
| E9-06 | PlayerSeat.jsx: coach 50% opacity on opponent hole cards | ✅ DONE |
| E9-07 | PokerTable.jsx: POV seat rotation (myId always at bottom) | ✅ DONE |
| E9-08 | PokerTable.jsx: coach_disconnected overlay | ✅ DONE |
| E9-09 | PokerTable.jsx: action timer bar with freeze visual when paused | ✅ DONE |
| E9-10 | CoachSidebar.jsx: Live Hand Tags section (8 quick-tag buttons) | ✅ DONE |
| E9-11 | CoachSidebar.jsx: Playlist Manager section (create/activate/delete playlists) | ✅ DONE |
| E9-12 | CoachSidebar.jsx: Scenario Loader section (searchable, load + add-to-playlist) | ✅ DONE |
| E9-13 | Vitest + RTL test setup for client | ✅ DONE |
| E9-14 | UI_EdgeCases.test.jsx: 4 test suites (Spectator View, Reconnection Sync, Illegal Bet, Coach Opacity) | ✅ DONE |
| E9-15 | GETTING_STARTED.md created | ✅ DONE |

---

## Epic 10 — Cloud Deployment & Single-Service Architecture (2026-03-14)

| Task | Description | Status |
|------|-------------|--------|
| E10-01 | server/db/Database.js: DATABASE_PATH env var (defaults to local sqlite path) | ✅ DONE |
| E10-02 | server/index.js: express.static serving client/dist + catch-all SPA route | ✅ DONE |
| E10-03 | server/index.js: path + fs imports for static file detection | ✅ DONE |
| E10-04 | client/src/hooks/useSocket.js: relative URL in production (empty string) | ✅ DONE |
| E10-05 | Root package.json: install-all, build, start, test scripts | ✅ DONE |
| E10-06 | .gitignore: node_modules, client/dist, *.sqlite, .env excluded | ✅ DONE |
| E10-07 | Dockerfile: multi-stage build (builder + production stages) | ✅ DONE |
| E10-08 | README.md: one-click deployment guide for Render/Railway/Fly.io | ✅ DONE |

---

## Epic 11 — Persistent Player Identity (2026-03-14)

> Goal: Replace ephemeral `socket.id` with a stable UUID in all DB writes so a student's hand history is correctly linked across sessions.

| Task | Description | Status |
|------|-------------|--------|
| E11-01 | `useSocket.js`: `getOrCreateStableId()` — reads/writes `poker_trainer_player_id` key in `localStorage`; included as `stableId` in every `join_room` emit | ✅ DONE |
| E11-02 | `server/index.js`: accept `stableId` in `join_room`; maintain `stableIdMap` (socketId→stableId); store on `socket.data.stableId`; call `HandLogger.upsertPlayerIdentity` on join; clean up on disconnect | ✅ DONE |
| E11-03 | `server/index.js`: both `startHand` player arrays now map `p.id → stableIdMap.get(p.id) || p.id`; `recordAction` uses `socket.data.stableId || socket.id` | ✅ DONE |
| E11-04 | `server/db/Database.js`: add `player_identities (stable_id PK, last_known_name, last_seen)` table + index on `last_known_name` | ✅ DONE |
| E11-05 | `server/db/HandLogger.js`: `upsertPlayerIdentity(stableId, name)` + `getPlayerStats(stableId)` (career cross-session aggregates) | ✅ DONE |
| E11-06 | `server/index.js`: new REST endpoint `GET /api/players/:stableId/stats` | ✅ DONE |
| E11-07 | `server/py-backend/` removed — experimental Python server was never imported by JS; dead code deleted | ✅ DONE |

---

## Agent Log
<!-- Each agent appends a line here when completing a task. Format:
[YYYY-MM-DD HH:MM] AGENT_NAME completed TASK_ID — one-line summary
-->

| Timestamp | Agent | Task | Summary |
|-----------|-------|------|---------|
| 2026-03-12 | Architect | F-01…F-05 | Baseline state machine, deck utils, socket layer, React client, event contract |
| 2026-03-12 | Architect | A-01 | Defined `HandConfiguration` schema (mode/hole_cards/board, null=random, validation rules, TableState integration); added `config` + `config_phase` to Game State Schema in `AGENT_MEMORY.md` |
| 2026-03-12 | Hybrid Dealer | HD-01 | Implemented Fill-the-Gaps algo in `server/game/HandGenerator.js`: validates specified cards, deduplicates, builds excluded shuffled deck, fills null slots collision-free; 8 Jest tests in `server/game/__tests__/HandGenerator.test.js` covering full-RNG, partial-manual, full-manual, duplicate-card error, and invalid-card error |
| 2026-03-12 | QA Validator | QA baseline | GameManager unit tests written |
| 2026-03-12 | Real-time | RT-01 | Added `open_config_phase`, `update_hand_config`, `start_configured_hand` socket event handlers to `server/index.js`; updated `AGENT_MEMORY.md` event contract table |
| 2026-03-12 | Game Loop | GL-01 | Upgraded `GameManager.js`: CONFIG_PHASE support via `openConfigPhase()`/`updateHandConfig()`; `startGame()` calls `generateHand` for manual/hybrid configs, stores full board in `_full_board`, reveals street-by-street in `_advanceStreet()`; `getPublicState()` exposes `config_phase` + sanitised `config` + phase-sliced board |
| 2026-03-12 | QA Validator | QA-01 | Replaced HandGenerator.test.js (47 tests, 11 suites) + created GameManager.config.test.js (76 tests, 13 suites). Covers all 10 required HandGenerator scenarios and all 10 required GameManager config integration scenarios. Bug documented: startGame() mutates state (phase→preflop, blinds posted) before generateHand() is called, so on error the state is not rolled back — undoAction() is the recovery path. |
| 2026-03-12 | Frontend Architect | FE-01 | Created `HandConfigPanel.jsx`: mode selector (rng/manual/hybrid), per-player 2-slot hole card rows, 5-slot board section, inline CardPicker modal with usedCards deduplication, Start Hand + Clear Config actions; added `openConfigPhase`/`updateHandConfig`/`startConfiguredHand` emit helpers to `useSocket.js` |
| 2026-03-12 | Frontend Architect | FE-02 | Integrated `HandConfigPanel` into `CoachSidebar`: import added; `config_phase` destructured from `gameState`; GAME CONTROLS section conditionally renders "Configure Hand" btn-gold button (waiting, no config) → `<HandConfigPanel>` (waiting, config_phase true) → normal controls (any other phase); no existing controls removed |
| 2026-03-12 | Architect | A-02 | Defined `## Hand Rank Schema` in `AGENT_MEMORY.md`: `HAND_RANKS` constants (0–9), `HandResult` object (rank/rankName/bestFive/kickers/description), `ShowdownResult` object (winners/allHands/potAwarded/splitPot), 4-step comparison rules (rank → bestFive card-by-card → ace-low straight → split pot); extended `## Game State Schema` with `showdown_result` field; added `showdown_result` to Server → Client socket event table |
| 2026-03-12 | Game Loop | GL-02 | Created `server/game/HandEvaluator.js`: pure `evaluate(holeCards, boardCards)` → HandResult; `evaluateFive(cards)` checks all 10 hand ranks (Royal Flush→High Card) including A-low wheel straight; C(7,5)=21 combos enumerated; `compareHands(a,b)` for rank+kicker tiebreak; `HAND_RANKS` constants exported; kickers field correct per hand type; description strings match spec format |
| 2026-03-12 | Game Loop | GL-03 | Integrated HandEvaluator into GameManager: added `_resolveShowdown()` — evaluates all active players' hands, finds winner(s) via `compareHands`, handles split pot (floor div, remainder to lowest seat), builds `ShowdownResult`, sets `winner`/`winner_name` for backwards compat; `_advanceStreet()` calls `_resolveShowdown()` at showdown; `showdown_result` added to `_initState`, `startGame`, `resetForNextHand`, and `getPublicState()`; fold-to-one-winner path in `placeBet` unchanged (no evaluator call) |
| 2026-03-12 | QA Validator | QA-02 | Created `server/game/__tests__/HandEvaluator.test.js`: 17 describe blocks, ~80 tests covering all 10 hand ranks, wheel straight/SF high-card ordering, compareHands (rank order, kicker tiebreak, equal hands), card-count variants (5/6/7 cards, board-only best hand), structural invariants (bestFive length=5, no duplicates, kickers subset of bestFive, cards from hole+board), description format checks. Bugs found: (1) description uses space not hyphen for SF/Flush/Straight (code: "Nine high", schema: "Nine-high"); (2) Royal Flush kickers returns [AceCard] instead of [] per schema spec. |
| 2026-03-12 | Real-time | RT-02 | Added secondary `showdown_result` socket event emission to `server/index.js` in 3 handlers: `place_bet` (line ~152), `force_next_street` (line ~246), `award_pot` (line ~267); pattern: get freshState via `gm.getPublicState`, emit `showdown_result` to room when `phase === 'showdown' && showdown_result` is truthy; `showdown_result` row already present in AGENT_MEMORY.md Server→Client table (verified) |
| 2026-03-12 | Frontend Architect | FE-03 | Showdown UI: PlayerSeat now accepts `showdownResult`+`isWinner` props — renders per-player hand-rank badge (pill, gold border+text for winner, muted for losers) and gold glow on winner seat card; PokerTable derives showdown state from `gameState.showdown_result`, passes props to each PlayerSeat, and renders a centered gold-bordered banner showing winner name(s)/hand description/pot awarded with "Next Hand" btn (coach only); useSocket.js unchanged — `showdown_result` already flows via `game_state` event |
| 2026-03-13 | Architect | A-03 | Defined `## SidePot Schema` in `AGENT_MEMORY.md`: `SidePot` object (`amount`, `eligiblePlayerIds`); added `total_contributed` to Player Schema; added `side_pots: []` to Game State Schema; documented side-pot formation conditions, 5-step `buildSidePots` algorithm with 3-player worked example, per-pot `_resolveShowdown` evaluation logic, extended `ShowdownResult` with `sidePotResults` + per-winner `potAwarded`; confirmed no new socket events needed |
| 2026-03-13 | Game Loop | GL-04 | Created `server/game/SidePotCalculator.js`: pure `buildSidePots(players)` → `SidePot[]`; guards for <2 contributors and no all-in players (return []); collects all-in breakpoints + max contribution level; walks sorted levels computing per-level amount via min-clamping formula over ALL players; eligible = is_active===true && total_contributed>=L; folded players' chips count toward amount but are excluded from eligiblePlayerIds; returns ordered SidePot[] smallest-first |
| 2026-03-13 | QA Validator | QA-03 | Created `server/game/__tests__/SidePot.test.js`: 20 tests, 6 suites (no-split, 2-player all-in, 3-player all-in, folded players, edge cases, hasFolded detection). All verified by manual logic trace. Bug documented: `hasFolded()` requires BOTH `is_active===false` AND `action==='folded'`; a player with `is_active=false` but `action='all-in'` remains eligible — callers must set the `action` field correctly. |
| 2026-03-13 | Real-time | RT-03 | side_pots already flows through broadcastState via getPublicState() — no new socket events or handler changes needed |
| 2026-03-13 | Game Loop | GL-05 | Integrated buildSidePots into GameManager: import added; side_pots/total_contributed fields added to state and player; _postBlind + placeBet (call/raise) increment total_contributed; _resolveShowdown rewritten with multi-pot path (per-pot eligible evaluation + award) and single-pot fallback; side_pots exposed in getPublicState; all reset paths updated |
| 2026-03-13 | QA Validator | QA-03 integration | Created GameManager.sidepots.test.js: 30 tests, 5 suites — no-all-in single pot, 2-player all-in cascade, 3-player cascade, total_contributed tracking via placeBet, getPublicState side_pots exposure |
| 2026-03-13 | Frontend Architect | FE-04 | Added side pot breakdown below main pot in PokerTable: per-pot amount + eligible names, only visible when all-in side pots exist |
| 2026-03-13 | Architect | A-04 | Defined SessionStats schema: per-player VPIP/PFR/WTSD/WSD stats, SessionState container, calculation rules, session_stats socket event |
| 2026-03-14 | Bug Fix | — | Fixed HandEvaluator description format: space→hyphen for SF/Flush/Straight; verified Royal Flush kickers=[] |
| 2026-03-14 | Real-time | RT-04 | Swapped GameManager→SessionManager in index.js; added session_stats emit after reset_hand |
| 2026-03-14 | Frontend | FE-05 | Added session_stats socket listener + sessionStats state to useSocket.js; passed sessionStats prop through App.jsx to CoachSidebar; added SECTION 6 SESSION STATS panel in CoachSidebar.jsx with per-player cards (hands played/won, net chips, VPIP/PFR/WTSD/WSD % grid, dark theme, only shown when stats available); fixed missing openConfigPhase/updateHandConfig/startConfiguredHand in App.jsx emit bundle |
| 2026-03-14 | Error Auditor | ISS audit | Created ISSUES_REGISTRY.md with 33 issues documented (2 critical, 8 high, 15 medium, 8 low) |
| 2026-03-14 | QA Validator | QA-04 | Created `server/game/__tests__/SessionManager.test.js`: 14 describe blocks, ~60 tests covering construction, single-hand lifecycle, VPIP/PFR tracking, fold-to-one path, showdown WTSD/WSD, ratios across 3 hands, netChips, multi-hand accumulation, coach-skipping, getSessionStats shape, proxy delegation, startGame error handling, preflop tracking clear |
| 2026-03-14 | QA Validator | QA-05 | Created `server/game/__tests__/stress.test.js`: 4 describe blocks — 1000 random hands no-crash, chip conservation across 50 hands, dealer rotation check across 9 hands, board card count per street |
| 2026-03-14 | QA Validator | QA-06 | Created `server/game/__tests__/edge_cases.test.js`: 5 describe blocks — heads-up blind/dealer logic (11 tests), coach room (7 tests), 9-player max (7 tests), all-in heads-up + side pots (6 tests), forceNextStreet board/showdown edge cases (8 tests) |
| 2026-03-14 | QA Validator | QA-07 | Created `server/game/__tests__/disconnect.test.js`: 6 describe blocks — disconnect before game (7 tests), disconnect mid-hand (6 tests), disconnect then undo (4 tests), active player count after disconnect (5 tests), all players disconnect (6 tests), reconnect simulation (8 tests) |
| 2026-03-14 | Bug Fix | ISS-02,07,17 | Fixed join flow: removed /auth preflight, fixed isCoach field in joinRoom emit, fixed socket port 8001→3001 |
| 2026-03-14 | Bug Fix | ISS-04,10,23 | Fixed SF kickers to [], fixed BettingControls prop mismatch, fixed winner name lookup in PokerTable |
| 2026-03-14 | Bug Fix | ISS-18–22 | Fixed CoachSidebar: p.folded→p.is_active, last_action→action, bet→current_bet, PhaseBadge uppercase, is_paused→paused |
| 2026-03-14 | DB Layer | DB-01 | Installed better-sqlite3 + uuid; created server/db/Database.js (WAL schema init) and server/db/HandLogger.js (startHand/recordAction/endHand/markIncomplete/query API) |
| 2026-03-14 | Real-time | DB-02 | Wired HandLogger into index.js (start_game, place_bet, reset_hand, start_configured_hand); added /api/hands, /api/hands/:id, /api/sessions endpoints; SIGINT/SIGTERM graceful shutdown |
| 2026-03-14 | Frontend | DB-03 | Created useHistory.js hook; added HISTORY panel (Section 7) to CoachSidebar: last 10 hands list, phase tags, expandable detail view (board/players/actions), auto-refresh on hand end; fixed sidebarOpen/onToggle wiring in App.jsx |
| 2026-03-14 | QA Validator | DB-04 | Created HandLogger.test.js: 9 suites, 43 tests covering startHand, recordAction, endHand, markIncomplete, getHands (limit/offset/filter), getHandDetail (board/hole_cards JSON parse), getSessionStats, full integration flow |
| 2026-03-14 | Bug Fix | ISS-05 | Confirmed startGame() now validates config before mutating state; phase stays 'waiting' on error; updated tests from "BUG expected" to correct assertions |
| 2026-03-14 | Bug Fix | SidePot | Fixed buildSidePots: added null/undefined guard; added single-pot-covers-all-active-players → return [] guard; 568/568 tests passing |
| 2026-03-14 | QA Validator | Test cleanup | Fixed HandEvaluator Two Pair test (board formed accidental Broadway straight); fixed GameManager rollbackStreet pot assertion; all test suite failures resolved |
| 2026-03-14 | Real-time | Epic 7 (partial) | Implemented remaining 5-category edge case spec in index.js + GameManager.js: (1) Single coach enforcement — second coach joins as spectator; coach reconnect validation; (2) Showdown undo — snapshot saved before phase transition so undoAction restores to river state; (3) Deck/scenario validation moved to generateHand (returns {error} not throws); updateHandConfig simplified to store-only; (4) toggle_pause uses saving/resumeRemaining timer flags; (5) place_bet cancels timer before delegating, captures pre-bet street, emits sync_error for race conditions; (6) disconnect: ghost-coach auto-pauses game + saves timer; spectator disconnect is silent; (7) HandLogger: is_manual_scenario column added (schema + ALTER TABLE migration); recordAction API updated; (8) start_configured_hand marks activeHands with isManualScenario:true; (9) qa_checklist.test.js + HandGenerator.test.js + GameManager.config.test.js updated to match new APIs; 610/610 tests passing |
| 2026-03-14 | Epic 9 | — | Epic 9 (Frontend UI Sync) implemented via parallel agents. All 14 tasks complete. Key changes: useSocket extended with 6 new state values + 8 emit helpers; BettingControls gains spam protection; PlayerSeat implements 50% opacity for coach view of opponent cards; PokerTable gains POV rotation, coach-offline overlay, and action timer bar; CoachSidebar gains Live Tags, Playlist Manager, and Scenario Loader sections; Vitest + RTL test suite added to client with 8 tests across 4 suites. |
| 2026-03-14 | Epic 10 | Cloud Deployment complete. Single-port architecture: Express serves React build in production. DATABASE_PATH env var for persistent SQLite. Multi-stage Dockerfile. Root package.json with unified scripts. README with Render/Railway/Fly.io deployment guides. |
| 2026-03-14 | Epic 11 | Persistent player identity: localStorage UUID replaces socket.id in all DB writes. stableIdMap on server maps socketId→stableId. player_identities table upserted on every join. Career stats endpoint GET /api/players/:stableId/stats. Python backend (server/py-backend/) deleted. |

---

## Blocked Tasks Registry
<!-- If a task is blocked, document it here so other agents know -->

| Task ID | Blocked By | Description | Date |
|---------|-----------|-------------|------|
| — | — | — | — |

---

## Decisions Log
<!-- Architectural decisions that agents should not re-litigate -->

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-12 | `null` in `HandConfiguration` slots means "fill randomly" | Simplest signal; avoids separate `mode` per slot |
| 2026-03-12 | Undo stack max 30 actions, street stack max 5 | Memory bound; coach use-case doesn't need deeper history |
| 2026-03-12 | Coaches get seat = -1, never participate in betting | Simplifies all active-player filters |
| 2026-03-12 | Hand evaluator lives in `server/game/HandEvaluator.js`, never imported by client | Logic stays server-side; client only renders what server sends |
