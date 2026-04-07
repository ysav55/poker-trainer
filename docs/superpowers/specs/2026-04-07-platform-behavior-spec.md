# Poker Coaching Platform — System Behavior Spec

> **Status:** Authoritative target state. Written 2026-04-07.
> This document defines what the platform is supposed to do. It does not describe current code state.
> For gap analysis, see `2026-04-07-platform-gap-audit.md`.

---

## Product Summary

A browser-based poker coaching platform used by coaches and students during live video calls. The platform is a shared interactive poker table — the coach is the director, students are the players. The video call (Zoom, Discord, etc.) is external and not part of this platform.

**Core loop:** Coach sets up a session → students join a table → hands are played (coached, free-form, or scripted) → system auto-tags and records every hand → coach annotates → data accumulates in CRM over time.

---

## Roles

| Role | Description |
|------|-------------|
| `superadmin` | Full platform access. Manages admins. |
| `admin` | Manages schools, coaches, students, platform settings. |
| `coach` | Runs sessions, manages their student roster and groups, annotates hands. |
| `coached_student` | Assigned to a coach. Plays at tables, sees own history. |
| `solo_student` | No assigned coach. Self-directed. |

**Trial:** A status flag (not a role). New self-registered students start in trial — 7 days / 20 hands. Coach or admin can lift trial at any time.

---

## Flow 1 — Onboarding & Account Management

### 1.1 Superadmin creates admin
- Superadmin fills form: name, email, password, role=admin.
- Account created immediately, no email verification.

### 1.2 Admin creates coach
- Admin fills form: name, email, password, role=coach.
- Optionally assigns coach to a school.

### 1.3 Admin creates student
- Admin fills form: name, password, role (coached_student or solo_student).
- If coached_student: must select a coach from a dropdown of existing coaches. Coach assignment is mandatory, not optional.
- Student is active immediately.

### 1.4 Coach creates student
- Coach fills form: name, password.
- Role is always coached_student. Coach is automatically assigned as their coach.
- Optionally assigns to one or more groups.

### 1.5 Student self-registers
- Student fills: name, password, optional email.
- Optionally selects a coach from a list.
- If coach selected → coached_student. If no coach → solo_student.
- Account starts in trial status.

### 1.6 Password reset
- Student cannot reset their own password.
- Admin or coach resets on their behalf via User Management or CRM.
- Reset sets a temporary password the student changes on next login.

### 1.7 Account deletion / archiving
- Any user can request deletion of their own account from Settings.
- Admin or superadmin executes the deletion.
- Deleted accounts are archived (soft-delete), not hard-deleted. Hand history is preserved.

---

## Flow 2 — Coached Cash Session

### 2.1 Coach creates a coached table
- From lobby: clicks "New Table" → modal appears.
- Sets: table name, small blind / big blind, max seats (2–9), buy-in range (min/max).
- Mode is `coached_cash`.
- Table is created → coach is immediately redirected to the table view (director mode).
- Table appears in lobby for all users in the coach's school.

### 2.2 Students join the table
- Student sees table in lobby with status chip (waiting / active).
- Clicks "Join" → buy-in modal → selects amount within min/max range → seated at table.
- Student sees the poker table UI with their seat highlighted.

### 2.3 Coach director view
- Coach is NOT seated as a player by default.
- Coach sees the full poker table + a persistent sidebar.
- Sidebar sections: Hand Config, Playlist, Active Seats, Hand History, Replay Controls.
- Coach sees all hole cards at all times (god view).

### 2.4 Controlling who plays
- Coach sidebar shows all seats with toggle: Active / Sit Out.
- Minimum 2 active seats to deal a hand.
- Coach can change active/sit-out state between hands (not mid-hand).

### 2.5 Hand configuration
- Coach can configure the next hand before dealing:
  - Assign specific hole cards to specific seats (unassigned = RNG).
  - Assign board cards (flop/turn/river) or leave RNG.
  - Set stack sizes per seat (overrides current stack).
- Once dealt, configuration is locked for that hand.

### 2.6 Playlist
- Coach can load a playlist from the sidebar.
- Each deal uses the next scenario in the playlist.
- Coach can skip forward/backward in the playlist.
- Coach can break out of playlist back to free-form (RNG) at any time.

### 2.7 Dealing and play
- Coach clicks "Deal" → hand starts → all active players receive hole cards.
- Betting proceeds in normal poker order. Each player acts via the UI.
- Coach can at any point: Pause hand, Undo last action, Force end hand.

### 2.8 After the hand
- Hand is saved to DB automatically.
- System runs auto-tagging (mistakes, sizing, positional, etc.) asynchronously.
- Coach can add manual annotations from the sidebar.
- Hand appears in session history for all participants.

