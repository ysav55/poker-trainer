# School System Phase 3: Visibility Filtering (School-Scoped Tables/Tournaments)

**Date:** 2026-04-16  
**Phase:** 3 of 3 (Settings → Passwords → Visibility Filtering)  
**Status:** Design Approved

---

## Overview

School members see only their school's tables/tournaments by default. Admins can create "Open" (cross-school visible) tables. Private tables have a whitelist of invited students (+ optional group auto-add). Privacy configuration happens during table creation via an inline modal.

**Phase 3 deliverable:** Full visibility filtering with school isolation and private table management — backend filtering, frontend privacy modal, spectate access control.

---

## Scope

### In Scope
- Database: Add `school_id` FK to `tables` and `tournament_groups`
- Backend visibility service: `TableVisibilityService`
- Backend route updates: `GET /api/tables`, `GET /api/tournaments`, `POST /api/tables`, `POST /api/tournaments`
- New routes: whitelist management (`POST /api/tables/:id/whitelist`, `DELETE /api/tables/:id/whitelist/:playerId`)
- New route: `PATCH /api/tables/:id/privacy` (edit privacy after creation)
- Frontend: `PrivacyConfigModal.jsx` (new component for privacy configuration)
- Frontend: `CreateTableModal.jsx` integration (privacy selection → modal opens if Private)
- Frontend: `LobbyPage.jsx` / `TablesPage.jsx` updates (remove 'open' option for non-admins, default to 'school')
- Frontend: Privacy badges on table cards (open, school, private, admin)
- Spectate access control: coaches can only spectate their own school's tables
- **Critical:** Backward compat: no existing tables affected; new tables always have school_id

### Out of Scope
- Email-based invites (deferred)
- Cross-school visibility (hard rule: not supported)
- Dynamic role-based access (not yet; use simple school_id check)
- Privacy editing via separate "Edit" page (only via modal in creation flow)
- Tournament group privacy (same rules as tables, but feature parity deferred if needed)

---

## Database

### Schema Changes (Migrations)

#### Migration: Add school_id to tables
```sql
ALTER TABLE tables ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
CREATE INDEX idx_tables_school_id ON tables(school_id);

-- Note: Existing tables have NULL school_id (wiped before real users; not relevant)
-- New tables ALWAYS have school_id set (enforced at application level)
```

#### Migration: Add school_id to tournament_groups
```sql
ALTER TABLE tournament_groups ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
CREATE INDEX idx_tournament_groups_school_id ON tournament_groups(school_id);
```

#### New table: private_table_whitelist
Tracks invited players for private tables.
```sql
CREATE TABLE private_table_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id VARCHAR(100) NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES player_profiles(id),
  invited_by UUID NOT NULL REFERENCES player_profiles(id), -- who invited them
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(table_id, player_id)
);

CREATE INDEX idx_whitelist_table_id ON private_table_whitelist(table_id);
CREATE INDEX idx_whitelist_player_id ON private_table_whitelist(player_id);
```

---

## Visibility Rules

| Privacy | Who Sees It | Who Can Join | Whitelist Needed? |
|---------|-------------|--------------|-------------------|
| **open** | Everyone (all authenticated users) | Anyone | No |
| **school** | Only members of the table's school | School members only | No |
| **private** | Only whitelisted players | Whitelisted players only | Yes |

**Critical:** Private tables do NOT appear in the lobby for non-whitelisted users. They don't show in search, list, or any view. Only whitelisted players see them.

---

## Backend

### Service: TableVisibilityService

File: `server/services/TableVisibilityService.js`

