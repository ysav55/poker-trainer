---
marp: true
theme: default
paginate: true
size: 16:9
---

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

:root {
  --bg-primary: #060a0f;
  --bg-surface: #0d1117;
  --bg-raised: #161b22;
  --bg-hover: #1c2128;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  --gold: #d4af37;
  --gold-hover: #e6c34d;
  --gold-subtle: rgba(212,175,55,0.07);
  --success: #3fb950;
  --error: #f85149;
  --warning: #d29922;
  --info: #58a6ff;
  --border: #21262d;
  --border-strong: #30363d;
}

section {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 400;
  font-size: 18px;
  line-height: 1.5;
  padding: 48px 56px;
  position: relative;
}

section::after {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 700;
  margin: 0;
  padding: 0;
}

h1 {
  font-size: 52px;
  line-height: 1.2;
  color: var(--text-primary);
}

h2 {
  font-size: 32px;
  color: var(--gold);
  margin-bottom: 24px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--border-strong);
}

h3 {
  font-size: 22px;
  color: var(--info);
  margin-top: 16px;
  margin-bottom: 8px;
}

h4 {
  font-size: 18px;
  color: var(--text-secondary);
  font-weight: 500;
}

ul, ol {
  padding-left: 24px;
}

li {
  margin-bottom: 6px;
  color: var(--text-secondary);
}

li::marker {
  color: var(--gold);
}

strong {
  color: var(--gold);
  font-weight: 600;
}

em {
  color: var(--info);
  font-style: normal;
}

code {
  background: var(--bg-raised);
  color: var(--success);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85em;
  border: 1px solid var(--border);
}

pre {
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
  color: var(--text-secondary);
}

pre code {
  background: transparent;
  border: none;
  padding: 0;
  color: var(--text-secondary);
}

a {
  color: var(--info);
  text-decoration: none;
}

