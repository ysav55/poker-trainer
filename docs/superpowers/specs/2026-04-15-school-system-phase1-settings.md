# School System Phase 1: Settings Endpoints

**Date:** 2026-04-15  
**Phase:** 1 of 3 (Settings → Passwords → Visibility Filtering)  
**Status:** Design (awaiting approval)

---

## Overview

Coaches need to customize their school's branding, table defaults, staking policies, leaderboard metrics, platforms, and auto-pause behavior. Currently, `SchoolTab.jsx` has UI for these settings but no backend endpoints exist.

**Phase 1 deliverable:** Full CRUD for school-level customizations via `/api/settings/school/*` endpoints, secured to school members only.

---

## Scope

### In Scope
- 6 settings categories: identity, platforms, staking-defaults, leaderboard, table-defaults, auto-pause-timeout
- Coach-level CRUD (read + write their own school settings)
- Admin read-only access (can view, cannot edit school customizations)
- Validation per category
- DB storage via `settings` table (existing, no new tables)
- Frontend: Wire SchoolTab to endpoints

### Out of Scope
- Passwords system (Phase 2)
- Table/tournament visibility filtering (Phase 3)
- Feature toggles / use limits (admin-only, already in `/api/admin/schools/:id/features`)
- Sub-roles system (deferred, ideas-to-consider.md)

---

## Database

### Existing Tables Used
- `settings` (migration 014) — generic key/value store, scope-aware

### Schema: No new tables
All settings stored in `settings` table with:
- `scope = 'school'`
- `scope_id = school_id`
- `key = 'setting:category'` (e.g., `'identity:profile'`, `'table:defaults'`)
- `value = JSONB` (category-specific shape)

### Settings Keys & Shapes

#### `identity:profile`
```json
{
  "name": "string",
  "description": "string (nullable)"
}
```

#### `table:defaults`
```json
{
  "min_sb": 5,
  "max_sb": 50,
  "min_bb": 10,
  "max_bb": 100,
  "min_starting_stack": 1000,
  "max_starting_stack": 50000
}
```

#### `staking:defaults`
```json
{
  "coach_split_pct": 50,
  "makeup_policy": "carries|resets_monthly|resets_on_settle",
  "bankroll_cap": 25000,
  "contract_duration_months": 6
}
```

#### `leaderboard:config`
```json
{
  "primary_metric": "net_chips|bb_per_100|win_rate|hands_played",
  "secondary_metric": "win_rate|net_chips|bb_per_100|hands_played",
  "update_frequency": "after_session|hourly|daily"
}
```

#### `platforms:list`
```json
{
  "platforms": ["PokerStars", "GGPoker", "888poker", ...]
}
```

#### `theme:appearance`
```json
{
  "felt_color": "#1e5235",
  "primary_color": "#d4af37",
  "logo_url": "https://..."
}
```

#### `table:auto_pause_timeout`
```json
{
  "idle_minutes": 15
}
```

---

## Backend

### New Service: `SchoolSettingsService`

File: `server/services/SchoolSettingsService.js`

```javascript
// Constructor: inject SchoolRepository, settings table access

// Public methods:
async getIdentity(schoolId)           // returns { name, description }
async setIdentity(schoolId, payload)  // validates, upserts, returns updated
async getTableDefaults(schoolId)      // returns { min_sb, max_sb, ... }
async setTableDefaults(schoolId, payload)
async getStakingDefaults(schoolId)    // returns { coach_split_pct, ... }
async setStakingDefaults(schoolId, payload)
async getLeaderboardConfig(schoolId)  // returns { primary_metric, ... }
async setLeaderboardConfig(schoolId, payload)
async getPlatforms(schoolId)          // returns { platforms: [...] }
async setPlatforms(schoolId, payload)
async getAppearance(schoolId)         // returns { felt_color, primary_color, ... }
async setAppearance(schoolId, payload)
async getAutoPauseTimeout(schoolId)   // returns { idle_minutes }
async setAutoPauseTimeout(schoolId, payload)

// Private helper:
async _getSetting(schoolId, key)      // fetch from settings table
async _setSetting(schoolId, key, value, updatedBy)  // upsert to settings table
```

### Validation Rules

