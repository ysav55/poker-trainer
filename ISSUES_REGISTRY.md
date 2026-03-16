# Issues Registry — Poker Trainer

**Last updated:** 2026-03-16 — B201 in-hand toggle fix. 951 tests passing.

## Severity Legend
- 🔴 CRITICAL — crash or incorrect game outcome
- 🟠 HIGH — visible user-facing bug or broken feature path
- 🟡 MEDIUM — inconsistency or tech debt likely to cause future issues
- 🟢 LOW — minor, cosmetic, or documentation gap

---

## Open Issues

*All known issues resolved as of 2026-03-16.*

---

## Resolved Issues

| ID | Sev | Description | Fixed |
|----|-----|-------------|-------|
| ISS-01 | 🔴 | `GameManager` used directly instead of `SessionManager` — session stats never tracked | Epic 4 |
| ISS-02 | 🔴 | `/auth` preflight fetch in `App.jsx` — endpoint didn't exist, blocked all joins | Epic 7 |
| ISS-03 | 🟠 | HandEvaluator description used space instead of hyphen (`"Nine high"` → `"Nine-high"`) | Epic 2 |
| ISS-04 | 🟠 | Royal Flush `kickers` returned `[AceCard]` instead of `[]` | Epic 2 |
| ISS-05 | 🟠 | `startGame()` mutated state before calling `generateHand` — on error, phase stuck as `'preflop'` | Epic 7 |
| ISS-07 | 🟠 | `isCoach` field missing from `joinRoom` emit | Epic 7 |
| ISS-10 | 🟠 | BettingControls prop mismatch | Epic 9 |
| ISS-12 | 🟡 | `forceNextStreet()` + `_advanceStreet()` each called `_saveSnapshot('street')` — double snapshot per forced advance | Epic 16 |
| ISS-13 | 🟡 | Same root cause as ISS-12 — rolling back after forced advance restored an intermediate state | Epic 16 |
| ISS-14 | 🟡 | `_resolveShowdown()` side-pot path: `handMap[p.id]` could be `undefined` for non-active eligible player IDs | Epic 16 |
| ISS-15 | 🟡 | `setBlindLevels()` rejected valid structures like 10/15 (`bb < sb * 2`); relaxed to `bb > sb` | Epic 16 |
| ISS-16 | 🟡 | `_saveSnapshot('action')` called before action validation — failed actions polluted the undo stack | Epic 16 |
| ISS-17 | 🟠 | Socket connected to wrong port (8001 instead of 3001) | Epic 7 |
| ISS-18 | 🟡 | CoachSidebar used `p.folded` instead of `!p.is_active` | Epic 9 |
| ISS-19 | 🟡 | CoachSidebar used `last_action` instead of `action` | Epic 9 |
| ISS-20 | 🟡 | CoachSidebar used `bet` instead of `current_bet` | Epic 9 |
| ISS-21 | 🟢 | Phase badge showed lowercase phase names | Epic 9 |
| ISS-22 | 🟡 | CoachSidebar used `is_paused` instead of `paused` | Epic 9 |
| ISS-23 | 🟠 | Winner name lookup broken in PokerTable | Epic 7 |
| ISS-24 | 🟡 | `mainPot` in `PokerTable.jsx` — dead code, logically incorrect | Epic 16 |
| ISS-28 | 🟢 | `reset_hand` handler didn't check `result.error` | Epic 16 |
| ISS-29 | 🟢 | `open_config_phase` handler didn't check `result.error` | Epic 16 |
| ISS-31 | 🟢 | `canRaise` used redundant `> \|\| >=` logic | Epic 16 |
| ISS-32 | 🟢 | `PlayerSeat.jsx` checked non-existent `player.is_folded` field | Epic 16 |
| ISS-41 | 🟡 | Ghost player seat showed as "Occupied" with no UI indicator during 60 s TTL | Epic 14 |
| ISS-51 | 🟡 | WALK detection false positive: BB is always posted but was counted as a raise | Epic 16 |
| ISS-52 | 🟡 | `load_hand_scenario` silently dropped extra hole cards when player count mismatched | Epic 16 |
| ISS-53 | 🟡 | Playlist auto-advance silently skipped hands deleted from DB | Epic 16 |
| ISS-54 | 🟡 | `_saveSnapshot()` stripped `playlist_mode.hands`, losing playlist state after undo | Epic 16 |
| ISS-61 | 🟡 | Live Hand Tags were local-only; lost on page refresh | Epic 16 |
| ISS-62 | 🟡 | `coachDisconnected` flag cleared on `connect` event instead of `game_state` — overlay could clear prematurely | Epic 14 |
| ISS-63 | 🟡 | Catch-all `app.get('*')` returned `index.html` for non-existent API routes instead of 404 JSON | Epic 16 |
| ISS-66 | 🔴 | `player_id` in DB was ephemeral `socket.id` — same student treated as new entity on every reconnect | Epic 11 |
| GAP-2  | 🟠 | VPIP/PFR saved from player's last action (e.g. river fold) instead of preflop action — stats were wrong | DB fix 2026-03-15 |
| GAP-3  | 🟡 | WTSD/WSD never persisted to DB; career stats couldn't show these metrics | DB fix 2026-03-15 |
| GAP-4  | 🟢 | `mistake_tags` saved but never returned in any query response | DB fix 2026-03-15 |
| GAP-5  | 🟡 | No index on `hand_players.player_id` — full table scan on every player history load | DB fix 2026-03-15 |
| GAP-6  | 🟢 | `display_name` set at registration but never synced after name changes | DB fix 2026-03-15 |
| GAP-7  | 🟡 | WHALE_POT tag hardcoded `bb=20` — wrong for tables with different blind levels | DB fix 2026-03-15 |
| ISS-50 | 🟡 | `analyzeAndTagHand` included reverted actions — false-positive pattern detection after Undo | Fixed 2026-03-15 (filter `is_reverted=1` already implemented in extended analyzer) |
| WF-01 | 🟡 | `GameManager.js` `replay_mode` not reset in `resetForNextHand()` — `branched=true` persisted across hands, permanently blocking future `branchFromReplay()` calls | Fixed 2026-03-15 |
| WF-02 | 🟠 | `GameManager.js` `_saveSnapshot()` captured `pre_branch_snapshot` (full deep copy) inside history entries — exponential memory growth across undo stack | Fixed 2026-03-15 (strip `pre_branch_snapshot: null` in snapshot, same pattern as `playlist_mode.hands`) |
| WF-03 | 🔴 | `GameManager.js` `startGame()` lacked phase guard — callable during `phase='replay'`, would destroy replay state and deal a new hand mid-replay | Fixed 2026-03-15 |
| WF-06 | 🟡 | `GameManager.js` `branchFromReplay()` did not reset `current_turn = null` — branched state started with stale `current_turn` from replayed hand | Fixed 2026-03-15 |
| WF-10 | 🟡 | `server/index.js` `load_replay` handler did not block when `playlist_mode.active` — loading a replay while a playlist was active corrupted playlist state | Fixed 2026-03-15 |
| DB-02 | 🔴 | `server/index.js` `bigBlind` never passed to `HandLogger.startHand()` — all hands stored with `big_blind=0`; `WHALE_POT` tag (threshold `150 × big_blind`) never fired | Fixed 2026-03-15 |
| DB-06 | 🟡 | `server/index.js` `analyzeAndTagHand` errors swallowed silently — tagging failures were invisible in logs, making diagnosis impossible | Fixed 2026-03-15 (console.error added) |
| EC-01 | 🔴 | `server/reports/SessionReport.js` Player names interpolated raw into HTML — stored XSS via crafted display name. Missing CSP header on report endpoint. | Fixed 2026-03-15 (`esc()` helper + CSP header) |
| EC-09 | 🟡 | `server/index.js` `pausedTimerRemainders` not deleted on `reset_hand` — paused timer remainder from previous hand bled into next hand's action timer duration | Fixed 2026-03-15 |
| EC-22 | 🟠 | `server/index.js` Action timer callback only checked `state.paused` before auto-folding — if phase changed to `showdown`/`waiting` after timer started, auto-fold still executed on wrong phase | Fixed 2026-03-15 (check `phase` + `current_turn` before acting) |
| FE-07 | 🔴 | `client/src/App.jsx` All 7 replay emit helpers (`loadReplay`, `replayStepFwd`, etc.) implemented in `useSocket.js` but never added to the `emit` bundle — buttons silently did nothing | Fixed 2026-03-15 |
| SIM-01 | 🔴 | `GameManager.js` `_advanceStreet()` did not set `current_turn = null` when all remaining active players are all-in — stale `current_turn` pointed to a player with `is_active=false` (the last folder), causing subsequent `place_bet` calls to return `Invalid player state` and hang the game | Fixed 2026-03-15 (add `this.state.current_turn = null` at end of all-in loop) |
| FE-10 | 🔴 | `client/src/components/BoardCards.jsx` `getRevealedSlots()` had no case for `'replay'` phase — fell through to `default: return []`, making all board cards invisible during replay | Fixed 2026-03-15 |
| FE-11 | 🟡 | `client/src/components/PokerTable.jsx` Phase label rendered "replay" in gold text alongside the REPLAY badge — duplicate conflicting indicators | Fixed 2026-03-15 (exclude `replay` from phase label condition) |
| EC-23 | 🔴 | `server/index.js` `set_mode` handler had no phase guard — callable mid-hand, corrupting betting state machine. Added `ACTIVE_PHASES` guard that rejects with `sync_error` when phase is not `waiting`/`config`. | Fixed 2026-03-15 |
| EC-24 | 🟠 | `server/index.js` Game-logic rejections used hard `error` event instead of soft `sync_error`. Added `sendSyncError()` helper; replaced all game-state-rejection `sendError()` calls in `undo_action`, `rollback_street`, `award_pot`, `start_configured_hand`, all replay handlers. | Fixed 2026-03-15 |
| EC-25 | 🟠 | `server/index.js` `start_configured_hand` called `gm.startGame()` without checking `config_phase` — callable at any time. Added `if (!gm.state.config_phase)` guard. | Fixed 2026-03-15 |
| EC-26 | 🟠 | `server/index.js` `undo_action` allowed during `phase='waiting'` — popped previous hand's history, corrupting phase to `preflop` with no deal. Added `phase === 'waiting'` guard. | Fixed 2026-03-15 |
| WF-05 | 🟡 | `server/index.js` `open_config_phase` callable during `phase='replay'`, corrupting replay state. Added `phase === 'replay'` guard. | Fixed 2026-03-15 |
| WF-11 | 🟠 | `server/index.js` `rollback_street` error path returned without broadcasting state, leaving client hung. Now calls `broadcastState()` before returning on failure. | Fixed 2026-03-15 |
| ISS-69 | 🔴 | `SessionManager.js` `addPlayer()` signature was `(socketId, name, isCoach)` — the `stableId` 4th param was never forwarded to `GameManager.addPlayer()`. All non-coach players got `socket.id` as their stableId, silently breaking `hole_cards_range` and `hole_cards_combos` lookups in HandGenerator. Found via B126 batch anomalies. | Fixed 2026-03-16 |
| ISS-70 | 🟠 | `CoachSidebar.jsx` used uppercase `'WAITING'` phase comparisons against a lowercase `'waiting'` value from the server — Configure Hand button never rendered, HandConfigPanel never shown. | Fixed 2026-03-16 (normalize with `.toUpperCase()`) |
| ISS-71 | 🔴 | `GameManager.js` `generatorConfig` only forwarded `mode`, `holeCards`, `board` — silently dropped `hole_cards_range`, `hole_cards_combos`, `board_texture`. Range/texture/combos features never fired end-to-end. | Fixed 2026-03-16 |
| DB-01 | 🟠 | `SessionManager.js` WTSD counted all `is_active` players at showdown — including players who only survived because the flag wasn't cleared. Now uses `showdown_result.allHands[]` membership instead. | Fixed 2026-03-16 |
| DB-03 | 🟡 | `Database.js` No UNIQUE constraint on `display_name` — duplicate names could corrupt coach UI and stat joins. Added partial case-insensitive UNIQUE index `WHERE display_name IS NOT NULL`. | Fixed 2026-03-16 |
| DB-04 | 🟠 | `server/index.js` A new socket could hijack a player seat during the 60 s TTL window by sending `isCoach: false` for a coach seat or vice versa. Added bidirectional coach-flag mismatch guard in reconnect path. | Fixed 2026-03-16 |
| DB-07 | 🟡 | `SessionManager.js` Session IDs used `Date.now()` — millisecond collisions possible. Replaced with `uuidv4()`. | Fixed 2026-03-16 |
| DB-09 | 🟡 | `server/index.js` Coach stableId fell back to `socket.id`, breaking career stat joins on reconnect. Now uses deterministic `coach_${tableId}`. | Fixed 2026-03-16 |
| EC-03 | 🟠 | `server/index.js` `tables` Map grew unboundedly. Now pruned in the TTL expiry callback when no sockets remain in the room. | Fixed 2026-03-16 |
| WF-07 | 🟡 | `server/index.js` `_loadScenarioIntoConfig()` ignored error returns from `openConfigPhase()`/`updateHandConfig()`. Now checks and propagates errors; callers emit notifications. | Fixed 2026-03-16 |
| ISS-06 | 🟢 | `SidePotCalculator.js` Undocumented `is_active`/`is_all_in` contract. Added explanatory comment. | Fixed 2026-03-16 (comment only) |
| ISS-25 | 🟡 | `SessionManager.js` Same root cause as DB-01 — resolved by the DB-01 fix. | Fixed 2026-03-16 |
| ISS-26 | 🟢 | `HandEvaluator.js` Full House `kickers` semantics undocumented. Added comment. | Fixed 2026-03-16 (comment only) |
| ISS-27 | 🟢 | `HandEvaluator.js` `evaluateShort()` flush/straight omission undocumented. Added comment. | Fixed 2026-03-16 (comment only) |
| ISS-30 | 🟢 | `HandConfigPanel.jsx` Start Hand button stuck for 3 s on server error. Now resets via `useEffect` on `gameState` change instead. | Fixed 2026-03-16 |
| ISS-33 | 🟢 | `GameManager.js` `notifications: []` dead state field — field was already removed in a prior session. Non-issue. | Closed 2026-03-16 (field absent) |
| ISS-40 | 🟡 | `server/index.js` Timer/pause race undocumented. Added detailed comment explaining the ordering guarantee. | Fixed 2026-03-16 (comment only) |
| ISS-55 | 🟢 | `Database.js` CASCADE DELETE pragma dependency undocumented. Added comment. | Fixed 2026-03-16 (comment only) |
| ISS-56 | 🟢 | `HandLogger.js` `removeHandFromPlaylist` transaction assumption undocumented. Added comment. | Fixed 2026-03-16 (comment only) |
| ISS-57 | 🟢 | `server/index.js` `activate_playlist` guard concern — `config_phase=true` still has `phase='waiting'` so guard already allows it. Added comment confirming the non-issue. | Fixed 2026-03-16 (comment only) |
| ISS-58 | 🟢 | `server/index.js` `adjustStack` assumption for `stackMode=historical`. Added comment. | Fixed 2026-03-16 (comment only) |
| ISS-59 | 🟢 | `PokerTable.jsx` Hardcoded `9` modulo in POV rotation. Replaced with `SEAT_POSITIONS.length`. | Fixed 2026-03-16 |
| ISS-60 | 🟢 | `BettingControls.jsx` `pendingBet` shallow-equal edge case. Added comment. | Fixed 2026-03-16 (comment only) |
| ISS-64 | 🟢 | `Dockerfile` Pre-compiled binary assumption undocumented. Added comment. | Fixed 2026-03-16 (comment only) |
| ISS-65 | 🟢 | `Database.js` No `mkdirSync` guard for custom `DATABASE_PATH`. Added guard. | Fixed 2026-03-16 |
| ISS-67 | 🟢 | `HandLogger.js` OPEN_LIMP fires when `bbPlayerId` is null, producing false positives. Added null guard. | Fixed 2026-03-16 |
| ISS-68 | 🟢 | `HandConfigPanel.jsx` `rangeDebounceRefs` not cleaned up on unmount. Added `useEffect` cleanup. | Fixed 2026-03-16 |
| FEAT-01 | 🟢 | No coach control over blind levels — table always ran 5/10. Added `set_blind_levels` socket event + CoachSidebar Section 4 UI. | Added 2026-03-16 |
| FEAT-02 | 🟢 | Default starting stack hardcoded (1000) — not scaled to blinds. Now computed as `100 × BB` dynamically. | Added 2026-03-16 |
| FEAT-03 | 🟢 | `small_blind` never stored in DB — `hands` table only had `big_blind`. Added migration + HandLogger support. | Added 2026-03-16 |
| FEAT-04 | 🟢 | No per-player BB view mode. Added `fmtChips(amount, bigBlind, bbView)` utility and Chips/BB toggle button on table. | Added 2026-03-16 |
| SIM-02 | 🟢 | `simulate_batches.js` crashed on batch 2+ because `upsertPlayerIdentity` set `display_name = last_known_name` for coaches — each batch's coach stableId (`coach_${tableId}`) is unique, causing a duplicate `display_name='Coach'` violation on the partial UNIQUE index. Fixed by removing `display_name` from `upsertPlayerIdentity`; only `registerPlayer` (auth registration) sets `display_name`. | Fixed 2026-03-16 |
| WF-12 | 🟢 | `GameManager.js` `openConfigPhase()` had no guard for active hand phases — callable during `preflop`/`flop`/`turn`/`river`/`showdown`, overwriting live config state. Added `activePhases` guard returning `{ error }`. Server handler changed from `sendError` to `sendSyncError` for consistency. Found via B211 batch test. | Fixed 2026-03-16 |
| SIM-03 | 🟢 | `simulate_batches.js` B145–B244 (100 new batches) added covering: action order, fold-win fix, coach seat, HU rules, chip conservation, REST API, dealer rotation, min-raise, all-in, undo/rollback, in-hand toggle, pause, config guards, replay edge cases, auth guards, player invariants, manual config, auth edge cases, regression. | Added 2026-03-16 |
| ISS-72 | 🔴 | `GameManager.js` `startGame()` did not mark players with `in_hand=false` as `is_active=false` — they were reset to `is_active=true` then only skipped for hole card dealing. The UTG calculation used a simple modulo index, so a sitting-out player could become `current_turn` on the first preflop action. Fixed by marking sitting-out players `is_active=false`/`action='sitting-out'` after the reset block, and replacing the UTG index with a loop that skips inactive players. Found via B201 batch. | Fixed 2026-03-16 |