### 2.9 Closing the table
- Coach clicks "Close Table" from sidebar or table menu.
- All players are removed. Table disappears from lobby immediately.
- Session stats are finalized.

---

## Flow 3 — Uncoached Cash Table

### 3.1 Creating an uncoached table
- Any user (student or coach) can create an uncoached table from lobby.
- Sets: name, blinds, max seats, buy-in range.
- Mode is `uncoached_cash`.
- Creator is redirected to the table and automatically seated.

### 3.2 Auto-start / auto-pause rules
- Table auto-deals when ≥ 3 players are active and seated.
- If active players drop to 2: table pauses after current hand ends. No new hands dealt.
- If active players drop to 1: table enters waiting state.
- If active players drop to 0 (all leave): table closes automatically and is removed from lobby.

### 3.3 Coach joins as player
- Coach sees the uncoached table in lobby.
- Can click "Join as Player" → buys in → seated as equal participant.
- No sidebar in this mode. Coach plays like any other player.
- Coach's hands are recorded and tagged the same as any player's.

### 3.4 Coach joins as spectator
- Coach can click "Watch" → enters spectator mode.
- Spectator sees all hole cards (god view).
- Spectator sidebar: can tag any hand, write session notes.
- Spectator cannot: deal, undo, pause, configure hands, or affect the game in any way.
- Spectator notes/tags are not visible to players during the session.

### 3.5 Hand recording
- All hands recorded identically to coached mode.
- Auto-tagging runs on every hand.
- Appears in each player's hand history.

---

## Flow 4 — Bot Tables

### 4.1 Bot lobby
- Separate lobby section: "Play vs Bots".
- Shows available bot tables with difficulty and current status.

### 4.2 Creating a bot table
- Student clicks "New Game" → modal with: table name, difficulty (easy/medium/hard).
- Table is created → student is immediately redirected to the table and seated.
- Bots fill remaining seats automatically.

### 4.3 Gameplay
- Table auto-deals continuously. No minimum human player count.
- Bots act automatically within a time limit.
- Student plays normally.

### 4.4 Recording
- All hands recorded and auto-tagged identically to other modes.
- Appears in student's hand history and coach's CRM view.

---

## Flow 5 — Hand Analysis & Review

### 5.1 Analysis page
- Accessible to coach and students.
- Coach sees all hands across all students. Student sees only their own.
- Filterable by: player, session, tag, street, date range, game type.

### 5.2 Auto-tags
- System tags each hand automatically after it ends.
- Tags visible inline on each hand row.
- Tag categories: mistakes, sizing, positional, street, pot type, hand strength.

### 5.3 Coach annotations
- Coach can add a text annotation to any hand or specific action.
- Annotations are visible to the student (coach decides when to share — or always visible, TBD per school setting).

### 5.4 Group replay session
- Coach initiates a replay from the analysis page or sidebar.
- All connected students in the session see the same replay in sync.
- Coach controls: step forward/back, branch (explore alternate line), exit replay.

### 5.5 Save hand as scenario
- Coach can click "Save as Scenario" on any hand in analysis.
- Scenario is saved to their scenario library with hand config pre-filled.

---

## Flow 6 — CRM & Student Management

### 6.1 CRM overview
- Coach opens CRM → sees all their students in a table.
- Columns: name, group, last active, hands played (30d), VPIP, PFR, alerts count.
- Filterable by group, status, alert presence.

### 6.2 Student profile (unified view)
- Coach clicks a student → single profile page.
- Sections: Overview stats, Session history, Hand history, Tags summary, Alerts, Baseline trends, Prep brief, Reports.
- Everything about one student in one place.

### 6.3 Alerts
- System generates alerts automatically: inactivity, volume drop, mistake spike, losing streak, stat regression, positive milestone.
- Alerts appear on CRM overview (badge count) and on student profile.
- Coach can dismiss/resolve alerts.

### 6.4 Pre-session brief
- Coach clicks "Prep Brief" before a session with a student.
- System generates: recent performance summary, key leaks, suggested focus areas.
- Cached for 1 hour.

### 6.5 Progress reports
- Coach generates a report for a student: weekly / monthly / custom range.
- Report covers: volume, win rate, stat trends, mistake frequency, improvement areas.

### 6.6 Create student from CRM
- Coach clicks "Add Student" from CRM.
- Form: name, password. Coach is auto-assigned. Optional group assignment.

---

## Flow 7 — Groups & Stable

### 7.1 Groups
- Coach creates named, color-coded groups.
- Students can belong to multiple groups simultaneously.
- Groups are visible in CRM filtering and student profiles.