```javascript
/**
 * Check if a player can see a table in the lobby (visibility check).
 * @param {string} playerId
 * @param {table object} table - must have { privacy, school_id }
 * @returns boolean
 */
async canPlayerSeeTable(playerId, table) {
  if (table.privacy === 'open') return true;
  
  if (table.privacy === 'school') {
    const player = await PlayerRepository.getPlayer(playerId);
    return player.school_id === table.school_id;
  }
  
  if (table.privacy === 'private') {
    const whitelisted = await isPlayerWhitelisted(table.id, playerId);
    return whitelisted;
  }
  
  return false;
}

/**
 * Get all tables visible to a player (used by GET /api/tables).
 * @param {string} playerId
 * @param {string?} mode - optional filter (coached_cash, uncoached_cash, tournament, bot_cash)
 * @returns array of visible table objects
 */
async getVisibleTables(playerId, mode) {
  // 1. Fetch all tables from DB
  // 2. Filter by mode if provided
  // 3. For each table: call canPlayerSeeTable(playerId, table)
  // 4. Return only visible tables
}

/**
 * Check if player is whitelisted for a private table.
 * @param {string} tableId
 * @param {string} playerId
 * @returns boolean
 */
async isPlayerWhitelisted(tableId, playerId) {
  // Query private_table_whitelist for (table_id, player_id) match
  // Return true if exists
}

/**
 * Add player to private table whitelist.
 * @param {string} tableId
 * @param {string} playerId
 * @param {string} invitedBy - player doing the inviting
 * @returns true on success
 */
async addToWhitelist(tableId, playerId, invitedBy) {
  // INSERT into private_table_whitelist
}

/**
 * Remove player from whitelist.
 * @param {string} tableId
 * @param {string} playerId
 * @returns true on success
 */
async removeFromWhitelist(tableId, playerId) {
  // DELETE from private_table_whitelist
}

/**
 * Get all whitelisted players for a table.
 * @param {string} tableId
 * @returns array of { playerId, displayName, invitedBy, invitedAt }
 */
async getWhitelist(tableId) {
  // Query private_table_whitelist with player profile joins
}

/**
 * Auto-add group members to whitelist (used during table creation).
 * @param {string} tableId
 * @param {string} groupId
 * @param {string} invitedBy
 * @returns number of players added
 */
async addGroupToWhitelist(tableId, groupId, invitedBy) {
  // 1. Query group_members for groupId
  // 2. For each member: call addToWhitelist(tableId, playerId, invitedBy)
  // 3. Return count added
}
```

### Routes: `server/routes/tables.js` Updates

**Auth:** All routes require `requireAuth` middleware.

#### `GET /api/tables` (ENHANCED)
**List tables visible to the current user**

**Backend Logic:**
1. Fetch all non-completed, non-bot_cash tables
2. Merge with live SharedState summaries
3. Filter using `TableVisibilityService.getVisibleTables(req.user.id)`
4. Return filtered array

**Response (200):**
```json
{
  "tables": [
    {
      "id": "table-123",
      "name": "Friendly Game",
      "mode": "coached_cash",
      "privacy": "school",
      "schoolId": "uuid",
      "createdBy": "uuid",
      "config": { "sb": 25, "bb": 50, "startingStack": 5000 },
      "live": { "seated": 4, "awaiting": 1, ... }
    },
    ...
  ]
}
```

---

#### `POST /api/tables` (ENHANCED)
**Create a table with school_id and privacy configuration**

**Request:**
```json
{
  "name": "Friendly Game",
  "mode": "coached_cash",
  "config": { "sb": 25, "bb": 50, "startingStack": 5000 },
  "privacy": "private",
  "privateConfig": {
    "whitelistedPlayers": ["player-uuid-1", "player-uuid-2"],
    "groupId": "group-uuid-1"
  }
}
```

**Backend Logic:**
1. Validate name (required)
2. Validate mode (coached_cash, uncoached_cash, tournament, bot_cash)
3. Validate config (sb, bb, startingStack)
4. **NEW:** Validate privacy:
   - If coach (not admin): privacy must be 'school' or 'private'; reject 'open' with 400
   - If admin: any privacy allowed
5. **NEW:** Assign school_id:
   - If coach: `school_id = req.user.school_id`
   - If admin: `school_id = req.body.schoolId` (optional) or null
