---
marp: true
theme: default
paginate: true
---

<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap');

:root {
  --color-foreground: #ffffff;
  --color-heading: #ffffff;
  --color-accent: #ffd700;
  --font-default: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif;
}

section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  color: var(--color-foreground);
  font-family: var(--font-default);
  font-weight: 400;
  box-sizing: border-box;
  position: relative;
  line-height: 1.7;
  font-size: 22px;
  padding: 56px;
}

section:nth-child(2n) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

section:nth-child(3n) {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

section:nth-child(4n) {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

section:nth-child(5n) {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
}

h1, h2, h3, h4, h5, h6 {
  font-weight: 700;
  color: var(--color-heading);
  margin: 0;
  padding: 0;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

h1 {
  font-size: 56px;
  line-height: 1.4;
  text-align: left;
}

h2 {
  position: absolute;
  top: 40px;
  left: 56px;
  right: 56px;
  font-size: 40px;
  padding-top: 0;
  padding-bottom: 16px;
}

h2::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 8px;
  width: 80px;
  height: 3px;
  background-color: var(--color-accent);
  box-shadow: 0 2px 10px rgba(255, 215, 0, 0.5);
}

h2 + * {
  margin-top: 112px;
}

h3 {
  color: var(--color-accent);
  font-size: 28px;
  margin-top: 32px;
  margin-bottom: 12px;
  text-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}

ul, ol {
  padding-left: 32px;
}

li {
  margin-bottom: 10px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

footer {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.7);
  position: absolute;
  left: 56px;
  right: 56px;
  bottom: 40px;
  text-align: center;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

section.lead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

section.lead h1 {
  margin-bottom: 24px;
  text-align: center;
}

section.lead p {
  font-size: 24px;
  color: var(--color-foreground);
  text-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}

strong {
  color: var(--color-accent);
  font-weight: 700;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.3);
}

code {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 18px;
}

.stat {
  font-size: 28px;
  color: var(--color-accent);
  font-weight: 700;
}
</style>

<!-- _class: lead -->

# Phase 3: UI Redesign
## Modals & Key Pages

April 12, 2026

---

## Agenda

- Modal extraction strategy
- Dashboard page implementation
- Tables page implementation
- Design & color tokens
- Test results & build metrics

---

## Modal Extraction

### CreateTableModal
- Extracted from LobbyPage (323 lines)
- Components: name, mode, blinds, stack, privacy
- Player invite search & presets
- Color tokens: `colors.gold` → `colors.bgSurfaceRaised`

### BuyInModal
- Extracted from LobbyPage (76 lines)
- Chip balance fetching from `/api/players/:id/stats`
- Buy-in slider: 50–200 BB
- Affordability validation

---

## Dashboard Overview

### Role-Adaptive Layout
- **Coaches**: Create Table, Students, Scenarios, Alerts
- **Students**: Join Table, Bot Practice, History, Analysis

### 4 Sub-Components
- `QuickLinks`: Navigation buttons (3-4 items)
- `QuickStats`: Role-specific stat pills
- `AlertFeed`: Coach-only severity dots
- `ActiveTables`: Top 3 table preview

---

## Tables Page

### Filter Tabs with Badges
- All, Cash, Tournament, Bot Practice
- Badge counts updated in real-time
- Table grid: 4 cards per row

### Actions & Modals
- Join / Spectate / Manager modes
- Buy-in flow for uncoached_cash
- CreateTableModal & BuyInModal

---

## Design System

### Color Tokens Applied
- `colors.bgSurface` → sections
- `colors.bgSurfaceRaised` → buttons
- `colors.textPrimary` → headings
- `colors.gold` → accents
- `colors.error` / `colors.success` → alerts

### Deprecation
- All hardcoded hex values removed
- GOLD constant → `colors.gold`
- Semantic token usage 100%

---

## Test Coverage

<div class="stat">1,002 Tests Passing</div>

- DashboardPage: 4 test cases ✓
- TablesPage: 3 test cases ✓
- Color compliance verified
- No TypeScript errors
- Build: 10.48s | 1,241 kB (gzip: 328 kB)

---

## What's Next

### Phase 4: CRM Overhaul
- CollapsibleSection: localStorage persistence
- StudentsRosterPage: full roster view
- StudentDashboardPage: 12-section layout
- Completion: 2026-04-13

---

<!-- _class: lead -->

# Phase 3 Complete ✓

Modal extraction, Dashboard, Tables

