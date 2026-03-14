# Issues Registry — Poker Trainer
> Created by Error Auditor Agent on 2026-03-14. Kept current as of 2026-03-14 (Epic 11 complete — Persistent Player Identity).

## Issue Severity Legend
- 🔴 CRITICAL — causes crashes or incorrect game outcomes
- 🟠 HIGH — visible user-facing bug or missing feature path
- 🟡 MEDIUM — inconsistency or tech debt that may cause future issues
- 🟢 LOW — minor, cosmetic, or documentation gap

---

## Open Issues

| ID | Severity | File | Description | Status |
|----|----------|------|-------------|--------|
| ISS-06 | 🟢 LOW | `server/game/SidePotCalculator.js` | Eligibility relies on `is_active === true` exclusively. `is_active=false + is_all_in=true` is impossible in normal gameplay (all-in → is_active always true; folded → is_active=false) but the implicit contract is undocumented. | OPEN (doc gap) |
| ISS-12 | 🟡 MEDIUM | `server/game/GameManager.js` | `_advanceStreet()` saves street snapshot at its own start. In all-in run-out path where `_nextTurn()` calls `_advanceStreet()`, the snapshot is correct. However `forceNextStreet()` calls `_saveSnapshot('street')` before calling `_advanceStreet()` which also saves one — double snapshot per forced advance (see ISS-13). | OPEN |
| ISS-13 | 🟡 MEDIUM | `server/game/GameManager.js` | `forceNextStreet()` calls `_saveSnapshot('street')` then immediately calls `_advanceStreet()` which also calls `_saveSnapshot('street')`. Every `forceNextStreet` call saves two street snapshots. Rolling back after a forced advance restores an intermediate state rather than the pre-force state. **Fix:** Remove the `_saveSnapshot('street')` call from `forceNextStreet()`. | OPEN |
| ISS-14 | 🟡 MEDIUM | `server/game/GameManager.js` | In `_resolveShowdown()` side-pot path, `handMap` only contains entries for active players. If `SidePotCalculator` ever returned an `eligiblePlayerIds` entry for a non-active player (due to future bug), `handMap[p.id]` would be `undefined` causing a crash. **Fix:** Filter `eligible` against `Object.keys(handMap)`. | OPEN |
| ISS-15 | 🟡 MEDIUM | `server/game/GameManager.js` | `setBlindLevels()` rejects `bb < sb * 2`, blocking valid structures like 10/15. **Fix:** Relax to `bb > sb`. | OPEN |
| ISS-16 | 🟡 MEDIUM | `server/game/GameManager.js` | `_saveSnapshot('action')` is called unconditionally at the top of `placeBet()`, before the switch validates the action. A failed check attempt pollutes the undo stack with a pre-action snapshot. Note: place_bet in index.js now cancels the timer before calling placeBet, but the snapshot-before-validation gap in GameManager remains. | OPEN |
| ISS-24 | 🟡 MEDIUM | `client/src/components/PokerTable.jsx` | `mainPot` computed as `pot - totalSidePots` is dead code (never rendered) and logically incorrect (side pots ARE the pot breakdown). Remove or clarify. | OPEN |
| ISS-25 | 🟡 MEDIUM | `server/game/SessionManager.js` | WTSD tracking uses `p.is_active` post-showdown, which may be `true` for non-showdown paths. Should track WTSD explicitly when phase reaches 'showdown'. | OPEN |
| ISS-26 | 🟢 LOW | `server/game/HandEvaluator.js` | Full House `kickers` field holds the pair cards (2 cards). Semantically correct for tiebreaking but inconsistent with other hand types. Add comment explaining the choice. | OPEN |
| ISS-27 | 🟢 LOW | `server/game/HandEvaluator.js` | `evaluateShort()` (fallback for <5 cards) does not detect flush or straight. Only affects non-standard dev paths. Document limitation. | OPEN |
| ISS-28 | 🟢 LOW | `server/index.js` | `reset_hand` handler does not check `result.error` from `resetForNextHand()`. Currently infallible, but defensive gap. | OPEN |
| ISS-29 | 🟢 LOW | `server/index.js` | `open_config_phase` handler does not check `result.error`. Same defensive gap as ISS-28. | OPEN |
| ISS-30 | 🟢 LOW | `client/src/components/HandConfigPanel.jsx` | `handleStartHand` re-enables Start Hand button after 3s timeout regardless of server response. Error is shown in toast but button state ignores it. | OPEN |
| ISS-31 | 🟢 LOW | `client/src/components/BettingControls.jsx` | `canRaise` uses redundant `> || >=` logic. Simplify to `raiseMax >= effectiveRaiseMin`. | OPEN |
| ISS-32 | 🟢 LOW | `client/src/components/PlayerSeat.jsx` | `isFolded` checks non-existent `player.is_folded` field as third condition. Dead code — remove it. | OPEN |
| ISS-33 | 🟢 LOW | `server/game/GameManager.js` | `notifications: []` in `_initState` but not included in `getPublicState()` return. Dead state — either expose it or remove it. | OPEN |
| ISS-40 | 🟡 MEDIUM | `server/index.js` | Timer/pause race condition: if action timer fires at the exact moment coach pauses, the `paused` check inside the timeout callback must be the first guard. Current implementation handles it correctly but lacks an integration test. | OPEN |
| ISS-41 | 🟡 MEDIUM | `server/index.js` | Ghost player seat shows as "Occupied" during 30s TTL window. Server still includes ghost player in broadcastState — clients see ghost player data but no explicit "reconnecting" UI state. | OPEN |
| ISS-50 | 🟡 MEDIUM | `server/db/HandLogger.js` | `analyzeAndTagHand` runs on all DB-recorded actions; if coach used Undo, the reverted action is still in DB and could cause false-positive pattern detection (e.g. a reverted 3-bet still counted). Fix: filter `is_reverted = 1` actions before analysis; mark UNDO_USED in mistake_tags. | OPEN |
| ISS-51 | 🟡 MEDIUM | `server/db/HandLogger.js` | WALK detection: analyzer checks for zero raises preflop, but BB is always implicitly "bet" (posted blind). Must not tag as WALK if any player besides BB voluntarily raised. Edge: heads-up walk vs multi-way all-fold. | OPEN |
| ISS-52 | 🟡 MEDIUM | `server/index.js` | `load_hand_scenario` seat mapping: if historical hand had more players than current session, extra historical hole cards are silently dropped. If current session has more players, they get random cards. No warning is emitted to coach — add explicit notification about seat mismatch. | OPEN |
| ISS-53 | 🟡 MEDIUM | `server/index.js` | Playlist auto-advance on `reset_hand`: if `HandLogger.getHandDetail()` returns null (hand deleted from DB after playlist was built), auto-advance silently skips the hand. Should emit a warning notification and advance to next valid hand. | OPEN |
| ISS-54 | 🟡 MEDIUM | `server/game/GameManager.js` | `_saveSnapshot()` strips `playlist_mode.hands` array to avoid bloat. On `undoAction()`, the restored snapshot will have `hands: []` — the playlist state is lost after undo. Fix: restore `playlist_mode.hands` from live state after undo. | OPEN |
| ISS-55 | 🟢 LOW | `server/db/Database.js` | `playlist_hands` CASCADE DELETE depends on `foreign_keys = ON`. If DB is opened without FK pragma (e.g. in tests using a different connection), orphaned playlist_hands rows can accumulate. Ensure all test mocks also set `PRAGMA foreign_keys = ON`. | OPEN |
| ISS-56 | 🟢 LOW | `server/db/HandLogger.js` | `removeHandFromPlaylist` reorders remaining rows in a transaction, but if two calls race (Node.js is single-threaded so this can't happen, but still) the compact could interleave. No-op concern but worth a comment. | OPEN |
| ISS-57 | 🟢 LOW | `server/index.js` | `activate_playlist` guard checks `phase !== 'waiting'` but `config_phase` is also a valid activation point (between hands). Should also allow activation when `config_phase === true`. | OPEN |
| ISS-58 | 🟢 LOW | `server/index.js` | `load_hand_scenario` with `stackMode: 'historical'` calls `gm.adjustStack()` which validates against `total_bet_this_round`. Between hands this is always 0, so it should always succeed — but this is an undocumented assumption. Add a comment. | OPEN |
| ISS-59 | 🟢 LOW | `client/src/components/PokerTable.jsx` | POV rotation uses `(seatIndex - mySeat + 9) % 9` — assumes exactly 9 seats. If table ever supports fewer/more seat slots, modulo must be updated. Currently always 9. | OPEN |
| ISS-60 | 🟢 LOW | `client/src/components/BettingControls.jsx` | `pendingBet` reset relies on `gameState` prop changing after server acknowledges action. If server sends an identical `game_state` object (shallow equal), React may skip re-render and `pendingBet` stays stuck. Unlikely but possible edge case. | OPEN |
| ISS-61 | 🟡 MEDIUM | `client/src/components/CoachSidebar.jsx` | Live Hand Tags are local-only state — not persisted to DB or emitted to server. Coach loses tags on page refresh. Future: emit `tag_hand` event to server for DB persistence. | OPEN |
| ISS-62 | 🟡 MEDIUM | `client/src/hooks/useSocket.js` | `coachDisconnected` flag is cleared on `connect` event, not on `game_state`. If coach reconnects but game state hasn't broadcast yet, the overlay clears prematurely. Should clear on first successful `game_state` after reconnect instead. | OPEN |
| ISS-63 | 🟡 MEDIUM | `server/index.js` | Catch-all `app.get('*', ...)` will intercept requests to non-existent API routes (returning index.html instead of 404 JSON). Should add a check: if `req.path.startsWith('/api/')` return 404 JSON, else serve index.html. | OPEN |
| ISS-64 | 🟢 LOW | `Dockerfile` | `npm ci --omit=dev` on the server excludes devDependencies, but `better-sqlite3` may need native compilation. Ensure `python3` and `make` are available in the alpine image if a rebuild is triggered. Current Dockerfile uses pre-compiled binaries from `npm ci`, which should work. Document this assumption. | OPEN |
| ISS-65 | 🟢 LOW | `server/db/Database.js` | `DATABASE_PATH` env var is read at module load time. If the path's parent directory doesn't exist (e.g. `/data/` on a fresh container before volume mount), better-sqlite3 will throw. Add a `mkdirSync` guard. | OPEN |

---

## Resolved Issues

| ID | Severity | Description | Fixed In | Date |
|----|----------|-------------|----------|------|
| ISS-66 | 🔴 | `player_id` in DB was `socket.id` (ephemeral) — same student treated as a new entity on every reconnect, breaking all cross-session history and career stats | `useSocket.js` (localStorage UUID), `server/index.js` (stableIdMap + socket.data.stableId), `Database.js` (player_identities table), `HandLogger.js` (upsertPlayerIdentity + getPlayerStats) | 2026-03-14 |
| ISS-01 | 🔴 | `GameManager` used directly instead of `SessionManager` — session stats never tracked | `server/index.js` swap to SessionManager | 2026-03-14 |
| ISS-02 | 🔴 | `/auth` preflight fetch in `App.jsx` — endpoint doesn't exist, blocked all joins | Removed fetch; `joinRoom` called directly | 2026-03-14 |
| ISS-03 | 🟠 | HandEvaluator description: `"Nine high"` (space) instead of `"Nine-high"` (hyphen) | `server/game/HandEvaluator.js` | 2026-03-14 |
| ISS-04 | 🟠 | Straight Flush `kickers` returned `[card]` instead of `[]` | `server/game/HandEvaluator.js` | 2026-03-14 |
| ISS-05 | 🟠 | `startGame()` mutated state before `generateHand()` — no rollback on error; phase stuck at 'preflop' | `server/game/GameManager.js` validates config before mutating | 2026-03-14 |
| ISS-07 | 🟠 | `joinRoom` emitted `{ role }` but server expected `{ isCoach }` — all users joined as players | `client/src/hooks/useSocket.js` | 2026-03-14 |
| ISS-08 | 🟠 | Same as ISS-02 (`App.jsx` called non-existent `/auth`) | `client/src/App.jsx` | 2026-03-14 |
| ISS-09 | 🟠 | `emit` bundle missing `openConfigPhase`, `updateHandConfig`, `startConfiguredHand` — config phase silent | `client/src/App.jsx` | 2026-03-14 |
| ISS-10 | 🟠 | `BettingControls` prop mismatch — `player`/`onAction` vs `gameState`/`myId`/`isCoach`/`emit` | `client/src/components/BettingControls.jsx` | 2026-03-14 |
| ISS-11 | 🟡 | `session_stats` event listed in header but never emitted | `server/index.js` (emit added after `reset_hand`) | 2026-03-14 |
| ISS-17 | 🟡 | Socket URL hardcoded to `localhost:8001`; server runs on `3001` | `client/src/hooks/useSocket.js` | 2026-03-14 |
| ISS-18 | 🟡 | `activePlayers` filter used non-existent `p.folded` field | `client/src/components/CoachSidebar.jsx` | 2026-03-14 |
| ISS-19 | 🟡 | `player.last_action` → `player.action` in ActionBadge render | `client/src/components/CoachSidebar.jsx` | 2026-03-14 |
| ISS-20 | 🟡 | `player.bet` → `player.current_bet` in bet display | `client/src/components/CoachSidebar.jsx` | 2026-03-14 |
| ISS-21 | 🟡 | `PhaseBadge` lookup case mismatch — always fell back to WAITING colors | `client/src/components/CoachSidebar.jsx` | 2026-03-14 |
| ISS-22 | 🟡 | `is_paused` destructured but server sends `paused` | `client/src/components/CoachSidebar.jsx` | 2026-03-14 |
| ISS-23 | 🟡 | Winner display showed socket ID instead of player name | `client/src/components/PokerTable.jsx` | 2026-03-14 |
| ISS-34 | 🟡 | `acted_this_street` never set to `true` — under-raise all-in re-raise blocking was inactive | `server/game/GameManager.js` | 2026-03-14 |
| ISS-35 | 🟡 | `_sortWinnersBySBProximity` defined but never called — odd chip went to lowest seat | `server/game/GameManager.js` | 2026-03-14 |
| ISS-36 | 🟡 | No ghost player TTL — disconnected seat removed immediately with no reconnect window | `server/index.js` (30s TTL added) | 2026-03-14 |
| ISS-37 | 🟡 | No player action timer — unlimited time to act | `server/index.js` (30s auto-fold timer added) | 2026-03-14 |
| ISS-38 | 🟡 | No database layer — hand history in-memory only; no incomplete hand logging on crash | `server/db/` (Database.js + HandLogger.js + REST API) | 2026-03-14 |
| ISS-40-timer | 🟡 | Timer/pause race condition — late `place_bet` arrives after auto-fold fires | `server/index.js` place_bet handler now calls `clearActionTimer` before `placeBet()` to close the race; emits `sync_error` (not `error`) for rejected late actions | 2026-03-14 |
| ISS-42 | 🟡 | No single-coach enforcement — second coach could join and take control | `server/index.js` join_room: second coach-join downgraded to spectator; spectator gets view-only game_state; spectator disconnect is silent | 2026-03-14 |
| ISS-43 | 🟡 | Pause did not freeze remaining timer time — resume always restarted at 30s | `server/index.js` clearActionTimer/startActionTimer rewritten with `{ saving }` / `{ resumeRemaining }` options; toggle_pause now uses both; `pausedTimerRemainders` Map preserves ms | 2026-03-14 |
| ISS-44 | 🟡 | Coach disconnect left game unpaused — players could act without oversight | `server/index.js` disconnect handler: coach disconnect auto-sets `gm.state.paused=true`, saves timer, emits `coach_disconnected` event | 2026-03-14 |
| ISS-45 | 🟡 | Undo at showdown restored to showdown (not river) — snapshot saved after phase transition | `server/game/GameManager.js` `_advanceStreet`: snapshot saved BEFORE `this.state.phase = nextPhase`, so undo correctly restores river state (pot intact, stacks pre-award, hole cards hidden) | 2026-03-14 |
| ISS-46 | 🟡 | `generateHand()` threw on validation errors instead of returning `{ error }` | `server/game/HandGenerator.js` rewrote to return `{ error }` for invalid/duplicate cards; supports both `hole_cards` and `holeCards` config keys; accepts string player IDs; returns `{ playerCards, board, deck, hand: {...} }` | 2026-03-14 |
| ISS-47 | 🟡 | `place_bet` recorded action with wrong street (post-`placeBet` phase after street advance) | `server/index.js` place_bet: `streetBeforeBet = gm.state.phase` captured BEFORE `gm.placeBet()` call; used in `HandLogger.recordAction` | 2026-03-14 |
| ISS-48 | 🟢 | `adjustStack` allowed setting stack below committed amount mid-hand | `server/game/GameManager.js` `adjustStack()`: rejects amounts below `player.total_bet_this_round` during active betting phases | 2026-03-14 |
| ISS-49 | 🟢 | No `is_manual_scenario` flag on hand actions in DB | `server/db/Database.js` added column + ALTER TABLE migration; `HandLogger.recordAction()` accepts `isManualScenario` param; `start_configured_hand` sets flag on `activeHands` entry | 2026-03-14 |
| ISS-39 | 🟡 | No historical hand loading (ISS-39 out of scope) | `server/index.js` — `load_hand_scenario` event implemented in Epic 8; maps historical cards to current seats with configurable stack mode | 2026-03-14 |