6. **NEW:** If privacy='private':
   - Validate privateConfig.whitelistedPlayers has ≥1 player
   - Create table first
   - Add whitelistedPlayers to private_table_whitelist
   - If privateConfig.groupId: call `TableVisibilityService.addGroupToWhitelist(tableId, groupId, createdBy)`
7. Return created table

**Response (201):**
```json
{
  "id": "table-123",
  "name": "Friendly Game",
  "mode": "coached_cash",
  "privacy": "private",
  "schoolId": "uuid",
  "createdBy": "uuid",
  "config": { ... },
  "live": null
}
```

**Errors:**
- 400: Invalid name, mode, config
- 400: Non-admin tries to create 'open' table → `{ "error": "forbidden_privacy", "message": "Only admins can create open tables" }`
- 400: Private table has no whitelist → `{ "error": "invalid_private_config", "message": "Private tables require at least one whitelisted player" }`
- 403: Not authenticated
- 500: Database error

---

#### `PATCH /api/tables/:id/privacy` (NEW)
**Edit privacy settings after creation**

**Request:**
```json
{
  "privacy": "private",
  "privateConfig": {
    "whitelistedPlayers": ["player-uuid-1", "player-uuid-2"],
    "groupId": "group-uuid-1"
  }
}
```

**Backend Logic:**
1. Assert table ownership (same as existing PATCH checks)
2. Validate new privacy value
3. If switching to 'private': validate privateConfig (≥1 player)
4. If switching FROM 'private': optionally warn (frontend decision)
5. Clear old whitelist (if applicable)
6. Add new whitelist entries
7. Update table.privacy

**Response (200):** Updated table record

**Errors:**
- 400: Invalid privacy or config
- 403: Not owner
- 404: Table not found

---

#### `POST /api/tables/:id/whitelist` (NEW)
**Add player to private table whitelist**

**Request:**
```json
{ "playerId": "uuid" }
```

**Backend Logic:**
1. Assert table ownership
2. Assert table is private (privacy='private')
3. Call `TableVisibilityService.addToWhitelist(tableId, playerId, req.user.id)`
4. Return updated whitelist

**Response (201):** Updated whitelist array

**Errors:**
- 400: Invalid playerId
- 403: Not owner
- 404: Table not found
- 409: Player already whitelisted

---

#### `DELETE /api/tables/:id/whitelist/:playerId` (NEW)
**Remove player from whitelist**

**Backend Logic:**
1. Assert table ownership
2. Call `TableVisibilityService.removeFromWhitelist(tableId, playerId)`

**Response (204):** No content

**Errors:**
- 403: Not owner
- 404: Table or whitelist entry not found

---

### Routes: `server/routes/tournaments.js` Updates

Apply same changes as tables:
- `GET /api/tournaments`: Filter by school + privacy
- `POST /api/tournaments`: Accept privacy + privateConfig, enforce school_id, validate 'open' restriction
- `PATCH /api/tournaments/:id/privacy` (NEW)
- `POST /api/tournaments/:id/whitelist` (NEW)
- `DELETE /api/tournaments/:id/whitelist/:playerId` (NEW)

---

### Spectate Access Control

**In:** `server/routes/tables.js` (GET single table for spectate)

**Logic:**
Before allowing spectate on a table:
```javascript
// Check visibility
const canSee = await TableVisibilityService.canPlayerSeeTable(req.user.id, table);
if (!canSee) return 403 { error: "forbidden", message: "You cannot spectate tables outside your school" };

// Check spectate-specific rules (if any)
if (table.privacy === 'school') {
  const player = await PlayerRepository.getPlayer(req.user.id);
  if (player.school_id !== table.school_id) return 403;
}
if (table.privacy === 'private') {
  const whitelisted = await TableVisibilityService.isPlayerWhitelisted(table.id, req.user.id);
  if (!whitelisted) return 403;
}
```

**Result:** Coaches can only spectate tables in their own school. Non-whitelisted players cannot spectate private tables.

---

## Frontend

### New Component: PrivacyConfigModal

File: `client/src/components/tables/PrivacyConfigModal.jsx`

