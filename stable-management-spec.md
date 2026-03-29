# POKER TRAINER — STABLE MANAGEMENT & CRM EXTENSIONS SPEC

**Version:** 1.0
**Date:** March 30, 2026
**Status:** Spec Complete — Timeline TBD
**Depends on:** Phase 2 master plan (RBAC, CRM, Table Management)

---

## TABLE OF CONTENTS

1. Stable Management — Full Feature Spec
2. CRM Extensions — What Gets Added
3. How Stable Management and CRM Connect
4. Database Schema
5. Frontend Specification
6. API Routes
7. Video Library — Thoughts (Not Spec'd)

---

## 1. STABLE MANAGEMENT

### 1.1 What a Stable Is

A poker stable is a business arrangement where a backer (the coach/stable owner) provides funding for players to play real-money poker. In return, the backer takes a percentage of profits. The coach is simultaneously:

- **Investor** — putting capital at risk
- **Coach** — training the players to be profitable
- **Manager** — tracking results, managing the bankroll, deciding who plays what stakes

Our first client does all three. Some of his students are staked (he funds their play and splits profits), others are coaching-only (they pay him for lessons). The app needs to handle both under one roof.

### 1.2 The Two Student Types

| | Coaching Student | Staked Player |
|---|---|---|
| **Pays the coach** | Yes (per session or package) | No (coach pays them) |
| **Coach tracks training** | Yes | Yes |
| **Coach tracks real-money results** | Optional | Mandatory |
| **Financial relationship** | Student → Coach (payment) | Coach → Player (backing) |
| **Revenue model** | Coaching fees | Profit split |
| **Risk** | None for coach | Coach loses if player loses |

A player can be BOTH — staked and receiving coaching (common: the coach stakes a student AND trains them, the coaching is "free" because it protects the staking investment).

### 1.3 Staking Deal Structure

A staking deal defines the financial terms between coach and player:

**Core terms:**
- **Stake percentage** — what % of buy-ins the coach covers (typically 50–100%)
- **Profit split** — how profits are divided (e.g., 50/50, 60/40 coach/player)
- **Makeup** — if the player is in the red, do they need to "make up" losses before seeing profit? (Yes = standard, No = "no-makeup" deal)
- **Current makeup balance** — running total of accumulated losses the player needs to clear
- **Allowed games** — which platforms, game types, and stakes the player can play
- **Bankroll cap** — maximum total exposure the coach allows
- **Review period** — how often the deal is evaluated (monthly, quarterly)
- **Kill switch** — conditions under which the deal terminates (e.g., loss exceeds X, player violates rules)

**Example deal:**
"I back Bar Harari 100% on PokerStars micro stakes (NL10–NL25) and 888poker. 50/50 profit split. Standard makeup. Monthly review. Kill if makeup exceeds $2,000."

### 1.4 Result Tracking

This is the digital replacement for Sheet 4 of the original spreadsheet (the platform-by-platform P&L tracker).

**How results are entered:**

Option A — **Manual entry by player:** Player logs into the app, goes to "My Results" → adds a session: date, platform, game type, stakes, session result (profit/loss), hands played, hours played, rake paid. Coach sees it in real-time.

Option B — **Manual entry by coach:** Coach enters results from the player's account screenshots or platform exports. Some players are less diligent about self-reporting.

Option C — **Platform import (Phase 3+):** CSV/hand history import from PokerStars, 888, GGPoker, etc. Parses the standard hand history format and auto-calculates results. This is the dream but requires platform-specific parsers.

**For now: Option A + B. Both coach and player can enter results. Coach can edit/correct.**

**What a result entry contains:**

```
date                — when the session was played
player_id           — who played
platform            — PokerStars, 888poker, GGPoker, WPT Global, live, other
game_type           — NL Hold'em, PLO, MTT, SNG, Spin & Go, other
stakes              — free text: "NL10", "NL25", "$11 MTT", "$5 Spin"
buy_in_total        — total money put in (for tournaments: sum of buy-ins)
cash_out_total      — total money taken out
result              — cash_out - buy_in (auto-calculated)
rake_paid           — rake/fees paid (auto-calculated from platform data or manual)
hands_played        — optional
hours_played        — optional
notes               — session notes ("ran bad", "tilted last hour", etc.)
entered_by          — player or coach (for audit trail)
```

### 1.5 Financial Dashboard — The Stable P&L View

The coach needs a unified view of their entire staking operation:

```
┌──────────────────────────────────────────────────────────────────────┐
│  STABLE OVERVIEW                                    Period: [Mar 2026]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ PORTFOLIO SUMMARY ──────────────────────────────────────────┐   │
│  │  Active Staked Players: 5                                     │   │
│  │  Total Capital Deployed: $4,200                               │   │
│  │  Total Results (gross): +$1,847                               │   │
│  │  Total Rake Paid: $623                                        │   │
│  │  Net Result: +$1,224                                          │   │
│  │  Coach Share (50%): +$612                                     │   │
│  │  ROI: +29.1%                                                  │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ PER-PLAYER BREAKDOWN ───────────────────────────────────────┐   │
│  │                                                               │   │
│  │  Player       │ Deal  │ Result │ Makeup │ Coach P&L │ Status │   │
│  │  ─────────────┼───────┼────────┼────────┼──────────┼────────│   │
│  │  Bar Harari   │ 50/50 │ +$845  │ $0     │ +$422    │ ● 🟢  │   │
│  │   (BarpK)     │       │        │        │          │        │   │
│  │  Guy Edri     │ 50/50 │ +$1,203│ $0     │ +$601    │ ● 🟢  │   │
│  │   (The Guygu) │       │        │        │          │        │   │
│  │  Daivid Srur  │ 60/40 │ -$534  │ $534   │ -$534    │ ● 🟡  │   │
│  │   (Diablods)  │       │        │ (in MU)│          │        │   │
│  │  Joseph       │ 50/50 │ -$112  │ $112   │ -$112    │ ● 🟡  │   │
│  │   (Mosheh..)  │       │        │ (in MU)│          │        │   │
│  │  Noam Shochat │ 50/50 │ +$445  │ $0     │ +$222    │ ● 🟢  │   │
│  │   (SaBaiDimai)│       │        │        │          │        │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ RESULTS BY PLATFORM ────────┐  ┌─ RESULTS BY GAME TYPE ────┐   │
│  │  PokerStars    +$1,102       │  │  NL Hold'em Cash  +$623   │   │
│  │  888poker      +$312         │  │  MTT              +$845   │   │
│  │  GGPoker       -$167         │  │  Spin & Go        -$221   │   │
│  │  Live          +$600         │  │  PLO              +$577   │   │
│  └──────────────────────────────┘  └─────────────────────────────┘   │
│                                                                      │
│  ┌─ TRENDS (line chart) ────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  📈 Monthly net result over last 6 months, per player         │   │
│  │  Highlight: who's trending up, who's trending down            │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ ALERTS ─────────────────────────────────────────────────────┐   │
│  │  ⚠️  Diablods makeup approaching kill threshold ($534/$2000)  │   │
│  │  ⚠️  Joseph hasn't logged results in 5 days                   │   │
│  │  📊 Monthly review due for all players on April 1             │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.6 Player Result Detail View

When the coach clicks into a specific staked player:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Stable          Bar Harari (BarpK)       Deal: 50/50     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ DEAL TERMS ─────────────────────────────────────────────────┐   │
│  │  Stake %: 100%    Split: 50/50    Makeup: Standard           │   │
│  │  Platforms: PokerStars, 888poker                              │   │
│  │  Allowed stakes: NL10–NL50                                    │   │
│  │  Bankroll cap: $3,000    Current exposure: $1,200             │   │
│  │  Review: Monthly         Next review: April 1                 │   │
│  │  Kill threshold: $2,000 makeup                                │   │
│  │  [Edit Deal]                                                  │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ LIFETIME P&L ──────┐  ┌─ THIS MONTH ──────┐  ┌─ MAKEUP ────┐  │
│  │  Gross: +$2,847      │  │  Gross: +$845      │  │  Balance: $0│  │
│  │  Rake: -$967         │  │  Rake: -$234       │  │  (clear)    │  │
│  │  Net: +$1,880        │  │  Net: +$611        │  │             │  │
│  │  Coach: +$940        │  │  Coach: +$305      │  │             │  │
│  │  Player: +$940       │  │  Player: +$305     │  │             │  │
│  └──────────────────────┘  └────────────────────┘  └─────────────┘  │
│                                                                      │
│  ┌─ SESSION LOG ────────────────────────────────────────────────┐   │
│  │  Date    │Platform │ Game    │ Stakes│Result│ Rake │Entered  │   │
│  │  Mar 28  │PokerStar│NL Cash  │ NL25  │ +$145│ $34  │Player   │   │
│  │  Mar 27  │PokerStar│NL Cash  │ NL25  │ -$67 │ $28  │Player   │   │
│  │  Mar 25  │888poker │MTT      │ $11   │ +$234│ $22  │Coach    │   │
│  │  Mar 24  │PokerStar│NL Cash  │ NL10  │ +$89 │ $15  │Player   │   │
│  │  Mar 22  │PokerStar│Spin&Go  │ $5    │ -$45 │ $8   │Player   │   │
│  │  ...                                                          │   │
│  │  [+ Add Result]  [Export CSV]  [Filter by platform/game]      │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ TRAINING vs REAL PLAY (the money insight) ──────────────────┐   │
│  │                                                               │   │
│  │  Training AI Score (avg): 72/100                              │   │
│  │  Real-money win rate: +4.2 BB/100 (NL25 cash)                │   │
│  │                                                               │   │
│  │  Top training leaks:          Matching real-play leaks:       │   │
│  │  1. passive_postflop (23x)    ✅ Confirmed — low aggression   │   │
│  │  2. missed_cbet (18x)         ✅ Confirmed — low cbet freq    │   │
│  │  3. overcalling (11x)         ❓ Hard to measure in HH data  │   │
│  │                                                               │   │
│  │  "Training is translating to real play. The postflop          │   │
│  │   passivity leak is visible in both datasets."                │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.7 Payout Calculator

At the end of each review period, the coach needs to calculate who owes what:

```
┌──────────────────────────────────────────────────────────────┐
│  PAYOUT CALCULATOR — March 2026                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Player       │Result  │Makeup In│Makeup Out│Coach  │Player │
│  ─────────────┼────────┼─────────┼──────────┼───────┼───────│
│  Bar Harari   │ +$845  │ $0      │ $0       │ +$422 │ +$422 │
│  Guy Edri     │+$1,203 │ $0      │ $0       │ +$601 │ +$601 │
│  Daivid Srur  │ -$534  │ $0      │ $534     │ -$534 │ $0    │
│  Joseph       │ -$112  │ $412    │ $524     │ -$112 │ $0    │
│  Noam Shochat │ +$445  │ $0      │ $0       │ +$222 │ +$222 │
│  ─────────────┼────────┼─────────┼──────────┼───────┼───────│
│  TOTAL        │+$1,847 │         │          │ +$599 │+$1,245│
│                                                              │
│  Makeup In = player's makeup at start of period              │
│  Makeup Out = makeup at end of period                        │
│  If player profits > makeup: clear makeup first, split rest  │
│  If player loses: add to makeup, coach absorbs the loss      │
│                                                              │
│  [Generate Payout Report]  [Mark Period as Settled]          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Payout logic (standard makeup deal):**

```
if player_result > 0:
    if player_makeup_balance > 0:
        # Clear makeup first
        cleared = min(player_result, player_makeup_balance)
        remaining_profit = player_result - cleared
        new_makeup = player_makeup_balance - cleared
        coach_share = remaining_profit * coach_split_pct
        player_share = remaining_profit * player_split_pct
    else:
        # No makeup — split the profit
        coach_share = player_result * coach_split_pct
        player_share = player_result * player_split_pct
else:
    # Loss — coach absorbs, add to makeup
    coach_share = player_result  # negative
    player_share = 0
    new_makeup = player_makeup_balance + abs(player_result)
```

### 1.8 Permissions

| Action | Who Can Do It |
|--------|--------------|
| View stable overview | coach, admin |
| View player results | coach, admin, the player themselves |
| Enter results (own) | player |
| Enter results (any player) | coach, admin |
| Edit/correct results | coach, admin |
| Create/edit staking deals | coach, admin |
| Run payout calculator | coach, admin |
| Export data | coach, admin |

---

## 2. CRM EXTENSIONS

The base CRM (from the master plan) covers: stats, notes, tags, mistake breakdown, hand history, drill history. Here's what Stable Management adds:

### 2.1 New CRM Sections (per player)

**Financial Tab (only visible for staked players):**

The CRM detail page gets a new tab (or section) showing:
- Current deal terms (stake %, split, makeup status, allowed games)
- P&L summary (lifetime, this month, this week)
- Makeup balance (highlighted if approaching kill threshold)
- Session log (last 10 results, link to full log)
- Quick "Add Result" button

**Training ↔ Real Play Correlation:**

This is the killer insight. The CRM already has training data (AI scores, leak tags, drill results). Now it also has real-money results. Show them side by side:

- Training AI score trend vs real-money win rate trend (dual-axis chart)
- Training leak tags vs real-play tendencies (when hand histories are available)
- "Is this player translating training into results?" — a single summary metric

This is the data that tells the coach whether the staking investment is working.

**Revenue Attribution:**

For each student (staked or coaching-only), show:
- Total coaching revenue from this student (from Enrollments/packages)
- Total staking P&L from this student (from staking results)
- Net value = coaching revenue + staking P&L share
- Lifetime customer value (LTV)

This answers: "Is this student worth my time?"

### 2.2 Player Profile Additions

The player's own view (not just coach) should show:

**For coaching-only students:**
- My package: sessions remaining, next session date
- My stats: AI scores, leak trends, drill assignments
- My history: all hands played in the app

**For staked players (all of the above PLUS):**
- My results: session log (self-entry form)
- My P&L: running total, this month, by platform
- My makeup: current balance, trend
- My deal: terms summary (read-only — coach sets these)

### 2.3 Scheduling Extensions

The existing Coach Schedule feature (from master plan 3B.4) gets extended:

**Staking review reminders:**
Schedule entries can be tagged as "Staking Review" type. The system auto-generates a review packet:
- Player's P&L for the period
- Makeup changes
- Training progress (AI scores, drills completed)
- Recommended action (continue/adjust/terminate)

**Volume tracking:**
Coach can set minimum volume requirements per staked player (e.g., "must play 10K hands/month" or "must log 20 sessions/month"). The system tracks progress and alerts the coach if a player falls behind.

### 2.4 Notifications Extensions

New notification types:

| Type | Trigger | Recipient |
|------|---------|-----------|
| `result_logged` | Player logs a session result | Coach |
| `makeup_threshold` | Player's makeup exceeds 75% of kill threshold | Coach |
| `makeup_cleared` | Player clears their makeup | Coach + Player |
| `volume_behind` | Player below required volume pace at mid-month | Coach |
| `review_due` | Staking review period ending in 3 days | Coach |
| `payout_ready` | Coach generates payout report | Player |
| `deal_changed` | Coach modifies deal terms | Player |
| `result_edited` | Coach edits a player-submitted result | Player |

---

## 3. HOW STABLE MANAGEMENT AND CRM CONNECT

```
┌─────────────────────────────────────────────────────────────────┐
│                     COACH'S ADMIN VIEW                           │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ CRM      │  │ Stable   │  │ Schedule │  │ Table Mgmt   │   │
│  │          │  │ Overview │  │          │  │              │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘   │
│       │             │             │                              │
│       └──────┬──────┘             │                              │
│              │                    │                              │
│       ┌──────▼──────┐            │                              │
│       │ PLAYER      │◀───────────┘                              │
│       │ DETAIL VIEW │  (schedule feeds review dates)             │
│       │             │                                            │
│       │ [Profile]   │  ← name, contact, status, roles           │
│       │ [Training]  │  ← AI scores, leaks, drills, hands        │
│       │ [Financial] │  ← deal terms, P&L, makeup, sessions      │
│       │ [Notes]     │  ← coach notes timeline                    │
│       │ [Correlation│  ← training vs real-play comparison        │
│       └─────────────┘                                            │
│                                                                  │
│  The CRM is the hub. Stable Management is a financial lens      │
│  on the same player data. Not a separate system.                │
└─────────────────────────────────────────────────────────────────┘
```

**Key principle:** Stable management is NOT a separate module. It's a financial layer added to the existing CRM. When the coach opens a player's profile, they see training data AND financial data in one place. The player type (coaching-only vs staked vs both) determines which sections are visible.

---

## 4. DATABASE SCHEMA

```sql
-- ============================================================
-- STAKING DEALS
-- ============================================================

CREATE TABLE staking_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES player_profiles(id),

    -- Deal terms
    stake_percentage NUMERIC(5,2) NOT NULL DEFAULT 100,  -- % of buy-ins coach covers
    coach_split_pct NUMERIC(5,2) NOT NULL DEFAULT 50,    -- coach's % of profits
    player_split_pct NUMERIC(5,2) NOT NULL DEFAULT 50,   -- player's % of profits
    has_makeup BOOLEAN DEFAULT true,                       -- standard makeup?

    -- Constraints
    allowed_platforms TEXT[] DEFAULT '{}',    -- ['PokerStars', '888poker']
    allowed_game_types TEXT[] DEFAULT '{}',   -- ['NL Cash', 'MTT']
    allowed_stakes TEXT,                      -- free text: "NL10-NL50"
    bankroll_cap NUMERIC(12,2),              -- max total exposure
    kill_threshold NUMERIC(12,2),            -- makeup amount that terminates deal
    min_monthly_volume TEXT,                  -- "10K hands" or "20 sessions"

    -- Review schedule
    review_period VARCHAR(20) DEFAULT 'monthly',  -- monthly, quarterly, custom
    next_review_date DATE,

    -- State
    status VARCHAR(20) DEFAULT 'active',     -- active, paused, terminated
    started_at DATE NOT NULL,
    ended_at DATE,
    termination_reason TEXT,

    -- Running balances (updated by triggers on result entries)
    current_makeup NUMERIC(12,2) DEFAULT 0,  -- running makeup balance
    lifetime_gross NUMERIC(12,2) DEFAULT 0,  -- total gross results
    lifetime_rake NUMERIC(12,2) DEFAULT 0,   -- total rake paid
    lifetime_net NUMERIC(12,2) DEFAULT 0,    -- gross - rake
    lifetime_coach_pnl NUMERIC(12,2) DEFAULT 0,  -- coach's total P&L
    lifetime_player_pnl NUMERIC(12,2) DEFAULT 0, -- player's total P&L

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- A player can have multiple deals over time (terminated → new deal)
-- but only ONE active deal at a time
CREATE UNIQUE INDEX idx_active_deal ON staking_deals(player_id)
    WHERE status = 'active';

-- ============================================================
-- SESSION RESULTS (real-money play tracking)
-- ============================================================

CREATE TABLE player_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES staking_deals(id),   -- null if coaching-only player logging for themselves

    -- Session details
    session_date DATE NOT NULL,
    platform VARCHAR(50) NOT NULL,              -- 'PokerStars', '888poker', 'GGPoker', 'Live', 'Other'
    game_type VARCHAR(30) NOT NULL,             -- 'NL Cash', 'PLO Cash', 'MTT', 'SNG', 'Spin', 'Other'
    stakes VARCHAR(30),                         -- 'NL10', 'NL25', '$11 MTT', etc.

    -- Financials
    buy_in_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    cash_out_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    result NUMERIC(12,2) GENERATED ALWAYS AS (cash_out_total - buy_in_total) STORED,
    rake_paid NUMERIC(12,2) DEFAULT 0,

    -- Volume
    hands_played INT,
    hours_played NUMERIC(5,2),

    -- Meta
    notes TEXT,
    entered_by UUID NOT NULL REFERENCES player_profiles(id),  -- who submitted this
    edited_by UUID REFERENCES player_profiles(id),             -- if coach corrected it
    edited_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_player_results_player_date ON player_results(player_id, session_date DESC);
CREATE INDEX idx_player_results_deal ON player_results(deal_id, session_date DESC);

-- ============================================================
-- PAYOUT PERIODS (settlement tracking)
-- ============================================================

CREATE TABLE payout_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES staking_deals(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Calculated at settlement
    gross_result NUMERIC(12,2),
    total_rake NUMERIC(12,2),
    net_result NUMERIC(12,2),
    makeup_start NUMERIC(12,2),           -- makeup at period start
    makeup_end NUMERIC(12,2),             -- makeup at period end
    makeup_cleared NUMERIC(12,2),         -- how much makeup was cleared
    coach_share NUMERIC(12,2),
    player_share NUMERIC(12,2),

    status VARCHAR(20) DEFAULT 'open',    -- open, calculated, settled
    settled_at TIMESTAMPTZ,
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- VOLUME TRACKING
-- ============================================================

CREATE TABLE volume_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES staking_deals(id) ON DELETE CASCADE,
    metric VARCHAR(20) NOT NULL,          -- 'hands', 'sessions', 'hours'
    required_amount INT NOT NULL,          -- per month
    current_amount INT DEFAULT 0,          -- auto-updated
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    met BOOLEAN DEFAULT false
);

-- ============================================================
-- PLAYER PROFILE EXTENSIONS
-- ============================================================

ALTER TABLE player_profiles ADD COLUMN player_type VARCHAR(20) DEFAULT 'coaching';
-- Values: 'coaching', 'staked', 'both'
-- Controls which CRM sections are visible

ALTER TABLE player_profiles ADD COLUMN online_aliases JSONB DEFAULT '[]';
-- e.g., [{"platform": "PokerStars", "alias": "BarpK"}, {"platform": "888", "alias": "BarpK888"}]
```

### Schema Summary

| Table | Purpose | Rows Expected |
|-------|---------|:------------:|
| staking_deals | One per player per deal (usually 1 active) | ~5–20 |
| player_results | One per session logged | Grows fast: ~50–200/month |
| payout_periods | One per deal per review period | ~5–20/quarter |
| volume_requirements | One per deal per metric per month | ~5–20/month |

---

## 5. FRONTEND SPECIFICATION

### 5.1 Admin Routes (New)

| Route | Component | Permission |
|-------|-----------|-----------|
| `/admin/stable` | `<StableOverview />` | `stable:view` |
| `/admin/stable/:playerId` | `<StakedPlayerDetail />` | `stable:view` |
| `/admin/stable/payout` | `<PayoutCalculator />` | `stable:manage` |
| `/my/results` | `<MyResults />` | any authenticated player |
| `/my/results/add` | `<AddResult />` | any authenticated player |

### 5.2 Stable Overview Page

```
<StableOverview>
  <PortfolioSummary />                   ← total capital, gross, net, ROI
  <StakedPlayerTable />                  ← per-player row with deal, result, makeup, status
    <PlayerRowActions />                 ← View detail, Edit deal, Add result
  <PlatformBreakdown />                 ← bar chart: results by platform
  <GameTypeBreakdown />                 ← bar chart: results by game type
  <MonthlyTrendChart />                 ← line chart: net result per player over time
  <StableAlerts />                      ← makeup thresholds, volume warnings, review reminders
```

### 5.3 Staked Player Detail Page

```
<StakedPlayerDetail playerId={id}>
  <DealTermsCard />                      ← stake %, split, platforms, stakes, caps
    <EditDealButton />                   ← opens DealForm modal
  <PnlSummaryCards />                   ← 3 cards: lifetime, this month, makeup balance
  <SessionLog />                        ← paginated DataTable of player_results
    <AddResultButton />                 ← opens AddResult form
    <EditResultButton />                ← coach can correct entries
    <FilterBar />                       ← by platform, game type, date range
  <TrainingCorrelation />               ← dual-axis chart: AI score vs win rate
    <LeakComparison />                  ← training leaks vs real-play patterns
  <VolumeTracker />                     ← progress bar: hands/sessions this month vs required
```

### 5.4 CRM Player Detail — Extended Tabs

The existing CRM detail page (from master plan) adds tabs:

```
<PlayerCRMDetail playerId={id}>
  <TabBar>
    <Tab label="Training" />             ← existing: stats, drills, hands, AI scores
    <Tab label="Financial" />            ← NEW: only visible if player_type = 'staked' or 'both'
    <Tab label="Notes" />                ← existing: coach notes timeline
    <Tab label="Value" />                ← NEW: revenue attribution
  </TabBar>

  {activeTab === 'Training' && <TrainingPanel />}      ← existing CRM content
  {activeTab === 'Financial' && <FinancialPanel />}     ← deal terms, P&L, sessions, makeup
  {activeTab === 'Notes' && <NotesPanel />}             ← existing
  {activeTab === 'Value' && <ValuePanel />}             ← revenue attribution
```

### 5.5 Financial Panel (inside CRM)

```
<FinancialPanel>
  <DealTermsSummary />                   ← compact version of deal terms
  <PnlRow />                            ← lifetime | this month | this week — 3 cards
  <MakeupIndicator />                   ← progress bar toward kill threshold, color-coded
  <RecentResults />                     ← last 5 sessions, link to full log
  <QuickAddResult />                    ← inline form: date, platform, game, result
```

### 5.6 Value Panel (inside CRM, all player types)

```
<ValuePanel>
  <RevenueAttribution />
    <CoachingRevenue />                  ← total paid for coaching (from enrollments)
    <StakingPnL />                       ← coach's P&L share (from staking, if applicable)
    <NetPlayerValue />                   ← coaching revenue + staking P&L
  <LTVEstimate />                       ← projected based on tenure and trend
  <CostToServe />                       ← estimated coaching hours × hourly rate
  <NetROI />                            ← (revenue - cost) / cost
```

### 5.7 Player's Own View — My Results

```
<MyResults>
  <ResultsSummary />                     ← this month: gross, net, by platform
  <MakeupBalance />                     ← if staked: current makeup, trend
  <SessionLog />                        ← own results only, paginated
    <AddResultForm />                   ← date, platform, game, stakes, buy-in, cash-out, notes
  <DealTerms />                         ← read-only view of current deal
  <MonthlyChart />                      ← line chart of own results over time
```

### 5.8 Add/Edit Result Form

```
┌──────────────────────────────────────────────┐
│  LOG SESSION RESULT                  [Close] │
├──────────────────────────────────────────────┤
│                                              │
│  Date:     [March 28, 2026       ]           │
│  Platform: [PokerStars            ▼]         │
│  Game:     [NL Cash               ▼]         │
│  Stakes:   [NL25                  ]          │
│                                              │
│  Buy-in Total:  [$__________]                │
│  Cash-out Total:[$__________]                │
│  Result:        $XXX  (auto-calculated)      │
│                                              │
│  Rake Paid:     [$__________] (optional)     │
│  Hands Played:  [__________]  (optional)     │
│  Hours Played:  [__________]  (optional)     │
│                                              │
│  Notes: [________________________________]   │
│                                              │
│  [Cancel]                       [Save]       │
└──────────────────────────────────────────────┘
```

Platform dropdown: PokerStars, 888poker, GGPoker, WPT Global, PartyPoker, Winamax, Live, Other.
Game dropdown: NL Cash, PLO Cash, MTT, SNG, Spin & Go, Sit & Go, Other.

---

## 6. API ROUTES

```
# ── Staking Deals ──
GET    /api/stable/deals                          # List all active deals (coach view)
GET    /api/stable/deals/:dealId                  # Deal detail
POST   /api/stable/deals                          # Create deal
PUT    /api/stable/deals/:dealId                  # Update deal terms
POST   /api/stable/deals/:dealId/terminate        # End deal

# ── Player Results ──
GET    /api/stable/results                        # All results (coach view, filterable)
GET    /api/stable/results/:playerId              # One player's results
POST   /api/stable/results                        # Log a result (player or coach)
PUT    /api/stable/results/:resultId              # Edit/correct a result (coach)
DELETE /api/stable/results/:resultId              # Delete a result (coach only)

# ── Player's own results ──
GET    /api/my/results                            # My results (authenticated player)
POST   /api/my/results                            # Log own result
GET    /api/my/deal                               # My current deal terms (read-only)

# ── Payouts ──
GET    /api/stable/payouts                        # List payout periods
POST   /api/stable/payouts/calculate              # Generate payout for period
PUT    /api/stable/payouts/:id/settle             # Mark period as settled

# ── Dashboard ──
GET    /api/stable/overview                       # Portfolio summary (aggregated)
GET    /api/stable/overview/by-platform           # Results grouped by platform
GET    /api/stable/overview/by-game               # Results grouped by game type
GET    /api/stable/overview/trend                 # Monthly trend data

# ── Volume ──
GET    /api/stable/volume/:playerId               # Volume tracking for player
POST   /api/stable/volume                         # Set volume requirement

# ── CRM Extensions ──
GET    /api/admin/players/:id/financial            # Financial tab data
GET    /api/admin/players/:id/value                # Revenue attribution data
GET    /api/admin/players/:id/correlation          # Training vs real-play comparison
```

---

## 7. VIDEO LIBRARY — THOUGHTS (Not Spec'd)

You asked for thoughts, not a spec. Here's how I'd think about it:

### What it should be

A **content management layer** that sits alongside scenarios and drills. Three content types:

1. **Standalone teaching videos** — coach uploads a video (or links to YouTube/Vimeo), tags it with topics (same `study_topics` vocabulary as scenarios), assigns difficulty level. Students browse and watch.

2. **Course modules** — ordered collections of videos with progress tracking. "Module 1: Preflop Fundamentals (6 videos)" → "Module 2: Postflop Concepts (8 videos)". Students mark videos as watched, coach sees completion rates.

3. **Hand-attached clips** — short clips attached to specific hands or scenarios. Coach records a 2-minute explanation of a hand, attaches it. When the student reviews that hand or plays that scenario, the clip is available as a "Watch coach's breakdown" button.

### Why NOT to build it now

**Storage and hosting are the expensive part.** Video files are large. Hosting them means either S3 (cheap storage, you build the player) or a video platform (Mux, Cloudflare Stream — $5–20/month + per-minute). For external links (YouTube/Vimeo), there's zero infrastructure cost but you lose control over the experience and can't track watch time accurately.

The right move is to **start with external links only** (YouTube unlisted videos) and add hosted video later when you have paying customers who demand it. YouTube unlisted gives you free hosting, free transcoding, free CDN, and an embeddable player. The coach uploads to YouTube as unlisted, pastes the link into the app. The app wraps it in a tagged, progress-tracked interface.

### When to build it

After the core training loop (scenarios → play → AI analysis → drills) is proven. Video is a content enrichment layer, not a core mechanic. If you build video before the training loop works, you've built a course platform — and there are 50 of those already. If you build it after, you've built a training platform with video — that's differentiated.

### The database sketch (for when you're ready)

```
videos
  id, title, description, url (YouTube/Vimeo/hosted),
  video_type (standalone/course_module/hand_clip),
  duration_seconds, thumbnail_url,
  tags[], study_topics[], difficulty,
  created_by → player_profiles, created_at

courses
  id, title, description, created_by, is_published,
  tags[], study_topics[]

course_modules
  course_id → courses, video_id → videos,
  module_order, section_title

video_progress
  player_id → player_profiles, video_id → videos,
  watched_seconds, completed (boolean), completed_at

hand_video_links
  video_id → videos, hand_id → hands (nullable),
  scenario_id → scenarios (nullable)
```

### The monetization angle

Video content is where the Scenario Marketplace idea evolves. A coach sells not just scenario packs but **course packs** — 10 scenarios + 5 teaching videos + a drill playlist, all tagged to the same study topics. The student buys the pack, watches the videos, plays the scenarios, gets AI analysis, then gets adaptive drills on the same topic. That's a complete learning product. Price: $29–49 per pack. Platform takes 20%.

That's Phase 3/4 territory, but worth noting because it changes the value proposition from "tool" to "marketplace."
