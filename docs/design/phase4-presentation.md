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

# Phase 4: CRM Overhaul
## Students + Dashboard

April 12, 2026

---

## Agenda

- StudentsRosterPage implementation
- StudentDashboardPage + section cards
- 12 collapsible components
- CollapsibleSection enhancement
- Test & build results

---

## StudentsRosterPage

### Data Table (252 lines)
- Columns: Name | Group | Grade | Alert | Last Active
- Search filter (by name)
- Group dropdown filter
- Sort by grade, alert severity
- Row click → `/students/:playerId`

### States
- Loading: skeleton rows
- Empty: "No students" message
- Error: error + retry button

---

## StudentDashboardPage

### Layout (161 lines)
- 2-column grid on desktop
- Single column on mobile
- Responsive, scrollable

### Breadcrumb
- Back button → `/students`
- Group name (if assigned)
- Player name

---

## 12 CRM Sections

All collapsible, all with localStorage persistence:

1. **Overview** — 4 stat cards (Hands, VPIP, PFR, WTSD)
2. **Performance** — Trend line chart + stat picker
3. **Mistakes** — Bar chart, per 100 hands
4. **Hands** — Last 10 hands, inline tags
5. **Alerts** — Active alerts, severity dots
6. **Notes** — Timeline, type badges, share toggle
7. **Staking** — Contract status, P&L
8. **Groups** — Assigned groups, manage button
9. **PrepBrief** — Brief text, refresh, timestamp
10. **Reports** — Weekly report cards, grades
11. **Scenarios** — Assigned playlists, progress
12. **PlayerHeader** — Breadcrumb + back button

---

## CollapsibleSection Enhancement

### Additions
- `storageKey` prop for localStorage
- Pattern: `section-crm-{name}-{playerId}`
- Lucide ChevronRight icon
- Color tokens: `colors.gold`, `colors.bgSurfaceRaised`
- `aria-expanded` accessibility

### State
- Open/closed persisted across page reloads
- Independent per section (each uses unique key)

---

## Technical Highlights

### Color Compliance
- All 12 sections use `colors.js` tokens
- Zero hardcoded hex values
- Consistent UI across pages

### Data Fetching
- Each section fetches own data
- Parallel requests via `Promise.all()`
- Loading/error states per section

### Test Coverage
- StudentsRosterPage: 10 tests ✓
- StudentDashboardPage: 2 tests ✓
- All components have render tests ✓

---

## Build & Tests

<div class="stat">1017 Tests Passing</div>

- Previous: 1005 tests
- Added: 12 new tests (+12 tests)
- Type: TS checking ✓
- Build: 10.2s | Production ready

---

## Code Metrics

| File | Type | Lines |
|---|---|---|
| StudentsRosterPage | Page | 252 |
| StudentDashboardPage | Page | 161 |
| OverviewSection | Component | 53 |
| PerformanceSection | Component | 86 |
| NotesSection | Component | 84 |
| (9 more sections) | Component | 50–90 ea |

Total CRM components: 1,056 LOC

---

## What's Next

### Phase 5: Cleanup
- Remove old SideNav, GlobalTopBar
- Final verification checklist
- Visual spot-check at multiple breakpoints
- Confirm all redirects working

---

<!-- _class: lead -->

# Phase 4 Complete ✓

Students roster, dashboard, 12 collapsible sections
