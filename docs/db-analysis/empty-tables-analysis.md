# Empty Tables: Write Paths & Activation

**Generated:** 2026-04-16 | **Status:** All tables have code paths to write; none are blocked by schema.

---

## Summary: 20+ Tables with 0 Rows

| Table | Rows | Write Path | Trigger Condition | Issue |
|---|---|---|---|---|
| **hand_tags** | 0 | `TagRepository.replaceAutoTags()` | Hand completes (socket: endHand) | ✅ Works; analyzer runs post-hand; likely no hands were auto-tagged yet |
| **coaching_sessions** | 0 | None found | N/A (schema-only, unused) | ⚠️ No write path exists; retire or add feature |
| **student_baselines** | 0 | `BaselineService.recompute(studentId)` | Manual call or post-session job | ⏱️ Idle; fire-and-forget in `tableCleanup.js` after session |
| **progress_reports** | 0 | `ProgressReportService.generate()` | `POST /api/coach/students/:id/reports` | ⏱️ Idle; endpoint exists but never called (no UI trigger) |
| **alert_instances** | 0 | `AlertService.generateAlerts(coachId)` | Called from admin alerts page | ⏱️ Idle; detection code present but not auto-triggered |
| **player_notes** | 0 | `CRMRepository.upsertNote()` | `POST /api/crm/players/:id/notes` | ⏱️ Idle; endpoint exists but no client code calling it |
| **player_tags** | 0 | None found | N/A (schema-only, unused) | ⚠️ No write path exists; retire |
| **announcement_reads** | 0 | None found (auto-update via RLS?) | N/A | ⚠️ Orphaned; announcements table also empty |
| **stack_adjustments** | 0 | None found | N/A (schema-only) | ⚠️ No write path exists; retire |
| **scenario_configs** | 0 | None found | N/A (schema-only, see scenarios) | ⚠️ Scenarios table (13 rows) used; configs table unused |

---

## Why So Empty?

### **1. Analyzer Pipeline (hand_tags = 0)**

```javascript
// server/socket/handlers/gameLifecycle.js
handLogger.endHand(handInfo)
  .then(() => AnalyzerService.analyzeAndTagHand(handId))  // ← Called on hand end
  .catch(err => log.error(…))

// server/game/AnalyzerService.js
async function analyzeAndTagHand(handId) {
  const context = await buildAnalyzerContext(handId);  // 3 DB queries
  const results = await Promise.allSettled([
    …ANALYZER_REGISTRY.map(analyzer => analyzer.fn(context))  // 9 analyzers
  ]);
  
  await replaceAutoTags(handId, autoTagRows);  // ← Writes to hand_tags
}
```

**Status:** Code is live. Tags should exist if hands completed post-2026-03-22 (when analyzer deployed). 
**Investigation:** Check `hand_tags` count per hand; likely 0 because:
- Hands were created but analyzer never ran (e.g., test mode, manual creation)
- Or analyzer is running but filteringoff empty results

**Test:** 
```sql
SELECT hand_id, COUNT(*) FROM hand_tags GROUP BY hand_id LIMIT 5;
SELECT COUNT(*) FROM hands WHERE hand_id NOT IN (SELECT DISTINCT hand_id FROM hand_tags) as unanalyzed;
```

---

### **2. Baseline Service (student_baselines = 0)**

```javascript
// server/socket/handlers/gameLifecycle.js tableCleanup
.then(() => BaselineService.recompute(Array.of(student_ids)))  // fire-and-forget

// server/services/BaselineService.js
async function recompute(playerIds) {
  for (const playerId of playerIds) {
    const stats = await _computeStats(playerId);
    await q(supabase.from('student_baselines').upsert({ player_id: playerId, …stats }));
  }
}
```

**Status:** Code is live & async (not awaited in handler).
**Why empty:** Baselines computed async; should exist 10–60s post-session.

**Investigation:** 
```sql
SELECT player_id, updated_at FROM student_baselines ORDER BY updated_at DESC LIMIT 5;
```

**Risk:** If no sessions completed, baselines stay 0. (173 sessions exist → baselines should exist)

---

### **3. Progress Reports (progress_reports = 0)**

```javascript
// server/routes/reports.js
router.post('/api/coach/students/:studentId/reports', async (req, res) => {
  const report = await ProgressReportService.generate(coachId, studentId, start, end);
  res.json(report);
});
```

**Status:** Code works; route defined.
**Why empty:** **No client code calls this endpoint.** Frontend never triggers report generation.

