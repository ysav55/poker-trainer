# Poker Trainer — Shared Agent Memory

**Last Updated:** 2026-03-14 (Epic 11 — Persistent Player Identity + py-backend removed)
**Orchestrator:** Claude (Sonnet 4.6)

---

## Deployment Architecture (Epic 10)
- **Single-port mode (production)**: Express serves React build from `client/dist/` via `express.static`. Socket.io and REST API on same port. `DATABASE_PATH` env var for persistent SQLite.
- **Unified startup**: `npm run build` (root) → builds React. `npm start` (root) → runs production server.
- **Dockerfile**: Multi-stage. Stage 1 builds React (node:20-alpine). Stage 2 runs Express with production deps + client/dist copied in.
- **Cloud**: Render/Railway/Fly.io compatible. Mount `/data` volume and set `DATABASE_PATH=/data/poker_trainer.sqlite`.

---

## Project Layout

```
poker-trainer/
  server/                        ← Node.js + Express + Socket.io (port 3001)  [py-backend removed]
    index.js                     ← Socket handlers, REST endpoints, HandLogger wiring
    game/
      GameManager.js             ← Core state machine (preflop→showdown, undo, rollback)
      SessionManager.js          ← Wraps GameManager; tracks VPIP/PFR/WTSD/WSD across hands
      HandEvaluator.js           ← Pure: evaluate(hole, board) → HandResult; compareHands
      HandGenerator.js           ← Fill-the-Gaps algo for hybrid/manual hand config
      SidePotCalculator.js       ← buildSidePots(players) → SidePot[]
      Deck.js                    ← Card utilities: create, shuffle, validate, getUsedCards
      __tests__/                 ← Jest unit tests (610 passing as of 2026-03-14)
    db/
      Database.js                ← SQLite singleton (WAL mode, FK ON), schema init + player_identities table
      HandLogger.js              ← Persistence API: startHand/recordAction/endHand/getHands/upsertPlayerIdentity/getPlayerStats/…
      __tests__/
        HandLogger.test.js       ← 43 tests using in-memory SQLite mock
  client/                        ← React + Vite + Tailwind (port 5173)
    src/
      App.jsx                    ← Root: join screen + table view; wires emit bundle + stats
      hooks/
        useSocket.js             ← Socket connection + all emit helpers; getOrCreateStableId() generates/persists UUID in localStorage; stableId included in join_room
        useHistory.js            ← REST hooks: fetchHands, fetchHandDetail, clearDetail
      components/
        Card.jsx                 ← Single card (face-up or hidden)
        BoardCards.jsx           ← 5-slot community cards
        BettingControls.jsx      ← Player action buttons; pendingBet spam protection + raise validation
        CardPicker.jsx           ← 52-card picker modal
        CoachSidebar.jsx         ← Admin panel (10 sections incl. Live Tags, Playlist Manager, Scenario Loader)
        HandConfigPanel.jsx      ← Coach pre-game hand configuration UI
        PlayerSeat.jsx           ← Positioned player chip/card display; coach 50% opacity on opponent cards
        PokerTable.jsx           ← Table layout + seat positions; POV rotation, coach-offline overlay, timer bar
      __tests__/
        UI_EdgeCases.test.jsx    ← Vitest + RTL tests (8 tests, 4 suites)
  poker_trainer.sqlite           ← SQLite DB file (created on first server start)
  package.json                   ← Unified scripts: install-all, build, start, test
  .gitignore                     ← Excludes node_modules, client/dist, *.sqlite, .env
  Dockerfile                     ← Multi-stage: builder (React) + production (Express)
  README.md                      ← One-click deployment guide
  AGENT_MEMORY.md                ← This file — canonical schema reference
  AGENT_PROGRESS.md              ← Task tracking board
  ISSUES_REGISTRY.md             ← Bug tracker
  GETTING_STARTED.md             ← End-user setup guide
```

---

## Socket Event Contract