**Purpose:** Configure privacy settings during table creation (or later editing).

**Props:**
```javascript
{
  tableName: string,
  initialPrivacy: 'school' | 'private',
  initialWhitelist: string[], // array of player IDs
  initialGroupId: string | null,
  allSchoolMembers: array of { id, displayName, email }, // sorted alphabetically
  allGroups: array of { id, name },
  onConfirm: (privacy, privateConfig) => void,
  onCancel: () => void
}
```

**UI Layout:**
```
┌────────────────────────────────────────────────┐
│ Privacy Configuration                          │
│ Table: "Friendly Game"                         │
│                                                │
│ [School]  [Private]  ← tabs/buttons            │
│                                                │
│ [If School selected:]                          │
│ ✓ All school members can join                  │
│                                                │
│ [If Private selected:]                         │
│                                                │
│ + Invite Students                              │
│   [Search: "Bob"]      [×] Clear               │
│   ☐ Alice (alice@...) ← checkbox               │
│   ☑ Bob (bob@...)     ← already selected       │
│   ☐ Carol (carol@...)                          │
│                                                │
│ + Add Group (optional)                         │
│   [Dropdown: "— Select —", "Cohort A", ...]   │
│   Auto-adds all group members                  │
│                                                │
│ ⚠ Private table requires ≥1 student           │
│                                                │
│ [Cancel]  [Configure Private]                  │
└────────────────────────────────────────────────┘
```

**Features:**
- Tabs/buttons to switch School ↔ Private
- School mode: no configuration needed
- Private mode:
  - Search box: filters school members by displayName (case-insensitive substring match)
  - Checkbox list: alphabetically sorted students
  - Group selector: optional, auto-adds entire group to whitelist
  - Validation indicator: "✓ 2 students invited" or "⚠ Add at least 1 student"
- Switching School → Private: clears whitelist (no data loss)
- Switching Private → School: optionally warn if whitelist is not empty
- Cancel/Confirm buttons

**State:**
```javascript
const [privacy, setPrivacy] = useState(initialPrivacy);
const [searchQuery, setSearchQuery] = useState('');
const [whitelistedPlayers, setWhitelistedPlayers] = useState(initialWhitelist);
const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId);

// Computed:
const searchResults = allSchoolMembers.filter(m => 
  m.displayName.toLowerCase().includes(searchQuery.toLowerCase())
);
const groupMembers = selectedGroupId ? 
  allGroups.find(g => g.id === selectedGroupId)?.members : [];
```

---

### Updates: CreateTableModal

File: `client/src/components/tables/CreateTableModal.jsx`

**Current flow:**
1. User fills in name, mode, SB/BB, stack
2. User selects privacy (open/school/private) from dropdown
3. User clicks "Create Table"

**New flow:**
1. User fills in name, mode, SB/BB, stack
2. User clicks "Privacy" dropdown, selects "School" or "Private"
3. **NEW:** If "Private" selected:
   - Show "Next" button instead of "Create Table"
   - User clicks "Next"
   - PrivacyConfigModal opens (overlay or modal within modal)
   - User configures whitelist + group
   - User clicks "Create Table" in modal
4. If "School" selected:
   - "Create Table" button available immediately

**Integration:**
```javascript
const [showPrivacyModal, setShowPrivacyModal] = useState(false);

const handlePrivacyChange = (newPrivacy) => {
  setPrivacy(newPrivacy);
  if (newPrivacy === 'private' && !showPrivacyModal) {
    setShowPrivacyModal(true);
  }
};

const handleCreateTable = async () => {
  if (privacy === 'private' && !showPrivacyModal) {
    setShowPrivacyModal(true);
    return;
  }
  // ... existing create logic
};
```

---

### Updates: LobbyPage / TablesPage

File: `client/src/pages/LobbyPage.jsx` or `client/src/pages/TablesPage.jsx`

