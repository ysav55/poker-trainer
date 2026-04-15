#!/usr/bin/env node

/**
 * Invokes the Integration Integrity Agent (Managed Agent) against staging.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... \
 *   POKER_USER=Idopeer POKER_PASSWORD=123456789 \
 *   node scripts/run-integrity-agent.js
 *
 * Falls back to interactive prompts when the env vars are not set.
 *
 * The agent will open the staging app in a browser, log in with the
 * provided credentials, and run integration checks per the prompt below.
 */

const Anthropic = require("@anthropic-ai/sdk");

const AGENT_ID = "agent_011CZvDNzQYMtxBHoGSYZPag";
const ENVIRONMENT_ID = "env_01EUb7gccGJgePxHPb8rLr1d";
const STAGING_URL = "https://poker-trainer-staging.fly.dev";

// Hardcoded review credentials. Change here when rotating the test account.
const DEFAULT_USER = "Idopeer";
const DEFAULT_PASSWORD = "123456789";

function buildReviewPrompt({ url, name, password }) {
  return [
    `Staging environment URL: ${url}`,
    `Login name: ${name}`,
    `Login password: ${password}`,
    "",
    "## Mission",
    "",
    "Run a thorough integration integrity review of the **entire UI Redesign V2 work** — all 8 phases.",
    "Phases 1–6 shipped over the past sprint. Phases 6.5 (Playlist→Table launch bridge) and 7 (Tournament page polish) shipped today.",
    "The user manually inspected the staging app and reports concrete broken behavior. Your job: confirm or deny each user-reported issue,",
    "verify every phase's acceptance criteria, then free-form audit anything you notice that wasn't on the list.",
    "",
    "Source plan: `plans/ui-redesign-v2.md` (in the repo). Master memory: `docs/memory/{frontend,backend}.md`.",
    "",
    "## Reporting format",
    "",
    "For each numbered item return one line: `N. PASS | FAIL | BLOCKED — concise observation`.",
    "When FAIL, include file/component hint if visible from network requests, console errors, or React DevTools class names.",
    "When BLOCKED, state what you needed (data, role, fixture) and couldn't get.",
    "After the numbered list, add a **\"Critical now\"** section listing the top 5 issues by user impact.",
    "",
    "## Constraints",
    "",
    "Treat staging as read-mostly. Do NOT create real tournaments / scenarios / users / playlists unless a test absolutely requires it.",
    "If you must POST to verify a flow (e.g. drill launch, register for a tournament, save-as-scenario), DELETE afterward or flag what you left behind in the report.",
    "Take screenshots of any failure or visual oddity and reference them in the report.",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section A — User-reported regressions (HIGHEST PRIORITY — start here)",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "1. **Students not connecting.** Log in as Idopeer (a coach). Open `/students` (Students Roster).",
    "   - Are any students listed? If empty, inspect the `/api/coach/students` (or equivalent) network call — what's the response shape and HTTP status?",
    "   - Pick a known student ID if visible and open `/students/<id>` (StudentDashboardPage). Does the dashboard render with data, or empty cards?",
    "   - Report whether the coach→student relationship is broken at the API layer, the routing layer, or the rendering layer.",
    "",
    "2. **Groups page redirect broken.** Navigate to `/admin/groups`, `/groups`, and any group-related sidebar link.",
    "   - Where do you land? Is it 404, blank, or a real page?",
    "   - Note console errors emitted during the redirect.",
    "   - Check the sidebar nav — is the Groups link visible for this role? Where does it point?",
    "",
    "3. **Seed playlists missing.** Open the HandBuilder page (find via sidebar — likely `/admin/hands` or `/scenarios`).",
    "   - Spec says 8 default playlists auto-seed on first load for new coaches: Dry Flop Spots, Wet Flop Spots, Paired Boards, Monotone Boards, 3-Bet Pots, Single-Raised Pots, Multiway Pots, Heads-Up.",
    "   - For Idopeer: is the playlist tree empty, partially seeded, or fully seeded?",
    "   - If empty, watch the network — does `POST /api/playlists` fire on mount? What's the response?",
    "   - If only partial, list which playlists are present.",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section B — Phase 1: Settings token migration",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "4. `/settings` — does the page load? Are all 7 tabs present in the tab nav: **Profile, School, Alerts, Org, Platform, Table Defaults, Danger Zone**?",
    "5. Click each tab in turn. Does each tab's body render without console errors? Note any tab that throws or shows an empty body.",
    "6. Visual: do colors look consistent across tabs (no off-tone surfaces, no clashing buttons)? Use DevTools to spot-check that backgrounds use `colors.bgSurface*` tokens.",
    "7. Does `SettingsPage` shell use lucide-react icons in the tab nav (NOT emoji)?",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section C — Phase 2: Admin page decomposition",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "8. `/admin/users` (UserManagement) — does the user table load? Does pagination render?",
    "9. UserFilters: search by name, change the role dropdown, toggle the status tabs. Each filter should reduce the list. Report any that doesn't.",
    "10. Open the row actions menu (`MoreHorizontal`/⋯ icon). Click **Reset Password** — `ResetPasswordModal` should open. Cancel out without sending.",
    "11. Click **Delete** on a row — `DeleteConfirmModal` should open with a type-to-verify input. Cancel out.",
    "12. `/admin/referee` (RefereeDashboard) — does the card grid render? If a tournament table card is present, click the menu — `MovePlayerModal` should open.",
    "13. Both pages: the page header should be `text-xl font-bold` (V1 standard), NOT all-caps with letter-spacing.",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section D — Phase 3: HandBuilder backend (primary_playlist_id)",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "14. Watch the network when the HandBuilder loads — `GET /api/admin/scenarios` (or wherever the scenarios list lives). Inspect a scenario object — does it include `primary_playlist_id` (may be null)?",
    "15. If you create a new scenario via the UI (or look at a recently-created one), is `primary_playlist_id` populated when the scenario was created from inside a selected playlist?",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section E — Phase 4: HandBuilder playlist tree",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "16. HandBuilder left panel — does it render as a **tree** (expandable playlists with color dots), NOT as flat tabs?",
    "17. Each playlist node: does it have a colored dot, a name, a scenario count badge, and a chevron expand toggle?",
    "18. Click a playlist — does it expand to show child scenarios? Each scenario should have a 2px left border tinted to the playlist color (low opacity).",
    "19. Search box at the top — type a string. Does it filter both playlist names AND scenario names? Matching child scenarios should auto-expand their parent.",
    "20. Scroll to the bottom of the tree — is there an **\"Unassigned\"** section for scenarios with no `primary_playlist_id`?",
    "21. Click a scenario — does the right panel load that scenario in the `ScenarioBuilder`?",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section F — Phase 5: HandBuilder header + seeding + cross-list",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "22. Page header above the split-pane: title \"Scenarios\", subtitle showing `{n} playlists · {m} scenarios` with live counts.",
    "23. **\"New Playlist\"** gold CTA in the header — click it. Does it create an empty playlist with a unique color (golden-angle distribution)?",
    "24. **\"Also Add to…\"** button — should be HIDDEN when no scenario selected, VISIBLE when one is. Click it; a dropdown of playlists with color dots should open.",
    "25. Cross-list: pick a playlist from the dropdown — does the scenario get added to that playlist as well? (Network: `POST /api/playlists/:id/hands`.)",
    "26. Right panel toolbar — when a scenario is selected, do you see `[color dot] Playlist › Scenario` breadcrumb plus Duplicate + Delete buttons?",
    "27. Empty state — when nothing is selected, does `EmptyBuilder` render with a lucide icon + instructional text + \"New Scenario\" CTA?",
    "28. Confirm `QuickSavePanel` is gone (it was supposed to be deleted in Phase 5).",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section G — Phase 6: Save-as-Scenario modal",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "29. `/admin/hands` history list (HandHistoryPage) — does each row show a **\"Save as Scenario\"** button for coach Idopeer? It must NOT appear for student roles.",
    "30. Click the button — does `SaveAsScenarioModal` open with hole cards pre-filled (read-only) and board cards pre-filled (editable via CardPicker)?",
    "31. Modal: is there an auto-generated name field (editable), a playlist dropdown with color dots, and a hero seat picker (Phase 6 polish)?",
    "32. Save: does it `POST /api/admin/scenarios` AND `POST /api/playlists/:id/hands` then close the modal? (Don't actually save unless you intend to clean up.)",
    "33. ReviewTablePage (`/review/:handId`) — does the same \"Save as Scenario\" button appear in the coach controls area for coaches?",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section H — Phase 6.5: Playlist→Table launch bridge (SHIPPED TODAY)",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "34. Open or create a `coached_cash` table. Open the sidebar PLAYLISTS tab.",
    "35. Does **`ScenarioLaunchPanel`** render (idle state — playlist dropdown, hero dropdown, hero-mode radios sticky/per_hand/rotate, ordering radios, auto-advance toggle, gold Launch CTA)?",
    "    - If the legacy `PlaylistsSection` renders instead, that's a wiring failure — TablePage was supposed to instantiate `useDrillSession` and pass `drill` prop.",
    "36. Pick a playlist + hero — does the Launch button enable?",
    "37. Click Launch — observe `POST /api/tables/:id/drill` request body. Must include `hero_mode`, `hero_player_id`, `auto_advance`, `playlist_id`.",
    "38. After launch, panel should transition to RUNNING state showing `position / total · hero_mode · auto: on/off` plus Pause / Advance / Swap buttons.",
    "39. Console: any errors from `useDrillSession`, `ScenarioLaunchPanel`, `ScenarioDealer`, or socket events `scenario:armed` / `scenario:skipped` / `scenario:progress`?",
    "40. Pause the drill, navigate away, come back to the table — does the **resume prompt** render with \"Resume from N\" / \"Restart\" buttons?",
    "41. New Hand at the table while drill is active — do the hole cards + board match the scenario? Does the dealer button land at the rotated seat?",
    "42. Hand complete — were stacks restored to pre-hand values? (Inspect chip counts before/after.)",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section I — Phase 7: Tournament polish (SHIPPED TODAY)",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "43. `/tournaments` (TournamentListPage) — do the 3 tabs (Upcoming / Active / Completed) show **count badges** with numbers in pill shapes?",
    "44. Tournament cards: surface uses `colors.bgSurfaceRaised`? Hover changes the border to gold? View button shows a lucide `ArrowRight` icon? Create button shows a `Plus` icon?",
    "45. `/tournaments/:groupId` (TournamentDetailPage) — info inside a card laid out as **2-column grid** (Starting Stack / Buy-In / Registrations / Late Reg)?",
    "46. Below the info grid: 3 **CollapsibleSection** instances — Blind Structure (TrendingUp icon), Registrants (Users icon), Payouts (ShoppingBag icon). Click chevrons to expand/collapse — `aria-expanded` should toggle.",
    "47. Action buttons: Register (gold primary), Unregister (ghost), Control View (ghost), Cancel (danger ghost). Back button shows lucide `ArrowLeft`.",
    "48. `/tournaments/:groupId/control` (TournamentControlPage) — TableMiniCards show **two pill badges** (player count with Users icon, blind level with TrendingUp icon)?",
    "49. Spectate button on each TableMiniCard shows a lucide `Eye` icon?",
    "50. \"End & Finalize\" rendered as gold ghost button; \"Cancel Tournament\" as danger ghost?",
    "51. `StatusBadge` colors consistent across all 3 pages (it was extracted to `client/src/components/tournament/StatusBadge.jsx`).",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section J — Cross-cutting: redirects, role gates, layout",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "52. `/lobby` → `/dashboard` redirect resolves and dashboard renders content?",
    "53. `/bot-lobby` → `/tables?filter=bot` redirect resolves and the bot filter is applied?",
    "54. `/admin/crm` → `/students` redirect resolves?",
    "55. `/admin/stable` → `/students` redirect resolves?",
    "56. Sidebar SideNav: are nav items role-gated correctly? As Idopeer (coach), can you see Students, HandBuilder, Tournaments, Tables, Dashboard? You should NOT see Org Settings or Schools (admin-only).",
    "57. Role gate on \"Save as Scenario\" — confirmed in Section G items 29 + 33.",
    "58. Top bar / header: chip bank pill, role pill, user dropdown all render and dropdown opens on click?",
    "59. Logout from the user dropdown — does it clear the JWT and redirect to `/login`?",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section K — Visual breakpoint sweep",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "60. Resize the browser to 320px width — does the SideNav collapse / become accessible? Are tournament cards / settings tabs / HandBuilder tree usable?",
    "61. At 768px — same checks. Note any horizontal scroll or overlapping elements.",
    "62. At 1024px — same checks.",
    "63. At 1440px — content not absurdly wide; max-widths respected (e.g. `/tournaments` should cap at 800px).",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section L — Auth flows: logout, registration, new-account login",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "64. **Logout** — open the user dropdown in the top bar, click Logout. Does the JWT clear from sessionStorage? Does the URL navigate to `/login`? Does the SideNav disappear? Try navigating back to a protected route (e.g. `/dashboard`) — does it bounce you to `/login`?",
    "65. **Registration endpoint** — visit `/register` (or whatever the registration entry is). Does the form load? Inspect the network call on submit — does it hit `/api/auth/register` (or `/api/auth/register-coach`)? Document the request shape and response.",
    "66. **Register a fresh student account** with a throwaway email/name (use a name like `int_test_<timestamp>`). Capture the response. Include the new account's name + password in your final report so the user can clean up.",
    "67. **Log in as that brand-new student.** Confirm the JWT is set, sidebar adapts to the student role (no admin links, no coach actions), and the landing page is the dashboard / appropriate student page.",
    "68. **Coach→student linkage as a brand-new student.** Without coach assignment, can the new student see anything coach-specific? Are they assigned to any coach automatically (some plans seed solo_student → no coach)?",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section M — Student-side perspective (use the new account from item 66)",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "69. Confirm the **\"Save as Scenario\"** button is HIDDEN on HandHistoryPage and ReviewTablePage for the student role.",
    "70. Confirm `/admin/users`, `/admin/groups`, `/admin/schools` redirect to a permission-denied page or `/dashboard` for the student.",
    "71. Coach-only sidebar items (HandBuilder, Students, Org Settings, etc.) — confirm they are NOT visible to the student.",
    "72. Tournament pages — can the student visit `/tournaments` and the detail page? Can they Register for a public tournament? (Don't actually register — just confirm the button is enabled.)",
    "73. Tables list (`/tables` or `/dashboard`) — what tables can the student see? Are bot tables joinable?",
    "74. Try to access a coached_cash table where the student is not seated. Does the app block access cleanly, or does it crash / leak the table state?",
    "75. **Log out the student account** and confirm the cycle works again.",
    "76. **Log back in as Idopeer (coach)** to verify session re-establishes cleanly. Watch the network call to `/api/auth/login` — note the response shape and any cookies/JWT set.",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Section N — Free-form audit",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "77. Click around the app for ~5 minutes as Idopeer (coach) AND as the new student. List anything broken, mis-styled, or behaviorally odd that is NOT covered above. Console warnings, 404s on assets, mis-aligned modals, broken links — all fair game.",
    "78. Open Network DevTools and watch for any request that returns 4xx or 5xx during normal navigation. List those requests.",
    "79. Open Console and list any warning or error printed during the session.",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "## Final summary",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "After the 79-item checklist, write a **\"Critical now\"** section: the top 5 issues by impact, ordered. For each: the symptom, the suspected root-cause file/area, and a one-line repro.",
    "",
    "Then a **\"Likely safe\"** section: phases that passed cleanly with no FAIL items.",
  ].join("\n");
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
    process.exit(1);
  }

  const name = process.env.POKER_USER || DEFAULT_USER;
  const password = process.env.POKER_PASSWORD || DEFAULT_PASSWORD;

  const client = new Anthropic();

  console.log("\nCreating session with Integration Integrity Agent...");

  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENVIRONMENT_ID,
    title: `Phase 6.5 + 7 integration check — ${new Date().toISOString().slice(0, 10)}`,
  });

  console.log(`Session created: ${session.id}`);
  console.log("Streaming agent responses...\n");
  console.log("─".repeat(60));

  const stream = await client.beta.sessions.events.stream(session.id);

  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.message",
        content: [
          {
            type: "text",
            text: buildReviewPrompt({ url: STAGING_URL, name, password }),
          },
        ],
      },
    ],
  });

  let reportText = "";

  for await (const event of stream) {
    if (event.type === "agent.message") {
      const text = (event.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (text) {
        process.stdout.write(text);
        reportText += text;
      }
    } else if (event.type === "agent.tool_use") {
      console.log(`\n[Tool: ${event.name}]`);
    } else if (event.type === "session.status_idle") {
      console.log("\n" + "─".repeat(60));
      console.log("Agent finished.");
      break;
    }
  }

  // Write report to file
  const fs = require("fs");
  const path = require("path");
  const reportPath = path.join(
    __dirname,
    `agent-report-${new Date().toISOString().slice(0, 10)}.md`
  );
  fs.writeFileSync(
    reportPath,
    `# Integration Integrity Report\n\nSession: ${session.id}\nDate: ${new Date().toISOString()}\n\n${reportText}`
  );
  console.log(`\n✓ Report saved to: ${reportPath}`);

  console.log(`\nSession ID: ${session.id}`);
  console.log(
    "View full session in Claude Console: https://console.anthropic.com"
  );
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
