---
marp: true
theme: default
paginate: true
---

<style>
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap');

:root {
  --color-background: #0d1117;
  --color-foreground: #c9d1d9;
  --color-heading: #58a6ff;
  --color-accent: #7ee787;
  --color-gold: #d4af37;
  --color-code-bg: #161b22;
  --color-border: #30363d;
  --color-muted: #6e7681;
  --font-default: 'Inter', system-ui, sans-serif;
  --font-code: 'Fira Code', 'Consolas', monospace;
}

section {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-default);
  font-weight: 400;
  box-sizing: border-box;
  border-left: 4px solid var(--color-accent);
  position: relative;
  line-height: 1.55;
  font-size: 20px;
  padding: 56px;
}

h1, h2, h3 {
  font-weight: 700;
  color: var(--color-heading);
  margin: 0;
  padding: 0;
  font-family: var(--font-code);
}

h1 { font-size: 48px; line-height: 1.3; text-align: left; }
h1::before { content: '# '; color: var(--color-accent); }

h2 {
  font-size: 34px;
  margin-bottom: 28px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--color-border);
}
h2::before { content: '## '; color: var(--color-accent); }

h3 {
  color: var(--color-foreground);
  font-size: 22px;
  margin-top: 24px;
  margin-bottom: 8px;
}
h3::before { content: '### '; color: var(--color-accent); }

ul, ol { padding-left: 28px; }
li { margin-bottom: 8px; }
li::marker { color: var(--color-accent); }

pre {
  background-color: var(--color-code-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 14px;
  overflow-x: auto;
  font-family: var(--font-code);
  font-size: 15px;
  line-height: 1.5;
}

code {
  background-color: var(--color-code-bg);
  color: var(--color-accent);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--font-code);
  font-size: 0.9em;
}

pre code { background-color: transparent; padding: 0; color: var(--color-foreground); }

table {
  border-collapse: collapse;
  font-size: 17px;
  margin-top: 8px;
  width: 100%;
}
th, td {
  border-bottom: 1px solid var(--color-border);
  padding: 6px 10px;
  text-align: left;
}
th { color: var(--color-gold); font-family: var(--font-code); font-weight: 700; }

footer {
  font-size: 13px;
  color: var(--color-muted);
  font-family: var(--font-code);
  position: absolute;
  left: 56px;
  right: 56px;
  bottom: 32px;
  text-align: right;
}
footer::before { content: '// '; color: var(--color-accent); }

