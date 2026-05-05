---
marp: true
theme: default
paginate: true
backgroundColor: #0b0b0f
color: #e7e5e4
style: |
  section {
    font-family: Inter, system-ui, sans-serif;
    padding: 60px;
  }
  h1 { color: #fbbf24; }
  h2 { color: #f97316; border-bottom: 2px solid #3f3f46; padding-bottom: 8px; }
  h3 { color: #a1a1aa; }
  code { background: #18181b; color: #fbbf24; padding: 2px 6px; border-radius: 4px; }
  pre { background: #18181b; border-left: 3px solid #f97316; padding: 16px; }
  table { font-size: 0.85em; }
  th { background: #18181b; color: #fbbf24; }
  td, th { padding: 8px 12px; border-bottom: 1px solid #27272a; }
  .done { color: #22c55e; }
  .todo { color: #f59e0b; }
  .pill { background: #18181b; padding: 2px 10px; border-radius: 999px; font-size: 0.75em; }
---

# UI Redesign V2
## Phases 3–5 Status

**Branch:** `feat/ui-redesign-v1`
**Date:** 2026-04-13
**Scope:** Scenario builder rebuild — DB → API → UI shell → cross-list

<span class="pill">Phase 3 ✅</span> &nbsp; <span class="pill">Phase 4 ✅</span> &nbsp; <span class="pill">Phase 5 ⏳</span>

---

## Phase 3 — Backend: `primary_playlist_id` <span class="done">✅</span>

**Goal:** give every scenario a canonical "home" playlist for tree grouping.

### Migration `051_scenario_primary_playlist.sql`
```sql
ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS primary_playlist_id UUID
  REFERENCES playlists(playlist_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scenarios_primary_playlist
  ON scenarios(primary_playlist_id)
  WHERE primary_playlist_id IS NOT NULL;
```

- Additive, nullable, idempotent — zero-risk
- **Applied to production Supabase** via MCP
- Partial index keeps lookups cheap when most rows are null

---

## Phase 3 — API Layer <span class="done">✅</span>

### `ScenarioBuilderRepository.js`
- Added `primary_playlist_id` to `SCENARIO_COLS`
- Threaded through `createScenario` / `updateScenario` / `duplicateScenario`
- Version-branch path and in-place fieldMap both propagate it

### `routes/scenarioBuilder.js`
- `POST /scenarios` and `PATCH /scenarios/:id` accept `primary_playlist_id`
- UUID regex validation — returns **400** on malformed input
- Nullish passes through (field is optional)

### Tests
`scenarioBuilderPrimaryPlaylist.test.js` — **5 passing**
- valid UUID → saved
- omitted → defaults null
- invalid → 400
- GET surfaces value
- PATCH validates

---

## Phase 3 — Sidebar Logout <span class="done">✅</span>

Small cleanup folded into Phase 3 close-out.

**`client/src/components/SideNav/SideNav.jsx`**
- Imported `LogOut` from lucide-react
- Pulled `logout` from `useAuth()`
- Button placed between **Settings** and **Collapse**, styled identically
- `aria-label="Log out"` for screen readers

No route change — `logout()` clears JWT and redirects via AuthProvider.

**Commit:** `52e9913`

---

## Phase 4 — HandBuilder Playlist Tree <span class="done">✅</span>

**Goal:** replace Scenarios/Playlists tab split with a unified tree nav.

### Before → After

| | Before | After |
|---|---|---|
| Shell | 636L tangled tabs | **195L** shell |
| Tabs | Scenarios / Playlists | none (single tree) |
| Right panel | PlaylistEditor OR ScenarioBuilder | ScenarioBuilder OR EmptyBuilder |
| Dead code | QuickSavePanel, folderFilter | removed |

**Target:** ≤ 250L. **Actual:** 195L ✅

---

## Phase 4 — New Components

Location: `client/src/components/scenarios/`

### `PLAYLIST_COLORS.js`
- 8 hand-picked seed hex colors
- `generatePlaylistColor(index)` — seeds for 0–7, **golden-angle HSL** (`137.508°`) for 8+
- `withOpacity(color, o)` — hex → `rgba(...)`, hsl → `hsla(...)`
- Guarantees visually distinct colors across 20+ playlists

### `ScenarioItem.jsx` (~40L)
- Row button with **2px left border** at 20% opacity of playlist color
- Falls back to `Scenario {id.slice(0,6)}` when name missing
- `data-testid="scenario-item-${id}"`

---

## Phase 4 — Tree Components

### `PlaylistNode.jsx` (~74L)
- Expandable header: chevron · 8px color dot · name · count badge
- **3px left border** in full playlist color
- Click fires both `onSelectPlaylist` and `onToggle` — selection and expansion in one gesture

### `PlaylistTree.jsx` (~160L)
- Groups scenarios by `primary_playlist_id` via `useMemo`
- Local `expanded: Set` — collapsed by default
- Search filters **playlists AND child scenarios**; matching child auto-expands its parent
- **Unassigned section** at bottom for scenarios with `null` FK
- Empty state: `"No playlists yet."` / `"No matches."`

---

## Phase 4 — Wiring + Tests

### `HandBuilder.jsx` rewrite (195L)
- Left: `<PlaylistTree />` + contextual `+ New in {playlist}` CTA
- Right: `<ScenarioBuilder primaryPlaylistId={...} />` or `<EmptyBuilder />`
- `primaryPlaylistId` threads into POST payload **only on create**

### Test coverage — 23 new / all passing
| File | Tests |
|---|---|
| `scenarios-PLAYLIST_COLORS.test.js` | 5 |
| `scenarios-ScenarioItem.test.jsx` | 4 |
| `scenarios-PlaylistNode.test.jsx` | 5 |
| `scenarios-PlaylistTree.test.jsx` | 8 |

**Full suite:** 1065 / 1065 ✅ &nbsp; **Build:** clean (12.12s) ✅

**Commit:** `b78b05c`

---

## Phase 5 — What's Left <span class="todo">⏳</span>

**Goal:** turn the shell into a polished experience — header, seeding, cross-listing.

### Page header (above split-pane)
- Title `Scenarios`
- Subtitle `{n} playlists · {m} scenarios` (dynamic)
- **"Also Add to…"** button — visible only when a scenario is selected; dropdown of playlists with color dots; calls `POST /api/playlists/:id/hands`
- **"New Playlist"** gold CTA — `POST /api/playlists` with next golden-angle color

### Scenario toolbar (right panel header)
- Breadcrumb: `[dot] Playlist › Scenario`
- Duplicate + Delete buttons
- Renders only when a scenario is selected

---

## Phase 5 — Seeding + Cleanup <span class="todo">⏳</span>

### `EmptyBuilder.jsx`
- Lucide icon + instructional text
- "New Scenario" CTA
- Shown when no scenario is selected

### Playlist seeding (client-side, one-shot)
- On mount, if `GET /api/playlists` → `[]`
- POST 8 defaults sequentially (**Dry Flop Spots**, **Wet Flop Spots**, …)
- Each gets its hand-picked `PLAYLIST_COLORS[0..7]`
- Second load sees non-empty → no-op

### Dead code removal
- Delete QuickSavePanel component (test already gone)

---

## Phase 5 — Acceptance Gates

Must all be green before commit:

- [ ] Header: title, dynamic counts, both CTAs
- [ ] "Also Add to…" gated on selection; cross-list works
- [ ] "New Playlist" creates + colors via golden-angle
- [ ] Toolbar: breadcrumb + duplicate + delete
- [ ] Empty state renders with lucide icon
- [ ] First-time coach: 8 pre-seeded playlists
- [ ] Second load: **no** re-seed
- [ ] QuickSavePanel removed
- [ ] New tests: seeding (mock empty → 8 POSTs), cross-list, toolbar
- [ ] `npm run build` passes
- [ ] `npx vitest run` — all tests pass

---

## Unpushed Commits

| SHA | Phase | Summary |
|---|---|---|
| `52e9913` | 3 | backend `primary_playlist_id` + sidebar logout |
| `b78b05c` | 4 | HandBuilder playlist tree (636L → 195L) |

Both on `feat/ui-redesign-v1`, ahead of origin by **2 commits**.

Push when ready → triggers staging deploy pipeline.

---

## Remaining Roadmap

| Phase | Title | Status |
|---|---|---|
| 3 | Backend: primary_playlist_id | <span class="done">✅</span> |
| 4 | HandBuilder playlist tree | <span class="done">✅</span> |
| **5** | **Header + seeding + cross-list** | <span class="todo">⏳ next</span> |
| 6 | Save as Scenario Modal | pending |
| 7 | Tournament Polish | pending |
| 8 | Final QA + regressions | pending |

---

# Next step

**Phase 5** — page header, seeding, cross-list.

Pick up with `executing-plans` skill.