**Changes:**
1. `GET /api/tables` response now server-filtered (no client-side filtering needed, but can stay for UX tabs)
2. Remove 'open' option from CreateTableModal for non-admins:
   ```javascript
   const PRIVACY_OPTIONS = isAdmin 
     ? [
         { value: 'open', label: 'Open' },
         { value: 'school', label: 'School' },
         { value: 'private', label: 'Private' }
       ]
     : [
         { value: 'school', label: 'School' },
         { value: 'private', label: 'Private' }
       ];
   ```
3. Default privacy from 'open' to 'school':
   ```javascript
   const [privacy, setPrivacy] = useState('school'); // was 'open'
   ```
4. Add privacy badge to table cards (see TableCard section below)
5. Client-side tabs still work (All, Cash, Tournament, Mine, School, Open) but are purely UI — server ensures user can't see what they shouldn't

---

### Updates: TableCard

File: `client/src/components/TableCard.jsx` or similar

**Add privacy badge with icon:**
```javascript
const privacyBadge = {
  'open': { icon: <Globe size={14} />, label: 'Open', color: '#3b82f6' },
  'school': { icon: <Building2 size={14} />, label: 'School', color: '#6b7280' },
  'private': { icon: <Lock size={14} />, label: 'Private', color: '#dc2626' }
};

// If table.createdBy is admin and privacy is 'open':
// Show additional "ADMIN" badge
```

**Add "Edit Privacy" button (if user owns table):**
```javascript
{isOwner && (
  <button onClick={() => setEditPrivacyModal(true)}>
    Edit Privacy
  </button>
)}
```

---

### Updates: PrivacyBadge

File: `client/src/components/PrivacyBadge.jsx`

Already exists; ensure it displays privacy icons correctly:
- open: globe icon
- school: building icon
- private: lock icon

---

## Auth & Permissions

| Endpoint | Role | Permission |
|----------|------|-----------|
| `GET /api/tables` | Any authenticated | Filtered by visibility (school + privacy) |
| `POST /api/tables` | Coach+ or Admin | Coach: 'school'/'private' only; Admin: any |
| `PATCH /api/tables/:id/privacy` | Owner (coach) | Must own table |
| `POST /api/tables/:id/whitelist` | Owner | Must own table |
| `DELETE /api/tables/:id/whitelist/:playerId` | Owner | Must own table |
| Same for tournaments | — | Same rules apply |

---

## Error Handling

| HTTP | Error Code | Scenario | Message |
|------|-----------|----------|---------|
| 400 | `forbidden_privacy` | Non-admin creates 'open' table | "Only admins can create open tables" |
| 400 | `invalid_private_config` | Private table has no whitelist | "Private tables require at least one whitelisted player" |
| 400 | `invalid_privacy` | Invalid privacy value | "Privacy must be open, school, or private" |
| 403 | `forbidden` | Player not in whitelist (join attempt) | "You are not invited to this table" |
| 403 | `forbidden` | Coach tries to spectate another school's table | "You cannot spectate tables outside your school" |
| 403 | `forbidden` | Not owner of table (edit attempt) | "You do not own this table" |
| 404 | `not_found` | Table doesn't exist | "Table not found" |
| 409 | `conflict` | Player already whitelisted | "Player is already invited to this table" |
| 500 | `internal_error` | Database error | "An error occurred while processing your request" |

---

## Testing

### Unit Tests: TableVisibilityService

- [ ] `canPlayerSeeTable`: open privacy → returns true
- [ ] `canPlayerSeeTable`: school privacy, same school → returns true
- [ ] `canPlayerSeeTable`: school privacy, different school → returns false
- [ ] `canPlayerSeeTable`: private privacy, whitelisted → returns true
- [ ] `canPlayerSeeTable`: private privacy, not whitelisted → returns false
- [ ] `isPlayerWhitelisted`: player exists in whitelist → returns true
- [ ] `isPlayerWhitelisted`: player not in whitelist → returns false
- [ ] `addToWhitelist`: adds player successfully
- [ ] `addToWhitelist`: rejects duplicate (UNIQUE constraint)
- [ ] `removeFromWhitelist`: removes player successfully
- [ ] `getWhitelist`: returns array of whitelisted players
- [ ] `addGroupToWhitelist`: adds all group members

