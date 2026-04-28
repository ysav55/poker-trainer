---
marp: true
theme: default
paginate: true
---

<style>
:root {
  --color-background: #0d1117;
  --color-foreground: #e6edf3;
  --color-heading: #d4af37;
  --color-accent: #58a6ff;
  --color-hr: #d4af37;
}

section {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-weight: 400;
  box-sizing: border-box;
  border-bottom: 4px solid var(--color-hr);
  position: relative;
  line-height: 1.6;
  font-size: 18px;
  padding: 48px;
}

section:last-of-type { border-bottom: none; }

h1, h2, h3 {
  font-weight: 700;
  color: var(--color-heading);
  margin: 0; padding: 0;
}

h1 { font-size: 44px; line-height: 1.3; }

h2 {
  position: absolute;
  top: 36px; left: 48px; right: 48px;
  font-size: 30px;
  padding-bottom: 12px;
}

h2::after {
  content: '';
  position: absolute;
  left: 0; bottom: 4px;
  width: 50px; height: 2px;
  background-color: var(--color-hr);
}

h2 + * { margin-top: 80px; }

h3 {
  color: var(--color-accent);
  font-size: 22px;
  margin-top: 20px;
  margin-bottom: 8px;
}

pre {
  background-color: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 16px;
  font-size: 13px;
  line-height: 1.4;
  overflow: hidden;
}

code {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}

strong { color: var(--color-accent); font-weight: 700; }
em { color: #8b949e; font-style: normal; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
  margin-top: 12px;
}

th {
  background-color: #161b22;
  color: var(--color-heading);
  padding: 8px 12px;
  text-align: left;
  border-bottom: 2px solid #30363d;
}

td {
  padding: 8px 12px;
  border-bottom: 1px solid #21262d;
}

section.lead { border-bottom: 4px solid var(--color-hr); }
section.lead h1 { margin-bottom: 16px; }
section.lead p { font-size: 20px; color: #8b949e; }
</style>

<!-- _class: lead -->

# Sidebar Navigation

Three options for the poker trainer

---

## Option A — Expand / Collapse

*Plan's proposal: 220px expanded ↔ 56px collapsed*

```
  EXPANDED (220px)              COLLAPSED (56px)
 ┌──────────────────┐          ┌────────┐
 │ PLAY             │          │        │
 │ 🏠 Dashboard     │          │  🏠    │
 │ 🎰 Tables        │          │  🎰    │
 │ 🤖 Bot Practice  │          │  🤖    │
 │ 🏆 Tournaments   │          │  🏆    │
 │                  │          │        │
 │ COACHING         │          │ ────── │
 │ 👥 Students      │          │  👥    │
 │ 📊 Groups        │          │  📊    │
 │ 🎯 Scenarios     │          │  🎯    │
 │ 🔔 Alerts    •   │          │  🔔 •  │
 │                  │          │        │
 │ REVIEW           │          │ ────── │
 │ 📋 History       │          │  📋    │
 │ 🏅 Leaderboard   │          │  🏅    │
 │                  │          │        │
 │ ─── bottom ───   │          │ ────── │
 │ ⚙️  Settings      │          │  ⚙️     │
 │ ◀ Collapse       │          │  ▶     │
 └──────────────────┘          └────────┘
```

- Lucide SVG icons (new dep) replace emojis
- localStorage persists state
- Auto-collapse < 1280px, hover-expand as flyout

---

## Option B — Narrow + Flyout Panel

*VS Code pattern: 64px bar + 200px flyout on click*

```
  IDLE (64px)         SECTION CLICKED (64px + 200px)
 ┌────────┐          ┌────────┬─────────────────┐
 │        │          │        │ COACHING         │
 │  🏠    │          │  🏠    │                  │
 │  🎰    │          │  🎰    │  Students        │
 │  🤖    │          │  🤖    │  Groups          │
 │  🏆    │          │  🏆    │  Scenarios       │
 │        │          │        │  Alerts      •   │
 │  👥 ◀──│──click───│► 👥    │                  │
 │  📋    │          │  📋    │                  │
 │  🏅    │          │  🏅    │                  │
 │        │          │        │                  │
 │  ⚙️     │          │  ⚙️     │                  │
 └────────┘          └────────┴─────────────────┘
                      click-away or Esc closes
```

- Icons are section-level (5-6), not page-level (12)
- Sub-items only visible on interaction
- No permanent screen real estate loss
- Familiar pattern (VS Code, Figma, Slack)

---

## Option C — Grouped Icon Bar

*Minimal: 64px, direct navigation, no sub-menus*

```
 ┌────────┐
 │  🏠    │  ← Dashboard
 │  🎰    │  ← Tables
 │  🤖    │  ← Bots
 │  🏆    │  ← Tournaments
 │ ────── │
 │  👥    │  ← Students (coach+)
 │  🔔 •  │  ← Alerts (coach+)
 │ ────── │
 │  📋    │  ← History
 │  🏅    │  ← Leaderboard
 │ ────── │
 │  ⚙️     │  ← Settings
 └────────┘
   7-8 items max
   hover = tooltip
   Groups, Scenarios = in-page tabs
```

- Sub-pages (Groups, Scenarios) accessed via
  tabs/breadcrumbs **within** parent pages
- Fewest items, least cognitive load
- No expand/collapse logic needed
- Tooltip on hover for discoverability

---

## Comparison

| | **A: Expand** | **B: Flyout** | **C: Icon Bar** |
|---|---|---|---|
| **Screen use** | 220px or 56px | 64px always | 64px always |
| **Discoverability** | High — labels visible | Medium — click to see | Low — tooltips only |
| **Item count** | 12 items | 5-6 groups | 7-8 items |
| **Mobile** | Must collapse + overlay | Flyout works as-is | Already compact |
| **Complexity** | Medium — collapse logic, responsive breakpoint, localStorage | Medium — flyout panel, click-outside, focus mgmt | Low — just routing |
| **New deps** | lucide-react | lucide-react | None (keep emojis or swap) |
| **Closest to current** | Different | Different | Closest |