### Client → Server
| Event | Payload |
|---|---|
| `join_room` | `{ name, isCoach, tableId?, stableId }` — `stableId` is a UUID from `localStorage` (generated once per browser, persists across sessions) |
| `start_game` | `{ mode: 'rng'\|'manual' }` |
| `place_bet` | `{ action: 'fold'\|'check'\|'call'\|'raise', amount? }` |
| `manual_deal_card` | `{ targetType, targetId?, position, card }` |
| `undo_action` | `{}` |
| `rollback_street` | `{}` |
| `toggle_pause` | `{}` |
| `set_mode` | `{ mode }` |
| `force_next_street` | `{}` |
| `award_pot` | `{ winnerId }` |
| `reset_hand` | `{}` |
| `adjust_stack` | `{ playerId, amount }` |
| `open_config_phase` | `{}` |
| `update_hand_config` | `{ config: HandConfiguration }` |
| `start_configured_hand` | `{}` |
| `load_hand_scenario` | `{ handId, stackMode: 'historical'\|'current' }` |
| `create_playlist` | `{ name }` |
| `get_playlists` | `{}` |
| `add_to_playlist` | `{ playlistId, handId }` |
| `remove_from_playlist` | `{ playlistId, handId }` |
| `delete_playlist` | `{ playlistId }` |
| `activate_playlist` | `{ playlistId }` |
| `deactivate_playlist` | `{}` |

### Server → Client
| Event | Payload |
|---|---|
| `room_joined` | `{ playerId, isCoach, isSpectator, name, tableId }` |
| `game_state` | Personalized `TableState` |
| `error` | `{ message }` — permanent error (bad input, auth fail) |
| `sync_error` | `{ message }` — transient rejection (late action, pause race); client should resync state |
| `notification` | `{ type, message }` |
| `showdown_result` | `ShowdownResult` object |
| `session_stats` | `SessionState` object — fired after each hand ends (after `resetForNextHand`) |
| `action_timer` | `{ playerId, duration, startedAt } \| null` — null = cancelled |
| `coach_disconnected` | `{ message }` — game auto-paused; coach has 30s to reconnect |
| `playlist_state` | `{ playlists }` — full playlist list; emitted after create/delete/activate/deactivate |

### REST API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/api/hands?tableId=&limit=&offset=` | Paginated hand history |
| `GET` | `/api/hands/:handId` | Full hand detail with board, players, actions |
| `GET` | `/api/sessions/:sessionId/stats` | DB-backed per-player session stats |
| `GET` | `/api/sessions/current` | Live in-memory stats for main-table |
| `GET` | `/api/players/:stableId/stats` | Career stats for a player across all sessions (total hands, VPIP%, PFR%, net chips) |

---

## Component Props API (Current — as of 2026-03-14)

### `<Card card="Ah" hidden small selected onClick />`
### `<BoardCards board={[]} phase isCoach onCardClick(position) />`
### `<BettingControls gameState myId isCoach emit />`
> Note: `player` is derived internally from `gameState.players.find(p => p.id === myId)`.
> `emit.placeBet(action, amount)` is called for all betting actions.

### `<CardPicker usedCards={Set} onSelect(card) onClose title />`
### `<CoachSidebar gameState emit sessionStats isOpen onToggle />`
> Now includes sections 8–10: Live Hand Tags (local state), Playlist Manager (create/activate/delete), Scenario Loader (searchable history → load or add-to-playlist).

### `<PlayerSeat player isCurrentTurn isMe isCoach style onHoleCardClick(position) />`
> When `isCoach && !isMe`: opponent hole cards rendered at 50% opacity.

### `<PokerTable gameState myId isCoach emit onOpenCardPicker />`
> POV rotation: seats rendered with `(seatIndex - mySeat + 9) % 9` so myId is always at the bottom.
> Renders coach-offline overlay when `coachDisconnected === true`.
> Renders action timer progress bar; bar freezes (grey) when game is paused.

---

## Game State Schema (TableState)

```js
{
  table_id, mode, phase, paused, players[], board[], pot,
  current_bet, min_raise, current_turn, dealer_seat,
  small_blind, big_blind, winner, winner_name,
  can_undo, can_rollback_street,

  // CONFIG_PHASE additions:
  config_phase, // boolean — true while coach is configuring the hand pre-startGame
  config,       // HandConfiguration | null — active hand config, null when not in use

  // SHOWDOWN additions:
  showdown_result, // ShowdownResult | null — populated at showdown, null otherwise

  // SIDE POT addition:
  side_pots: []  // SidePot[] — populated when 2+ players are all-in with unequal stacks;
                 // empty array otherwise (single main pot tracked by `pot` field above)
}
```

## Player Schema
```js
{
  id, name, seat, stack, hole_cards[], current_bet,
  total_bet_this_round, action, is_active, is_dealer,
  is_small_blind, is_big_blind, is_all_in, is_coach,
  total_contributed, // cumulative chips put into pot across ALL streets this hand
  acted_this_street, // boolean — true once player voluntarily acts (used for under-raise re-raise blocking)
}
```

---

## HandConfiguration Schema

> Defined by task A-01. Used by `generateHand()` and `startGame()`.

