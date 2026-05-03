# Sidebar v3 vs Old CoachSidebar — Discovery Doc

Generated 2026-04-30 for staging review. Use this as **shared language**: every block has a stable name like `live.configure_hand_card` so you can say "swap `live.action_feed_card` and `live.equity_card`" and I'll know exactly what to move.

Old sidebar = `client/src/components/CoachSidebar.jsx` + 9 sections under `client/src/components/sidebar/`.
V3 sidebar = `client/src/components/sidebar-v3/Sidebar.jsx` + 5 tabs.
V3 toggle: append `?sidebarV3=1` to a coached_cash table URL.

---

## Part 1 — V3 Layout Map (current, top to bottom)

```
┌─ V3 SIDEBAR (360px wide, no collapse) ────────────────────────────────┐
│                                                                       │
│  ╔══ HEADER ═══════════════════════════════════════════════════╗      │  header.brand
│  ║  FeltSide                                       [● LIVE]    ║      │  header.status_pill   (LIVE/PAUSED/SCENARIO/REVIEW)
│  ║  <subtitle>                                                 ║      │  header.subtitle
│  ╚═════════════════════════════════════════════════════════════╝      │
│                                                                       │
│  ┌── TAB BAR ──────────────────────────────────────────────────┐      │  tabs.bar
│  │  [ Live ]  [ Drills ]  [ History ]  [ Review ]  [ Setup ]   │      │  tabs.live | tabs.drills | tabs.history | tabs.review | tabs.setup
│  └─────────────────────────────────────────────────────────────┘      │  (active tab persisted in localStorage `fs.sb3.tab`)
│                                                                       │
│  ┌── BODY (changes per active tab) ───────────────────────────┐       │
│  │                                                            │       │
│  │   ── LIVE TAB ─────────────────────────                    │       │
│  │   live.bet_status_card        (phase | hand# | pot |       │       │
│  │                                clock | board)              │       │
│  │   live.configure_hand_card    (RNG / Manual / Hybrid +     │       │
│  │                                target picker + cards/range │       │
│  │                                + board texture + Apply)    │       │
│  │   live.table_roster_card      (per-seat: sitout, adjust    │       │
│  │                                stack [DISABLED], kick)     │       │
│  │     live.roster.add_bot_button + difficulty_picker         │       │
│  │   live.equity_card            (per-player equity bars,     │       │
│  │                                read-only)                  │       │
│  │   live.action_feed_card       (stub — phase 2 placeholder) │       │
│  │                                                            │       │
│  │   ── DRILLS TAB ───────────────────────                    │       │
│  │   drills.mode_segment         [ Library | Session ]        │       │
│  │   drills.library.playlist_list (Load button per row)       │       │
│  │   drills.session.active_card  (progress bar + 3 stat tiles │       │
│  │                                + End Drill + Next Spot     │       │
│  │                                [DISABLED phase 4])         │       │
│  │   drills.build_form           [HIDDEN — phase 4]           │       │
│  │                                                            │       │
│  │   ── HISTORY TAB ──────────────────────                    │       │
│  │   history.view_segment        [ Table | Players ]          │       │
│  │                                (Players hidden in live)    │       │
│  │   history.session_stats_card  (Hero Net / Won / Lost /     │       │
│  │                                Biggest Pot / Hands)        │       │
│  │                                (hidden in live mode)       │       │
│  │   history.filter_chips        [ All | Won | Lost |         │       │
│  │                                  Showdown ]                │       │
│  │   history.hand_strip          (horizontal scroll of cards) │       │
│  │                                                            │       │
│  │   ── REVIEW TAB ───────────────────────                    │       │
│  │   review.replay_header        (perspective selector +      │       │
│  │                                board + cursor counter)     │       │
│  │   review.replay_controls      (‹ Prev | Next › | Play From │       │
│  │                                Here | street jumps)        │       │
│  │   review.decision_tree        (per-street action timeline; │       │
│  │                                clickable nodes)            │       │
│  │   review.save_branch_card     (chip-pick playlist OR       │       │
│  │                                + New Playlist inline)      │       │
│  │                                                            │       │
│  │   ── SETUP TAB ────────────────────────                    │       │
│  │   setup.section_segment       [ Blinds | Seats | Players ] │       │
│  │   setup.blinds.current_card   (SB + BB inputs + Apply)     │       │
│  │   setup.blinds.cash_presets   (Level 1..N rows)            │       │
│  │   setup.seats.map_grid        (3-col seat grid)            │       │
│  │   setup.seats.detail_card     (empty=AddBot;               │       │
│  │                                occupied=Edit Stack /       │       │
│  │                                Sit / Kick)                 │       │
│  │   setup.players.roster        ($ / sit / kick per row)     │       │
│  │   setup.players.add_bot_card  (difficulty + Add bot)       │       │
│  │                                                            │       │
│  └────────────────────────────────────────────────────────────┘       │
│                                                                       │
│  ┌── FOOTER (changes per active tab) ──────────────────────────┐      │  footer.bar
│  │  Live:    [ Pause ] [ ⚑ Tag Hand* ] [ Next Hand → ]         │      │  footer.live.pause | tag_hand* | next_hand
│  │  Drills:  [ Clear* ] [ Launch Hand* ]                       │      │  footer.drills.clear* | launch_hand*
│  │  History: [ Export CSV* ] [ Review Selected → ]             │      │  footer.history.export* | review_selected
│  │  Review:  [ ← History ] [ Exit Replay → Live ]              │      │  footer.review.back | exit
│  │  Setup:   [ Reset* ] [ Apply Next Hand* ]                   │      │  footer.setup.reset* | apply
│  └─────────────────────────────────────────────────────────────┘      │  * = disabled in current build
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Part 2 — Feature Matrix (Old → V3)

Status legend:
- **KEPT** — feature exists in both, same intent
- **RENAMED** — feature exists, different label or position
- **NEW** — only in v3 (added)
- **MISSING** — only in old (regression, gap, or intentional removal — needs review)
- **DISABLED** — UI exists in v3 but disabled (phase pending)
- **DUPED** — same control appears in 2+ places in v3
- **HIDDEN** — component exists but not mounted (e.g. behind feature flag)

### Group A — Header / Chrome

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| A1 | Phase + pot strip | Sticky info strip | `live.bet_status_card` + `header.status_pill` | RENAMED | v3 splits across header pill (state) + Live card (numbers) |
| A2 | LIVE / PAUSED indicator | Inline in info strip | `header.status_pill` | RENAMED | v3 adds SCENARIO / REVIEW states |
| A3 | Sidebar collapse / expand | Edge button | — | **MISSING** | v3 always full-width 360px |
| A4 | Tab persistence on refresh | Resets on reload | localStorage `fs.sb3.tab` | NEW | |

### Group B — Game Control (start, pause, mode)

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| B1 | RNG / Manual mode toggle | `GameControlsSection` | `live.configure_hand_card` mode segment | RENAMED | v3 adds **Hybrid** as 3rd option |
| B2 | Start Hand (RNG only) | `GameControlsSection` | `footer.live.next_hand` | RENAMED | "Next Hand →" |
| B3 | Reset hand | `GameControlsSection` | — | **MISSING** | no v3 equivalent |
| B4 | Pause / Resume game | `GameControlsSection` | `footer.live.pause` | KEPT | |
| B5 | Tag hand (apply coach tag) | not in old | `footer.live.tag_hand` | **DISABLED** | phase 2 — TBD |

### Group C — Hand Configuration (cards / range / board)

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| C1 | Hole cards picker (specific) | `HandConfigPanel` (mounted by GameControls) | `live.configure_hand_card` cards mode | KEPT | |
| C2 | Hole-cards range picker | `HandConfigPanel` | `live.configure_hand_card` range mode | KEPT | v3 adds % combos display + quick presets (Top 5%, Pairs, Suited, Clear) |
| C3 | Specific board cards | `HandConfigPanel` | `live.configure_hand_card` BOARD target | KEPT | |
| C4 | Board texture constraints (Rainbow / FD / Mono / Paired / Connected / etc.) | — | `live.configure_hand_card` texture chips | **NEW** | |
| C5 | Apply now vs queue for next hand | manual user toggle | auto by phase (Apply Now in waiting / Apply Next Hand in-hand) | RENAMED | better UX |

### Group D — Blinds

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| D1 | Set Big Blind | `BlindLevelsSection` | `setup.blinds.current_card` BB input | KEPT | |
| D2 | Set Small Blind separately | — (auto = BB/2) | `setup.blinds.current_card` SB input | **NEW** | |
| D3 | Cash blind presets (Level 1..N) | — | `setup.blinds.cash_presets` | **NEW** | |
| D4 | "Only available between hands" gate | enforced + message | enforced | KEPT | |

### Group E — Stacks

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| E1 | Adjust player stack to amount | `AdjustStacksSection` (player select + amount) | `setup.seats.detail_card` Edit Stack inline + `setup.players.roster` $ button inline | RENAMED + **DUPED** | two entry points in Setup tab |
| E2 | Adjust stack from Live tab | — | `live.table_roster_card` per-seat ± icon | **DISABLED** | phase 5 |

### Group F — Players (sit / add / kick)

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| F1 | Sit-in / sit-out toggle | `PlayersSection` (between hands only) | `live.table_roster_card`, `setup.seats.detail_card`, `setup.players.roster` | RENAMED + **DUPED** (3 entry points) | v3 not gated to between-hands |
| F2 | Add bot | — | `live.roster.add_bot_button`, `setup.seats.detail_card`, `setup.players.add_bot_card` | **NEW** + **DUPED** (3 entry points) |  |
| F3 | Kick player | — | `live.table_roster_card` ×, `setup.seats.detail_card`, `setup.players.roster` | **NEW** + **DUPED** | uses `window.confirm()` browser prompt |
| F4 | Player roster read-only (cards / actions / dealer badge) | `PlayersSection` | `live.table_roster_card` (limited badges only) | RENAMED | v3 drops hole-card preview + per-action badge — see G3 |

### Group G — Equity / Range Sharing

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| G1 | Coach equity overlay toggle (Coach button) | `GameControlsSection` | — | **MISSING** | v3 always renders equity for coach |
| G2 | Players equity broadcast toggle (Players button) | `GameControlsSection` | hinted via `live.equity_card` kicker label only | **MISSING** (toggle) | label changes but no control to flip it |
| G3 | Live equity per player display | inline in old game controls | `live.equity_card` | KEPT | v3 has cleaner layout |
| G4 | Share Range modal (broadcast pre-defined range to players w/ label) | `GameControlsSection` modal + `RangeMatrix` + Broadcast button | — | **MISSING** | high-value coaching feature absent |

### Group H — Undo / Rollback

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| H1 | Undo last action | `UndoControlsSection` | — | **MISSING** | |
| H2 | Rollback street | `UndoControlsSection` | — | **MISSING** | |

### Group I — Hand Library / Search

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| I1 | Search hands by text (name / id / tag) | `HandLibrarySection` | — | **MISSING** | |
| I2 | Filter hand library by range (matrix) | `HandLibrarySection` | — | **MISSING** | |
| I3 | Load hand as scenario w/ stack mode (keep / historical) | `HandLibrarySection` | partial (only via Review → Save Branch flow) | **MISSING** (load-into-table) | |
| I4 | Add hand to playlist (from library) | `HandLibrarySection` + dropdown | `review.save_branch_card` only | RENAMED + scope reduced | v3 only allows from a Review session, not from library browse |
| I5 | + Build Scenario button | inline in HANDS tab | `drills.build_form` | **HIDDEN** | phase 4 |

### Group J — History (completed hands list)

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| J1 | Hand list display | `HistorySection` (vertical list) | `history.hand_strip` (horizontal scroll) | RENAMED | layout flipped |
| J2 | Inline expand to hand detail | `HistorySection` | — | **MISSING** | v3 forces full Review tab open instead |
| J3 | Load replay from history | `HistorySection` ▶ icon | `history.hand_strip` card click + `footer.history.review_selected` | RENAMED | |
| J4 | Manual refresh button | `HistorySection` icon | — | **MISSING** | unclear if v3 auto-refreshes |
| J5 | Filter chips (All / Won / Lost / Showdown) | — | `history.filter_chips` | **NEW** | |
| J6 | Session stats tiles (Net / Won / Lost / Big pot / Hands) | — | `history.session_stats_card` | **NEW** | hidden in live mode currently |
| J7 | Per-player stats (VPIP / PFR / W$SD) | — | `history.players_view` (fixture only) | **NEW** | |
| J8 | Export CSV | — | `footer.history.export` | **DISABLED** | phase 3 |

### Group K — Replay / Review

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| K1 | Step back / forward | `ReplayControlsSection` ◀ ▶ | `review.replay_controls` ‹ Prev / Next › | KEPT | |
| K2 | Timeline scrubber (drag to action) | `ReplayControlsSection` range input | — | **MISSING** | high-impact |
| K3 | Auto-play | `ReplayControlsSection` Play button | — | **MISSING** | |
| K4 | Speed control (0.5× / 1× / 2× / 4×) | `ReplayControlsSection` | — | **MISSING** | |
| K5 | Annotation: add note at action | `ReplayControlsSection` + dialog | — | **MISSING** | persisted to `/api/hands/:id/annotations` |
| K6 | Annotation: delete | `ReplayControlsSection` ✕ | — | **MISSING** | |
| K7 | Annotation markers on timeline | `ReplayControlsSection` dots | — | **MISSING** | |
| K8 | Branch from cursor | `ReplayControlsSection` "Branch & Play" | `review.replay_controls` "Play From Here" | RENAMED | |
| K9 | Unbranch / back to replay | `ReplayControlsSection` | `review.replay_controls` "Back to Replay" | RENAMED | |
| K10 | Exit replay | `ReplayControlsSection` Exit | `footer.review.back` / `footer.review.exit` | KEPT | |
| K11 | Decision tree (per-street action timeline w/ clickable nodes) | — | `review.decision_tree` | **NEW** | |
| K12 | Perspective selector (switch hero view) | — | `review.replay_header` chips | **NEW** | |
| K13 | Street jump buttons (Preflop / Flop / Turn / River) | — | `review.replay_controls` street row | **NEW** | |
| K14 | Save branch as new drill / playlist hand | partial (Save-to-Playlist flow on HANDS tab) | `review.save_branch_card` chip picker + + New Playlist inline | **NEW UX** | much faster than old flow |

### Group L — Playlists (lifecycle)

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| L1 | Create new playlist | `PlaylistsSection` input + Create | only via `review.save_branch_card` + New Playlist inline | **MISSING** dedicated UI | |
| L2 | Delete playlist | `PlaylistsSection` ✕ | — | **MISSING** | |
| L3 | Activate playlist | `PlaylistsSection` Play button | `drills.library.playlist_list` Load | RENAMED | |
| L4 | Deactivate playlist | `PlaylistsSection` Stop | `drills.session.active_card` End Drill | RENAMED | |

### Group M — Drills / Coach Participation

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| M1 | Coach Play / Monitor mode (during playlist) | `PlaylistsSection` | — | **MISSING** | coach can't toggle their seat in/out cleanly |
| M2 | Auto-start countdown + cancel | `PlaylistsSection` countdown | — | **MISSING** | |
| M3 | Resume playlist after pause | `PlaylistsSection` ▶ Resume | — | **MISSING** | |
| M4 | Start drill | `PlaylistsSection` ▶ Start Drill | `drills.library.playlist_list` Load | RENAMED | |
| M5 | Deal Next / advance scenario | `PlaylistsSection` ▶▶ Deal Next | `drills.session.active_card` Next Spot | **DISABLED** | phase 4 |
| M6 | Pause / Resume drill | `PlaylistsSection` | — | **MISSING** | |
| M7 | Stop drill | `PlaylistsSection` ✕ | `drills.session.active_card` End Drill | RENAMED | |
| M8 | Drill log (last 3 events) | `PlaylistsSection` | — | **MISSING** | |
| M9 | Drill stats tiles (correct / mistake / unsure) | — | `drills.session.active_card` stat tiles | **NEW** | currently zero — server results store pending |
| M10 | Scenario launch panel: hero mode (sticky / per_hand / rotate), order (sequential / random), auto-advance, allow zero match | `ScenarioLaunchPanel` | — | **MISSING** | rich pre-launch config gone |

### Group N — Scenario Builder

| # | Feature | Old block | V3 block | Status | Notes |
|---|---|---|---|---|---|
| N1 | + Build Scenario button → modal | `+ Build Scenario` (HANDS tab) | `drills.build_form` | **HIDDEN** | phase 4 wires |

---

## Part 3 — Action List for Staging Walkthrough

Run through these on `?sidebarV3=1`. For each, note: ✅ works / ❌ broken / ⚠️ awkward.

### Critical regressions to verify (most likely to bite)

1. **Sidebar collapse** (A3) — confirm v3 occupies 360px always. Does it eat too much table real-estate on smaller screens?
2. **Reset hand** (B3) — currently mid-hand if you want to abort, no button. Workaround?
3. **Undo / Rollback** (H1, H2) — when a player misclicks, can the coach undo? Confirm there's no v3 path.
4. **Coach equity toggle** (G1, G2) — coach can no longer hide equity from themselves OR from players. Is this intended?
5. **Share Range modal** (G4) — broadcasting a labeled range to players' screens is gone. Big coaching feature.
6. **Hand library search + range filter** (I1, I2) — coach can no longer browse past hands by criteria from the sidebar.
7. **Load hand as scenario** (I3) — flow only via Review tab, requires picking the hand first via History. Old had direct "Load" button.
8. **Replay scrubber + autoplay + speed** (K2, K3, K4) — replay UX is much thinner. Stepping one action at a time only.
9. **Replay annotations** (K5, K6, K7) — coach notes at specific actions are not in v3 at all. Ask if this data is shown elsewhere.
10. **Playlist create/delete** (L1, L2) — playlist mgmt is half-gone. Create only inline via Save Branch; no delete anywhere.
11. **Coach Play/Monitor toggle** (M1) — during a playlist run, coach can't choose to sit in or just observe via a clean toggle.
12. **Drill pause/resume + Deal Next** (M5, M6) — scenario flow control is partly missing or disabled.
13. **ScenarioLaunchPanel** (M10) — hero mode / order / auto-advance / zero-match config: gone.

### Duplications worth questioning

14. **Sit-out / Sit-in** appears in 3 places (`live.table_roster_card`, `setup.seats.detail_card`, `setup.players.roster`). Pick one canonical entry point?
15. **Add bot** appears in 3 places (`live.roster.add_bot_button`, `setup.seats.detail_card`, `setup.players.add_bot_card`).
16. **Kick** appears in 3 places (same as above).
17. **Adjust stack** lives in `setup.seats.detail_card` AND `setup.players.roster` (and a disabled stub in `live.table_roster_card`).

These triplicate paths inflate scope. Decide which surface owns each verb.

### Disabled stubs to either ship or remove

18. `footer.live.tag_hand` — phase 2 (looks shipped already in commit history; verify wiring or remove the button).
19. `footer.history.export` — phase 3.
20. `footer.drills.clear`, `footer.drills.launch_hand` — phase 3.
21. `drills.session.active_card` Next Spot — phase 4.
22. `live.table_roster_card` per-seat Adjust Stack — phase 5.
23. `footer.setup.reset`, `footer.setup.apply` — phase 5.

User-visible disabled buttons erode trust. If a phase isn't shipping soon, hide the button instead of disabling.

### Wins worth keeping (so we don't regress on the next pass)

24. Hybrid mode (B1) — RNG + manual mix is a strong addition.
25. Board texture constraints (C4) — board archetype generator is a power feature.
26. Apply Now vs Apply Next Hand auto-detect (C5) — better than old's manual toggle.
27. Decision tree on Review (K11) — clear visual structure of the hand.
28. Perspective selector + street jumps (K12, K13) — replay analysis feels modern.
29. Save Branch chip picker + inline new-playlist (K14) — fastest path to convert a hand into a drill we've ever had.
30. Filter chips on history + session stats (J5, J6) — good UX.
31. Setup tab visual seat map (`setup.seats.map_grid`) — much clearer than old AdjustStacks dropdown.
32. Persistent active tab (`fs.sb3.tab` localStorage) — small but nice.

---

## Part 4 — Naming Issues (Shared Language)

Things to clean up so we talk about the same thing:

- **Tab id is `settings` but the label is `Setup`** ([client/src/components/sidebar-v3/shared.jsx](client/src/components/sidebar-v3/shared.jsx)). Pick one — `setup` everywhere or `settings` everywhere.
- **"Library" vs "Session" sub-modes inside Drills** — fine, but the empty-state copy says "Save hands from the History tab into one to start drilling" and the history → playlist path is broken (see L1 / I4). Copy will mislead.
- Old had `GAME / HANDS / PLAYLISTS`; v3 has `Live / Drills / History / Review / Setup`. The "Hands" → "History" rename is good. "Game" → "Live" is good. But the old's PLAYLISTS tab maps roughly to v3's Drills tab — and a lot of playlist *management* (create/delete/coach mode) didn't follow. Decide whether playlist CRUD belongs on Drills, on Review (current Save Branch path), or on a new sub-tab.
- "Save Branch" — ambiguous. Better: "Save as Drill" or "Save This Hand to a Playlist".
- "Next Spot →" (drills) vs "Next Hand →" (live) — both meaningful, but coaches may conflate them. Keep distinct copy: "Advance Drill" vs "Deal Next Hand".

---

When you're on staging tomorrow and want to re-arrange or wire something, say e.g. *"move `live.action_feed_card` above `live.equity_card`"* or *"add G1 back as a button in `header.bar`"* and I'll know exactly where.