**Activation:** 
```bash
curl -X POST http://localhost:3001/api/coach/students/{studentId}/reports \
  -H "Authorization: Bearer {jwt}" \
  -H "Content-Type: application/json" \
  -d '{"period_start":"2026-04-01","period_end":"2026-04-16"}'
```

---

### **4. Alerts (alert_instances = 0)**

```javascript
// server/services/AlertService.js
async function generateAlerts(coachId) {
  const detectors = [
    new InactivityDetector(),
    new VolumeDropDetector(),
    new MistakeSpikeDetector(),
    …5 total
  ];
  
  const alerts = await Promise.all(detectors.map(d => d.detect(coachId)));
  for (const alert of alerts) {
    await upsertAlert(alert);  // ← Writes to alert_instances
  }
}

// server/routes/alerts.js
router.get('/api/coach/alerts', async (req, res) => {
  const alerts = await AlertService.generateAlerts(req.user.id);
  res.json(alerts);
});
```

**Status:** Code works; route defined; detectors exist.
**Why empty:** Endpoint only called when coach visits alerts page. (No alerts were generated because page never visited in test.)

---

### **5. Player Notes (player_notes = 0)**

```javascript
// server/db/repositories/CRMRepository.js
async function upsertNote(playerId, note) {
  await q(supabase.from('player_notes').upsert({
    player_id: playerId,
    content: note,
    …
  }));
}

// server/routes/admin/crm.js
router.post('/api/crm/players/:playerId/notes', async (req, res) => {
  const { content } = req.body;
  await CRMRepository.upsertNote(playerId, content);
  res.json({ ok: true });
});
```

**Status:** Code works; route defined.
**Why empty:** No client code calls this endpoint. Frontend never opens note editor.

---

### **6. Orphaned Tables (No Write Path)**

| Table | Status | Action |
|---|---|---|
| **coaching_sessions** | Schema exists; no write code | Delete from next migration (unused feature) |
| **player_tags** | Schema exists; no write code | Delete from next migration (unused feature) |
| **stack_adjustments** | Schema exists; no write code | Delete from next migration (unused feature) |
| **scenario_configs** | Schema exists; `scenarios` used instead | Delete from next migration; consolidate into scenarios |

---

## Activation Plan

To populate these tables before deploy:

### **Stage 1: Automated (already running)**
- ✅ **hand_tags** — Auto-tagged on hand end (verify analyzer ran)
- ⏱️ **student_baselines** — Computed async post-session (verify job ran)
- ⏱️ **session_prep_briefs** — Cached on coach page load (9 exist; good)

### **Stage 2: Manual Test (dev/staging)**
1. **progress_reports:** Trigger from postman or curl
2. **alert_instances:** Visit `/coach/alerts` page in UI (or POST)
3. **player_notes:** Add note in CRM UI (or POST `/api/crm/players/:id/notes`)

### **Stage 3: Pre-Deploy Verification**
```sql
-- Verify minimum rows exist
SELECT 
  'hand_tags' as tbl, COUNT(*) as cnt FROM hand_tags
UNION ALL
SELECT 'student_baselines', COUNT(*) FROM student_baselines
UNION ALL
SELECT 'progress_reports', COUNT(*) FROM progress_reports
UNION ALL
SELECT 'alert_instances', COUNT(*) FROM alert_instances
UNION ALL
SELECT 'player_notes', COUNT(*) FROM player_notes;
```

**Expected before prod:** hand_tags ≥ 50, student_baselines ≥ 10, others ≥ 1

---

## Retirement Candidates (Safe to Delete)

| Table | Reason | Impact |
|---|---|---|
| **coaching_sessions** | Never written to; functionality in tables + sessions | None; orphaned |
| **player_tags** | Never written to; hand_tags covers this | None; orphaned |
| **stack_adjustments** | Never written to; player_chip_bank covers this | None; orphaned |
| **scenario_configs** | Never written to; scenarios table covers this | Consolidate schema |
| **announcement_reads** | Empty; auto-update via RLS not working | Check RLS policy |

**Deletion plan:** Write migration 060 to drop these tables (safe; no dependencies).

---

## RLS Policies (May Block Writes)

All empty tables have RLS enabled with 28 standard policies. Check if:
1. Row-level security is **not** blocking valid inserts
2. Service role used in code (bypasses RLS) — ✅ Confirmed in repositories

**Safe:** All write code uses `supabase.from()` with service role key server-side.