```js
const HandConfiguration = {
  mode: 'rng',       // 'rng' | 'manual' | 'hybrid'
                     // null in any card slot means "fill randomly"

  hole_cards: {
    // '<player_socket_id>': [ '<card> | null', '<card> | null' ]
    'abc123': ['As', 'Kd'],
    'def456': ['Jh', null],
  },

  board: [
    'Kh',   // flop card 1
    null,   // flop card 2 — random
    null,   // flop card 3 — random
    null,   // turn — random
    null,   // river — random
  ],
};
```

**Validation rules:** no duplicate cards, valid card strings, exactly 2 hole cards per player, exactly 5 board slots, valid mode value. Validation runs inside `generateHand()` which returns `{ error }` (not throws) — `startGame()` propagates this as `{ error: 'Hand generation failed: ...' }` without mutating state (ISS-05 fixed 2026-03-14). `updateHandConfig()` is store-only (validates mode field only); card/duplicate validation is deferred to `startGame()` time.

`generateHand(config, players, _deck?)` accepts:
- `config.hole_cards` (snake_case, from Socket API) OR `config.holeCards` (camelCase, legacy)
- `players` as `{ id, … }[]` objects OR plain string IDs
- Optional 3rd arg `_deck` (ignored; API compat)
- Returns `{ playerCards, board, deck, hand: { playerCards, board, deck } }` on success, `{ error }` on failure

---

## Hand Rank Schema

### 1. Hand Rank Constants
```js
const HAND_RANKS = {
  ROYAL_FLUSH:     9,
  STRAIGHT_FLUSH:  8,
  FOUR_OF_A_KIND:  7,
  FULL_HOUSE:      6,
  FLUSH:           5,
  STRAIGHT:        4,
  THREE_OF_A_KIND: 3,
  TWO_PAIR:        2,
  ONE_PAIR:        1,
  HIGH_CARD:       0,
};
```

### 2. HandResult Object
```js
{
  rank:        7,
  rankName:    'FOUR_OF_A_KIND',
  bestFive:    ['As','Ah','Ad','Ac','Kh'],
  kickers:     ['Kh'],    // [] for hands fully determined by rank (Royal Flush, Straight Flush)
  description: 'Four of a Kind, Aces',
}
```

**`description` format examples:**
| Hand | description |
|------|-------------|
| Royal Flush | `'Royal Flush'` |
| Straight Flush | `'Straight Flush, King-high'` |
| Four of a Kind | `'Four of a Kind, Aces'` |
| Full House | `'Full House, Kings full of Tens'` |
| Flush | `'Flush, Ace-high'` |
| Straight | `'Straight, Queen-high'` |
| Three of a Kind | `'Three of a Kind, Jacks'` |
| Two Pair | `'Two Pair, Aces and Kings'` |
| One Pair | `'One Pair, Sevens'` |
| High Card | `'High Card, Ace'` |

### 3. ShowdownResult Object
```js
{
  winners: [{ playerId, playerName, handResult, potAwarded? }],
  allHands: [{ playerId, playerName, handResult }],  // best → worst
  potAwarded: 420,
  splitPot: false,
  sidePotResults?: [{ potIndex, amount, winnerIds }]  // only when side_pots exist
}
```

### 4. Comparison Rules
1. Higher `rank` wins outright.
2. Same rank → compare `bestFive` card-by-card (A=14, K=13…2=2). Suits never used.
3. Wheel straight (A-2-3-4-5) = 5-high straight; loses to 6-high straight.
4. All `bestFive` equal → split pot; `Math.floor(pot / n)` each, remainder to SB-proximity winner.

---

## SidePot Schema

```js
// SidePot
{ amount: 150, eligiblePlayerIds: ['a','b','c'] }
```

`buildSidePots(players)` → `SidePot[]`. Returns `[]` when:
- Fewer than 2 players have positive contributions, OR
- No player is all-in, OR
- All all-in players contributed the same amount and all active players are eligible for the single pot.

`total_contributed` on each player = cumulative chips into pot across ALL streets (never reset per-street).

---

## SessionStats Schema

```js
// SessionStats — per player
{
  playerId, playerName,
  handsPlayed,  // dealt-in hands (is_active=true, seat>=0, !is_coach)
  handsWon,     // hands with at least one pot won
  netChips,     // currentStack - startingStack (captured at session start)
  vpip,         // 0.0–1.0: called or raised preflop / handsPlayed
  pfr,          // 0.0–1.0: raised preflop / handsPlayed
  wtsd,         // 0.0–1.0: reached showdown / handsPlayed
  wsd,          // 0.0–1.0: won at showdown / handsPlayed
}

// SessionState — emitted as session_stats event
{
  sessionId,    // UUID for this server session
  handsDealt,   // total completed hands
  players: SessionStats[]
}
```

