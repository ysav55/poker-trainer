---
marp: true
theme: default
paginate: true
---

<style>
:root {
  --bg: #0d1117;
  --surface: #161b22;
  --text: #e6edf3;
  --muted: #8b949e;
  --gold: #d4af37;
  --success: #3fb950;
  --error: #f85149;
  --warning: #d29922;
  --info: #58a6ff;
  --border: #30363d;
}

section {
  background-color: var(--bg);
  color: var(--text);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 18px;
  padding: 48px;
  line-height: 1.6;
  border-bottom: 3px solid var(--gold);
}

h1, h2 { color: var(--gold); margin: 0; font-weight: 700; }
h1 { font-size: 40px; }
h2 { position: absolute; top: 36px; left: 48px; font-size: 28px; }
h2 + * { margin-top: 72px; }
h3 { color: var(--info); font-size: 20px; margin-top: 16px; }
strong { color: var(--info); }
em { color: var(--muted); font-style: normal; }

pre {
  background-color: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px;
  font-size: 13px;
  line-height: 1.4;
}

table { width: 100%; border-collapse: collapse; font-size: 15px; }
th { background: var(--surface); color: var(--gold); padding: 8px 12px; text-align: left; border-bottom: 2px solid var(--border); }
td { padding: 8px 12px; border-bottom: 1px solid #21262d; }

section.lead { display: flex; flex-direction: column; justify-content: center; }
section.lead h1 { margin-bottom: 12px; }
section.lead p { font-size: 18px; color: var(--muted); }
</style>

<!-- _class: lead -->

# Phase 2 Complete
Sidebar + Layout — 6 commits shipped

---

## New Sidebar Structure

```
┌──────────────────────┐    ┌────┐
│ ♠ Holdem Hub         │    │ ♠  │
│                      │    │    │
│ PlayerName           │    │1270│
│ 💰 1,270  [+ Add]   │    │    │
│ 3 online · 2 tables  │    ├────┤
├──────────────────────┤    │ 🏠 │
│ HOME                 │    │ 🎰 │
│  🏠 Dashboard        │    │ 🏆 │
│  🎰 Tables           │    │ 📋 │
│  🏆 Tournaments      │    │ 🏅 │
│  📋 History          │    ├────┤
│  🏅 Leaderboard      │    │ 👥 │
│                      │    │ 📂 │
│ COACHING    (coach+) │    │ 🎯 │
│  👥 Students         │    ├────┤
│  📂 Groups           │    │ ⚙  │
│  🎯 Scenarios        │    │ ◀  │
├──────────────────────┤    └────┘
│  ⚙  Settings         │
│  ◀ Collapse          │     56px
└──────────────────────┘
        220px
```

---

## Component Architecture

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px;">
<div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px;">

### SideNav/ directory

```
SideNav/
  SideNav.jsx         ← composition root
  SidebarHeader.jsx   ← user info + chips
  NavGroup.jsx        ← section label + children
  NavItem.jsx         ← icon + label + badge
  useSidebarState.js  ← expand/collapse hook
  index.js            ← re-export
```

</div>
<div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px;">

### Key behaviors

- **220px** expanded / **56px** collapsed
- **localStorage** persisted state
- **Auto-collapse** below 1280px
- **Lucide icons** (Home, Table2, Trophy…)
- **Gold active state** — 3px left border
- **Role-gated** — coach+ sees COACHING

</div>
</div>

---

## AppLayout Rewrite

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 16px;">
<div>

### Before

```
┌─────────────────────────┐
│    GlobalTopBar (48px)   │
│ ♠ POKER TRAINER · Lobby  │
│        🪙 1,270  [Admin] │
├────┬────────────────────┤
│    │                    │
│ 64 │    <Outlet />      │
│ px │                    │
│    │                    │
└────┴────────────────────┘
```

*TopBar + emoji sidebar*

</div>
<div>

### After

```
┌──────────────────────────┐
│           │              │
│  220px    │              │
│  SideNav  │  <Outlet />  │
│  (chips,  │              │
│   logo,   │              │
│   nav)    │              │
│           │              │
└──────────────────────────┘
```

*No topbar. Sidebar owns user info.*

</div>
</div>

---

## Route Changes

| Old Route | New Behavior |
|---|---|
| `/lobby` | → **redirect** to `/dashboard` |
| `/bot-lobby` | → **redirect** to `/tables?filter=bot` |
| `/dashboard` | **New** — stub (Phase 3 builds it out) |
| `/tables` | **New** — stub (Phase 3 builds it out) |
| `*` wildcard | → `/dashboard` (was `/lobby`) |

*All existing routes (`/tournaments`, `/history`, `/admin/*`) unchanged.*

---

## What Shipped

| Commit | Files | What |
|---|---|---|
| `a4b0461` | `useSidebarState.js` | localStorage + auto-collapse hook |
| `a4b0461` | `NavItem.jsx` | Icon + label + badge + active state |
| `a4b0461` | `NavGroup.jsx` | Section header + divider |
| `a4b0461` | `SidebarHeader.jsx` | User info, chips, school stats |
| `c465ba7` | `SideNav.jsx` + `index.js` | Composition root wiring all parts |
| `f66aa55` | `AppLayout.jsx` + `App.jsx` | Layout rewrite, routes, stubs |

**Tests:** 995 passing (59 files), zero regressions

**Next:** Phase 3 — Dashboard + Tables (extract from 1,064-line LobbyPage)