blockquote {
  border-left: 3px solid var(--gold);
  padding-left: 16px;
  color: var(--text-secondary);
  font-style: normal;
  margin: 12px 0;
  background: var(--gold-subtle);
  padding: 12px 16px;
  border-radius: 0 6px 6px 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th {
  background: var(--bg-raised);
  color: var(--gold);
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
  border-bottom: 2px solid var(--border-strong);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
}

tr:hover td {
  background: var(--bg-hover);
}

/* Lead slide */
section.lead {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  background: linear-gradient(135deg, var(--bg-primary) 0%, #0d1520 50%, #111a25 100%);
}

section.lead h1 {
  font-size: 56px;
  margin-bottom: 16px;
}

section.lead p {
  font-size: 20px;
  color: var(--text-secondary);
}

/* Section divider */
section.section-divider {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  background: var(--bg-surface);
}

section.section-divider h2 {
  font-size: 44px;
  border-bottom: none;
  padding-bottom: 0;
}

section.section-divider p {
  color: var(--text-muted);
  font-size: 18px;
}

/* Wireframe box styling */
section .wire {
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 16px;
}
</style>

<!-- _class: lead -->
<!-- _paginate: false -->

# Poker Trainer
## UI Redesign Mockup Deck

**v3 Full-Scope Redesign** — every page, every role
Dark theme with gold accents | Responsive | Accessible

---

## Navigation — SideNav

```
 ┌──────────────────────┐ ┌────────────────────────────────────────────────┐
 │  ♠ POKER TRAINER     │ │  GlobalTopBar                                  │
 │  ──────────────────  │ │  ◄ Dashboard          🪙 1,250    Jo ▾  coach  │
 │                      │ ├────────────────────────────────────────────────┤
 │  PLAY                │ │                                                │
 │  ● Dashboard         │ │                                                │
 │    Tables            │ │                                                │
 │    Bot Practice      │ │          Page content renders here             │
 │    Tournaments       │ │                                                │
 │                      │ │                                                │
 │  COACHING            │ │                                                │
 │    Students          │ │                                                │
 │    Groups            │ │                                                │
 │    Scenarios         │ │                                                │
 │    Alerts        (3) │ │                                                │
 │                      │ │                                                │
 │  REVIEW              │ │                                                │
 │    Hand History      │ │                                                │
 │    Leaderboard       │ │                                                │
 │                      │ │                                                │
 │  ADMIN               │ │                                                │
 │    Users             │ │                                                │
 │  ──────────────────  │ │                                                │
 │  ⚙ Settings          │ │                                                │
 │  « Collapse          │ │                                                │
 └──────────────────────┘ └────────────────────────────────────────────────┘
   220px labeled             Fluid content area
   Collapses to 56px        Max-width: 1280px centered
```

- **Gold** left border + text on active item | Lucide icons 20px + 13px labels
- Coach sees 12 items | Student sees 7 (no COACHING/ADMIN sections)

---

<!-- _class: section-divider -->

## Auth Pages
Login | Register | Forgot Password

Standalone — no sidebar or topbar

---

## Login

```
              ┌────────────────────────────────────────┐
              │                                        │
              │          ♠  POKER TRAINER              │
              │                                        │
              │   ┌──────────────────────────────┐     │
              │   │  Email                       │     │
              │   └──────────────────────────────┘     │
              │                                        │
              │   ┌──────────────────────────────┐     │
              │   │  Password                    │     │
              │   └──────────────────────────────┘     │
              │            Forgot password? ─►         │
              │                                        │
              │   ┌──────────────────────────────┐     │
              │   │       ★  Sign In             │     │
              │   └──────────────────────────────┘     │
              │                                        │
              │      Don't have an account?            │
              │      Register ─►                       │
              │                                        │
              └────────────────────────────────────────┘
                         max-w-sm centered
                    min-h-screen flex-center
```

- Gold focus ring on inputs | `text-sm` labels | Error icon + message below field
- Enter submits | Button disables + spinner during request

---

## Register

```
              ┌────────────────────────────────────────┐
              │          ♠  POKER TRAINER              │
              │                                        │
              │   ┌──────────┐ ┌──────────┐            │
              │   │ Student  │ │  Coach   │  ◄ tabs    │
              │   └──────────┘ └──────────┘            │
              │                                        │
              │   ┌──────────────────────────────┐     │
              │   │  Display Name                │     │
              │   └──────────────────────────────┘     │
              │   ┌──────────────────────────────┐     │
              │   │  Email                       │     │
              │   └──────────────────────────────┘     │
              │   ┌──────────────────────────────┐     │
              │   │  Password                    │     │
              │   └──────────────────────────────┘     │
              │   ┌──────────────────────────────┐     │
              │   │  Invite Code (if student)    │     │
              │   └──────────────────────────────┘     │
              │                                        │
              │   ┌──────────────────────────────┐     │
              │   │      ★  Create Account       │     │
              │   └──────────────────────────────┘     │
              │                                        │
              │   ⓘ Coach accounts need admin approval │
              │                                        │
              │      Already have an account?          │
              │      Sign in ─►                        │
              └────────────────────────────────────────┘
```

- Tab switcher: Student / Coach with `text-sm` labels
- Inline validation per field | Toast on success + auto-redirect

---

<!-- _class: section-divider -->

## Core Pages
Dashboard | Tables | Poker Table

---

## Dashboard — Coach View

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Dashboard                                      🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │
 │  │ Active     │ │ Students   │ │ Hands /    │ │ Avg Grade  │       │
 │  │ Tables   3 │ │ Online   8 │ │ Week   142 │ │        B+  │       │
 │  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │
 │                                                                      │
 │  ┌───────── Alert Feed ──────────────────────────────────────┐      │
 │  │ ● Miguel hasn't played in 5 days          stat_regression │      │
 │  │ ● Sarah's mistake rate spiked 40%         mistake_spike   │      │
 │  │ ● Andre hit 500 hands milestone!          positive        │      │
 │  │                                          See All ─►       │      │
 │  └───────────────────────────────────────────────────────────┘      │
 │                                                                      │
 │  ┌─── Active Tables ───────────────────────┐  ┌─── Quick Links ──┐ │
 │  │ ┌─────────┐ ┌─────────┐ ┌─────────┐    │  │ ★ Students       │ │
 │  │ │ Main    │ │ Beginn. │ │ Bot #4  │    │  │ ★ Create Table   │ │
 │  │ │ 6/9     │ │ 3/6     │ │ auto    │    │  │ ★ Scenarios      │ │
 │  │ └─────────┘ └─────────┘ └─────────┘    │  └──────────────────┘ │
 │  │                          View All ─►    │                        │
 │  └─────────────────────────────────────────┘                        │
 │                                                                      │
 │  ┌─── Recent Activity ──────────────────────────────────────────┐   │
 │  │ Hand #4012  Main Table  [OPEN_LIMP] [C_BET]   2 min ago     │   │
 │  │ Hand #4011  Main Table  [3BET_POT]             5 min ago     │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 └──────────────────────────────────────────────────────────────────────┘
```

---

## Dashboard — Student View

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Dashboard                                      🪙 1,250   Eli ▾   │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │
 │  │ Chip Bank  │ │ Hands      │ │ VPIP       │ │ Leaderboard│       │
 │  │    1,250   │ │ Played 89  │ │    24%     │ │ Rank  #4   │       │
 │  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │
 │                                                                      │
 │  ┌─── Announcements ────────────────────────────────────────┐       │
 │  │ 📢  Tournament this Friday 7pm — sign up in Tournaments  │       │
 │  └──────────────────────────────────────────────────────────┘       │
 │                                                                      │
 │  ┌─── Available Tables ───────────────────┐ ┌─── Coach Notes ────┐  │
 │  │ ┌─────────┐ ┌─────────┐ ┌─────────┐   │ │ "Work on 3-bet    │  │
 │  │ │ Main    │ │ Adv.    │ │ Tourney │   │ │  sizing from BTN   │  │
 │  │ │ 4/6 ●   │ │ 2/6 ●   │ │ REG     │   │ │  — good progress   │  │
 │  │ └─────────┘ └─────────┘ └─────────┘   │ │  on c-bet freq"    │  │
 │  └────────────────────────────────────────┘ └────────────────────┘  │
 │                                                                      │
 │  ┌─── Bot Practice ─────────────────────────────────────────┐       │
 │  │  ★ Quick Start: Easy │ Medium │ Hard         New Game ─► │       │
 │  └──────────────────────────────────────────────────────────┘       │
 └──────────────────────────────────────────────────────────────────────┘
```

---

## Tables Page

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Tables                                         🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌ All ┐ ┌ Coached ┐ ┌ Uncoached ┐ ┌ Bot ┐   [🔍 Search]  [+ New] │
 │  └─────┘ └─────────┘ └───────────┘ └─────┘                         │
 │                                                                      │
 │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
 │  │ Main Table   │  │ Beginners    │  │ Advanced     │              │
 │  │              │  │              │  │              │              │
 │  │ coached_cash │  │ coached_cash │  │ uncoached    │              │
 │  │ 6/9 players  │  │ 3/6 players  │  │ 4/6 players  │              │
 │  │ 1/2 blinds   │  │ 1/2 blinds   │  │ 2/5 blinds   │              │
 │  │              │  │              │  │              │              │
 │  │ ★ Join       │  │ ★ Join       │  │ ★ Buy In     │              │
 │  └──────────────┘  └──────────────┘  └──────────────┘              │
 │                                                                      │
 │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
 │  │ Friday MTT   │  │ Bot Easy #1  │  │  + + + + +   │              │
 │  │              │  │              │  │              │              │
 │  │ tournament   │  │ bot_cash     │  │  New Table   │              │
 │  │ 12 entrants  │  │ autonomous   │  │  (coach+)    │              │
 │  │ REG OPEN     │  │ 6/6 bots     │  │              │              │
 │  │              │  │              │  │              │              │
 │  │ ★ Register   │  │ ★ Spectate   │  │  ★ Create    │              │
 │  └──────────────┘  └──────────────┘  └──────────────┘              │
 │                                                                      │
 │  [ Open Multi-View ]                                                │
 └──────────────────────────────────────────────────────────────────────┘
```

- Filter tabs role-aware | Auto-fill responsive grid | NewTableCard for coach+

---

## Table — Poker View

```
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  Main Table  ·  Hand #4012  ·  1/2 NL Hold'em  ·  coached_cash             │
 ├───────────────────────────────────────────────────────────────┬──────────────┤
 │                                                               │ CoachSidebar │
 │            ┌─────┐                ┌─────┐                     │              │
 │            │ P3  │                │ P4  │                     │ Hand Config  │
 │            │ 850 │                │ 1.2k│                     │ ──────────── │
 │            └─────┘                └─────┘                     │ Deck: random │
 │                                                               │ Board: —     │
 │     ┌─────┐    ╔════════════════════╗    ┌─────┐             │              │
 │     │ P2  │    ║                    ║    │ P5  │             │ Controls     │
 │     │ 920 │    ║   ♠ ♥  BOARD  ♦ ♣ ║    │ 780 │             │ ──────────── │
 │     └─────┘    ║   Ah  Kd  9s      ║    └─────┘             │ [Deal]       │
 │                ║   Pot: 245        ║                         │ [Undo]       │
 │            ┌───║────────────────────║───┐                     │ [Next Hand]  │
 │            │ P1╚════════════════════╝P6 │                     │              │
 │            │ 1k                    550│                     │ Replay       │
 │            └───────────────────────────┘                     │ ──────────── │
 │                                                               │ [◄][▶][▶▶]  │
 │         ┌──────────────────────────────────┐                 │              │
 │         │  ★ HERO: [As] [Kh]   POT: 245   │                 │ Players      │
 │         │                                  │                 │ ──────────── │
 │         │  [Fold]  [Check]  [Bet ___]      │                 │ P1 ● 1000    │
 │         └──────────────────────────────────┘                 │ P2 ● 920     │
 │                                                               │ P3   850     │
 └───────────────────────────────────────────────────────────────┴──────────────┘
   Full-screen layout — no sidebar navigation                     299-line comp
```

- Coach sidebar: hand config, controls, replay, player list
- Player seats with chip counts, position labels (BTN, SB, BB)
- Action bar with fold/check/bet for active player

---

<!-- _class: section-divider -->

## Coaching Pages
Students | Student Dashboard | Groups

---

## Students — Roster View

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Students                                       🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  [🔍 Search students...]  Group: [All ▾]  Alert: [All ▾]  [+ Add]  │
 │                                                    [Manage Groups]   │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │ NAME            GROUP        GRADE  ALERT    LAST ACTIVE  HANDS│ │
 │  ├──────────────────────────────────────────────────────────────┤   │
 │  │ Ariela Simantov ┌─────────┐  A-    ●        2 hours ago    312│ │
 │  │                 │ Advanced │                                   │ │
 │  │                 └─────────┘                                   │ │
 │  ├──────────────────────────────────────────────────────────────┤   │
 │  │ Miguel Torres   ┌──────┐    B+    ● red    5 days ago      89│ │
 │  │                 │ Core │                                      │ │
 │  │                 └──────┘                                      │ │
 │  ├──────────────────────────────────────────────────────────────┤   │
 │  │ Sarah Chen      ┌──────┐    B     ● gold   1 hour ago     201│ │
 │  │                 │ Core │                                      │ │
 │  │                 └──────┘                                      │ │
 │  ├──────────────────────────────────────────────────────────────┤   │
 │  │ Andre Williams  ┌─────────┐  C+    —        3 hours ago    156│ │
 │  │                 │ Beginner│                                   │ │
 │  │                 └─────────┘                                   │ │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 │  Showing 4 of 12 students                          ◄ 1 2 3 ►       │
 └──────────────────────────────────────────────────────────────────────┘
```

- Linear-style data table | Color-coded group pills | Severity dots
- Row click navigates to `/students/:playerId`

---

## Student Dashboard

```
 ┌─── ◄ Students > Advanced > Ariela Simantov ──────────────────────────┐
 │  [Avatar] Ariela Simantov  coach_student  ┌─────────┐  Last: 2h ago │
 │                                            │ Advanced │               │
 ├──────────────────────────────┬─────────────┴──────────────────────────┤
 │  OVERVIEW STATS              │  QUICK ACTIONS                        │
 │  ┌──────┐┌──────┐┌──────┐   │  [Reload Chips] [Reset Password]      │
 │  │ A-   ││ 312  ││ 24%  │   │  [Message] [Archive]                  │
 │  │Grade ││Hands ││ VPIP │   │                                        │
 │  └──────┘└──────┘└──────┘   │                                        │
 ├──────────────────────────────┼───────────────────────────────────────┤
 │  PERFORMANCE TREND           │  PLAYER TAGS                          │
 │  ┌─────────────────────┐    │  ┌──────┐ ┌───────────┐ ┌──────────┐ │
 │  │  📈 ─ ─ ╱─ ─ ─     │    │  │ tight│ │ improving │ │ +add tag │ │
 │  │       ╱              │    │  └──────┘ └───────────┘ └──────────┘ │
 │  │  VPIP ▾  30d        │    │                                        │
 │  └─────────────────────┘    │                                        │
 ├──────────────────────────────┼───────────────────────────────────────┤
 │  MISTAKE BREAKDOWN           │  GROUPS                               │
 │  ┌─────────────────────┐    │  ┌─────────┐ ┌─────────────┐          │
 │  │ OPEN_LIMP   ████ 12 │    │  │ Advanced│ │ Friday MTT  │          │
 │  │ MIN_RAISE   ███  8  │    │  └─────────┘ └─────────────┘          │
 │  │ COLD_CALL   ██   4  │    │  [Manage Groups]                      │
 │  └─────────────────────┘    │                                        │
 ├──────────────────────────────┼───────────────────────────────────────┤
 │  RECENT HANDS (last 10)      │  STAKING                              │
 │  #4012 [OPEN_LIMP] [C_BET]  │  Active contract: 60/40 split         │
 │  #4011 [3BET_POT]            │  Monthly P&L: +$240                   │
 │  #4010 [SLOWPLAY] [HERO_CALL]│  Makeup: $0                           │
 │  View All ─►                 │                                        │
 ├──────────────────────────────┼───────────────────────────────────────┤
 │  SESSIONS                    │  SCENARIOS                            │
 │  Apr 7  42 hands  Q:82/100  │  3 playlists assigned                 │
 │  Apr 5  38 hands  Q:71/100  │  [View Scenarios ─►]                  │
 ├──────────────────────────────┼───────────────────────────────────────┤
 │  ANALYSIS                    │  PREP BRIEF                           │
 │  Tag distribution chart      │  Focus: 3-bet sizing, c-bet freq     │
 │  Flagged: 3 hands            │  Generated: 2h ago  [↻ Refresh]      │
 ├──────────────────────────────┼───────────────────────────────────────┤
 │  NOTES                       │  REPORTS                              │
 │  📝 "Tendency to overlimp"  │  Week of Apr 1: Grade B+ → A-        │
 │     [👁 shared] Apr 6       │  Week of Mar 25: Grade B              │
 │  📝 "Session review"        │  [View All ─►]                        │
 │     [private] Apr 3         │                                        │
 └──────────────────────────────┴───────────────────────────────────────┘
```

- Collapsible sections, localStorage-persisted | 2-col grid, stacks < 1024px
- Notes: toggle "Share with student" (eye icon) | Color-coded note types

---

## Groups

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Groups                                         🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  [🔍 Search groups...]                              [+ New Group]   │
 │                                                                      │
 │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
 │  │ ■ Advanced       │  │ ■ Core           │  │ ■ Beginners      │  │
 │  │                  │  │                  │  │                  │  │
 │  │ 4 students       │  │ 6 students       │  │ 3 students       │  │
 │  │ Avg Grade: A-    │  │ Avg Grade: B     │  │ Avg Grade: C+    │  │
 │  │ 1,240 hands/wk   │  │ 890 hands/wk     │  │ 340 hands/wk     │  │
 │  │                  │  │                  │  │                  │  │
 │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
 │                                                                      │
 │  ┌──────────────────┐                                               │
 │  │ ■ Friday MTT     │                                               │
 │  │                  │                                               │
 │  │ 8 students       │                                               │
 │  │ Avg Grade: B+    │                                               │
 │  │ Tournament focus  │                                               │
 │  │                  │                                               │
 │  └──────────────────┘                                               │
 │                                                                      │
 └──────────────────────────────────────────────────────────────────────┘
```

- Color swatch per group | Click card → `/groups/:groupId`
- Empty state: "No groups yet. Create your first group to organize students."

---

## Group Dashboard

```
 ┌─── ◄ Groups > Advanced ──────────────────────────────────────────────┐
 │  ■ Advanced   4 students                                             │
 ├──────────────────────────────┬───────────────────────────────────────┤
 │  GROUP STATS                 │  MEMBERS                              │
 │  ┌──────┐┌──────┐┌──────┐   │  Ariela Simantov    A-   312 hands   │
 │  │ A-   ││ 1240 ││ 22%  │   │  David Park         A    289 hands   │
 │  │ Avg  ││Total ││ Avg  │   │  Lisa Wong          B+   201 hands   │
 │  │Grade ││Hands ││ VPIP │   │  Raj Patel          B+   178 hands   │
 │  └──────┘└──────┘└──────┘   │  [+ Add Member]                       │
 ├──────────────────────────────┼───────────────────────────────────────┤
 │  PERFORMANCE TREND           │  GROUP ANALYSIS                       │
 │  ┌─────────────────────┐    │  Tag distribution (aggregate)         │
 │  │  📈 aggregate trend │    │  C_BET: 34%  |  3BET: 18%             │
 │  │  ──── Ariela        │    │  OPEN_LIMP: 8% (↓ improving)         │
 │  │  ---- David         │    │                                        │
 │  └─────────────────────┘    │                                        │
 ├──────────────────────────────┼───────────────────────────────────────┤
 │  MISTAKE BREAKDOWN           │  REPORTS                              │
 │  ┌─────────────────────┐    │  Group weekly: Grade B+ → A-          │
 │  │ Aggregate bar chart │    │  [View All ─►]                        │
 │  └─────────────────────┘    │                                        │
 ├──────────────────────────────┼───────────────────────────────────────┤
 │  RECENT HANDS                │  SCENARIOS                            │
 │  Across all group members    │  2 playlists assigned to group        │
 │  #4012 Ariela [C_BET]       │  [Manage Scenarios ─►]                │
 │  #4009 David [3BET_POT]     │                                        │
 └──────────────────────────────┴───────────────────────────────────────┘
```

- Same section components as Student Dashboard — accept `groupId` prop
- Member list clickable → `/students/:playerId`

---

<!-- _class: section-divider -->

## Review Pages
Hand History | Review Table | Multi-Table

---

## Hand History

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Hand History                                   🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌─────────┐┌────────────┐┌──────────┐┌───────┐┌──────────┐┌─────┐│
 │  │Mistakes ││Coach Tagged││Scenarios ││ Today ││This Week ││Month││
 │  └─────────┘└────────────┘└──────────┘└───────┘└──────────┘└─────┘│
 │  Active: [OPEN_LIMP ✕] [C_BET ✕]          [🔍 Search hands...]    │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │ #4012      Apr 7, 2026      Main Table                       │   │
 │  │ [OPEN_LIMP] [COLD_CALL_3BET] [sizing:POT_BET]               │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │     ▼ Inline Replay Preview                                         │
 │     ┌────────────────────────────────────────────────────────┐      │
 │     │ PREFLOP: Hero limps UTG, V1 raises 3x, Hero calls     │      │
 │     │ FLOP [Ah Kd 9s]: V1 c-bets 2/3, Hero calls            │      │
 │     │ TURN [7c]: check-check                                  │      │
 │     │ RIVER [2d]: V1 bets 1/2, Hero folds                    │      │
 │     │                                                          │      │
 │     │ [◄ Prev] [▶ Play] [Next ►]     [Open Full Review ─►]   │      │
 │     └────────────────────────────────────────────────────────┘      │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │ #4011      Apr 7, 2026      Main Table               SCN    │   │
 │  │ [3BET_POT] [C_BET_IP]                                       │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │ #4010      Apr 6, 2026      Advanced Table                   │   │
 │  │ [SLOWPLAY] [HERO_CALL] [coach:review this]                   │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 └──────────────────────────────────────────────────────────────────────┘
```

- Tags color-coded: **auto**=blue, **mistake**=red, **coach**=gold, **sizing**=purple
- Click card → inline replay expands | "Full Review" → `/review?handId=X`

---

## Review Table — Hand Replay

```
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  ◄ Back to History    Hand #4012  ·  Main Table  ·  coached_cash            │
 ├────────────────────────────────────────────────┬────────────────────────────┤
 │                                                │  TIMELINE                  │
 │                                                │                            │
 │         ┌─────────────────────────┐            │  ── PREFLOP ──             │
 │         │                         │            │  ● SB posts 1              │
 │    P2   │     POKER TABLE         │   P5       │  ● BB posts 2              │
 │    920  │                         │   780      │  ● UTG limps 2       ◄──   │
 │         │    Board: Ah Kd 9s      │            │  ● CO raises 6             │
 │    P1   │    Pot: 245             │   P6       │  ● BTN folds               │
 │    1k   │                         │   550      │  ● SB folds                │
 │         └─────────────────────────┘            │  ● BB calls                │
 │                                                │  ● UTG calls               │
 │         Hero: [As] [Kh]                        │                            │
 │                                                │  ── FLOP ──                │
 │  ┌──────────────────────────────────────┐      │  ● CO bets 12              │
 │  │ [◄◄] [◄] [▶ Play] [►] [►►]  1x ▾   │      │  ● UTG calls               │
 │  │ Step 8 of 14                         │      │                            │
 │  └──────────────────────────────────────┘      │  ── TURN ──                │
 │                                                │  ● check-check             │
 │  ┌─── Annotations ─────────────────────┐      │                            │
 │  │ Coach note: "Should have 3-bet      │      │  ── RIVER ──               │
 │  │ preflop from UTG with AKo"          │      │  ● CO bets 30              │
 │  │                                      │      │  ● UTG folds               │
 │  │ [Add note...]                        │      │                            │
 │  └──────────────────────────────────────┘      │                            │
 └────────────────────────────────────────────────┴────────────────────────────┘
   Full-screen — no sidebar nav                     Street headers = sticky
   Keyboard: ←/→ step, Space play/pause             Speed: 0.5x / 1x / 2x
```

---

## Multi-Table View

```
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  Multi-Table View    Watching: 3 tables                    [◄ Back]         │
 ├──────────────────────────────────────────────────────────────────────────────┤
 │                                                                              │
 │  ┌───────────────────────────┐  ┌───────────────────────────┐               │
 │  │ Main Table                │  │ Advanced                  │               │
 │  │ ┌─────────────────────┐   │  │ ┌─────────────────────┐   │               │
 │  │ │    Mini poker       │   │  │ │    Mini poker       │   │               │
 │  │ │    table view       │   │  │ │    table view       │   │               │
 │  │ │    Pot: 245         │   │  │ │    Pot: 180         │   │               │
 │  │ └─────────────────────┘   │  │ └─────────────────────┘   │               │
 │  │ Hand #4012  6/9 players   │  │ Hand #3998  4/6 players   │               │
 │  │ [★ Focus]                 │  │ [★ Focus]                 │               │
 │  └───────────────────────────┘  └───────────────────────────┘               │
 │                                                                              │
 │  ┌───────────────────────────┐                                              │
 │  │ Beginners                 │                                              │
 │  │ ┌─────────────────────┐   │                                              │
 │  │ │    Mini poker       │   │                                              │
 │  │ │    table view       │   │                                              │
 │  │ │    Pot: 60          │   │                                              │
 │  │ └─────────────────────┘   │                                              │
 │  │ Hand #4001  3/6 players   │                                              │
 │  │ [★ Focus]                 │                                              │
 │  └───────────────────────────┘                                              │
 │                                                                              │
 └──────────────────────────────────────────────────────────────────────────────┘
   Full-screen, no sidebar        Focus button → expand single table
   Empty: "No tables open — Go to Tables ─►"
```

---

<!-- _class: section-divider -->

## Player Tools
Bot Lobby | Leaderboard

---

## Bot Lobby

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Bot Practice                                   🪙 1,250   Eli ▾   │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌ All ┐ ┌ Easy ┐ ┌ Medium ┐ ┌ Hard ┐                  [+ New Game]│
 │  └─────┘ └──────┘ └────────┘ └──────┘                              │
 │                                                                      │
 │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
 │  │ Bot Game #1      │  │ Bot Game #2      │  │ Bot Game #3      │  │
 │  │                  │  │                  │  │                  │  │
 │  │ ┌──────┐         │  │ ┌────────┐       │  │ ┌──────┐         │  │
 │  │ │ EASY │         │  │ │ MEDIUM │       │  │ │ HARD │         │  │
 │  │ └──────┘         │  │ └────────┘       │  │ └──────┘         │  │
 │  │ 6 bots · 1/2 NL  │  │ 6 bots · 2/5 NL  │  │ 6 bots · 5/10 NL │  │
 │  │ Running           │  │ Running           │  │ Running           │  │
 │  │                  │  │                  │  │                  │  │
 │  │ [★ Spectate]     │  │ [★ Spectate]     │  │ [★ Spectate]     │  │
 │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
 │                                                                      │
 └──────────────────────────────────────────────────────────────────────┘
```

- Difficulty badge: **Easy**=green, **Medium**=gold, **Hard**=red
- Empty state: icon + "Start your first bot game" + CTA button

---

## Leaderboard

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Leaderboard                                    🪙 1,250   Eli ▾   │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌ All Time ┐ ┌ Weekly ┐ ┌ Monthly ┐                               │
 │  └──────────┘ └────────┘ └─────────┘                                │
 │  Score = Chips per 100 hands                                        │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │ RANK  NAME                  HANDS   WIN RATE  NET    SCORE  │   │
 │  ├──────────────────────────────────────────────────────────────┤   │
 │  │ 🥇 1  Ariela Simantov       312     62%      +2,840   912  │   │
 │  │ ────────────────────────────────────────── gold border ──── │   │
 │  │ 🥈 2  David Park            289     58%      +1,920   664  │   │
 │  │ ────────────────────────────────────────── silver border ── │   │
 │  │ 🥉 3  Lisa Wong             201     55%      +1,140   567  │   │
 │  │ ────────────────────────────────────────── bronze border ── │   │
 │  │    4  ┌─────────────────────────────────────────────────┐   │   │
 │  │       │ ★ YOU  Eli Torres    89     52%       +420  472 │   │   │
 │  │       └─────────────────────────────────────────────────┘   │   │
 │  │    5  Sarah Chen             156     48%       +180   115  │   │
 │  │    6  Andre Williams         134     45%       -220   -164 │   │
 │  │    7  Raj Patel              178     44%       -380   -213 │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 └──────────────────────────────────────────────────────────────────────┘
```

- Top 3: medal + rank-colored left border (gold/silver/bronze)
- "YOU" badge: gold bg + white text | Coach: icon button → CRM link
- Responsive: < 768px hides Win Rate + Score columns

---

<!-- _class: section-divider -->

## Tournament Pages
List | Lobby | Standings | Setup | Control

---

## Tournament List

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Tournaments                                    🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌ Upcoming ┐ ┌ Active ┐ ┌ Completed ┐           [+ Create] coach+ │
 │  └──────────┘ └────────┘ └───────────┘                              │
 │                                                                      │
 │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
 │  │ Friday MTT       │  │ Sunday Special   │  │ Weekly Freeroll  │  │
 │  │                  │  │                  │  │                  │  │
 │  │ Apr 11, 7:00 PM  │  │ Apr 13, 3:00 PM  │  │ Apr 14, 6:00 PM  │  │
 │  │ 12/24 registered │  │ 0/16 registered  │  │ 8/32 registered  │  │
 │  │ 1000 starting    │  │ 2000 starting    │  │ 500 starting     │  │
 │  │ 10 min levels    │  │ 15 min levels    │  │ 8 min levels     │  │
 │  │                  │  │                  │  │                  │  │
 │  │ [★ Register]     │  │ [★ Register]     │  │ [Registered ✓]   │  │
 │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
 │                                                                      │
 │  No completed tournaments yet.                                      │
 └──────────────────────────────────────────────────────────────────────┘
```

---

## Tournament Lobby

```
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  Friday MTT  ·  Tournament Lobby                               [◄ Back]     │
 ├──────────────────────────────────────────────────────────────────────────────┤
 │                                                                              │
 │  ┌──────────────────────────────────────────────────────────────────┐       │
 │  │                   STARTING IN                                     │       │
 │  │                   02:34:18                                        │       │
 │  │                   Late reg closes in 15 min 🕐                   │       │
 │  └──────────────────────────────────────────────────────────────────┘       │
 │                                                                              │
 │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │
 │  │ Starting       │  │ Blind Level   │  │ Players       │  │ Prize Pool  │  │
 │  │ Stack          │  │               │  │               │  │             │  │
 │  │ 1,000          │  │ 1: 10/20      │  │ 12/24         │  │ 12,000      │  │
 │  └───────────────┘  └───────────────┘  └───────────────┘  └─────────────┘  │
 │                                                                              │
 │  ┌─── Blind Structure ──────────────────────────────────────────────┐       │
 │  │ LEVEL    SMALL    BIG     ANTE    DURATION                       │       │
 │  │   1       10       20      0       10 min     ◄── current        │       │
 │  │   2       15       30      0       10 min                        │       │
 │  │   3       25       50      5       10 min                        │       │
 │  │   4       50      100     10       10 min                        │       │
 │  │   5      100      200     20       10 min                        │       │
 │  └──────────────────────────────────────────────────────────────────┘       │
 │                                                                              │
 │  ┌─── Entrants (12) ────────────────────────────────────────────────┐       │
 │  │ Ariela Simantov  ·  David Park  ·  Lisa Wong  ·  Eli Torres     │       │
 │  │ Sarah Chen  ·  Andre Williams  ·  Raj Patel  ·  ...             │       │
 │  └──────────────────────────────────────────────────────────────────┘       │
 └──────────────────────────────────────────────────────────────────────────────┘
```

---

## Tournament Standings

```
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  Friday MTT  ·  Final Standings                                [◄ Back]     │
 ├──────────────────────────────────────────────────────────────────────────────┤
 │                                                                              │
 │  ┌──────────────────────────────────────────────────────────────────┐       │
 │  │                                                                  │       │
 │  │            🏆  WINNER: ARIELA SIMANTOV  🏆                      │       │
 │  │                                                                  │       │
 │  │            Prize: 6,000 chips                                    │       │
 │  │                                                                  │       │
 │  └──────────────────────────────────────────────────────────────────┘       │
 │           Gold banner with celebration styling                              │
 │                                                                              │
 │  ┌──────────────────────────────────────────────────────────────────┐       │
 │  │ PLACE   PLAYER              PRIZE (chips)   ELIMINATED AT       │       │
 │  ├──────────────────────────────────────────────────────────────────┤       │
 │  │ 🥇 1st  Ariela Simantov     6,000            —                   │       │
 │  │ 🥈 2nd  David Park          3,600            Level 8, 7:42 PM   │       │
 │  │ 🥉 3rd  Lisa Wong           2,400            Level 7, 7:31 PM   │       │
 │  │    4th  Eli Torres           —                Level 6, 7:18 PM   │       │
 │  │    5th  Sarah Chen           —                Level 5, 7:05 PM   │       │
 │  │    ...                                                           │       │
 │  └──────────────────────────────────────────────────────────────────┘       │
 │                                                                              │
 │  Tournament Details: 12 entrants · 8 levels · Duration: 1h 23m             │
 └──────────────────────────────────────────────────────────────────────────────┘
```

---

## Tournament Setup — Wizard (Admin)

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Tournament Setup                               🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  Step:  ① Basic Info ── ② Blinds ── ③ Payouts ── ④ Rules ── ⑤ Review│
 │         ●══════════════○           ○           ○           ○        │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │                                                              │   │
 │  │  Tournament Name                                             │   │
 │  │  ┌──────────────────────────────────────────────────┐       │   │
 │  │  │  Friday MTT                                      │       │   │
 │  │  └──────────────────────────────────────────────────┘       │   │
 │  │                                                              │   │
 │  │  ┌─── Starting Stack ───┐  ┌─── Max Players ───┐           │   │
 │  │  │      1,000            │  │       24           │           │   │
 │  │  └──────────────────────┘  └────────────────────┘           │   │
 │  │                                                              │   │
 │  │  ┌─── Level Duration ───┐  ┌─── Late Reg ──────┐           │   │
 │  │  │   10 minutes          │  │   3 levels         │           │   │
 │  │  └──────────────────────┘  └────────────────────┘           │   │
 │  │                                                              │   │
 │  │  Schedule                                                    │   │
 │  │  ┌──────────────┐  ┌──────────────┐                         │   │
 │  │  │  Apr 11       │  │  7:00 PM     │                         │   │
 │  │  └──────────────┘  └──────────────┘                         │   │
 │  │                                                              │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 │                                        [◁ Back]     [★ Next Step]   │
 └──────────────────────────────────────────────────────────────────────┘
```

- 5-step wizard with numbered circle indicators (active/completed states)
- Back = ghost button | Next = primary gold

---

<!-- _class: section-divider -->

## Admin Pages
Users | Scenario Builder | Coach Alerts | Referee | Staking

---

## Admin — User Management

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Users                                          🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  [🔍 Search users...]   Role: [All ▾]   Status: [All ▾]   [+ Add]  │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │                                                              │   │
 │  │  ▼ Coach: Jo Martinez (4 students)                           │   │
 │  │  ├─────────────────────────────────────────────────────────  │   │
 │  │  │ NAME                ROLE              EMAIL    LAST LOGIN │   │
 │  │  │ Ariela Simantov     coached_student   a@...    2h ago    │   │
 │  │  │ Miguel Torres       coached_student   m@...    5d ago    │   │
 │  │  │ Sarah Chen          coached_student   s@...    1h ago    │   │
 │  │  │ Andre Williams      coached_student   a@...    3h ago    │   │
 │  │  │                                                           │   │
 │  │  ▼ Coach: Sam Lee (2 students)                               │   │
 │  │  ├─────────────────────────────────────────────────────────  │   │
 │  │  │ David Park          coached_student   d@...    1d ago    │   │
 │  │  │ Lisa Wong           coached_student   l@...    4h ago    │   │
 │  │  │                                                           │   │
 │  │  ▶ Unassigned (3 users)                                      │   │
 │  │                                                              │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 └──────────────────────────────────────────────────────────────────────┘
```

- Coach grouping: coached_students collapse under coach display name
- Coach name resolved (not UUID) | Collapsible sections per coach

---

## Scenario Builder

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Scenarios                                      🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌─ Library ──────────┐  ┌─── Scenario Editor ──────────────────┐  │
 │  │                     │  │                                      │  │
 │  │ [🔍 Search]        │  │  Board Configuration                 │  │
 │  │ [Folder ▾]         │  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐│  │
 │  │                     │  │  │ Ah │ │ Kd │ │ 9s │ │    │ │    ││  │
 │  │ ┌─────────────────┐│  │  └────┘ └────┘ └────┘ └────┘ └────┘│  │
 │  │ │ ★ 3-Bet Squeeze ││  │                                      │  │
 │  │ │  4 players       ││  │  Player Setup                       │  │
 │  │ │  [3BET] [SQZ]   ││  │  ┌──────────────────────────────┐  │  │
 │  │ └─────────────────┘│  │  │ Seat 1: Hero  [As][Kh] 1000  │  │  │
 │  │                     │  │  │ Seat 2: V1    [??][??]  920  │  │  │
 │  │ ┌─────────────────┐│  │  │ Seat 3: V2    [??][??]  850  │  │  │
 │  │ │ C-Bet Practice  ││  │  │ Seat 4: V3    [??][??]  780  │  │  │
 │  │ │  2 players       ││  │  └──────────────────────────────┘  │  │
 │  │ │  [C_BET]         ││  │                                      │  │
 │  │ └─────────────────┘│  │  Preflop Action                     │  │
 │  │                     │  │  UTG raises 6 → CO 3-bets 18 →     │  │
 │  │ ┌─────────────────┐│  │  BTN cold-calls → ...               │  │
 │  │ │ River Bluff      ││  │                                      │  │
 │  │ │  2 players       ││  │  ┌────────────────────────────────┐│  │
 │  │ │  [BLUFF]         ││  │  │ [Save to Playlist ▾] [★ Save] ││  │
 │  │ └─────────────────┘│  │  └────────────────────────────────┘│  │
 │  │ ▓▓▓ scroll ▓▓▓    │  │                                      │  │
 │  └─────────────────────┘  └─────────────────────────────────────┘  │
 └──────────────────────────────────────────────────────────────────────┘
```

- Left sidebar: scrollable library with shadow indicators
- Scenario cards show all tags ("+N" with hover if many)

---

## Coach Alerts

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Alerts                                         🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌ Active (3) ┐ ┌ Dismissed ┐ ┌ Settings ┐                         │
 │  └────────────┘ └───────────┘ └──────────┘                          │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │ ● CRITICAL                                          Apr 7   │   │
 │  │                                                              │   │
 │  │ Miguel Torres — Inactivity Alert                             │   │
 │  │                                                              │   │
 │  │ Student hasn't played in 5 days. Last session: Apr 2.        │   │
 │  │ Previous average: 3.2 sessions/week.                         │   │
 │  │                                                              │   │
 │  │ [Review in CRM ─►]                          [✓ Dismiss]     │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │ ● HIGH                                              Apr 7   │   │
 │  │                                                              │   │
 │  │ Sarah Chen — Mistake Spike                                   │   │
 │  │                                                              │   │
 │  │ Mistake rate increased 40% over last 50 hands.               │   │
 │  │ Top mistakes: OPEN_LIMP (12), MIN_RAISE (8).                │   │
 │  │                                                              │   │
 │  │ [Review in CRM ─►]                          [✓ Dismiss]     │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │ ● LOW (positive)                                    Apr 6   │   │
 │  │                                                              │   │
 │  │ Andre Williams — Milestone: 500 Hands                        │   │
 │  │                                                              │   │
 │  │ [Review in CRM ─►]                          [✓ Dismiss]     │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 └──────────────────────────────────────────────────────────────────────┘
```

- Severity: human labels (Critical/High/Medium/Low) with colors
- "Review in CRM" navigates with context toast

---

## Referee Dashboard

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Referee Dashboard       Last updated: 12s ago ●                    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  Friday MTT — Level 5 (100/200/20)   12 → 8 remaining              │
 │                                                                      │
 │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
 │  │ Table 1          │  │ Table 2          │  │ Table 3          │  │
 │  │ `tbl_a1b2c3`     │  │ `tbl_d4e5f6`     │  │ `tbl_g7h8i9`     │  │
 │  │                  │  │                  │  │                  │  │
 │  │ 4 players        │  │ 3 players        │  │ 1 player         │  │
 │  │ Avg stack: 2,400 │  │ Avg stack: 3,100 │  │ Stack: 8,500     │  │
 │  │                  │  │                  │  │                  │  │
 │  │ Ariela    3,200  │  │ David     4,100  │  │ Eli     8,500 ★ │  │
 │  │ Miguel    2,800  │  │ Lisa      2,900  │  │                  │  │
 │  │ Sarah     1,900  │  │ Raj       2,300  │  │                  │  │
 │  │ Andre     1,300  │  │                  │  │                  │  │
 │  │                  │  │                  │  │                  │  │
 │  │ [Move Player]    │  │ [Move Player]    │  │ ⚠ Under-populated│  │
 │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
 │                                                                      │
 │  [Rebalance Tables]                     [Confirm End Tournament]    │
 │                                         (opens confirmation modal)  │
 └──────────────────────────────────────────────────────────────────────┘
```

- Auto-refresh with "Last updated: Xs ago" + pulse dot
- Under-populated warning inline, not footer

---

## Admin Staking

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Students > Staking Overview                    🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌ Active Contracts ┐ ┌ Completed ┐ ┌ All ┐           [+ New Deal] │
 │  └──────────────────┘ └───────────┘ └─────┘                         │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │ Ariela Simantov — 60/40 Split                                │   │
 │  │                                                              │   │
 │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   │
 │  │  │ Profit   │ │ Sessions │ │ Makeup   │ │ Monthly  │       │   │
 │  │  │ +$2,840  │ │    42    │ │   $0     │ │  +$240   │       │   │
 │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │   │
 │  │                                                              │   │
 │  │  Monthly P&L                                                 │   │
 │  │  ┌─────────────────────────────────────┐                    │   │
 │  │  │ Jan ██████     +180                  │                    │   │
 │  │  │ Feb ████████   +240                  │                    │   │
 │  │  │ Mar █████████  +320                  │                    │   │
 │  │  │ Apr ███████    +240                  │                    │   │
 │  │  └─────────────────────────────────────┘                    │   │
 │  │                                                              │   │
 │  │  [+ Add Session]  [Adjust Makeup]  [View Details ─►]        │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │ David Park — 70/30 Split                                     │   │
 │  │  Profit: +$1,920  ·  Sessions: 28  ·  Makeup: $120          │   │
 │  │  [+ Add Session]  [Adjust Makeup]  [View Details ─►]        │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 └──────────────────────────────────────────────────────────────────────┘
```

---

<!-- _class: section-divider -->

## Settings
Profile | School | Table Defaults | Org | Danger Zone

---

## Settings — Hub

```
 ┌─── GlobalTopBar ─────────────────────────────────────────────────────┐
 │ ◄ Settings                                       🪙 1,250   Jo ▾    │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │  ┌ Profile ┐┌ School ┐┌ Table Defaults ┐┌ Org ┐┌ Alerts ┐┌Danger┐ │
 │  └─────────┘└────────┘└────────────────┘└─────┘└────────┘└──────┘  │
 │  ◄ ▓▓▓▓▓▓▓▓ scroll indicator ▓▓▓▓▓▓▓▓ ►  (on small screens)      │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │                                                              │   │
 │  │  ┌──────┐                                                    │   │
 │  │  │      │   Jo Martinez                                     │   │
 │  │  │  JM  │   coach · Advanced, Core                          │   │
 │  │  │      │   jo@example.com                                   │   │
 │  │  └──────┘   Contact your admin to change roles ─►           │   │
 │  │  80x80px                                                     │   │
 │  │                                                              │   │
 │  │  Display Name                                                │   │
 │  │  ┌──────────────────────────────────────────────────┐       │   │
 │  │  │  Jo Martinez                                     │       │   │
 │  │  └──────────────────────────────────────────────────┘       │   │
 │  │                                                              │   │
 │  │  Email                                                       │   │
 │  │  ┌──────────────────────────────────────────────────┐       │   │
 │  │  │  jo@example.com                                  │       │   │
 │  │  └──────────────────────────────────────────────────┘       │   │
 │  │                                                              │   │
 │  │  ▶ Change Password (collapsed)                               │   │
 │  │                                                              │   │
 │  │                                    [★ Save Changes]          │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 └──────────────────────────────────────────────────────────────────────┘
```

- Tab scroll shadows on small screens | Unsaved changes warning on tab switch
- Password section collapsed by default | All roles see Settings

---

## Settings — School (Admin)

```
 ┌─── Settings > School ────────────────────────────────────────────────┐
 │                                                                      │
 │  ┌ Profile ┐┌★School┐┌ Table Defaults ┐┌ Org ┐┌ Alerts ┐┌Danger┐  │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │  SCHOOL IDENTITY                                             │   │
 │  │                                                              │   │
 │  │  School Name           Description                           │   │
 │  │  ┌────────────────┐   ┌──────────────────────────────┐      │   │
 │  │  │ Ace Academy    │   │ Premier poker coaching       │      │   │
 │  │  └────────────────┘   └──────────────────────────────┘      │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │  FEATURE GATES                                               │   │
 │  │                                                              │   │
 │  │  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌───────────────┐  │   │
 │  │  │●Replay  │ │●Analysis │ │●Chip Bank │ │●Playlists     │  │   │
 │  │  └─────────┘ └──────────┘ └───────────┘ └───────────────┘  │   │
 │  │  ┌────────────┐ ┌─────┐ ┌─────────────┐ ┌──────────┐      │   │
 │  │  │○Tournaments│ │●CRM │ │●Leaderboard │ │○Scenarios│      │   │
 │  │  └────────────┘ └─────┘ └─────────────┘ └──────────┘      │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │  CAPACITY                                                    │   │
 │  │  Max Coaches: 5 (3 used)    Max Students: 50 (12 used)      │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                                                                      │
 │                                              [★ Save Changes]       │
 └──────────────────────────────────────────────────────────────────────┘
```

- Feature gates: toggle switches with enabled/disabled states
- Capacity: progress bars showing used/max

---

<!-- _class: section-divider -->

## Design System
Colors | Typography | Components | States

---

## Color Tokens

```
  ┌─── Backgrounds ──────────────────────────────────────────────────┐
  │                                                                  │
  │  ██████  bgPrimary       #060a0f   Page background              │
  │  ██████  bgSurface       #0d1117   Cards, panels                │
  │  ██████  bgSurfaceRaised #161b22   Elevated elements            │
  │  ██████  bgSurfaceHover  #1c2128   Hover state                  │
  │                                                                  │
  ├─── Text ─────────────────────────────────────────────────────────┤
  │                                                                  │
  │  ██████  textPrimary     #e6edf3   Headings, body               │
  │  ██████  textSecondary   #8b949e   Descriptions, labels         │
  │  ██████  textMuted       #6e7681   Captions (raised bg only)    │
  │                                                                  │
  ├─── Accent ───────────────────────────────────────────────────────┤
  │                                                                  │
  │  ██████  gold            #d4af37   Primary action, active state │
  │  ██████  goldHover       #e6c34d   Hover on gold elements       │
  │  ██████  success         #3fb950   Positive, enabled            │
  │  ██████  error           #f85149   Errors, mistakes, critical   │
  │  ██████  warning         #d29922   Warnings, caution            │
  │  ██████  info            #58a6ff   Links, informational         │
  │                                                                  │
  ├─── Borders ──────────────────────────────────────────────────────┤
  │                                                                  │
  │  ██████  borderDefault   #21262d   Subtle dividers              │
  │  ██████  borderStrong    #30363d   Emphasized borders           │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

> No hardcoded hex in components — all imports from `lib/colors.js`

---

## Typography Scale

```
  ┌─── Type Hierarchy ───────────────────────────────────────────────┐
  │                                                                  │
  │  Page Title (h1)     text-xl font-bold        20px               │
  │  ──────────────────────────────────────────                      │
  │  Section Header (h2) text-sm font-semibold    14px               │
  │  ──────────────────────────────────────────                      │
  │  Subsection (h3)     text-sm font-medium      14px               │
  │  ──────────────────────────────────────────                      │
  │  Body / Table Cells  text-sm                  14px               │
  │  ──────────────────────────────────────────                      │
  │  Sidebar Labels      text-xs                  12px               │
  │  ──────────────────────────────────────────                      │
  │  Badge Numbers       text-[10px]              10px  (minimum!)   │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘

  RULE: No text below 10px anywhere. No text-[8px] or text-[9px].

  ┌─── Component States ────────────────────────────────────────────┐
  │                                                                  │
  │  Loading     Skeleton pulse animation, aria-busy="true"          │
  │  Empty       Icon + message + primary CTA button                 │
  │  Error       Message + Retry button + optional detail toggle     │
  │                                                                  │
  │  Focus       focus-visible:ring-2 focus-visible:ring-gold        │
  │  Active Nav  3px gold left border + gold text                    │
  │  Hover       bg-surfaceHover transition                          │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

---

## Toast System

```
                                          ┌─── Toast Stack ──────────┐
                                          │  (fixed top-16 right-4)  │
  Page content below...                   │                          │
                                          │  ┌─── Success ────────┐ │
  Toasts stack vertically,                │  │ ✓ Changes saved    │ │
  8px gap, max 5 visible.                 │  │ ▓▓▓▓▓▓░░░ 3s      │ │
                                          │  └────────────────────┘ │
  Auto-dismiss: 5 seconds                │                          │
  with progress bar.                      │  ┌─── Error ──────────┐ │
                                          │  │ ✕ Failed to save   │ │
  Types:                                  │  │   Connection lost   │ │
  • error   — red left border            │  │ ▓▓▓▓▓▓▓░░ 4s      │ │
  • success — green left border          │  └────────────────────┘ │
  • info    — gold left border           │                          │
  • warning — orange left border         │  ┌─── Info ────────────┐ │
                                          │  │ ★ Navigated from   │ │
  Dismiss: click ✕ or auto               │  │   Coach Alerts      │ │
                                          │  │ ▓▓▓▓▓▓▓▓░ 4.5s    │ │
  Architecture:                           │  └────────────────────┘ │
  ToastContext → useToast() hook          │                          │
  ToastContainer (portal, z-50)           └──────────────────────────┘
  ToastItem (single toast)
```

---

## Responsive Breakpoints

```
  320px              640px             1024px            1280px
  │                  │                 │                 │
  │  MOBILE          │  TABLET         │  DESKTOP        │  WIDE
  │                  │                 │                 │
  │  Sidebar: hidden │  Sidebar: hidden│  Sidebar: 56px  │  Sidebar: 220px
  │  1 column        │  1 column       │  2 columns      │  2 columns
  │  Cards stack     │  Cards stack    │  Side-by-side   │  Full layout
  │                  │                 │                 │
  │  Nav: hamburger  │  Nav: hamburger │  Nav: icons     │  Nav: labeled
  │  ──────────────  │  ──────────────│  ──────────────  │  ──────────
  │                  │                 │                 │
  │  Student dash:   │  Student dash:  │  Student dash:  │  Student dash:
  │  single column   │  single column  │  2-col grid     │  2-col grid
  │                  │                 │                 │
  │  Leaderboard:    │  Leaderboard:   │  Leaderboard:   │  Leaderboard:
  │  Rank+Name+Net   │  +Hands         │  +WinRate       │  All columns
  │                  │                 │                 │
  │  Tables:         │  Tables:        │  Tables:        │  Tables:
  │  1 card/row      │  2 cards/row    │  3 cards/row    │  auto-fill
  │                  │                 │                 │

  Sidebar auto-collapses below 1280px with hover-expand floating panel.
```

---

## Per-Role Visibility Map

| Page | superadmin | admin | coach | coached | solo |
|---|:---:|:---:|:---:|:---:|:---:|
| Dashboard | **Coach** | **Coach** | **Coach** | **Student** | **Student** |
| Tables | x | x | x | x | x |
| Bot Practice | x | x | x | x | x |
| Tournaments | x | x | x | x | x |
| **Students** | x | x | x | — | — |
| **Groups** | x | x | x | — | — |
| **Scenarios** | x | x | x | — | — |
| **Alerts** | x | x | x | — | — |
| Hand History | x | x | x | x | x |
| Leaderboard | x | x | x | x | x |
| **Users** | x | x | — | — | — |
| Settings | x | x | x | x | x |

> Dashboard renders different widgets per role — same route, different content.
> Coach sections hidden for students. Admin section hidden for coaches.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# End of Mockup Deck

**30 screens** covering every page in the Poker Trainer app
Dark theme with gold accents | Responsive | Role-aware

Next: implement phase by phase per the UI Redesign Plan