---

## Database Schema (SQLite)

File: `poker_trainer.sqlite` at project root.

```sql
sessions (session_id PK, table_id, started_at)

hands (
  hand_id PK, session_id FK, table_id,
  started_at, ended_at, board JSON,
  final_pot, winner_id, winner_name,
  phase_ended,              -- 'showdown' | 'fold_to_one' | phase name
  completed_normally        -- 1=normal, 0=incomplete/crash
)

hand_players (
  hand_id FK + player_id PK,   -- player_id = stableId (UUID from localStorage, NOT socket.id)
  player_name, seat, stack_start, stack_end,
  hole_cards JSON, is_winner, vpip, pfr
)

hand_actions (
  id AUTOINCREMENT PK, hand_id FK,
  player_id,              -- stableId (UUID)
  player_name, street, action, amount, timestamp,
  is_manual_scenario  -- 1 when action belongs to a coach-configured hand, 0 otherwise
)

player_identities (
  stable_id PK,           -- UUID from localStorage
  last_known_name TEXT,   -- updated on every join_room
  last_seen INTEGER       -- Unix ms timestamp
)
```

**Identity:** `player_id` in all tables is the client's stable UUID (from `localStorage`), NOT `socket.id`. Server maintains `stableIdMap: Map<socketId, stableId>` populated on `join_room`. On each join, `HandLogger.upsertPlayerIdentity(stableId, name)` keeps `player_identities` current so names stay linked to stable IDs even if players rename.

`Database.js` runs `ALTER TABLE` migrations on startup for all new columns (safe no-op if already exists).

**HandLogger API:** `ensureSession`, `startHand`, `recordAction({ …, isManualScenario? })`, `endHand`, `markIncomplete`, `getHands`, `getHandDetail`, `getSessionStats`, `upsertPlayerIdentity(stableId, name)`, `getPlayerStats(stableId)`

**Action street capture:** `server/index.js` captures `streetBeforeBet = gm.state.phase` BEFORE calling `gm.placeBet()`, then passes it to `recordAction`. This prevents recording the wrong street when `placeBet` advances the phase internally.

---

## Ghost Player & Timer Behaviour

