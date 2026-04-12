# Item 8: Player CRM

**Status**: ⬜ pending
**Blocked by**: Items 3 (RBAC — crm:view/crm:edit permissions), 4 (user management), 5 (routing — /admin/crm page)
**Blocks**: nothing

---

## Context

Coaches need a single view per student: performance trends, notes, scheduling, mistake
breakdown. Much of the data already exists (`hand_tags`, `session_player_stats`,
`leaderboard`). New tables add coach notes, scheduling, and weekly snapshots.

---

## Migration 011 — CRM Tables

```sql
-- supabase/migrations/011_player_crm.sql

CREATE TABLE player_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES player_profiles(id),
  content TEXT NOT NULL,
  note_type VARCHAR(30) DEFAULT 'general'
    CHECK (note_type IN ('general', 'session_review', 'goal', 'weakness')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_player_notes_player ON player_notes (player_id, created_at DESC);

CREATE TABLE player_tags (
  player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
  tag VARCHAR(50) NOT NULL,
  assigned_by UUID REFERENCES player_profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (player_id, tag)
);

CREATE TABLE coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES player_profiles(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT DEFAULT 60,
  status VARCHAR(20) DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_coaching_sessions_player ON coaching_sessions (player_id, scheduled_at);

CREATE TABLE player_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  hands_played INT,
  net_chips BIGINT,
  vpip_pct NUMERIC(5,2),
  pfr_pct NUMERIC(5,2),
  wtsd_pct NUMERIC(5,2),
  wsd_pct NUMERIC(5,2),
  three_bet_pct NUMERIC(5,2),
  avg_decision_time_ms INT,
  most_common_mistakes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (player_id, period_start)
);
```

---

## New Repository: `server/db/repositories/CRMRepository.js`

```js
export const CRMRepository = {
  // Aggregated view: player_profiles + latest session stats + recent tags
  async getPlayerCRMSummary(playerId) { ... },

  // Notes
  async createNote(playerId, coachId, content, noteType) { ... },  // → UUID
  async getNotes(playerId, { limit = 20, offset = 0 }) { ... },    // → rows DESC

  // Tags
  async setPlayerTags(playerId, tags, assignedBy) {
    // DELETE all existing + INSERT new (replace-all pattern)
    await supabase.from('player_tags').delete().eq('player_id', playerId);
    if (tags.length > 0) {
      await supabase.from('player_tags').insert(
        tags.map(tag => ({ player_id: playerId, tag, assigned_by: assignedBy }))
      );
    }
  },
  async getPlayerTags(playerId) { ... },

  // Coaching sessions
  async createCoachingSession({ playerId, coachId, scheduledAt, durationMinutes, notes }) { ... },
  async getCoachingSessions(playerId, { status } = {}) { ... },
  async updateSessionStatus(sessionId, status) { ... },

  // Snapshots
  async upsertSnapshot(playerId, periodStart, periodEnd, stats) {
    // stats: { hands_played, net_chips, vpip_pct, pfr_pct, ... }
    await supabase.from('player_performance_snapshots').upsert({
      player_id: playerId, period_start: periodStart, period_end: periodEnd, ...stats,
    }, { onConflict: 'player_id,period_start' });
  },
  async getSnapshots(playerId, { limit = 12 } = {}) { ... },
};
```

---

## Weekly Snapshot Job: `server/jobs/snapshotJob.js`

```js
import { CRMRepository } from '../db/repositories/CRMRepository.js';
import { PlayerRepository } from '../db/repositories/PlayerRepository.js';
import { supabase } from '../db/supabase.js';

export async function computeAllSnapshots() {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const players = await PlayerRepository.listPlayers({ status: 'active' });

  for (const player of players) {
    // 1. Fetch session_player_stats for period
    const { data: stats } = await supabase
      .from('session_player_stats')
      .select('vpip, pfr, wtsd, wsd, hands_played, net_chips')
      .eq('player_id', player.id)
      .gte('created_at', periodStart.toISOString());

    // 2. Aggregate
    const snapshot = aggregateStats(stats ?? []);

    // 3. Fetch top mistake tags from hand_tags
    const { data: tags } = await supabase
      .from('hand_tags')
      .select('tag')
      .eq('player_id', player.id)
      .eq('tag_type', 'mistake')
      .gte('created_at', periodStart.toISOString());

    snapshot.most_common_mistakes = getTopN(tags ?? [], 3);

    await CRMRepository.upsertSnapshot(
      player.id,
      periodStart.toISOString().split('T')[0],
      periodEnd.toISOString().split('T')[0],
      snapshot
    );
  }
}

// Called on server start — runs every Sunday at 00:00 UTC
export function scheduleSundaySnapshot() {
  const now = new Date();
  const nextSunday = getNextSunday(now);
  const delay = nextSunday - now;
  setTimeout(() => {
    computeAllSnapshots().catch(console.error);
    setInterval(() => computeAllSnapshots().catch(console.error), 7 * 24 * 60 * 60 * 1000);
  }, delay);
}
```