### 7.2 Stable (special group)
- "Stable" is a group with a financial ledger attached.
- Each staked student has a chip bank: buy-in history, cash-out history, current balance.
- Coach adjusts balances manually after sessions.
- Only coach and admin can see financial data. Students cannot see other students' financials.

### 7.3 Group stats
- Coach can view aggregate stats per group: avg VPIP, avg win rate, total hands, etc.

---

## Flow 8 — Coach-Run Tournament

### 8.1 Creating a tournament
- Coach creates from lobby: name, starting stacks, blind schedule (levels + durations), max players, rebuy/addon options.
- Tournament appears in lobby for the coach's students.

### 8.2 Registration and start
- Students join tournament lobby → registered.
- Coach starts tournament → players assigned to tables → first hand dealt.

### 8.3 Gameplay
- Hands auto-deal. Blind levels advance on schedule.
- Eliminations tracked automatically. Bust player's chips go to winner.
- Tables auto-balance as players bust (fill seats from other tables).

### 8.4 Coach controls
- Can pause tournament, manually adjust blind level, manually bust/reinstate a player.
- Can view all tables simultaneously from a tournament overview.

### 8.5 Completion
- Final player wins. Standings saved. Chip counts recorded.
- Hands from the tournament appear in each player's hand history tagged as tournament hands.

---

## Flow 9 — Organized Tournament (Large Format)

### 9.1 Admin creates tournament
- Admin creates: name, structure, date, max players, assigns referees.
- Registration opens — students register via lobby.

### 9.2 Referee management
- Referees assigned per table.
- Referee dashboard: manage their table, record bust-outs, flag disputes.

### 9.3 Admin oversight
- Admin sees all tables in a referee dashboard.
- Can balance tables, move players, override referee decisions.

### 9.4 Completion
- Admin closes tournament. Final standings published to all participants.

---

## Flow 10 — Leaderboard & Shared Stats

### 10.1 Leaderboard
- Accessible to all authenticated users.
- Shows: rank, player name, net chips, hands played, VPIP, PFR.
- Filters: period (all time / 30d / 7d), game type (cash / tournament / all).
- Filters are functional — data re-fetches on change.

### 10.2 Player stats at table
- Any player can hover another player's seat avatar.
- Tooltip shows: session VPIP, session PFR, hands played this session.

### 10.3 Privacy
- Students see aggregate stats only. No access to another student's hand history or coach notes.

---

## Flow 11 — Settings

### 11.1 All users
- Change display name.
- Change password (requires current password).
- Change email.
- Request account deletion (admin executes).

### 11.2 Coach settings
- Manage groups: create, rename, recolor, delete, assign students.
- View and manage student roster.
- Manage chip bank entries for staked students.

### 11.3 Admin settings
- Create and manage schools: name, coach capacity, student capacity.
- Enable/disable features per school: replay, analysis, chip bank, playlists, tournaments, CRM, leaderboard, scenarios, groups.
- Assign coaches to schools.
- Platform user list: create, edit, reset passwords, archive accounts.

### 11.4 Superadmin settings
- All admin settings.
- Role assignment for any user.
- Platform-wide feature flags.

---

## Flow 12 — Scenarios & Playlists

### 12.1 Scenario creation
- Coach creates a scenario from the Hand Builder (admin menu) or from "Save as Scenario" on any hand.
- Config: name, description, hole cards per seat (optional), board cards (optional), stack sizes (optional), position assignments (optional). Unset fields are RNG at deal time.

### 12.2 Playlist creation
- Coach creates a playlist: name, ordered list of scenarios.
- Can reorder, add, remove scenarios from the playlist.

### 12.3 Using playlists in session
- Coach loads playlist from sidebar during a coached session.
- Playlist advances automatically after each hand, or coach skips manually.
- Coach can exit playlist at any time — reverts to free-form.

### 12.4 Sharing
- Coach can share a playlist with another coach (read-only copy).
- Shared playlists appear in the recipient's playlist library marked as "shared".

### 12.5 Student access
- Students cannot create or edit scenarios or playlists.
- Students cannot see the scenario configuration before a hand is dealt.

---

## Non-Functional Requirements

- **Auth:** All routes require authentication except `/login`, `/register`, `/forgot-password`.
- **Permissions:** System-level gates use `requirePermission(key)`. Tournament-scoped gates use `requireTournamentAccess()`. Never mix these.
- **Real-time:** Table state, hand actions, and seat changes are socket-driven. REST is for persistence only.
- **Recording:** Every hand played on any table type (coached, uncoached, bot, tournament) is saved to DB and auto-tagged.
- **Stability:** A failing auto-tagger must not break hand save. Use `Promise.allSettled` in the analyzer pipeline.
- **Old tables:** Tables must not persist after all players leave or after coach closes them. Idle timer closes orphaned tables after 20 minutes of inactivity.