- **Ghost player TTL:** On disconnect, a 30s timer is set before `removePlayer` is called. If the same player name reconnects within 30s, the timer is cancelled and state is preserved. Reconnecting coach must set `isCoach: true` — the server validates this matches the original seat.
- **Spectators:** A second user joining with `isCoach: true` when a coach is already seated is downgraded to spectator (`isSpectator: true`). Spectators receive `game_state` events but have no GameManager seat and no controls. Spectator disconnects are silent (no TTL, no `removePlayer`).
- **Action timer:** `startActionTimer(tableId, { resumeRemaining? })` starts a 30s (or saved remainder) auto-fold. `clearActionTimer(tableId, { saving? })` cancels and optionally saves remaining ms to `pausedTimerRemainders` Map.
- **Pause/resume:** `toggle_pause` calls `clearActionTimer(tableId, { saving: true })` on pause and `startActionTimer(tableId, { resumeRemaining: true })` on resume — timer picks up exactly where it left off.
- **Ghost-coach auto-pause:** When the coach disconnects mid-game, `gm.state.paused` is set to `true` directly, `clearActionTimer` is called with `saving: true`, and `coach_disconnected` is emitted to all clients. The 30s TTL still applies; if coach doesn't return, `removePlayer` cleans up the seat (game remains paused until a new coach joins).
- **Late-action race protection:** `place_bet` handler cancels the action timer BEFORE calling `gm.placeBet()`. If the bet is rejected for `'Not your turn'` or `'paused'`, a `sync_error` event (not `error`) is emitted and the timer is restarted for the real current-turn player.
- **Under-raise all-in:** A player may not re-raise if the previous raise was not a full raise (`last_raise_was_full=false`) AND the player has already acted this street (`acted_this_street=true`) AND they are not the last aggressor. `min_raise` is only updated on a full raise — incomplete all-in must not shrink it.
- **Odd chip:** `_sortWinnersBySBProximity` distributes remainder chip(s) to the player(s) closest to the SB seat in clockwise order.
- **Showdown undo:** `_advanceStreet()` saves the action-level snapshot BEFORE setting `this.state.phase = 'showdown'`. This means `undoAction()` restores to the end-of-river state (phase=river, pot intact, stacks pre-award, hole cards hidden again via `getPublicState`).

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-12 | `null` in `HandConfiguration` slots means "fill randomly" | Simplest signal; avoids separate `mode` per slot |
| 2026-03-12 | Undo stack max 30 actions, street stack max 5 | Memory bound; coach use-case doesn't need deeper history |
| 2026-03-12 | Coaches get seat = -1, never participate in betting | Simplifies all active-player filters |
| 2026-03-12 | Hand evaluator lives in `server/game/HandEvaluator.js`, never imported by client | Logic stays server-side; client only renders what server sends |
| 2026-03-14 | `buildSidePots` returns `[]` when single pot covers all active players | Equal all-in case requires no split; return value consistent with no-split cases |
| 2026-03-14 | `startGame()` validates hand config before any state mutation | Prevents stuck-in-preflop state on bad config (ISS-05 fix) |
| 2026-03-14 | DB file at project root (`poker_trainer.sqlite`) | Easy to find, back up, or delete; not inside `server/` to avoid accidental `npm clean` loss |
| 2026-03-14 | `generateHand` returns `{ error }` instead of throwing | Allows callers to handle errors without try/catch; consistent with rest of the codebase's `{ error }` pattern |
| 2026-03-14 | `updateHandConfig` is store-only (no card validation) | Coach edits config incrementally; rejecting on every keystroke creates bad UX. Validation runs once at `startGame()` time — fail-fast without state mutation |
| 2026-03-14 | Second coach becomes spectator (not rejected) | A coach's assistant should be able to observe without taking control; hard-rejecting would require a separate role UI |
| 2026-03-14 | Coach disconnect auto-pauses (not auto-removes) | 30s window lets coach recover a dropped connection; players cannot act unobserved during that window |
| 2026-03-14 | `sync_error` vs `error` for late/rejected actions | `error` is for permanent failures (bad input); `sync_error` is transient — client should just resync state without showing a blocking error toast |
| 2026-03-14 | `player_id` in DB = stable UUID, not `socket.id` | `socket.id` is ephemeral (new per connection); UUID from `localStorage` persists forever — required for cross-session hand history and career stats |
| 2026-03-14 | Python backend removed | `server/py-backend/` was experimental/legacy and never imported by the JS server; deleted to reduce confusion |

---

## Stress Test Coverage Completed

- [x] GameManager: 1000 random hands, chip conservation, dealer rotation
- [x] Duplicate card detection in manualDealCard
- [x] Betting round completion logic
- [x] Blind posting edge cases (heads-up, all-in on blind)
- [x] Street transitions (preflop→flop→turn→river→showdown)
- [x] Winner detection (fold-to-one, all-in run-out)
- [x] Socket: join/leave mid-hand (disconnect.test.js)
- [x] Side pots: 2/3-way all-in, chip conservation
- [x] SessionManager: VPIP/PFR/WTSD/WSD accumulation across hands
- [x] HandLogger: full startHand→recordAction→endHand→query flow (in-memory SQLite)
- [x] QA Checklist: duplicate card detection, undo at showdown, adjustStack validation, simultaneous actions, under-raise all-in, odd chip, multi-way side pots (qa_checklist.test.js)
- [x] UI edge cases: Spectator view (no controls), reconnection sync, illegal bet prevention, coach opacity on opponent cards (client/__tests__/UI_EdgeCases.test.jsx — Vitest + RTL)

## Epic 10 Completion Status
- Epic 10 (Cloud Deployment): ✅ DONE

## Known Open Gaps (as of 2026-03-14)

| Gap | Location | Notes |
|-----|----------|-------|
| ISS-13: double street snapshot on forceNextStreet | GameManager.js | `forceNextStreet` + `_advanceStreet` each call `_saveSnapshot('street')` |
| ISS-16: action snapshot before validation | GameManager.js | Failed actions still write to undo stack |
| ISS-41: ghost player shows as occupied (no UI indicator) | client | No "reconnecting" visual state |
| ISS-59: POV rotation assumes exactly 9 seats | PokerTable.jsx | `(seatIndex - mySeat + 9) % 9` hardcoded modulo |
| ISS-60: pendingBet may stay stuck if game_state shallow-equals previous | BettingControls.jsx | Unlikely but possible edge case |
| ISS-61: Live Hand Tags are local only | CoachSidebar.jsx | Not persisted to DB; lost on page refresh |
| ISS-62: coachDisconnected cleared on connect not game_state | useSocket.js | Overlay may clear before game state broadcast arrives |
