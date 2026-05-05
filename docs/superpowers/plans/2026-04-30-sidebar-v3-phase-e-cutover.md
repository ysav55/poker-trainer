# Sidebar v3 — Phase E: Cutover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. This is the highest-risk phase — every task has a fast-revert path. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the default sidebar from old (`CoachSidebar.jsx`) to v3, delete the old sidebar tree, drop the `hand_annotations` table + route, update docs. Keep `?sidebarV3=0` as a one-release escape hatch in case a regression slips through.

**Architecture:** Three commits, atomic in spirit but separable for revert clarity:
1. **Default v3** — `TablePage.jsx` swaps the conditional. `?sidebarV3=0` becomes the opt-out. Old code still mounted under that opt-out. (Revert = single commit.)
2. **Delete old tree** — once staging soak confirms v3 is healthy by default, delete `CoachSidebar.jsx`, `client/src/components/sidebar/`, and the `?sidebarV3=0` branch in `TablePage.jsx`. (Revert via git history.)
3. **Drop annotations** — migration `065_drop_hand_annotations.sql` + delete `server/routes/annotations.js` + remove client-side annotation calls. (No backfill; staging confirmed empty.)

**Tech Stack:** No new tech. Pure consolidation. The migration is destructive but applies only against staging-confirmed empty data per N6.a.

**Spec:** [docs/superpowers/specs/2026-04-30-sidebar-v3-spec.md](../specs/2026-04-30-sidebar-v3-spec.md), Phase E in Section 10. Cutover prerequisites in Section 11.

