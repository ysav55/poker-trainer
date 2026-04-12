# Poker Coaching Platform — Gap Audit

> **Status:** Living document. Updated as gaps are confirmed and fixed.
> References story numbers from `2026-04-07-platform-behavior-spec.md`.
> Last updated: 2026-04-07.

---

## How to read this

- **BROKEN** — exists in code but doesn't work as specified
- **MISSING** — not built at all
- **PARTIAL** — exists but incomplete (e.g. UI exists, backend missing, or vice versa)
- **UNVERIFIED** — not yet tested against running app; needs confirmation
- **OK** — confirmed working

---

## Flow 1 — Onboarding & Account Management

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 1.3 Admin creates student | BROKEN | `UserForm.jsx:51` — default role initializes to `'player'` (retired role). Coach assignment field missing entirely from form. POST `/api/admin/users` returns 500 when `'player'` role doesn't exist in DB after migration 043. |
| 1.4 Coach creates student | BROKEN | Same as 1.3 — no coach auto-assignment, no form field for it. |
| 1.5 Student self-registers | UNVERIFIED | `RegisterPage` exists. Coach selection field — unknown if present. |
| 1.6 Password reset | PARTIAL | Reset request flow exists (`ForgotPasswordPage`). Admin-side reset exists in `UserManagement`. Unclear if coach can reset from CRM directly. |
| 1.7 Account deletion | MISSING | No delete-account flow in Settings for self-service. Admin archive exists via `PUT /api/admin/users/:id` with `status: archived`. |

---

## Flow 2 — Coached Cash Session

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 2.1 Coach creates coached table → redirect | BROKEN | Table creation POST succeeds but redirect to `/table/:tableId` does not fire. Navigation depends on `activeTables` socket event; if socket update doesn't arrive, navigate never runs. |
| 2.2 Table appears in lobby | UNVERIFIED | Cannot confirm — couldn't reach this state due to 2.1 bug. |
| 2.3 Students join | UNVERIFIED | Buy-in modal exists. Actual seating unverified. |
| 2.4 Coach director view (sidebar) | UNVERIFIED | `CoachSidebar` exists. Whether it loads correctly for a new table unverified. |
| 2.5–2.7 Hand config / playlist | UNVERIFIED | UI exists. Unverified due to table creation bug blocking access. |
| 2.9 Closing the table | BROKEN | Old tables persist in lobby and do not close. Idle timer exists (`idleTimer.js`) but cleanup appears unreliable in practice. |

---

## Flow 3 — Uncoached Cash Table

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 3.1 Create uncoached table → redirect | BROKEN | Same redirect issue as 2.1. Table created but no navigation to table view. |
| 3.2 Auto-start / auto-pause rules | UNVERIFIED | `AutoController` exists and has logic for this. Cannot confirm due to redirect bug. |
| 3.3–3.4 Auto-pause / auto-close | UNVERIFIED | Same as 3.2. |
| 3.3 Coach joins as player | UNVERIFIED | `LobbyPage` has "join as player" path. Unverified. |
| 3.4 Coach joins as spectator | PARTIAL | Spectator join path exists in code. Whether sidebar loads with god-view and no game controls — unverified. |

---

## Flow 4 — Bot Tables

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 4.1 Bot lobby renders | OK | Confirmed working (tests pass, renders table list). |
| 4.2 Create bot table → redirect | BROKEN | No name input field in creation modal. After creation, no redirect to table. `BotLobbyPage` navigates to `/table/${tableId}` but this either fails silently or the API returns no ID. |
| 4.3 Bots fill seats / gameplay | UNVERIFIED | Cannot reach — blocked by 4.2. |
| 4.4 Recording | UNVERIFIED | Same. |

---

## Flow 5 — Hand Analysis & Review

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 5.1 Analysis page | PARTIAL | Page exists. Coach sees all hands — unverified. Student sees own hands — unverified. Filters exist in UI but period/game-type filters are non-functional stubs (known open issue). |
| 5.2 Auto-tags | OK | Auto-tagging pipeline confirmed working (60 server tests pass). Tags display in analysis — unverified in running app. |
| 5.3 Coach annotations | UNVERIFIED | Annotation endpoints exist. UI entry point — unverified. |
| 5.4 Group replay session | PARTIAL | Replay engine exists. Socket-driven group replay via `transition_to_review` event exists. Whether it syncs correctly for all participants — unverified. |
| 5.5 Save hand as scenario | UNVERIFIED | ScenarioBuilder exists. "Save as Scenario" from analysis — unknown if wired. |

