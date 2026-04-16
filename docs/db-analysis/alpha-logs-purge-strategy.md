# Alpha Logs: Purge Strategy & TTL

**Current State:** 13,436 rows, ~5.6 MB | **Created:** 2026-03-30 → 2026-04-16

---

## Problem

- **Growth:** 200+ rows/day (debugging logs accumulating)
- **Impact:** Query scans slow; disk usage grows; backup bloat
- **Action:** Purge old logs + add automated TTL retention

---

## Solution: Two-Phase Approach

### **Phase 1: Immediate Purge (One-time)**

```sql
-- Keep only last 7 days of alpha_logs
DELETE FROM alpha_logs WHERE created_at < NOW() - INTERVAL '7 days';

-- Result: ~13.4K rows → ~1.4K rows (rough estimate; 1–2 days of logs)
-- Recovered: ~5MB → ~0.6MB
```

**When:** Before staging deploy (dev safe; no production impact yet)

**Verification:**
```sql
SELECT 
  COUNT(*) as remaining_rows,
  pg_size_pretty(pg_total_relation_size('alpha_logs')) as size
FROM alpha_logs;
```

---

### **Phase 2: Automated TTL (Migration 061)**

Create migration to add:
1. **TTL function** — Auto-delete logs older than 14 days
2. **Index on created_at** — Speed up TTL scans
3. **Cron job** — Daily purge (Supabase pgcron)

```sql
-- Migration 061_alpha_logs_ttl.sql

-- Index for TTL lookups
CREATE INDEX idx_alpha_logs_created_at 
  ON alpha_logs(created_at DESC) 
  WHERE created_at < NOW() - INTERVAL '14 days';

-- Retention policy: keep 14 days, auto-delete older
-- Supabase: Use pg_cron to run daily

-- Create function for cron job
CREATE OR REPLACE FUNCTION purge_old_alpha_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM alpha_logs 
  WHERE created_at < NOW() - INTERVAL '14 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule daily purge at 02:00 UTC (low-traffic window)
-- Note: Supabase pgcron syntax
-- SELECT cron.schedule('purge-alpha-logs', '0 2 * * *', 'SELECT purge_old_alpha_logs()');

-- For now, manual approach: add to monitoring/alerts
-- TODO: Wire into tableCleanup.js job or separate cron service
```

---

## Implementation Checklist

- [ ] **Dev:** Run Phase 1 purge manually
- [ ] **Write migration 061** (create retention function + index)
- [ ] **Staging:** Deploy migration + monitor log growth
- [ ] **Prod:** Deploy migration; monitor daily purge

---

## Alternative: Log Rotation (If TTL Not Feasible)

If Supabase pgcron unavailable:

```javascript
// server/jobs/alphaLogRotation.js
async function rotateAlphaLogs() {
  const yesterday = new Date(Date.now() - 86400000 * 14); // 14 days ago
  
  await supabase
    .from('alpha_logs')
    .delete()
    .lt('created_at', yesterday.toISOString());
  
  console.log('Alpha logs rotated');
}

// Wire into tableCleanup or separate job scheduler
module.exports = { rotateAlphaLogs };
```

---

## Data Retention Policy (Post-Deploy)

| Log Type | Retention | Reason |
|---|---|---|
| alpha_logs (debug) | 14 days | Low query value; storage cost |
| audit logs (future) | 90 days | Compliance |
| session logs (future) | 30 days | Analysis window |

---

## Cost Impact

| Action | Disk Freed | Disk Rate Change |
|---|---|---|
| Purge 7+ day logs | ~4.8 MB | ↓ 40% immediate |
| TTL 14-day policy | ~0.3 MB/day | ↓ Ongoing |
| Baseline (no action) | — | ↑ 200+ rows/day |

**Recommendation:** Do both (one-time + ongoing policy).