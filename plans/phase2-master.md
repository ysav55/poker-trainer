# Phase 2 — Master Plan

> Source: phase2-strategy_1.md
> Last updated: 2026-03-30
> All items implemented as of 2026-03-30. See individual plan files for detail.

## Build Order & Status

| # | Item | Blocked By | Status |
|---|------|-----------|--------|
| 3 | RBAC System | — | ✅ done |
| 4 | User Management | 3 | ✅ done |
| 5 | Frontend Routing & Lobby | 3, 4 | ✅ done |
| 1 | Multi-Table Architecture | 3 | ✅ done |
| 2 | Game Mode Controllers | 1 | ✅ done |
| 6 | Multi-Table Frontend | 1, 5 | ✅ done |
| 7 | Hand Builder | 3, 4 | ✅ done |
| 8 | Player CRM | 3, 4, 5 | ✅ done |
| 9 | Tournament Mode | 1, 2 | ✅ done |

## Plan Files

- [phase2-03-rbac.md](phase2-03-rbac.md)
- [phase2-04-user-management.md](phase2-04-user-management.md)
- [phase2-05-frontend-routing.md](phase2-05-frontend-routing.md)
- [phase2-01-multi-table-arch.md](phase2-01-multi-table-arch.md)
- [phase2-02-game-modes.md](phase2-02-game-modes.md)
- [phase2-06-multi-table-frontend.md](phase2-06-multi-table-frontend.md)
- [phase2-07-hand-builder.md](phase2-07-hand-builder.md) — references scenario-builder.md
- [phase2-08-player-crm.md](phase2-08-player-crm.md)
- [phase2-09-tournament.md](phase2-09-tournament.md)

## DB Migrations Needed

| Migration | Item | Description |
|-----------|------|-------------|
| 007 | 3 | roles, permissions, role_permissions, player_roles |
| 008 | 4 | player_profiles: email, password_hash, status, avatar_url, notes, metadata, created_by |
| 009 | 1 | tables registry table |
| 010 | 7 | scenario_configs, playlist_hands.scenario_config_id |
| 011 | 8 | player_notes, player_tags, coaching_sessions, player_performance_snapshots |
| 012 | 9 | tournament_configs, tournament_standings |

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-table socket strategy | One socket per table (Option A) | Zero server changes; acceptable for ≤4 tables |
| RBAC | Role + Permission tables | Roles alone become rigid; permissions allow custom roles without code changes |
| Permission cache | In-memory Map | No Redis needed for single-instance Fly.io |
| Table registry | DB-backed + in-memory SharedState | DB for persistence across restarts; SharedState for live status |
| Frontend routing | React Router + Context | react-router-dom + AuthContext + LobbyContext + TableContext (per-table) |
| Game controllers | Class hierarchy in server/game/controllers/ | CoachedController → keeps existing flow; AutoController → auto-deal; TournamentController extends Auto |
