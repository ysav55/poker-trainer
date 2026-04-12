# Item 7: Hand Builder (Scenario Engine)

**Status**: ⬜ pending
**Blocked by**: Items 3 (RBAC — socket permission guards), 4 (coach identity UUID in DB)
**Reference**: [plans/scenario-builder.md](scenario-builder.md) — PRIMARY SOURCE, read before implementing

---

## Context

`plans/scenario-builder.md` (written 2026-03-24) is a complete, detailed implementation
plan covering DB schema, socket events, component breakdown, edge cases, and phased delivery.
**Read it in full before starting this item.** This file only notes the Phase 2-specific
deltas and confirms the migration number.

---

## Primary Source Summary

From `scenario-builder.md`:

- **DB**: New `scenario_configs` table + `ALTER TABLE playlist_hands ADD COLUMN scenario_config_id`
- **Socket events**: `save_scenario_to_playlist`, `get_scenario_configs`, `scenario_saved`, `scenario_configs`
- **New components**: `ScenarioBuilder.jsx`, `ScenarioPlayerRow.jsx`, `ScenarioPreview.jsx`
- **Entry point**: "+ Build Scenario" button in CoachSidebar PLAYLISTS section
- **Playlist integration**: `_advancePlaylist` detects `scenario_config_id`, loads via
  `_loadScenarioConfigIntoConfig` (new function adjacent to existing `_loadScenarioIntoConfig`)
- **Stub hand approach**: create a placeholder `hands` row at save time with `is_scenario_hand=true`
  to satisfy FK; `scenario_configs.config_json` is the authoritative source

---

## Phase 2 Deltas

### 1. Migration number
`scenario-builder.md` calls it migration `008`. In Phase 2 context it is **migration 010**:

| Migration | Item | Description |
|-----------|------|-------------|
| 007 | 3 | RBAC |
| 008 | 4 | User management |
| 009 | 1 | Tables registry |
| **010** | **7** | **scenario_configs + playlist_hands.scenario_config_id** |

### 2. Coach identity
After Item 4, `socket.data.playerId` is a real DB UUID (synced from `player_profiles`).
`created_by` in `scenario_configs` is populated from `socket.data.playerId` directly.
No schema change — just ensure `socket.data.playerId` is set correctly post-Item-4.

### 3. Permission guard
`scenario-builder.md` uses `requireCoach(socket, action)`. After Item 3, replace with:
```js
if (!await requireSocketPermission(socket, 'hand:tag')) return;
```

### 4. Admin page route
The CoachSidebar "+ Build Scenario" button (§2a in scenario-builder.md) still exists.
Additionally, `HandBuilder.jsx` at `/admin/hands` (from Item 5 routing) provides a
standalone builder not tied to a live table. The standalone builder uses REST POST
to `/api/admin/scenarios` instead of the socket event (same payload, different transport).

---

## Delivery Phases (from scenario-builder.md)

| Phase | Scope | Priority |
|-------|-------|----------|
| 1 — MVP | Build + save + load in playlist | Implement first |
| 2 — Polish | Quick-edit pencil icon, keyboard shortcuts | After MVP confirmed |
| 3 — Templates | Client-side scenario presets | Nice to have |

---

## Key Files to Read Before Implementing

1. **`plans/scenario-builder.md`** — full read, primary source
2. `server/socket/handlers/` — find `_advancePlaylist` / `activate_playlist` logic
3. `server/db/HandLoggerSupabase.js` lines ~339–399 — `createPlaylist`, `addHandToPlaylist` patterns
4. `client/src/components/HandConfigPanel.jsx` — `pickerUsedCards` + card slot patterns to replicate
5. `client/src/components/CoachSidebar.jsx` — PLAYLISTS section where entry point is added
6. `server/auth/socketPermissions.js` — (from Item 3) for `requireSocketPermission`