**Prereq (HARD):** Phases A, B, C, D ALL merged and soaked on staging. Coach walkthrough sign-off received before starting Phase E.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/pages/TablePage.jsx` | Modify (T1, T2) | T1: default to v3, keep `?sidebarV3=0` opt-out. T2: delete the conditional + opt-out logic |
| `client/src/components/CoachSidebar.jsx` | Delete (T2) | Old sidebar root |
| `client/src/components/sidebar/` (entire dir) | Delete (T2) | Old section components + tests |
| `client/src/components/sidebar/__tests__/` (entire dir) | Delete (T2) | Old test files |
| `supabase/migrations/065_drop_hand_annotations.sql` | Create (T3) | Drop the table |
| `server/routes/annotations.js` | Delete (T3) | REST endpoints |
| `server/index.js` | Modify (T3) | Remove `app.use('/api/annotations'...)` mount |
| `server/db/repositories/AnnotationRepository.js` | Delete (T3) (if exists) | |
| `client/src/lib/api.js` (or wherever annotation REST calls live) | Modify (T3) | Remove any `apiFetch('/api/hands/:id/annotations'...)` calls |
| `docs/sidebar-v3-vs-old.md` | Modify (T4) | Update to reflect v3-is-default |
| `README.md` / dev docs | Modify (T4) | Remove `?sidebarV3=1` toggle instructions |
| `e2e/sidebar-v3.coach-happy.spec.ts` | Modify (T5) | Drop the `?sidebarV3=1` query param from URLs |

---

## Task 1: Pre-cutover audit

Tasks before any code change. **Halt cutover if any check fails.**

- [ ] **Step 1.1: Verify Phases A–D merged**

```bash
git log --oneline 44b757a..HEAD --grep='Phase [ABCD]'
```

Confirm presence of completion markers for all four phases. Verify branch state is what you expect.

- [ ] **Step 1.2: Verify staging is healthy on `?sidebarV3=1`**

Manual check: log into staging, append `?sidebarV3=1` to a coached_cash table URL. Confirm:
- All five tabs render and switch.
- Live tab: action log fills as the hand plays.
- Drills tab: 3 segments, no footer.
- History tab: filter chips work, hand cards click open Review.
- Review tab: scrubber drags, autoplay works.
- Setup tab: Blinds + Seats sub-modes; pending banner appears mid-hand.
- Notes feature: add/edit/delete on Live, Review, History pip works.
- Tag Hand dialog opens + saves.
- Excel export downloads a 4-sheet workbook.
- Single-coach lock enforces correctly with 2 browser tabs.

If ANY of the above fails: stop. Do not proceed with cutover. Open a fix-forward task in the relevant phase plan.

- [ ] **Step 1.3: Verify no production annotation data**

Query production Supabase:

```sql
SELECT COUNT(*) FROM hand_annotations;
```

If `> 0`, **STOP**. The N6.a "drop entirely, no backfill" decision was conditional on confirmed-empty data. If production has annotations, we either migrate them or change the spec.

If `0`: proceed.

- [ ] **Step 1.4: Verify no orphan callers**

```bash
git grep -n "CoachSidebar\b" client/src/
git grep -n "from.*'./components/sidebar/" client/src/
git grep -n "/api/hands/.*annotations\|/api/annotations" client/src/
git grep -n "/api/annotations" server/
```

Note any matches for cleanup in T2/T3.

- [ ] **Step 1.5: Confirm `?sidebarV3=0` escape hatch is wanted**

Confirm with user: keep `?sidebarV3=0` for ≥1 release, or jump straight to no-toggle in cutover commit?

Default per spec: keep escape hatch for one release. Revisit in next planning cycle.

---

## Task 2: T1 — Default sidebar to v3 (`?sidebarV3=0` escape hatch)

**Files:**
- Modify: `client/src/pages/TablePage.jsx`
- Test: `client/src/pages/__tests__/TablePage.test.jsx` (modify or create)

- [ ] **Step 2.1: Failing test**

Append to or create test asserting v3 is the default mount and `?sidebarV3=0` falls back to old:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TablePage from '../TablePage.jsx';

vi.mock('../../components/sidebar-v3/Sidebar.jsx', () => ({
  default: () => <div data-testid="sidebar-v3">v3</div>,
}));
vi.mock('../../components/CoachSidebar.jsx', () => ({
  default: () => <div data-testid="coach-sidebar">old</div>,
}));

describe('TablePage — sidebar default', () => {
  it('defaults to v3 when no query param', () => {
    const { getByTestId, queryByTestId } = render(
      <MemoryRouter initialEntries={['/table/t1']}><TablePage /></MemoryRouter>
    );
    expect(getByTestId('sidebar-v3')).toBeInTheDocument();
    expect(queryByTestId('coach-sidebar')).toBeNull();
  });

  it('renders old sidebar when ?sidebarV3=0', () => {
    const { getByTestId, queryByTestId } = render(
      <MemoryRouter initialEntries={['/table/t1?sidebarV3=0']}><TablePage /></MemoryRouter>
    );
    expect(getByTestId('coach-sidebar')).toBeInTheDocument();
    expect(queryByTestId('sidebar-v3')).toBeNull();
  });
});
```

Run: `cd client && npx vitest run src/pages/__tests__/TablePage.test.jsx`. Expected: FAIL — currently old is the default.

- [ ] **Step 2.2: Flip the default**

Edit `client/src/pages/TablePage.jsx`. Find the existing logic (likely):

```jsx
const useSidebarV3 = searchParams.get('sidebarV3') === '1';
```

Change to:

```jsx
const useSidebarV3 = searchParams.get('sidebarV3') !== '0'; // v3 is default; 0 opts out
```

(Adapt the variable name to whatever the existing code uses.)

- [ ] **Step 2.3: Run, verify pass**

Expected: PASS for both tests.

- [ ] **Step 2.4: Run all client tests**

Run: `cd client && npx vitest run`. Some existing tests that mounted TablePage may have implicitly relied on the old sidebar — fix them or update mocks.

- [ ] **Step 2.5: Build**

Run: `cd client && npm run build`. Expected: clean.

- [ ] **Step 2.6: Commit**