section.lead {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
section.lead h1 { margin-bottom: 20px; }
section.lead p { font-size: 20px; color: var(--color-muted); font-family: var(--font-code); }

strong { color: var(--color-gold); font-weight: 700; }

.metric {
  display: inline-block;
  background: rgba(126,231,135,0.08);
  border: 1px solid rgba(126,231,135,0.3);
  border-radius: 6px;
  padding: 4px 10px;
  margin-right: 6px;
  font-family: var(--font-code);
  color: var(--color-accent);
  font-size: 16px;
}
</style>

<!-- _class: lead -->

# UI Redesign V2

Recent changes · feat/phase2 merge + Phase 2 decomposition

`feat/ui-redesign-v1` · 2026-04-12

---

## Agenda

- Recent commit timeline
- `feat/phase2` merge — what landed
- **Phase 1**: Settings token migration
- **Phase 2**: Admin page decomposition
- Metrics & next steps

<footer>UI Redesign V2 · Overview</footer>

---

## Commit timeline

```text
54049d2  feat(ui): V2 Phase 2 — admin page decomposition   ← just shipped
5c933ec  Merge branch 'feat/phase2' into feat/ui-redesign-v1
9abf04e  feat(ui): Phase 1 — migrate Settings tabs to color tokens
c9ed960  docs: add UI Redesign V2 implementation plan (8 phases)
4cb2033  docs: use golden-angle hue distribution for playlist colors
3b13c18  docs: add UI Redesign V2 design spec
518f209  fix(ui): V1 completion — stale routes, dead imports
37e353c  chore(ui): remove old SideNav.old and GlobalTopBar components
```

<footer>git log --oneline -8</footer>

---

## Merge: feat/phase2 → feat/ui-redesign-v1

Commit **5c933ec** · 17 files · **+405 / −14**

- 1 conflict resolved: `client/src/components/SideNav.jsx`
- New e2e integrity suite: `e2e/16-integrity.spec.js` (+96)
- Server integrity tests: `apiIntegrity.test.js` (+276)
- E2E helper refactors: `auth.js`, `nav.js`
- Updated existing e2e specs (lobby, table, session-and-roles)
- Root page instrumentation across 6 pages

<footer>Integrity-focused merge — no UI changes</footer>

---

## Phase 1 — Settings Token Migration

Commit **9abf04e** · 10 files · **+207 / −199**

- Migrated 8 settings files from hex literals to `colors.js` tokens
- Files: `SettingsPage`, `SchoolTab`, `AlertsTab`, `OrgTab`, `PlatformTab`, `ProfileTab`, `TableDefaultsTab`, `DangerZoneTab`, `shared`
- Added tokens: `warningStrong`, `white`, `groupColors`
- Fixed stale `GOLD` constants (previously undeclared)
- Lucide-react tab icons replace emoji in `SettingsPage`

<footer>Zero hardcoded hex in settings/</footer>

---

## Phase 1 — Before / After

```jsx
// BEFORE — raw hex scattered across 8 files
<span style={{ color: '#d4af37' }}>SETTINGS</span>
<div style={{ background: '#161b22', border: '1px solid #30363d' }}>

// AFTER — centralised tokens
import { colors } from '../../lib/colors.js';
<span style={{ color: colors.gold }}>Settings</span>
<div style={{ background: colors.bgSurfaceRaised,
             border: `1px solid ${colors.borderStrong}` }}>
```

Future theme swaps propagate automatically.

<footer>1017 client tests pass</footer>

---

## Phase 2 — Admin Decomposition

Commit **54049d2** · 16 files · **+1371 / −739**

Two bloated admin pages decomposed into 6 focused components:

| File | Before | After |
|---|---|---|
| `UserManagement.jsx` | 655L | **247L** |
| `RefereeDashboard.jsx` | 367L | **183L** |

Both pages retain data fetching + orchestration only.

<footer>Under 250 / 200 line targets</footer>

---

## Phase 2 — New components

All under `client/src/components/admin/`:

- **`UserTableRow.jsx`** — row + `StatusBadge`, `RolePill`, `ActionsMenu`, `Pagination`
- **`UserFilters.jsx`** — search · role select · status tabs · refresh
- **`ResetPasswordModal.jsx`** — password reset with success state
- **`DeleteConfirmModal.jsx`** — type-to-verify destructive action
- **`MovePlayerModal.jsx`** — tournament player reassignment
- **`TournamentTableCard.jsx`** — card with stats, players, action buttons

<footer>6 focused components, all token-driven</footer>

---

## Phase 2 — Design system changes

Added **12 subtle tokens** to `colors.js` for tinted backgrounds:

```js
goldTint:     'rgba(212,175,55,0.15)',
goldBorder:   'rgba(212,175,55,0.4)',
successTint:  'rgba(63,185,80,0.1)',
successBorder:'rgba(63,185,80,0.3)',
errorTint:    'rgba(248,81,73,0.1)',
errorBorder:  'rgba(248,81,73,0.3)',
warningTint   warningBorder
infoTint      infoBorder
mutedTint     mutedBorder
```

Killed all raw `rgba()` from JSX.

<footer>colors.js — single source of truth</footer>

---

## Phase 2 — Icon migration

Emoji → **lucide-react** across all admin surfaces:

| Before | After |
|---|---|
| `⋯` | `<MoreHorizontal />` |
| `✕` | `<X />` |
| `↻` | `<RefreshCw />` |
| `←` | `<ArrowLeft />` · `<ChevronLeft />` |
| `→` | `<ChevronRight />` |
| `↓ Export CSV` | `<Download /> Export CSV` |
| `+ Add User` | `<Plus /> Add User` |

<footer>Consistent iconography platform-wide</footer>

---

## Phase 2 — V1 header pattern

```jsx
// BEFORE — all-caps headline with letter-spacing
<h1 className="text-lg font-bold tracking-[0.12em]"
    style={{ color: '#d4af37' }}>
  USER MANAGEMENT
</h1>

// AFTER — V1 standard
<h1 className="text-xl font-bold"
    style={{ color: colors.textPrimary }}>
  User Management
</h1>
<p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
  {filtered.length} users shown
</p>
```

<footer>Applied to UserManagement + RefereeDashboard</footer>

---

## Phase 2 — Verification

- **`npm run build`** — ✓ clean
- **`npx vitest run`** — **1050 / 1050 passing**
- 39 new tests across 6 test files
- Zero hardcoded hex in modified files
- Zero emoji icons remaining in admin JSX

<span class="metric">+1371</span>
<span class="metric">−739</span>
<span class="metric">net −632 legacy code</span>

<footer>Build + tests green</footer>

---

## Progress against V2 plan

- [x] **Phase 1** — Settings token migration
- [x] **Phase 2** — Admin page decomposition
- [ ] Phase 3 — HandBuilder backend (migration 051 + scenarios API)
- [ ] Phase 4 — HandBuilder playlist tree
- [ ] Phase 5 — HandBuilder header + seeding + cross-list
- [ ] Phase 6 — Save as Scenario modal
- [ ] Phase 7 — Tournament polish
- [ ] Phase 8 — Final verification

**2 of 8 phases complete · 25%**

<footer>plans/ui-redesign-v2.md</footer>

---

<!-- _class: lead -->

# Next: Phase 3

Backend slice — migration 051, `primary_playlist_id`, scenarios API

Ready to continue?