---

## New Admin API Routes: `server/routes/admin/crm.js`

All GET routes: `requirePermission('crm:view')`
All mutation routes: `requirePermission('crm:edit')`

| Method | Path | Action |
|--------|------|--------|
| GET | /api/admin/players | List players with summary stats |
| GET | /api/admin/players/:id/crm | Full CRM view (stats + notes + tags + schedule) |
| GET | /api/admin/players/:id/notes | Paginated notes |
| POST | /api/admin/players/:id/notes | Add note |
| GET | /api/admin/players/:id/schedule | Upcoming sessions |
| POST | /api/admin/players/:id/schedule | Create coaching session |
| PUT | /api/admin/players/:id/schedule/:sid | Update session status |
| GET | /api/admin/players/:id/tags | Get player tags |
| PUT | /api/admin/players/:id/tags | Replace all player tags |
| GET | /api/admin/players/:id/snapshots | Weekly snapshots (last 12) |
| POST | /api/admin/snapshots/compute | Manual snapshot trigger (admin only) |

Register in `server/index.js`:
```js
import crmRouter from './routes/admin/crm.js';
app.use('/api/admin', requireAuth, crmRouter);
```

---

## New Frontend Pages: `client/src/pages/admin/`

### `PlayerCRM.jsx`
Two-column layout:
- **Left (narrow)**: Player selector (search input + scrollable list), Tags panel, Schedule list, Quick actions (Add Note, Schedule Session, Assign Playlist)
- **Right (wide)**: Stats chart, Notes timeline, Mistake breakdown, Hand history

### `PlayerStatsChart.jsx`
`recharts` `LineChart`. Check if recharts is installed first (`client/package.json`).
If not: `npm install recharts`. Lines: VPIP, PFR, 3Bet% over weekly snapshot periods.
X-axis: `period_start` dates. Tooltip shows all values.

### `PlayerNotesTimeline.jsx`
Append-only list sorted newest-first:
- Each note: timestamp, type badge (general/session_review/goal/weakness), content, coach name
- "Add Note" form above list: textarea + type selector + submit button
- Optimistic UI: append note locally on submit, refresh from server on success

### `PlayerTagManager.jsx`
Tag pills with × remove button. "+ Add tag" inline input (on Enter/blur: add tag).
On change: debounced `PUT /api/admin/players/:id/tags` with full tag list.
Tags are freeform strings ("tilts easily", "strong 3bet", "passive postflop").

### `PlayerSchedule.jsx`
Table: scheduled_at, duration, status badge, notes.
"Schedule Session" button → modal with: date/time picker, duration input, notes textarea.
Status update: dropdown per row (scheduled → completed/cancelled).

### `PlayerMistakeBreakdown.jsx`
`recharts` `BarChart` of top 10 mistake tags.
Data: fetch from `GET /api/admin/players/:id/crm` which includes aggregated mistake tags.
X-axis: tag names. Y-axis: frequency count.

### `PlayerHandHistory.jsx`
Paginated table: date, hand_id (link to replay), tags (pill list), net chips.
Reuse existing `GET /api/players/:stableId/hands` endpoint.
Filters: date range picker, tag multi-select.

---

## Key Files to Read Before Implementing

- `server/routes/players.js` — existing `/stats` and `/hands` endpoints (reuse patterns)
- `server/db/repositories/PlayerRepository.js` — existing stat query methods
- `supabase/migrations/001_initial_schema.sql` — `session_player_stats`, `leaderboard` schema
- `server/index.js` — admin router registration pattern

---

## Tests

- Unit: `computeAllSnapshots` — correct aggregation from mock session_player_stats
- Unit: `CRMRepository.setPlayerTags` — delete+insert atomicity
- Unit: `CRMRepository.createNote` / `getNotes` ordering
- Unit: `scheduleSundaySnapshot` — correct delay calculation to next Sunday
- Integration: POST `/api/admin/players/:id/notes` → GET notes returns it newest-first
- Integration: PUT `/api/admin/players/:id/tags` → GET tags returns updated set
- Integration: POST `/api/admin/snapshots/compute` → snapshots upserted for all active players
- Integration: GET `/api/admin/players/:id/crm` — returns merged view