```bash
git add client/src/pages/TablePage.jsx \
        client/src/pages/__tests__/TablePage.test.jsx
git commit -m "$(cat <<'EOF'
feat(sidebar): make v3 the default; ?sidebarV3=0 opts out

Phase E T1 — cutover step 1 of 3. v3 has been gated behind
?sidebarV3=1 since the rollout began; this flips the default. The
opt-out (?sidebarV3=0) stays for one release as an emergency
escape hatch. Spec section 10 / 11.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2.7: Deploy to staging + soak**

```bash
flyctl deploy --config fly.staging.toml --remote-only
```

Wait ≥ 24 hours of active use before T2. Verify in coach walkthroughs that v3 default works for everyone — no users falling back to `?sidebarV3=0` due to bugs.

If a regression surfaces during soak: revert this commit (`git revert <SHA>`), fix forward in the relevant phase plan, retry.

---

## Task 3: T2 — Delete the old sidebar tree

**Files:**
- Delete: `client/src/components/CoachSidebar.jsx`
- Delete: `client/src/components/sidebar/` (entire directory + tests)
- Modify: `client/src/pages/TablePage.jsx` (remove the conditional + import)
- Modify: `client/src/pages/__tests__/TablePage.test.jsx` (drop the `?sidebarV3=0` test)

**Prerequisite:** Soak from T1 step 2.7 complete with no regressions reported.

- [ ] **Step 3.1: Re-verify no orphan callers**

```bash
git grep -n "CoachSidebar\b" client/src/
git grep -n "from.*'./components/sidebar/\|from.*'../components/sidebar/" client/src/
```

Expected: only matches in `TablePage.jsx` (the conditional we're about to delete) and possibly comments.

If unexpected matches, stop and investigate.

- [ ] **Step 3.2: Delete files**

```bash
git rm client/src/components/CoachSidebar.jsx
git rm -r client/src/components/sidebar/
```

This deletes:
- `CoachSidebar.jsx`
- `sidebar/ReplayControlsSection.jsx` (with its annotation UI — also dies here)
- `sidebar/GameControlsSection.jsx` (the legacy Hybrid mode + Share Range modal source — dies here)
- `sidebar/HandConfigPanel.jsx`, `BlindLevelsSection.jsx`, `UndoControlsSection.jsx`, `AdjustStacksSection.jsx`, `PlayersSection.jsx`, `HandLibrarySection.jsx`, `HistorySection.jsx`, `PlaylistsSection.jsx`, `ScenarioLaunchPanel.jsx`
- All `__tests__` for the above

Confirm via `git status` that the deletions are tracked.

- [ ] **Step 3.3: Update TablePage.jsx — remove conditional + import**

Edit `client/src/pages/TablePage.jsx`:

1. Remove the `import CoachSidebar from '../components/CoachSidebar.jsx';` line.
2. Remove the `useSidebarV3` variable + the conditional render. Keep only the v3 mount:

```jsx
<SidebarV3 data={data} emit={emit} tableId={tableId} replay={replay} />
```

3. The query param parsing for `sidebarV3` can also be removed from this file.

- [ ] **Step 3.4: Update TablePage test**

Drop the `?sidebarV3=0` test case (no longer applicable). Keep the v3-is-default test.

- [ ] **Step 3.5: Run all client tests**

Run: `cd client && npx vitest run`. Some tests in the old `client/src/components/sidebar/__tests__/` are gone — that's expected. Other tests may have imported from those files — update or delete.

If any unrelated test fails, fix forward.

- [ ] **Step 3.6: Build**

Run: `cd client && npm run build`. Expected: bundle size drops noticeably.

- [ ] **Step 3.7: Commit**

```bash
git add -A client/src/components/ client/src/pages/
git commit -m "$(cat <<'EOF'
refactor(sidebar): remove old sidebar tree (CoachSidebar + sidebar/)

Phase E T2 — cutover step 2 of 3. v3 has soaked as default for one
release without regressions; old sidebar is now dead code. Removes:
- CoachSidebar.jsx (root)
- 9 section files in sidebar/ (Replay, GameControls, HandConfig,
  BlindLevels, Undo, AdjustStacks, Players, HandLibrary, History,
  Playlists, ScenarioLaunchPanel)
- All __tests__ for the above
- The ?sidebarV3=0 escape hatch in TablePage.jsx

The ReplayControlsSection annotation UI dies with the rest. Phase E
T3 will drop the server-side route + table.

Spec section 10 / 11.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3.8: Deploy to staging**

```bash
flyctl deploy --config fly.staging.toml --remote-only
```