---

## Flow 6 — CRM & Student Management

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 6.1 CRM overview | UNVERIFIED | `PlayerCRM` page exists. Actual data loading — unverified. |
| 6.2 Student profile (unified view) | MISSING | Known open issue. No single unified student profile page. Data spread across 6 separate pages. |
| 6.3 Alerts | PARTIAL | `AlertService` confirmed working. `CoachAlertsPage` exists. Whether alerts surface correctly in CRM — unverified. |
| 6.4 Pre-session brief | PARTIAL | `SessionPrepService` confirmed working. `PrepBriefTab` exists. Access path from CRM — unverified. |
| 6.5 Progress reports | PARTIAL | `ProgressReportService` confirmed working. `ReportsTab` exists. |
| 6.6 Create student from CRM | BROKEN | Same as Flow 1.3 — 500 error on creation. |

---

## Flow 7 — Groups & Stable

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 7.1 Group creation | UNVERIFIED | `GroupRepository` exists. UI entry point — unknown if it's in Settings or CRM. |
| 7.2 Student group assignment | UNVERIFIED | Backend exists. UI flow — unverified. |
| 7.3 Stable / chip bank | PARTIAL | `ChipBankRepository` confirmed working. UI for adjusting balances — unverified. |

---

## Flow 8 — Coach-Run Tournament

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 8.1 Create tournament | UNVERIFIED | `TournamentSetup` page exists. |
| 8.2–8.5 Tournament gameplay | UNVERIFIED | `TournamentController` confirmed working in tests. Live behavior — unverified. |

---

## Flow 9 — Organized Tournament

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 9.1–9.4 All | PARTIAL | Infrastructure exists (System B). Live end-to-end behavior — unverified. **HIGH PRIORITY.** Blocked on tournament system unification (see Architectural Decision in spec). |

---

## Flow 10 — Leaderboard & Shared Stats

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 10.1 Leaderboard renders | OK | Confirmed working (tests pass). |
| 10.1 Period/game-type filters | BROKEN | Known open issue — filters exist in UI but are non-functional stubs. Data does not re-fetch on filter change. |
| 10.2 Player stats tooltip at table | UNVERIFIED | Cannot test — table access blocked by redirect bug. |

---

## Flow 11 — Settings

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 11.1 Change name/password/email | UNVERIFIED | `SettingsPage` exists. Actual save behavior — unverified. |
| 11.2 Coach group management | UNVERIFIED | Unknown if this lives in Settings or CRM only. |
| 11.3 Admin school management | PARTIAL | School endpoints exist. UI in admin settings — unverified. |
| 11.4 Superadmin | UNVERIFIED | |

---

## Flow 12 — Scenarios & Playlists

| Story | Status | Gap Description |
|-------|--------|-----------------|
| 12.1 Scenario creation | UNVERIFIED | `HandBuilder` page + `ScenarioBuilderRepository` exist. |
| 12.2 Playlist creation | UNVERIFIED | `PlaylistRepository` exists. UI — unverified. |
| 12.3 Playlist in session | UNVERIFIED | Playlist section in `CoachSidebar` exists. Cannot test — blocked by table redirect bug. |
| 12.4 Sharing | MISSING | No playlist sharing between coaches implemented. |
| 12.5 Student access restrictions | UNVERIFIED | |

---

## Priority Fix Order

Based on what's broken and what's blocking everything else:

### P0 — Unblocks all table testing
1. **Table redirect on creation** (Flows 2.1, 3.1) — lobby table creation must navigate to `/table/:tableId` reliably
2. **Bot table creation modal** (Flow 4.2) — name field missing, redirect missing; add "Add Bot" in-table button
3. **Old tables persist** (Flow 2.9) — orphaned tables clog lobby

### P1 — Core data quality
4. **Create student 500 error** (Flow 1.3) — `UserForm` default role bug + missing coach assignment field + add email field
5. **Tournament system unification** (Flows 8 & 9) — merge System A and System B into one coherent flow; required for Flow 9 (now high priority)
6. **Leaderboard filters non-functional** (Flow 10.1) — data doesn't re-fetch on period/game-type change

### P2 — Verification pass (test in running app once P0 fixed)
- All UNVERIFIED items above — go through each flow in the live app and update status

### P3 — Missing features
- Unified student profile page (Flow 6.2) — currently 6 separate pages
- Playlist export/import (Flow 12.4)
- Self-service account deletion (Flow 1.7)
- Student notification when coach annotates a hand
- Multi-student pre-session brief (Flow 6.4)