### Integration Tests: Routes

- [ ] Coach can create school-scoped table
- [ ] Coach cannot create open table (400)
- [ ] Admin can create open table
- [ ] Coach can create private table with whitelist
- [ ] Private table requires ≥1 whitelisted player (400)
- [ ] Coach cannot see tables from another school
- [ ] Coach can see school-scoped tables
- [ ] Non-whitelisted player cannot see private table
- [ ] Whitelisted player can see private table
- [ ] Coach can edit privacy of owned table
- [ ] Coach cannot edit privacy of unowned table (403)
- [ ] Coach can add/remove players from whitelist
- [ ] Table visibility filtering in `GET /api/tables` works correctly

### Integration Tests: Spectate Access

- [ ] Coach can spectate school-scoped table in own school
- [ ] Coach cannot spectate school-scoped table in another school (403)
- [ ] Coach cannot spectate private table if not whitelisted (403)
- [ ] Admin can spectate any open table

### Frontend Tests: PrivacyConfigModal

- [ ] Modal opens when "Private" selected in CreateTableModal
- [ ] School tab: shows message "All school members can join"
- [ ] Private tab: shows student list and group selector
- [ ] Search filters students by displayName
- [ ] Checkboxes toggle whitelist membership
- [ ] Group selector auto-adds all members
- [ ] Validation: shows warning if <1 student selected
- [ ] "Create Table" disabled until ≥1 student invited
- [ ] Switching School → Private clears whitelist
- [ ] Switching Private → School optionally warns

### Frontend Tests: LobbyPage / TableCard

- [ ] 'open' option removed for non-admins in CreateTableModal
- [ ] Default privacy is 'school' (not 'open')
- [ ] Privacy badge displays correctly (icon + label)
- [ ] Admin tables show "ADMIN" badge
- [ ] Table list only shows visible tables (server-filtered)
- [ ] "Edit Privacy" button appears on owned tables
- [ ] Clicking "Edit Privacy" opens PrivacyConfigModal

---

## Implementation Order

1. **Database:** Create migrations for school_id on tables/tournament_groups; create private_table_whitelist
2. **Backend Service:** `TableVisibilityService.js` with all methods
3. **Backend Routes:** Update tables.js and tournaments.js (GET, POST, PATCH, whitelist endpoints)
4. **Backend Integration:** Spectate access control in table routes
5. **Tests:** Service + route integration tests
6. **Frontend Component:** `PrivacyConfigModal.jsx`
7. **Frontend Integration:** `CreateTableModal.jsx`, `LobbyPage.jsx`, `TableCard.jsx`
8. **Manual QA:** Full flow: create private table → invite students → non-invited sees nothing → invited sees table

---

## Rollout Notes

- Phase 3 is backward-compatible: existing tables have NULL school_id and are NOT visible to anyone by default (safe default)
- Coaches can immediately start creating school-scoped tables after Phase 1 ships
- Private table creation requires whitelist, preventing empty private tables
- No breaking changes to existing endpoints (GET filters, POST accepts new fields)

---

## Definition of Done

- [ ] `school_id` added to tables and tournament_groups via migration
- [ ] `private_table_whitelist` table created
- [ ] `TableVisibilityService` passes all unit tests
- [ ] All updated routes pass integration tests
- [ ] `PrivacyConfigModal.jsx` works end-to-end
- [ ] `CreateTableModal.jsx` integrates modal flow
- [ ] LobbyPage removes 'open' for non-admins, defaults to 'school'
- [ ] Privacy badges display correctly on table cards
- [ ] Spectate access control enforced (coaches can only spectate own school)
- [ ] Visibility filtering confirmed: private tables invisible to non-whitelisted, school tables invisible to other schools, open visible to all
- [ ] No console errors or unhandled promise rejections
- [ ] TypeScript/linter clean
- [ ] Endpoints documented in `/docs/memory/backend.md`