Soak ≥ 24 hours again. Coach walkthrough confirms nothing depended on the old sidebar that wasn't surfaced.

---

## Task 4: T3 — Drop `hand_annotations` table + server route + client refs

**Files:**
- Create: `supabase/migrations/065_drop_hand_annotations.sql`
- Delete: `server/routes/annotations.js`
- Delete: `server/db/repositories/AnnotationRepository.js` (if exists)
- Modify: `server/index.js` (remove mount)
- Modify: any client file calling `/api/hands/:id/annotations` or `/api/annotations/:id` (already deleted with old sidebar in T2, but double-check)
- Test: `supabase/migrations/__tests__/065_drop.test.sql` (or one-off sanity script)

**Prerequisite:** T2 soaked. Any final-final orphan annotation API callers grepped down.

- [ ] **Step 4.1: Re-verify no callers**

```bash
git grep -n "/api/hands/.*annotations\|/api/annotations" client/src/
git grep -n "/api/annotations\|hand_annotations" server/
```

Expected matches: only `server/routes/annotations.js`, `server/index.js` mount, and any repo file. No client matches (T2 deleted the only client caller — the old `ReplayControlsSection`).

If unexpected: stop, investigate.

- [ ] **Step 4.2: Re-verify production data**

Query prod again (paranoid check):

```sql
SELECT COUNT(*) FROM hand_annotations;
```

Must be `0`. If not, halt and migrate per discussion with user.

- [ ] **Step 4.3: Write migration 065**

Create `supabase/migrations/065_drop_hand_annotations.sql`:

```sql
-- 065_drop_hand_annotations.sql
-- Drop the hand_annotations table per spec N6.a.
-- The feature is replaced by hand_notes (Phase B). No backfill —
-- staging-only data, confirmed empty in production at cutover.

BEGIN;

DROP TABLE IF EXISTS hand_annotations CASCADE;

COMMIT;
```

- [ ] **Step 4.4: Apply migration on staging**

```bash
psql $STAGING_DATABASE_URL -f supabase/migrations/065_drop_hand_annotations.sql
```

Verify:
```bash
psql $STAGING_DATABASE_URL -c "\dt hand_annotations"
```

Expected: "Did not find any relation named hand_annotations".

- [ ] **Step 4.5: Delete server-side route + repo**

```bash
git rm server/routes/annotations.js
# only if it exists:
git rm server/db/repositories/AnnotationRepository.js 2>/dev/null || true
```

Edit `server/index.js`. Remove the line:

```js
require('./routes/annotations.js')(app, { requireAuth });
```

- [ ] **Step 4.6: Run server tests**

