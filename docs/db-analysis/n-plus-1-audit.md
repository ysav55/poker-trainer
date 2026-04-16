# N+1 Query Audit: 809 Queries, 86 Files

**Scope:** All `supabase.from()`, `.select()`, `.where()` calls across server/

---

## Quick Stats

- **Total query sites:** 809 occurrences
- **Files with queries:** 86
- **Repository files:** 40+
- **Route files:** 18
- **Test files:** 30+
- **Service files:** 8

---

## High-Risk Patterns (Easy Wins)

### **1. Loop-based Hand Queries** (Replay, Analyzer)

**Problem:** Load hand once, then load actions in a loop
```javascript
// ❌ N+1 anti-pattern
const hand = await HandRepository.getHand(handId);
const actions = await supabase.from('hand_actions').select('*').eq('hand_id', handId);
const players = await supabase.from('hand_players').select('*').eq('hand_id', handId);
const tags = await supabase.from('hand_tags').select('*').eq('hand_id', handId);
// 4 sequential queries
```

**Solution:** Use DataAccessLayer or single nested query
```javascript
// ✅ Eager load
const hand = await req.db.getHand(handId);
// 1 query; actions, players, tags already loaded
```

**Files:** 
- `server/db/repositories/HandRepository.js` — 15 query sites
- `server/game/AnalyzerService.js` — 3 query sites
- `server/socket/handlers/replay.js` — 4 query sites

**Impact:** Replay page load: 8 queries → 1 query

---

### **2. Session Stats Join** (Missing)

**Problem:** Query session, then fetch stats separately
```javascript
// ❌ Missing join
const session = await supabase.from('sessions').select('*').eq('session_id', id).single();
const stats = await supabase.from('session_player_stats').select('*').eq('session_id', id);
// 2 queries
```

**Solution:** Add to SessionRepository.getSession()
```javascript
// ✅ Joined
const session = await supabase.from('sessions')
  .select('*, session_player_stats(*)')  // nested
  .eq('session_id', id)
  .single();
// 1 query
```

**Files:** `server/db/repositories/SessionRepository.js` — 2 query sites

**Impact:** Session page load: 2 → 1 query

---

### **3. Tournament + Standings Loop**

**Problem:** Load tournament, then loop to get standings
```javascript
// ❌ N+1
const tournament = await TournamentRepository.get(tournamentId);
const standings = await supabase.from('tournament_standings').select('*').eq('tournament_id', tournamentId);
```

**Solution:** Add nested select
```javascript
// ✅ Joined
const tournament = await supabase.from('tournaments')
  .select('*, tournament_standings(*)')
  .eq('id', tournamentId)
  .single();
// 1 query
```

**Files:** `server/db/repositories/TournamentRepository.js` — 3 query sites

---

### **4. Playlist → Items + Hands Loop**

**Problem:** Load playlist, then items, then hands per item
```javascript
// ❌ N+1
const playlist = await PlaylistRepository.get(playlistId);
const items = await supabase.from('playlist_items').select('*').eq('playlist_id', playlistId);
for (const item of items) {
  const hand = await HandRepository.getHand(item.hand_id);  // Loop!
}
```

**Solution:** Batch or eager-load
```javascript
// ✅ Batch
const playlist = await req.db.getPlaylist(playlistId);
const items = await supabase.from('playlist_items').select('*').eq('playlist_id', playlistId);
const hands = await req.db.getHandBatch(items.map(i => i.hand_id));
// 2 queries (not N+2)
```

**Files:** `server/db/repositories/PlaylistRepository.js` — 4 query sites

---

## Medium-Risk Patterns (Medium Effort)

| Pattern | File | Query Count | Fix | Benefit |
|---|---|---|---|---|
| **Player roster + roles** | PlayerRepository | 2 | Add nested role_select | Save 1 query per auth |
| **Table + settings** | TableRepository | 2 | Add table_presets join | Save 1 query per page load |
| **School + groups** | SchoolRepository | 2 | Add nested groups select | Save 1 query per school query |
| **Scenario + playlist** | ScenarioRepository | 3 | Add playlist join | Save 2 queries per scenario |

---

## Low-Risk Patterns (Accepted)

| Pattern | Reason | Queries |
|---|---|---|
| SELECT * (no explicit columns) | 809 occurrences; refactor later | Deferred |
| Transaction queries (create+insert) | Necessary atomicity | Accepted |
| Admin loops (bulk operations) | Background jobs OK; not user-facing | Accepted |

---

## Implementation Roadmap

### **Phase 1: Critical (This Week)**
1. **DataAccessLayer** — Hand eager-loading via req.db.getHand()
2. **Hand replay** — Use DataAccessLayer instead of loop
3. **Session joins** — Add nested session_player_stats select

**Expected:** 40% reduction in replay queries

### **Phase 2: Standard (Next Week)**
4. **Playlist batch** — req.db.getHandBatch() for item hands
5. **Tournament joins** — Add standings to getTournament()
6. **Scenario eager-loading** — Playlist + items in select

**Expected:** 30% reduction overall

### **Phase 3: Polish (Optional)**
7. **Explicit SELECT columns** — Audit all `select('*')` calls
8. **Admin query logging** — Measure actual query count per route
9. **Metrics** — Cache hit rate, P95 query latency

---

## Testing N+1 Fixes

### **Before:**
```bash
curl http://localhost:3001/api/hands/{handId}  # Server logs: 4 queries
```

### **After:**
```bash
curl http://localhost:3001/api/hands/{handId}  # Server logs: 1 query
```

### **Measurement:**
```javascript
// Add to DataAccessLayer or route logging:
const start = Date.now();
const result = await req.db.getHand(handId);
console.log(`getHand: ${Date.now() - start}ms (1 query)`);
```

---

## Migration Path (Zero Downtime)

1. Deploy DataAccessLayer (opt-in)
2. Refactor high-traffic routes (replay, analysis) → use req.db
3. Deprecate old patterns (add // TODO comments)
4. Batch delete old patterns once refactored

**No breaking changes; parallel deployment safe.**

---

## Long-Term: Query Budgets (Post-Deploy)

| Route | Query Budget | Current | Target |
|---|---|---|---|
| `GET /api/hands/:id` | 2 | 4 | 1 |
| `GET /api/sessions/:id` | 2 | 3 | 1 |
| `GET /api/tournaments/:id` | 3 | 5 | 2 |
| `GET /api/playlists/:id` | 3 | N+2 | 2 |

**Enforce via code review + monitoring.**
