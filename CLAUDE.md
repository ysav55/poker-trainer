# Poker Trainer — Claude Instructions


This file defines how you work on this codebase. Read it fully before touching anything.

---

## 0. Understand before acting

Before writing a single line of code:

- Read every file relevant to the task. This means routes, controllers, DB schema, migrations, and any client component involved. Don't assume — verify.
- If the task references a spec document, read the entire spec, not just the relevant section. Decisions made in one section often constrain another.
- If anything is ambiguous — an unclear requirement, a conflict between the spec and the code, an architectural decision that has two valid answers — **stop and ask**. A wrong assumption caught before coding costs nothing. A wrong assumption caught after costs everything.
- Do not begin planning until you are confident you understand the full scope of what you're changing and what it touches.

---

## 1. Plan before coding

Once you understand the task, write a plan. The plan must cover:

1. **What files change** — list every file you expect to create or modify.
2. **What the change is** — one sentence per file describing what you're doing and why.
3. **What the dependencies are** — if file B depends on file A being changed first, say so. Execute in the right order.
4. **What can break** — list every adjacent feature or code path that touches the same data, endpoints, or components. These are your regression targets.

Only start coding after the plan is written. If the plan reveals the task is larger than it appeared, surface that before proceeding — don't silently absorb scope.

---

## 2. No code without tests

Every change ships with tests. No exceptions.

**Before writing code:**
- Identify what a passing state looks like. What does the endpoint return? What does the component render? What does the DB contain?

**After writing code:**
- Write or update the test for the thing you just changed.
- Run the full test suite for the affected module, not just the new test.
- Run a regression pass on every adjacent path you listed in the plan. If a previously passing test now fails, fix it before moving on — do not leave broken tests and continue.

**If the codebase has no tests for the area you're touching:**
- Write a minimal integration test for the specific behavior you're adding or fixing before you touch the existing code. This gives you a baseline. Then make your change and verify the test passes.

A change that works but breaks something else is not done.

---

## 3. Use sub-agents. Protect your context window.

Your context window is a finite resource. Treat it like one.

**Delegate heavy lifting to sub-agents:**
- File reads and searches that you don't need to reason about yourself — delegate.
- Running tests and returning output — delegate.
- Applying a well-defined, mechanical code change across multiple files — delegate with precise instructions.
- Anything where the output is a structured result you can consume in a few lines — delegate.

**Keep in your own context:**
- The plan.
- The current task's requirements.
- The decisions you've made and why.
- The current state of what's done, in progress, and pending.

**Rules:**
- Never load an entire large file into context unless you genuinely need every line of it. Read the relevant section.
- Never run a broad search and reason over all results in your own context. Delegate the search, get the specific answer back.
- When a sub-agent returns a result, extract what you need, discard the rest, and continue. Do not accumulate raw outputs.
- If you notice your context filling with noise — stop, summarize your current state in a few bullet points, and continue from the summary.

---

## 4. When stuck: stop, step back, re-plan

If you've been on the same sub-problem for more than two attempts without progress:

1. **Stop writing code.**
2. **Write down exactly what you expected to happen and what is actually happening.** One sentence each. If you can't write the expected behavior clearly, that's why you're stuck — go back to understanding.
3. **Re-read the relevant code** — the actual source, not your memory of it. Something you assumed is likely wrong.
4. **Re-plan just that sub-section.** Throw out your previous approach if needed. A fresh plan from a correct understanding beats a persistent wrong approach every time.
5. **If re-planning doesn't unstick you** — surface the blocker explicitly. State what you know, what you don't know, and what decision or information would unblock you. Ask.

Do not push through confusion by trying more variations of the same wrong approach.

---

## Stack reference

- **Backend:** Node.js, Express, Socket.io, Supabase (Postgres)
- **Frontend:** React, Vite, Tailwind CSS
- **Hosting:** Fly.io
- **Auth:** Role-based (superadmin → admin → coach → coached_student / solo_student / trial, plus lateral roles: referee, moderator)
- **Key architectural constraint:** Permission checks use both RBAC (`role_permissions` table) and scoped tournament access (`tournament_referees` table). Always use the correct middleware — `requirePermission()` for system-level, `requireTournamentAccess()` for tournament-scoped.

---

## Codebase conventions

- Migrations are numbered sequentially (`021_`, `022_`, etc.). Never edit an already-applied migration. Always write a new one.
- `Promise.allSettled` is used in the analyzer pipeline intentionally — one failing analyzer must not break others. Do not change this to `Promise.all`.
- `replaceAutoTags()` is the only function that may delete `auto`, `mistake`, or `sizing` tags. Nothing else touches those. `coach` tags are never auto-replaced.
- Socket events follow the pattern `namespace:event_name` (e.g. `tournament:blind_up`). Client-to-server and server-to-client events are documented in the spec. Do not invent new event names without updating the spec.
- The standalone tournament system (System B) and the table-based system (System A) are intentionally separate. Do not connect them unless a spec explicitly says to.

---

## Definition of done

A task is done when:

- [ ] The feature or fix works as specified.
- [ ] All tests pass, including regression tests for adjacent paths.
- [ ] No console errors or unhandled promise rejections introduced.
- [ ] No TypeScript / lint errors introduced (run the linter).
- [ ] If a migration was written, it is idempotent or clearly documented as run-once.
- [ ] If a new API endpoint was added, it has auth middleware. No unprotected endpoints.
- [ ] The change has been summarized in one short paragraph: what changed, why, and what was tested.

---

## What not to do

- Do not refactor code that is not part of the current task, even if you notice something that could be cleaner. Log it as a note and move on.
- Do not change database column names or table names without a migration and a search for all usages.
- Do not add dependencies without checking if an equivalent already exists in `package.json`.
- Do not leave `console.log` debug statements in committed code.
- Do not suppress errors to make a test pass. Fix the error.