Run: `cd server && npx jest`. Expected: green. Any test that hit `/api/hands/:id/annotations` will need to be deleted (they've already been removed if they lived in old sidebar test files).

- [ ] **Step 4.7: Build + deploy to staging**

```bash
flyctl deploy --config fly.staging.toml --remote-only
```

Confirm:
- `curl -i https://poker-trainer-staging.fly.dev/api/annotations/anything` returns 404 (route gone).
- `curl -i https://poker-trainer-staging.fly.dev/api/hands/<id>/annotations` returns 404.
- All other endpoints still work.

- [ ] **Step 4.8: Apply migration to production (after staging confirmation)**

```bash
psql $PROD_DATABASE_URL -f supabase/migrations/065_drop_hand_annotations.sql
```

Then deploy production:

```bash
flyctl deploy --remote-only  # production fly.toml
```

- [ ] **Step 4.9: Commit**

```bash
git add supabase/migrations/065_drop_hand_annotations.sql \
        server/routes/annotations.js \
        server/index.js
git commit -m "$(cat <<'EOF'
refactor(api): drop hand_annotations table + /api/annotations routes

Phase E T3 — cutover step 3 of 3. The action-level annotation feature
is replaced by hand-level Notes (Phase B). N6.a decision: drop
entirely, no backfill — staging-only data, production confirmed
empty at cutover.

Migration 065 drops the table. Routes file deleted. Server index no
longer mounts /api/annotations.

Spec section 4.2, 6.2.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: T4 — Update docs + E2E specs

**Files:**
- Modify: `docs/sidebar-v3-vs-old.md` (mark old column as historical / archive)
- Modify: `README.md` if it mentions `?sidebarV3=1`
- Modify: `e2e/*.spec.ts` if any URL string includes `?sidebarV3=1`
- Modify: any other dev doc / runbook referencing the toggle

- [ ] **Step 5.1: Grep for `sidebarV3` references**

```bash
git grep -nE "sidebarV3=1|sidebarV3=0" --untracked
```

Expected matches: docs, README, possibly e2e specs.

- [ ] **Step 5.2: Update each match**

For each match:
- Strip the `?sidebarV3=1` query param from URL examples (now redundant).
- For docs that compare old vs v3: add a header note "as of <date>, v3 is the only sidebar".

- [ ] **Step 5.3: Archive `docs/sidebar-v3-vs-old.md`**

Either:
- Move to `docs/archive/` if you want to preserve the comparison history, OR
- Delete entirely (the spec already captures the final decisions).

User preference. Default: move to archive.

- [ ] **Step 5.4: Run E2E suite**

```bash
cd client && npx playwright test
```

Confirm green. Any test that hardcodes `?sidebarV3=1` should now use the bare URL.

- [ ] **Step 5.5: Commit**

```bash
git add docs/ README.md e2e/
git commit -m "$(cat <<'EOF'
docs: post-cutover cleanup — drop ?sidebarV3 toggle references

Phase E follow-up. v3 is the only sidebar; the toggle no longer
exists. Updates dev docs, README, and E2E URLs accordingly.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: T5 — Final verification

- [ ] **Step 6.1: Full client test suite**

Run: `cd client && npx vitest run`. Expected: green.

- [ ] **Step 6.2: Full server test suite**

Run: `cd server && npx jest`. Expected: green. Should be ~2884 baseline + Phase B/C/D/E additions, minus any tests deleted with the old sidebar.

- [ ] **Step 6.3: Build**

Run: `cd client && npm run build`. Bundle should be smaller than pre-Phase-E (old sidebar tree gone).

- [ ] **Step 6.4: E2E**

Run: `cd client && npx playwright test`. All green.

- [ ] **Step 6.5: Production deploy**

```bash
flyctl deploy --remote-only  # production fly.toml
```

Watch logs:

```bash
flyctl logs -a poker-trainer-ysav55
```

For 1 hour post-deploy. Any 5xx errors → revert immediately.

- [ ] **Step 6.6: Coach announcement**

User-driven: announce to coaches that the new sidebar is now the only sidebar, point them at any docs they need.

---

## Rollback playbook

If a critical regression surfaces post-cutover:

| Stage | Revert command | Effect |
|---|---|---|
| Post-T1 (escape hatch live) | nothing — coaches use `?sidebarV3=0` while we hot-fix v3 | minimal impact |
| Post-T2 (old tree deleted) | `git revert <T2 SHA>` — restores old sidebar files; T1's `?sidebarV3=0` still works | medium effort; old code restored |
| Post-T3 (annotations dropped) | `git revert <T3 SHA>` + manual table re-create from migration 021 | high effort; production data was empty anyway, so not destructive |

Production should not be allowed to land in a state where rollback would cost coach data. T3 is the only point past which "rollback restores DB state". That's why it's last and gated by repeated empty-table verification.

---

## Self-Review Checklist

- [ ] All Phase E spec section 10 items have a task above:
  - Default v3 + escape hatch → Task 2 ✓
  - Delete old sidebar tree → Task 3 ✓
  - Migration 065 + route delete → Task 4 ✓
  - Doc updates → Task 5 ✓
- [ ] Pre-cutover prerequisites enumerated and gated → Task 1 ✓
- [ ] Three commits map to three logical revertable units (default flip, tree delete, annotation drop).
- [ ] Production deploy gated by staging soak twice (post-T1, post-T2).
- [ ] No placeholders. Migration SQL is exact. Commit messages are exact.
- [ ] Rollback playbook covers each stage.

**End of Phase E plan.**