| Setting | Rules |
|---------|-------|
| Identity.name | Required, 1–100 chars, trimmed |
| Identity.description | Optional, 0–500 chars |
| Table defaults.min_sb, max_sb | Integers, > 0, min_sb < max_sb |
| Table defaults.min_bb, max_bb | Integers, > min_sb, min_bb < max_bb |
| Table defaults.min_stack, max_stack | Integers, ≥ 100, min < max |
| Staking.coach_split_pct | Integer, 0–100 |
| Staking.makeup_policy | One of: carries, resets_monthly, resets_on_settle |
| Staking.bankroll_cap | Integer, ≥ 100 |
| Staking.contract_duration_months | Integer, 1–36 |
| Leaderboard metrics | One of: net_chips, bb_per_100, win_rate, hands_played |
| Leaderboard.update_frequency | One of: after_session, hourly, daily |
| Platforms.platforms | Array of non-empty strings, max 20 items, max 50 chars each |
| Appearance.felt_color | Hex color, 7 chars (#RRGGBB) |
| Appearance.primary_color | Hex color, 7 chars |
| Appearance.logo_url | Valid URL or null |
| AutoPause.idle_minutes | Integer, 5–120 |

### New Routes: `server/routes/school-settings.js`

**Auth:** All routes require `requireAuth` + `requireSchoolMembership(req, res, schoolId)` middleware.

#### `GET /api/settings/school`
Returns full settings object for user's school.
```json
{
  "schoolId": "uuid",
  "identity": { "name": "...", "description": "..." },
  "tableDefaults": { "min_sb": 5, ... },
  "stakingDefaults": { "coach_split_pct": 50, ... },
  "leaderboardConfig": { "primary_metric": "net_chips", ... },
  "platforms": { "platforms": [...] },
  "appearance": { "felt_color": "#1e5235", ... },
  "autoPauseTimeout": { "idle_minutes": 15 }
}
```

#### `PUT /api/settings/school/identity`
**Requires:** Coach role or higher + school membership  
**Request:** `{ "name": "...", "description": "..." }`  
**Response:** Updated identity object  
**Errors:** 400 (validation), 401 (not authenticated), 403 (not in school)

#### `PUT /api/settings/school/table-defaults`
**Requires:** Coach role + school membership  
**Request:** `{ "min_sb": 5, "max_sb": 50, ... }`  
**Response:** Updated table-defaults object  
**Errors:** 400 (validation), 403

#### `PUT /api/settings/school/staking-defaults`
**Requires:** Coach role + school membership  
**Request:** `{ "coach_split_pct": 50, ... }`  
**Response:** Updated staking-defaults object  
**Errors:** 400, 403

#### `PUT /api/settings/school/leaderboard`
**Requires:** Coach role + school membership  
**Request:** `{ "primary_metric": "...", "secondary_metric": "...", "update_frequency": "..." }`  
**Response:** Updated leaderboard config  
**Errors:** 400, 403

#### `PUT /api/settings/school/platforms`
**Requires:** Coach role + school membership  
**Request:** `{ "platforms": ["PokerStars", "GGPoker", ...] }`  
**Response:** Updated platforms object  
**Errors:** 400, 403

#### `PUT /api/settings/school/appearance`
**Requires:** Coach role + school membership  
**Request:** `{ "felt_color": "#...", "primary_color": "#...", "logo_url": "..." }`  
**Response:** Updated appearance object  
**Errors:** 400, 403

#### `PUT /api/settings/school/auto-pause-timeout`
**Requires:** Coach role + school membership  
**Request:** `{ "idle_minutes": 15 }`  
**Response:** Updated auto-pause config  
**Errors:** 400, 403

---

## Frontend

### UI Library: Lucide React Icons
Use lucide-react for all icons (consistent with SettingsPage, CoachSidebar, etc.).

### SchoolTab.jsx Updates
- Already has UI components for all 6 categories ✓
- **Currently calls:** `/api/settings/school/*` endpoints
- **Change:** Implement error handling, loading states, success messages (already done, lines 438–504)
- **Icons to add:**
  - Section headers: Building2, Palette, Rows3, TrendingUp, Globe, Clock
  - Action buttons: Plus, Trash2, Save, X
  - Status indicators: CheckCircle, AlertCircle

### Suggested Icon Mapping

| Section | Icon | Rationale |
|---------|------|-----------|
| Identity | Building2 | School/organization |
| Appearance (felt, colors, logo) | Palette | Color customization |
| Table Defaults | Rows3 | Table configuration |
| Staking Defaults | DollarSign | Money/financial |
| Leaderboard | TrendingUp | Rankings/metrics |
| Platforms | Globe | Multi-platform |
| Groups/Cohorts | Users | Team/groups |
| Auto-Pause Timeout | Clock | Time-based |
| Add/Create | Plus | Standard add action |
| Delete/Remove | Trash2 | Standard delete action |
| Close/Dismiss | X | Standard close |

### Component Updates: `shared.jsx`
Update `SectionHeader` to accept optional `icon` prop:
```jsx
export function SectionHeader({ title, icon: Icon }) {
  return (
    <div className="mb-3 mt-5 first:mt-0 flex items-center gap-2">
      {Icon && <Icon size={16} style={{ color: colors.textMuted }} />}
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: colors.textMuted }}>
        {title}
      </span>
    </div>
  );
}
```

### Integration Points

**PokerTable.jsx** (Phase 2 task — not in Phase 1)
- Currently hardcoded felt color (#1e5235, index.css:56)
- Will fetch school appearance on mount, apply via inline styles or CSS variables

**CreateTableModal** (Phase 2 task)
- Will fetch table-defaults on mount, pre-fill SB/BB/stack inputs

**StakingPage.jsx** (Phase 2 task)
- Will fetch staking-defaults on mount, pre-fill form fields

**LeaderboardPage.jsx** (Phase 2 task)
- Will fetch leaderboard-config on mount, sort by primary/secondary metrics

**StakingPage.jsx — Platforms dropdown** (Phase 2 task)
- Will fetch platforms list instead of using hardcoded array (line 34)

---

## Auth & Permissions

### Middleware: `requireSchoolMembership(schoolId)`
- Extracts schoolId from request (path param or query)
- Verifies `req.user.school_id === schoolId`
- For admins: allow (can view any school, but write permissions still restricted)
- For coaches: allow if school_id matches
- Returns 403 if mismatch

### Write Permissions
- Only `coach` role or higher can write (`requireRole('coach')`)
- Admins can read, not write school customizations (by design — separate `/api/admin/schools` for admin features)

### Read Permissions
- School members can read their own school settings
- Admins can read any school settings (for audit, monitoring)

---

## Error Handling

| Status | Scenario | Message |
|--------|----------|---------|
| 400 | Validation failed | `{ "error": "invalid_<field>", "message": "..." }` |
| 400 | Missing required field | `{ "error": "missing_field", "message": "..." }` |
| 401 | Not authenticated | `{ "error": "unauthorized" }` |
| 403 | Not in school or wrong role | `{ "error": "forbidden", "message": "You do not belong to this school" }` |
| 404 | School not found | `{ "error": "not_found" }` |
| 500 | DB error | `{ "error": "internal_error" }` |

---

## Testing

### Unit Tests (SchoolSettingsService)
- [ ] Identity: validate name length, trim
- [ ] Table defaults: min < max validation
- [ ] Staking: coach_split_pct 0–100 bounds
- [ ] Leaderboard: valid metric names
- [ ] Platforms: max 20 items, max 50 chars per item
- [ ] Appearance: valid hex colors
- [ ] Auto-pause: idle_minutes 5–120

### Integration Tests (Routes)
- [ ] Coach can read own school settings
- [ ] Coach can write own school settings
- [ ] Coach cannot write another school's settings (403)
- [ ] Admin can read any school settings
- [ ] Admin cannot write school customizations (403 on PUT)
- [ ] Student cannot access settings endpoints (403)
- [ ] Update one setting doesn't affect others
- [ ] Validation errors return 400 with details

### Frontend Tests (SchoolTab)
- [ ] Settings load on mount
- [ ] Identity section: save updates identity
- [ ] Platforms section: add/remove platform, save
- [ ] Staking section: update fields, save
- [ ] Leaderboard section: change metrics, save
- [ ] Table defaults section: range validation
- [ ] Auto-pause section: update timeout
- [ ] Error messages display on 400/403/500
- [ ] Success messages display on save

---

## Implementation Order

1. **Database:** No migration needed (use existing `settings` table)
2. **Backend Service:** SchoolSettingsService.js
3. **Backend Routes:** school-settings.js route file
4. **Middleware:** requireSchoolMembership helper
5. **Tests:** Service + route integration tests
6. **Frontend:** Wire SchoolTab (already has UI, just connect API calls)
7. **Manual QA:** Verify all settings persist, admins can read, coaches can write

---

## Rollout Notes

- Phase 1 is low-risk: new endpoints only, no mutations to existing tables
- SchoolTab UI already exists; no frontend redesign needed
- If settings are missing, frontend should fall back to sensible defaults (not error)
- Coaches can customize immediately after login

---

## Definition of Done

- [ ] SchoolSettingsService passes all unit tests
- [ ] All 8 routes pass integration tests
- [ ] SchoolTab successfully calls all endpoints
- [ ] Validation errors are clear and actionable
- [ ] Admin read-only enforcement works
- [ ] No console errors or unhandled promise rejections
- [ ] TypeScript/linter clean
- [ ] New endpoints documented in `/docs/memory/backend.md`
