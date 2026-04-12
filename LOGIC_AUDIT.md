# Logic Audit: Poker Trainer Codebase

**Audit date:** 2026-04-09
**Scope:** All mathematical calculations, statistical computations, pattern recognition, and conditional scoring in server + client source code.

## Executive Summary

**120+ logic sites** identified across **~30 source files** in 10 feature domains. The most logic-dense domains are:

1. **Tag Analyzers** (10 analyzers, ~50 pattern rules) -- the brain of the coaching system
2. **Stats Engine** (BaselineService + ProgressReportService + SessionManager) -- every stat shown to coaches
3. **Alert Detectors** (6 detectors with configurable thresholds) -- drives coach attention
4. **Game Engine** (GameManager + ShowdownResolver + SidePotCalculator) -- pot math, blinds, side pots
5. **ICM Service** -- recursive and Monte Carlo equity models
6. **Staking System** -- P&L, makeup, settlement math

**Immediate red flags:**
- `RegressionDetector` approximates standard deviation as `max(mean * 0.20, 0.02)` since no per-stat variance is stored -- this is a rough placeholder, not a real z-score.
- `SessionQualityService` hardcodes `equityScore = 0.5` (25% of the composite score), meaning the quality score is effectively computed from 75% of its intended inputs.
- `fold_to_cbet` in BaselineService counts *all* folds on the flop, not specifically folds to a c-bet -- it's a proxy that over-counts.
- `MilestoneDetector` checks "first profitable week" by examining only 3 prior *sessions*, not 3 prior *weeks* -- sessions != weeks.
- `VolumeDropDetector` divides 30-day hand count by 4 to approximate weekly average -- this drifts for students with uneven schedules.
- The `MistakeAnalyzer` MIN_RAISE tag fires when `amount <= lastBetAmount * 2`, but the poker standard for a minimum raise is `previous_bet + min_raise_increment` -- the `* 2` test is a simplification that may false-positive on legitimate small raises.

---

# PATTERN RECOGNITION

## Hand Tagger -- Street Tags

```
Street Tagger > WALK detection
File: server/game/tagAnalyzers/street.js : line 13
Logic: Tags a hand as a WALK when all players except one folded preflop
  and no raise occurred and no board was dealt.
Formula/Rule: IF preflop has zero raises AND fold_count >= total_preflop_actions - 1
  AND board is empty -> tag = WALK
Poker context: A walk means the BB won uncontested. Useful for filtering
  trivial hands from analysis and identifying tables with excessive folding.
```

```
Street Tagger > Street progression tags
File: server/game/tagAnalyzers/street.js : lines 20-23
Logic: Tags which streets were reached based on board card count.
Formula/Rule:
  board.length >= 3 -> SAW_FLOP
  board.length >= 4 -> SAW_TURN
  board.length >= 5 -> SAW_RIVER
  hand.phase_ended === 'showdown' -> WENT_TO_SHOWDOWN
Poker context: Powers WTSD/WTSD stats and filters. If SAW_FLOP is under-counted,
  all postflop frequency stats are wrong downstream.
```

## Hand Tagger -- Preflop Patterns

```
Preflop Tagger > 3-bet / 4-bet pot detection
File: server/game/tagAnalyzers/preflop.js : lines 12-14
Logic: Counts the number of raise actions preflop. Two raises = 3-bet pot,
  three raises = 4-bet pot.
Formula/Rule:
  raise_count >= 2 -> 3BET_POT
  raise_count >= 3 -> FOUR_BET_POT
Poker context: 3-bet and 4-bet pots have fundamentally different stack-to-pot
  ratios and range dynamics. Tagging these lets coaches filter and review
  specifically how students play in inflated pots.
```

```
Preflop Tagger > Squeeze pot detection
File: server/game/tagAnalyzers/preflop.js : lines 17-24
Logic: Detects a squeeze play: raise after a (raise -> call) sequence.
  Walks the preflop action list tracking whether a raise then a call have
  occurred; if a second raise follows, it's a squeeze.
Formula/Rule: IF action sequence contains raise -> call -> raise -> tag = SQUEEZE_POT
Poker context: Squeezes are an advanced play. Tagging them helps coaches
  identify students who use or face squeezes and review those spots.
```

```
Preflop Tagger > All-in preflop
File: server/game/tagAnalyzers/preflop.js : line 27
Logic: Tags if any player went all-in preflop.
Formula/Rule: IF any preflop action is 'all-in' -> ALL_IN_PREFLOP
Poker context: All-in preflop hands are high-variance spots worth reviewing.
```

```
Preflop Tagger > Limped pot detection
File: server/game/tagAnalyzers/preflop.js : lines 30-34
Logic: Tags as LIMPED_POT when voluntary actions (call/raise/all-in) exist
  but none of them are raises.
Formula/Rule: IF voluntary_actions > 0 AND no voluntary action is a raise -> LIMPED_POT
Poker context: Limped pots indicate passive preflop play. Coaches use this
  to identify students who aren't opening aggressively enough.
```

```
Preflop Tagger > Button open
File: server/game/tagAnalyzers/preflop.js : lines 37-50
Logic: Tags BTN_OPEN when the first preflop raiser is seated on the dealer button.
Formula/Rule: IF first_raise.player_id == button_player.player_id -> BTN_OPEN
Poker context: Button opens are a key positional concept. Frequency of BTN opens
  is a coaching metric.
```

```
Preflop Tagger > Blind defense
File: server/game/tagAnalyzers/preflop.js : lines 53-62
Logic: Tags BLIND_DEFENSE when the big blind responds to a raise with a call or re-raise.
Formula/Rule: IF BB player acts after a raise AND BB's action is call or raise -> BLIND_DEFENSE
Poker context: Blind defense frequency is a core coaching stat. Under-defending
  blinds is a common leak.
```

## Hand Tagger -- Postflop Patterns

```
Postflop Tagger > Continuation bet detection
File: server/game/tagAnalyzers/postflop.js : lines 13-23
Logic: Tags C_BET when the last preflop raiser is the first to bet or raise on the flop.
Formula/Rule: IF last_preflop_raiser == first_flop_aggressor -> C_BET
Poker context: C-bet frequency is a primary postflop coaching stat. Feeds into
  aggression profiling and missed c-bet detection.
```

```
Postflop Tagger > Check-raise detection
File: server/game/tagAnalyzers/postflop.js : lines 26-35
Logic: Detects a check-raise on any street. Tracks which players checked;
  if a player who checked later raises on the same street, it's a check-raise.
Formula/Rule: IF player checked on street AND player later raised on same street -> CHECK_RAISE
Poker context: Check-raises are a key aggressive play. Tagging them helps
  coaches identify students who use this line effectively.
```

```
Postflop Tagger > Bluff catch detection
File: server/game/tagAnalyzers/postflop.js : lines 38-45
Logic: Tags BLUFF_CATCH when someone calls the last river bet and wins at showdown.
Formula/Rule: IF river has a bet AND caller_after_bet == hand.winner_id
  AND hand ended at showdown -> BLUFF_CATCH
Poker context: Bluff catches are high-skill plays. Identifying them lets
  coaches praise good reads and review the spot.
```

```
Postflop Tagger > Donk bet detection
File: server/game/tagAnalyzers/postflop.js : lines 48-55
Logic: Tags DONK_BET when a non-preflop-raiser bets first on the flop.
Formula/Rule: IF first_flop_bettor != last_preflop_raiser -> DONK_BET
Poker context: Donk bets violate the standard flow where the preflop aggressor
  has first crack at c-betting. Often a leak in student play.
```

```
Postflop Tagger > River raise
File: server/game/tagAnalyzers/postflop.js : lines 58-59
Logic: Tags RIVER_RAISE when any raise occurs on the river.
Formula/Rule: IF any river action is 'raise' -> RIVER_RAISE
Poker context: River raises represent extreme strength or bold bluffs.
  High-review-value spots for coaching.
```

## Hand Tagger -- Mistake Detection

```
Mistake Tagger > Undo used
File: server/game/tagAnalyzers/mistakes.js : lines 19-20
Logic: Tags UNDO_USED (hand-level, no player_id) if any action was reverted.
Formula/Rule: IF any action in allActions has is_reverted == true -> UNDO_USED
Poker context: Undo usage suggests the student made a misclick or changed
  their mind. Worth flagging for review.
```

```
Mistake Tagger > Open limp detection
File: server/game/tagAnalyzers/mistakes.js : lines 23-39
Logic: Tags OPEN_LIMP when a non-BB player's first voluntary action is a call
  before any raise has occurred.
Formula/Rule: IF player != BB AND first_voluntary_action == 'call'
  AND no raise preceded it -> OPEN_LIMP (mistake, player-specific)
Poker context: Open limping is one of the most common beginner mistakes.
  Modern poker strategy strongly favors opening with a raise or folding.
```

```
Mistake Tagger > Overlimp detection
File: server/game/tagAnalyzers/mistakes.js : lines 42-52
Logic: Tags OVERLIMP when a player calls preflop after at least one other
  limp already exists (and before any raise).
Formula/Rule: IF limp_count >= 1 AND player calls (not BB) AND no raise yet -> OVERLIMP
Poker context: Overlimping compounds the open-limp mistake. Students should
  be raising to isolate or folding, not piling into limped pots.
```

```
Mistake Tagger > Limp-reraise detection
File: server/game/tagAnalyzers/mistakes.js : lines 55-66
Logic: Tags LIMP_RERAISE when a player who limped preflop later raises
  after someone else raises.
Formula/Rule: IF player limped (called before first raise) AND player
  later raises after first raise -> LIMP_RERAISE
Poker context: Limp-reraising is a trappy, deceptive line. While it can
  be intentional with premium hands, it's often a sign of confused play.
```

```
Mistake Tagger > Cold-call 3-bet
File: server/game/tagAnalyzers/mistakes.js : lines 69-85
Logic: Tags COLD_CALL_3BET when a player who had no prior investment
  calls a 3-bet (the second raise).
Formula/Rule: IF 3-bet exists AND player calls after 3-bet AND player had
  no chips invested before the 3-bet -> COLD_CALL_3BET
Poker context: Cold-calling 3-bets with a wide range is a major leak.
  The caller needs a very strong hand to profitably enter a 3-bet pot cold.
```

```
Mistake Tagger > Fold to probe bet
File: server/game/tagAnalyzers/mistakes.js : lines 88-100
Logic: Tags FOLD_TO_PROBE when a player folds to a bet whose sizing ratio
  is less than 25% of the pot.
Formula/Rule: IF bet.sizingRatio < 0.25 AND a subsequent player folds -> FOLD_TO_PROBE
  (stops if a raise intervenes)
Poker context: Folding to a tiny probe bet gives the opponent an extremely
  profitable bluff. The pot odds demand a very wide continuing range.
  ⚠️ HARDCODED VALUE: 0.25 threshold
```

```
Mistake Tagger > Min-raise detection
File: server/game/tagAnalyzers/mistakes.js : lines 103-116
Logic: Tags MIN_RAISE when a raise amount is <= 2x the previous bet/raise amount.
Formula/Rule: IF raise_amount <= last_bet_amount * 2 -> MIN_RAISE
  (preflop baseline is the big blind)
Poker context: Min-raises are generally weak plays that give opponents
  excellent pot odds to continue.
  ⚠️ REVIEW NEEDED: This uses `amount <= lastBetAmount * 2` which is a
  simplification. The actual poker minimum raise is `previous_bet +
  min_raise_increment`. A raise to exactly 2x the last bet is a legal
  minimum raise and is arguably not a mistake in all situations.
  This may over-flag legitimate min-raises as mistakes.
```

## Hand Tagger -- Sizing Classification

```
Sizing Tagger > Bet sizing buckets
File: server/game/tagAnalyzers/sizing.js : lines 17-24
Logic: Classifies every postflop bet or raise into a sizing bucket based on
  the ratio of the bet amount to the pot at the time of action.
Formula/Rule:
  sizingRatio = action.amount / action.pot_at_action
  ratio < 0.25  -> PROBE_BET
  ratio < 0.50  -> THIRD_POT_BET
  ratio < 0.80  -> HALF_POT_BET
  ratio <= 1.10 -> POT_BET
  ratio <= 2.00 -> OVERBET
  ratio > 2.00  -> OVERBET_JAM
  (Preflop actions are skipped entirely)
Poker context: Sizing is one of the most coachable aspects of poker.
  These tags let coaches filter hands by sizing patterns and identify
  students who over-bet, under-bet, or use inappropriate sizings.
  ⚠️ HARDCODED VALUES: All 6 bucket boundaries are hardcoded constants.
```

```
Sizing Tagger > sizingRatio computation
File: server/game/AnalyzerService.js : lines 60-65
Logic: Enriches every action row with a sizingRatio before passing to analyzers.
Formula/Rule: sizingRatio = (pot_at_action > 0 AND amount > 0)
  ? amount / pot_at_action : null
Poker context: This ratio is the denominator for all sizing tags and the
  SessionQualityService sizing accuracy score. If pot_at_action is wrong
  in the DB, all downstream sizing analysis is wrong.
```

## Hand Tagger -- Pot Type Classification

```
Pot Type Tagger > Whale pot
File: server/game/tagAnalyzers/potType.js : lines 13-15
Logic: Tags WHALE_POT when the final pot exceeds 150 big blinds.
Formula/Rule: IF final_pot > 150 * big_blind -> WHALE_POT
Poker context: Large pots are high-stakes decisions worth reviewing.
  ⚠️ HARDCODED VALUE: 150 BB threshold.
```

```
Pot Type Tagger > Multiway pot
File: server/game/tagAnalyzers/potType.js : lines 18-25
Logic: Tags MULTIWAY when 3+ players saw the flop (or preflop if no flop dealt).
  Counts unique non-folding actor IDs on the flop.
Formula/Rule: IF unique_non_folding_flop_actors >= 3 -> MULTIWAY
Poker context: Multiway pots change hand equity dramatically. Coaching
  advice differs significantly in multiway vs heads-up pots.
```

```
Pot Type Tagger > Stack depth tags
File: server/game/tagAnalyzers/potType.js : lines 29-36
Logic: Tags SHORT_STACK or DEEP_STACK based on any seated player's starting stack
  relative to the big blind.
Formula/Rule:
  IF any player's stack_start < 20 * BB -> SHORT_STACK
  IF any player's stack_start > 100 * BB -> DEEP_STACK
Poker context: Stack depth fundamentally changes optimal strategy. Short-stack
  play (push/fold) vs deep-stack play (implied odds) require different approaches.
  ⚠️ HARDCODED VALUES: 20 BB and 100 BB thresholds.
```

```
Pot Type Tagger > Overbet detection (hand-level)
File: server/game/tagAnalyzers/potType.js : lines 39-46
Logic: Tags OVERBET when any bet or raise exceeds 2x the pot at that action.
Formula/Rule: IF action.amount > 2 * action.pot_at_action -> OVERBET
Poker context: Overbets are polarizing plays. Tagging them lets coaches
  review whether students use overbets appropriately.
  Note: This is a separate, hand-level OVERBET tag from the per-action
  sizing OVERBET tag in sizing.js. The sizing tag uses 1.10-2.00x range;
  this one uses >2.00x. They measure different things.
```

## Hand Tagger -- Board Texture

```
Board Tagger > Suit classification
File: server/game/tagAnalyzers/board.js : lines 44-53
Logic: Classifies the flop by suit distribution.
Formula/Rule:
  All 3 same suit -> MONOTONE_BOARD
  2 of one suit, 1 of another -> TWO_TONE_BOARD
  All different suits -> RAINBOW_BOARD
Poker context: Suit texture determines flush draw availability, which
  changes optimal c-bet frequency and sizing.
```

```
Board Tagger > Pair classification
File: server/game/tagAnalyzers/board.js : lines 56-61
Logic: Classifies the flop by rank repetition.
Formula/Rule:
  All 3 same rank -> TRIPS_BOARD
  2 of one rank -> PAIRED_BOARD
  All different ranks -> UNPAIRED_BOARD
Poker context: Paired boards reduce the number of possible holdings and
  change range interaction dynamics.
```

```
Board Tagger > Connectedness classification
File: server/game/tagAnalyzers/board.js : lines 64-71
Logic: For unpaired boards, classifies by the "best span" of the 3 flop
  card ranks (considering ace as high or low).
Formula/Rule:
  span = max_rank_index - min_rank_index (with ace duality)
  span <= 2 -> CONNECTED_BOARD (e.g. 7-8-9)
  span 3-4 -> ONE_GAP_BOARD (e.g. 6-7-9)
  span > 4 -> DISCONNECTED_BOARD (e.g. Q-2-3)
Poker context: Connected boards have more straight draw possibilities,
  making them "wetter" and changing optimal play.
```

```
Board Tagger > Height classification
File: server/game/tagAnalyzers/board.js : lines 74-82
Logic: Classifies the flop height by the ranks present.
Formula/Rule:
  Contains an Ace -> ACE_HIGH_BOARD
  All 3 are broadway (T,J,Q,K,A) -> BROADWAY_BOARD
  All 3 are ranks 8-T (index 6-9) -> MID_BOARD
  All 3 are rank 9 or lower (index <= 7) -> LOW_BOARD
Poker context: Board height determines which ranges connect. Ace-high boards
  favor the preflop raiser; low boards favor the caller.
  ⚠️ REVIEW NEEDED: MID_BOARD checks index 6-9 (ranks 8,9,T,J).
  Including Jack as "mid" is debatable -- some coaches would classify J as broadway.
  LOW_BOARD checks index <= 7 (ranks 2-9). This overlaps with MID_BOARD
  (8 and 9 qualify for both), but since MID_BOARD requires ALL three ranks
  in 8-J and LOW_BOARD requires ALL three in 2-9, an overlap only occurs
  when all three ranks are 8-9 range. In that case MID_BOARD fires first.
```

```
Board Tagger > Wet/dry composite
File: server/game/tagAnalyzers/board.js : lines 85-92
Logic: Assigns WET_BOARD or DRY_BOARD based on the combination of suit
  and connectedness tags.
Formula/Rule:
  (TWO_TONE or MONOTONE) AND (CONNECTED or ONE_GAP) -> WET_BOARD
  RAINBOW AND DISCONNECTED -> DRY_BOARD
Poker context: Wet boards require more protection bets; dry boards allow
  more check-backs. This composite tag simplifies filtering.
```

## Hand Tagger -- Equity-Based Tags

```
Equity Tagger > Drew thin
File: server/game/tagAnalyzers/equity.js : line 71
Logic: Tags DREW_THIN (mistake) when a player calls a bet with less than
  25% equity.
Formula/Rule: IF action == 'call' AND player_equity < 25% -> DREW_THIN
Poker context: Calling with very low equity is a major mistake. This tag
  surfaces spots where students called when way behind.
  ⚠️ HARDCODED VALUE: 25% equity threshold.
```

```
Equity Tagger > Value backed
File: server/game/tagAnalyzers/equity.js : line 76
Logic: Tags VALUE_BACKED when a player bets or raises with more than 70% equity.
Formula/Rule: IF action in (bet, raise) AND player_equity > 70% -> VALUE_BACKED
Poker context: Confirms the player had a strong hand when they bet -- positive
  reinforcement for coaches to highlight.
  ⚠️ HARDCODED VALUE: 70% equity threshold.
```

```
Equity Tagger > Equity bluff
File: server/game/tagAnalyzers/equity.js : lines 80-85
Logic: Tags EQUITY_BLUFF when a player bets/raises with less than 30% equity
  and an opponent calls after.
Formula/Rule: IF action in (bet, raise) AND player_equity < 30%
  AND any subsequent action on same street is a call -> EQUITY_BLUFF
Poker context: Identifies bluffs that were called, useful for reviewing
  bluff sizing and frequency.
  ⚠️ HARDCODED VALUE: 30% equity threshold.
```

```
Equity Tagger > Equity fold
File: server/game/tagAnalyzers/equity.js : line 91
Logic: Tags EQUITY_FOLD (mistake) when a player folds with more than 50% equity.
Formula/Rule: IF action in (fold, folded) AND player_equity > 50% -> EQUITY_FOLD
Poker context: Folding when ahead is a clear mistake. However, equity is
  computed with full card knowledge -- the player didn't know they were ahead.
  Still useful as a coaching tool to identify spots where the student
  should develop reads.
  ⚠️ HARDCODED VALUE: 50% equity threshold.
  ⚠️ REVIEW NEEDED: This tag uses "God-mode" equity (seeing all hole cards).
  A fold with >50% equity is only a mistake if the player *should have known*
  they were ahead. The tag will fire in spots where folding was correct
  given incomplete information. Coaches should use this as a discussion
  starter, not proof of a mistake.
```

## Hand Tagger -- Hand Strength Tags

```
Hand Strength Tagger > Slowplay detection
File: server/game/tagAnalyzers/handStrength.js : lines 22-34
Logic: Tags SLOWPLAY when a player has a monster hand (three of a kind or better)
  on the flop or turn but never bet or raised on that street.
Formula/Rule: IF hand_rank >= THREE_OF_A_KIND (rank 3+)
  AND player never bet/raised on that street -> SLOWPLAY
Poker context: Slowplaying monsters can be correct or a leak depending on
  board texture and opponent tendencies.
```

```
Hand Strength Tagger > Hero call
File: server/game/tagAnalyzers/handStrength.js : lines 38-51
Logic: Tags HERO_CALL when a player calls a river bet holding one pair or worse
  and the hand went to showdown.
Formula/Rule: IF showdown reached AND river has a bet AND player called
  after the last bet AND hand_rank <= ONE_PAIR (rank 1 or 0) -> HERO_CALL
Poker context: Hero calls with marginal holdings are high-skill plays.
  Tagging them helps coaches review whether the read was good.
```

```
Hand Strength Tagger > Value missed
File: server/game/tagAnalyzers/handStrength.js : lines 54-70
Logic: Tags VALUE_MISSED when a player had two pair or better on every
  postflop street but never bet or raised on any of them.
Formula/Rule: IF hand_rank >= TWO_PAIR on every postflop street the player
  was active AND player never bet/raised on any postflop street -> VALUE_MISSED
Poker context: Failing to extract value from strong hands is a common passive
  player leak.
```

```
Hand Strength Tagger > Thin value raise
File: server/game/tagAnalyzers/handStrength.js : lines 73-82
Logic: Tags THIN_VALUE_RAISE when a player raises on the river with exactly one pair.
Formula/Rule: IF river action == 'raise' AND hand_rank == ONE_PAIR -> THIN_VALUE_RAISE
Poker context: Raising the river with one pair is a thin value line that requires
  a good read. Can be brilliant or a mistake.
```

## Hand Tagger -- Positional Tags

```
Positional Tagger > C-bet IP/OOP
File: server/game/tagAnalyzers/positional.js : lines 19-37
Logic: Tags C_BET_IP or C_BET_OOP when a continuation bet is made with or
  without positional advantage. Uses isInPosition() to compare the c-bettor's
  postflop position against the first non-folding opponent.
Formula/Rule: IF c-bet detected AND isInPosition(cbettor, opponent) -> C_BET_IP
  ELSE -> C_BET_OOP
Poker context: C-bet success rates differ dramatically IP vs OOP. Tracking
  this split helps coaches advise on positional adjustments.
```

```
Positional Tagger > Donk bet from BB
File: server/game/tagAnalyzers/positional.js : lines 40-49
Logic: Tags DONK_BET_BB when a donk bet comes specifically from the big blind.
Formula/Rule: IF donk bet detected AND positions[bettor] == 'BB' -> DONK_BET_BB
Poker context: BB donk bets are a specific leak pattern. The BB should usually
  check to the preflop aggressor.
```

```
Positional Tagger > 3-bet from BTN/SB
File: server/game/tagAnalyzers/positional.js : lines 52-58
Logic: Tags 3BET_BTN or 3BET_SB when the 3-bettor is on the button or small blind.
Formula/Rule: IF 2nd_raiser's position == 'BTN' -> 3BET_BTN
  IF 2nd_raiser's position == 'SB' -> 3BET_SB
Poker context: Positional 3-bets are a key advanced concept. Button 3-bets
  exploit position; SB 3-bets are defensive.
```

```
Positional Tagger > Squeeze from CO
File: server/game/tagAnalyzers/positional.js : lines 62-73
Logic: Tags SQUEEZE_CO when a squeeze play comes from the cutoff position.
Formula/Rule: IF squeeze detected AND squeezer's position == 'CO' -> SQUEEZE_CO
Poker context: CO squeezes are positionally advantageous. Tracking them helps
  coaches identify students who use position-aware aggression.
```

## Alert Detectors -- Pattern Recognition

```
Alert Detector > Inactivity detection
File: server/services/detectors/InactivityDetector.js : lines 17-38
Logic: Fires an alert when a student hasn't played a hand in more days than
  the configured threshold.
Formula/Rule:
  days_inactive = (now - last_hand_at) / ms_per_day
  IF days_inactive > threshold -> fire alert
  severity = min(days_inactive / threshold, 1.0)
  ⚠️ HARDCODED VALUE: DEFAULT_DAYS = 5
Poker context: Inactivity alerts help coaches follow up with students who
  have dropped off. The severity scales linearly with inactivity duration.
```

```
Alert Detector > Losing streak detection
File: server/services/detectors/LosingStreakDetector.js : lines 20-57
Logic: Fires when a student has negative net chips in N consecutive recent
  sessions (most-recent-first).
Formula/Rule:
  Walk sessions most-recent-first; count consecutive sessions with net_chips < 0.
  IF streak >= threshold -> fire alert
  severity = min(streak / threshold, 1.0)
  total_loss = sum of net_chips across streak sessions
  ⚠️ HARDCODED VALUE: DEFAULT_STREAK_LENGTH = 3
Poker context: Losing streaks can indicate tilt or declining play quality.
  Early detection lets coaches intervene before the student spirals.
```

```
Alert Detector > Mistake spike detection
File: server/services/detectors/MistakeSpikeDetector.js : lines 27-76
Logic: Fires when any tracked mistake tag's per-100-hands rate this week
  exceeds spike_ratio * the 30-day baseline rate. Uses 9 tracked mistake tags.
Formula/Rule:
  current_rate = (weekly_tag_count / weekly_hands) * 100
  baseline_rate = (baseline_tag_count / baseline_hands) * 100
  IF baseline_rate < 1.0 per 100 hands -> skip (too rare to be meaningful)
  IF current_rate >= baseline_rate * spike_ratio -> spike detected
  severity = min((current_rate - baseline_rate) / baseline_rate, 1.0)
  Alert severity = max severity across all spiking tags
  ⚠️ HARDCODED VALUES: DEFAULT_SPIKE_RATIO = 1.5 (50% increase triggers),
    MIN_BASELINE_RATE = 1.0 per 100 hands
Poker context: Sudden increases in specific mistakes indicate a developing
  leak. The per-tag granularity helps coaches pinpoint exactly what changed.
```

```
Alert Detector > Stat regression detection
File: server/services/detectors/RegressionDetector.js : lines 33-74
Logic: Fires when any core stat drifts more than z_threshold standard deviations
  from the 30-day baseline. Tracks VPIP, PFR, 3-bet%, and aggression.
Formula/Rule:
  stddev = max(mean * 0.20, 0.02)
  z_score = (weekly_stat - baseline_mean) / stddev
  IF abs(z_score) >= z_threshold -> regression detected
  severity = min(abs(z_score) / 4, 1.0)
  ⚠️ HARDCODED VALUES: DEFAULT_Z_THRESHOLD = 2.0, stddev approximation = 20% of mean
  ⚠️ REVIEW NEEDED: The standard deviation is approximated as 20% of the mean,
    minimum 0.02. This is NOT a real statistical z-score -- it's a heuristic.
    For stats near zero (e.g. a 3-bet% of 0.03), stddev = 0.02, making the
    z-score extremely sensitive. For high-variance stats (e.g. aggression = 2.5),
    stddev = 0.50, which may be too forgiving. Consider storing actual per-stat
    variance in student_baselines.
Poker context: Stat regression alerts catch students whose play is drifting
  from their baseline. The direction labels (e.g. "loosening", "more passive")
  give coaches immediate context.
```

```
Alert Detector > Volume drop detection
File: server/services/detectors/VolumeDropDetector.js : lines 21-48
Logic: Fires when hands played this week fall below drop_pct of the
  approximate weekly average (30-day total / 4).
Formula/Rule:
  avg_weekly = baseline.hands_played / 4
  IF avg_weekly < 5 -> skip (not enough baseline)
  IF this_week_hands >= avg_weekly * drop_pct -> no alert
  severity = min(1 - (this_week_hands / avg_weekly), 1.0)
  ⚠️ HARDCODED VALUES: DEFAULT_DROP_PCT = 0.5, MIN_AVG_HANDS = 5
  ⚠️ REVIEW NEEDED: Dividing 30-day hands by 4 assumes uniform weekly
    distribution. Students who play in bursts (e.g. 200 hands on weekends
    only) will have misleading weekly averages.
Poker context: Volume drops can indicate motivation issues or scheduling
  problems. Coaches can use this to check in with students.
```

```
Alert Detector > Milestone detection
File: server/services/detectors/MilestoneDetector.js : lines 29-91
Logic: Detects positive achievements. Two milestones checked:
  1. First profitable week: net_chips > 0 this week AND none of the 3 prior
     sessions were profitable.
  2. Stat improvement held: core stat improved by >= 3 percentage points
     vs previous 30-day baseline AND weekly trend continues improving.
Formula/Rule:
  first_profitable_week: thisWeekNet > 0 AND no prior 3 sessions have net > 0
  stat_improvement: abs(prev_baseline - current_baseline) >= 0.03
    AND improvement direction correct per LOWER_IS_BETTER set
    AND weekly stat continues in the same direction
  severity = 0.0 (informational only)
  LOWER_IS_BETTER stats: vpip, open_limp_rate, cold_call_3bet_rate,
    overlimp_rate, fold_to_probe, equity_fold_rate
  ⚠️ HARDCODED VALUE: IMPROVEMENT_THRESHOLD = 0.03 (3 percentage points)
  ⚠️ REVIEW NEEDED: "First profitable week" checks 3 prior *sessions*
    (recentSessions.slice(1, 4)), not 3 prior *weeks*. If a student plays
    multiple sessions per week, this may fire prematurely.
Poker context: Positive milestones boost student morale. Coaches can
  celebrate improvements and reinforce good habits.
```

## Bot Decision Service -- Decision Logic

```
Bot AI > Call/fold decision (pot odds)
File: server/game/BotDecisionService.js : lines 59-76
Logic: Bots use a simplified pot-odds model. They compute the equity needed
  to call and compare against a difficulty-dependent threshold.
Formula/Rule:
  equityNeeded = toCall / (pot + toCall)
  IF equityNeeded <= threshold -> call; ELSE -> fold
  Thresholds: easy = 0.30 (30%), medium = 0.20 (20%), hard = 0.15 (15%)
  ⚠️ HARDCODED VALUES: All three thresholds.
Poker context: This is an oversimplification. Real pot odds require the
  actual equity from the player's hand, not just the call amount. The bots
  use a "maximum tolerable equity needed" approach rather than computing
  actual hand equity. Lower thresholds mean the bot only calls when getting
  very good immediate odds.
  Quick win: Use EquityService to compute actual hand equity for hard bots.
```

```
Bot AI > Medium difficulty raise logic
File: server/game/BotDecisionService.js : lines 94-106
Logic: Medium bots raise 33% pot when they have top pair or better (postflop only).
Formula/Rule:
  IF hand_rank >= TWO_PAIR OR (hand_rank == ONE_PAIR AND has_top_pair) -> raise
  raise_amount = pot * 0.33 above current bet
  ⚠️ HARDCODED VALUE: 0.33 pot fraction.
Poker context: This gives medium bots some aggression but only with strong hands.
  They never raise preflop, which is unrealistic.
  Quick win: Add preflop opening ranges for medium bots.
```

```
Bot AI > Hard difficulty raise logic
File: server/game/BotDecisionService.js : lines 111-128
Logic: Hard bots 3-bet preflop with AA/KK/AK only. Postflop, they pot-bet
  with a straight or better.
Formula/Rule:
  Preflop: IF (AA or KK or AK) AND current_bet > 0 -> raise to 3x current bet
  Postflop: IF hand_rank >= STRAIGHT (rank 4+) -> raise pot-sized
  ⚠️ HARDCODED VALUES: Premium hand set (AA/KK/AK), 3x multiplier, straight+ threshold.
Poker context: This is a very tight aggressive range. Hard bots are
  exploitably tight -- they never bluff and only value-bet the nuts.
  Quick win: Add bluffing logic and wider preflop ranges for hard bots.
```

```
Bot AI > Top pair detection
File: server/game/BotDecisionService.js : lines 149-155
Logic: Checks if one of the bot's hole cards matches the highest board card rank.
Formula/Rule: IF any hole_card rank == max(board card ranks) -> has_top_pair = true
Poker context: Used by medium bots to decide whether to raise with one pair.
  Correctly identifies top pair by comparing hole card rank to the board's
  highest rank.
```

## Position System

```
Position Engine > Position assignment
File: server/game/positions.js : lines 51-67
Logic: Maps each player's seat to a canonical position name based on
  clockwise distance from the dealer button.
Formula/Rule:
  offset = (player_seat_index - dealer_index + n) % n
  Position names by offset: [BTN, SB, BB, UTG, ...]
  Maps defined for 2-9 players. 10+ uses the 9-player map.
Poker context: Position names are attached to every hand action in the DB
  and used by all positional tag analyzers. Incorrect position assignment
  would cascade through the entire analysis pipeline.
```

```
Position Engine > In-position check
File: server/game/positions.js : lines 80-95
Logic: Determines if player A acts after player B postflop (and is thus "in position").
Formula/Rule:
  offsetA = (seatIdxA - dealerIdx + n) % n
  offsetB = (seatIdxB - dealerIdx + n) % n
  IF offsetA < offsetB -> player A is in position
  Note: Lower offset = acts later postflop (BTN = offset 0 = last to act)
Poker context: Used by C_BET_IP/C_BET_OOP tags. A bug here would
  mislabel all positional c-bet tags.
```

---

# MATH & STATS

## Game Engine -- Core Pot Math

```
Game Engine > Blind posting
File: server/game/GameManager.js : lines 594-605
Logic: Posts a blind for a player, capping at their stack if they can't afford it.
Formula/Rule:
  paid = min(blind_amount, player.stack)
  player.stack -= paid
  player.total_bet_this_round = paid
  player.total_contributed += paid
  pot += paid
  IF player.stack == 0 -> player is all-in
Poker context: Correct blind posting is fundamental. The min() ensures short-stacked
  players go all-in on the blind. Underpayment must still create action.
```

```
Game Engine > Call amount calculation
File: server/game/GameManager.js : lines 635-644
Logic: A call pays the difference between the current bet and the player's
  existing investment, capped at the player's stack.
Formula/Rule:
  callAmt = min(current_bet - total_bet_this_round, player.stack)
  player.stack -= callAmt
  total_bet_this_round += callAmt
  total_contributed += callAmt
  pot += callAmt
  IF player.stack == 0 -> all-in
Poker context: Standard call mechanics. The cap at player.stack handles
  partial calls (calling all-in for less).
```

```
Game Engine > Raise validation and min-raise tracking
File: server/game/GameManager.js : lines 648-683
Logic: Validates raises against the minimum raise requirement and tracks
  whether a raise is "full" (meets the min raise increment) or incomplete
  (an all-in for less than a full raise).
Formula/Rule:
  minTotal = current_bet + min_raise
  IF amount < minTotal AND amount < stack + total_bet_this_round -> reject
  raiseIncrement = amount - current_bet
  last_raise_was_full = raiseIncrement >= min_raise
  IF full raise -> min_raise = raiseIncrement (advances the min raise)
  IF incomplete -> min_raise stays unchanged
  Re-open action for other players only on full raises.
Poker context: The full vs incomplete raise distinction is critical. When a
  short stack goes all-in for less than a full raise, other players who already
  acted should not get another chance to raise. This is correct NL hold'em rules.
```

```
Game Engine > Default starting stack
File: server/game/GameManager.js : line 198
Logic: When no stack is specified, default to 100 big blinds.
Formula/Rule: actualStack = stack ?? (big_blind * 100)
  ⚠️ HARDCODED VALUE: 100 BB default.
Poker context: 100 BB is the standard starting stack for cash games.
  Appropriate default.
```

```
Game Engine > Fold-to-one pot award
File: server/game/GameManager.js : lines 695-703
Logic: When only one active player remains (everyone else folded), that player
  wins the entire pot immediately.
Formula/Rule:
  last_active_player.stack += pot
  pot = 0
Poker context: Standard fold-to-one resolution. No showdown needed.
```

## Game Engine -- Side Pot Calculator

```
Side Pots > Multi-pot construction
File: server/game/SidePotCalculator.js : lines 39-103
Logic: Builds side pots when one or more players are all-in for different amounts.
  Uses contribution breakpoints from all-in players.
Formula/Rule:
  1. Collect unique total_contributed values from all-in players.
  2. Append the maximum total_contributed across ALL players.
  3. Sort ascending, deduplicate.
  4. For each level L (prev = previous level):
     pot_amount = SUM[ min(p.total_contributed, L) - min(p.total_contributed, prev) ]
       for ALL players (folded players' chips count toward pot amount)
     eligible = players where total_contributed >= L AND is_active == true
  5. If only one pot and all active players are eligible -> return []
     (no split needed, main pot handles it)
Poker context: Side pot math is one of the most error-prone areas in poker
  software. The algorithm correctly handles:
  - Folded players' chips going into the pot they're no longer eligible for
  - Multiple all-in levels creating nested side pots
  - The degenerate case where one pot covers everyone
  Quick win: Log side pot calculations for debugging.
```

## Game Engine -- Showdown Resolution

```
Showdown > Winner determination and pot distribution
File: server/game/ShowdownResolver.js : lines 50-153
Logic: Evaluates all active players' hands, determines winners per pot
  (main or side), splits ties, and awards remainder chips to the player
  closest to the small blind (clockwise).
Formula/Rule:
  Multi-pot path:
    For each side pot:
      ranked = eligible players sorted by hand strength (best first)
      winners = all players tying for best hand
      share = floor(pot.amount / winner_count)
      remainder = pot.amount - share * winner_count
      remainder goes to winner closest to SB
  Single-pot path:
    Same logic but with the full pot.
  Remainder chip rule:
    Sorted by SB proximity = (player.seat - sb_seat + num_seats) % num_seats
    First in sorted order gets the extra chip(s).
Poker context: The SB-proximity remainder rule is standard casino procedure.
  floor() division ensures no fractional chips. Side pot ordering (smallest
  contribution first) is correct -- the main pot (highest contribution) is
  last.
```

## Game Engine -- Hand Evaluation

```
Hand Evaluator > 5-card hand ranking
File: server/game/HandEvaluator.js : lines 101-315
Logic: Evaluates exactly 5 cards and returns the hand rank (0-9), best five
  cards, kickers, and description.
Formula/Rule:
  Priority order (highest to lowest):
  9 = ROYAL_FLUSH: flush + straight + A-high
  8 = STRAIGHT_FLUSH: flush + straight
  7 = FOUR_OF_A_KIND: 4 cards of same rank
  6 = FULL_HOUSE: 3 of one rank + 2 of another
  5 = FLUSH: all 5 same suit
  4 = STRAIGHT: 5 consecutive ranks (with A-2-3-4-5 wheel support)
  3 = THREE_OF_A_KIND: 3 of same rank, no pair
  2 = TWO_PAIR: 2 distinct pairs
  1 = ONE_PAIR: exactly one pair
  0 = HIGH_CARD: nothing
  Wheel straight (A-2-3-4-5): detected via [12,3,2,1,0] pattern check.
  Wheel is reordered to [5,4,3,2,A] so 6-high straight beats it on comparison.
Poker context: The evaluator is the foundation for showdown resolution,
  hand strength tags, and equity computation. Any bug here cascades everywhere.
```

```
Hand Evaluator > Hand comparison (tiebreaking)
File: server/game/HandEvaluator.js : lines 347-363
Logic: Compares two hand results. First by rank, then by bestFive card values
  in descending order.
Formula/Rule:
  IF rank_a != rank_b -> return rank_a - rank_b (higher wins)
  ELSE compare bestFive values position by position (kicker comparison)
Poker context: Tiebreaking is critical for split pots. The bestFive ordering
  ensures correct kicker resolution for every hand type.
```

```
Hand Evaluator > 7-card best hand selection
File: server/game/HandEvaluator.js : lines 382-407
Logic: Combines 2 hole cards + up to 5 board cards, generates all C(n,5)
  combinations, evaluates each, returns the best.
Formula/Rule:
  combos = C(n, 5) where n = hole_cards.length + board.length
  best = max(evaluateFive(combo) for combo in combos)
  For 7 cards: C(7,5) = 21 combinations evaluated.
Poker context: Standard best-5-from-7 selection. The C(7,5) approach is
  correct but brute-force. For a training tool this is fine; for a
  high-throughput poker engine you'd use lookup tables.
```

## ICM Service -- Tournament Equity

```
ICM > Exact Malmuth-Harville computation
File: server/services/IcmService.js : lines 20-49
Logic: Recursively computes each player's ICM equity using the Malmuth-Harville
  model. P(player i wins) = chips_i / total_chips. For each possible winner,
  recursively compute remaining players' equity over remaining payouts.
Formula/Rule:
  equity(i) = P(i wins) * payout[0]
    + SUM_j!=i [ P(j wins) * equity(i | payouts[1:], stacks without j) ]
  P(i wins) = stacks[i] / sum(stacks)
  Base cases: no payouts or no players -> 0; one player -> sum(all payouts)
Poker context: This is the mathematically exact ICM model. Exponential
  complexity (O(n!)) but fine for <= 9 players. Used for final prize
  distribution in tournaments.
```

```
ICM > Monte Carlo estimation
File: server/services/IcmService.js : lines 58-80
Logic: Estimates ICM equity via simulation. For each iteration, randomly
  select a "winner" weighted by chip count, award them the next payout,
  remove them, repeat for remaining payouts.
Formula/Rule:
  For each iteration (default 5000):
    For each payout position:
      Pick winner with probability proportional to remaining chips
      Award payout / iterations to that player
      Remove winner from remaining pool
  ⚠️ HARDCODED VALUE: 5000 iterations default.
Poker context: Used for the live ICM overlay (shown during tournaments).
  5000 iterations gives reasonable accuracy for <= 9 players. The
  division by iterations at each step (rather than counting wins and
  dividing at the end) is mathematically equivalent but avoids integer
  overflow.
```

```
ICM > Prize distribution with rounding
File: server/services/IcmService.js : lines 90-117
Logic: Converts payout percentages to chip amounts, computes exact ICM equity,
  floors each prize, and gives the remainder to the chip leader.
Formula/Rule:
  payouts[i] = floor(totalPool * percentage[i] / 100)
  prizes[i] = floor(icmEquity[i])
  remainder = totalPool - sum(prizes)
  chip_leader gets remainder
Poker context: The floor + remainder-to-leader approach prevents distributing
  more chips than the pool. Standard tournament accounting.
```

## Staking Service -- Financial Math

```
Staking > P&L computation
File: server/services/StakingCalcService.js : lines 28-106
Logic: Computes the full staking state for a contract. Tracks buy-ins, cashouts,
  adjustments, makeup, and profit splits.
Formula/Rule:
  grossPnl = totalCashouts - totalBuyIns
  runningPnl = grossPnl + adjustmentTotal
  rawMakeup = priorMakeup + runningPnl
  currentMakeup = min(0, rawMakeup)  (can't be positive -- that's profit)
  profitAboveMakeup = max(0, rawMakeup)
  coachShare = profitAboveMakeup * (coach_split_pct / 100)
  playerShare = profitAboveMakeup * (player_split_pct / 100)
  Status: profitAboveMakeup > 0 -> 'in_profit'
          currentMakeup < 0 -> 'in_makeup'
          else -> 'even'
Poker context: Standard staking contract math. Makeup is the running loss
  that must be recovered before profit is split. The min/max clamping
  correctly separates makeup from profit.
  Quick win: Add validation that coach_split_pct + player_split_pct == 100.
```

```
Staking > Monthly makeup reset policy
File: server/services/StakingCalcService.js : lines 49-58
Logic: If the contract has 'resets_monthly' policy and the prior makeup
  period started before the current month, makeup resets to 0.
Formula/Rule:
  IF makeup_policy == 'resets_monthly'
  AND periodStart < first_day_of_current_month
  -> priorMakeup = 0, periodStart = first_day_of_current_month
Poker context: Some staking deals reset makeup monthly to prevent students
  from being trapped in deep makeup holes. The reset boundary is the
  calendar month start.
```

```
Staking > Rounding
File: server/services/StakingCalcService.js : lines 176-178
Logic: All monetary values rounded to 2 decimal places.
Formula/Rule: round2(n) = Math.round((n + Number.EPSILON) * 100) / 100
Poker context: The EPSILON addition prevents floating-point edge cases
  (e.g. 1.005 rounding to 1.00 instead of 1.01). Correct approach.
```

## Equity Service

```
Equity > Win probability computation
File: server/game/EquityService.js : lines 38-63
Logic: Delegates to the poker-odds-calculator library to compute exact
  win/tie percentages for each active player given their hole cards and board.
Formula/Rule:
  Uses OddsCalculator.calculate(cardGroups, boardCards)
  Returns equity (0-100%) and tiePercentage for each player.
  Requires at least 2 valid players with exactly 2 hole cards each.
  Returns [] on any error (non-fatal).
Poker context: This is the equity engine used by the EquityAnalyzer for
  tags like DREW_THIN, EQUITY_FOLD, etc. It uses exhaustive enumeration
  (not Monte Carlo), so results are exact.
```

## Stats Engine -- Baseline Service

```
Stats > VPIP calculation
File: server/services/BaselineService.js : line 230
  (also: server/game/SessionManager.js : line 163)
Logic: VPIP = ratio of hands where the player voluntarily put money in preflop.
Formula/Rule:
  BaselineService: vpip = totalVpip / totalHands (from session_player_stats.vpip_count)
  SessionManager: vpip = _vpipCount / handsPlayed
  A "voluntary" action is a call or raise preflop (BB posting is not voluntary).
Poker context: VPIP is THE core stat for player profiling. Must be accurate.
  The denominator is total hands dealt, not hands where the player had an
  opportunity to act (they always do unless they're sitting out).
```

```
Stats > PFR calculation
File: server/services/BaselineService.js : line 231
  (also: server/game/SessionManager.js : line 164)
Logic: PFR = ratio of hands where the player raised preflop.
Formula/Rule:
  BaselineService: pfr = totalPfr / totalHands
  SessionManager: pfr = _pfrCount / handsPlayed
Poker context: PFR should always be <= VPIP. If PFR > VPIP something is wrong.
  Quick win: Add a PFR <= VPIP sanity check.
```

```
Stats > WTSD calculation
File: server/services/BaselineService.js : line 233
  (also: server/game/SessionManager.js : line 165)
Logic: WTSD = ratio of hands where the player went to showdown.
Formula/Rule:
  BaselineService: wtsd = totalWtsd / totalHands
  SessionManager: wtsd = _wtsdCount / handsPlayed
  ⚠️ REVIEW NEEDED: Standard WTSD is "went to showdown / saw the flop",
    not "went to showdown / total hands dealt". The denominator here
    (totalHands) includes hands the player folded preflop, which deflates
    the WTSD percentage compared to industry-standard poker trackers.
    This will show significantly lower WTSD values than PokerTracker or
    Hold'em Manager, which may confuse coaches who are used to those tools.
Poker context: WTSD measures showdown propensity. With the current
  denominator, a typical player might show 8-12% WTSD instead of the
  industry-standard 25-30%. Consider changing to saw_flop denominator.
```

```
Stats > WSD (Won at Showdown) calculation
File: server/services/BaselineService.js : line 234
  (also: server/game/SessionManager.js : line 166)
Logic: WSD = ratio of showdowns won out of showdowns reached.
Formula/Rule:
  BaselineService: wsd = totalWsd / totalWtsd
  SessionManager: wsd = _wsdCount / _wtsdCount
Poker context: WSD is correctly computed with WTSD as the denominator.
  A WSD of ~50% is typical.
```

```
Stats > Aggression factor
File: server/services/BaselineService.js : lines 91-95
  (also: server/game/SessionManager.js : lines 131-134)
Logic: Aggression factor = (bets + raises) / calls across all streets.
Formula/Rule:
  BaselineService: aggression = betsRaises / calls (if calls > 0, else 3.0 if any bets)
  SessionManager: aggFreq = raises / (raises + calls) per hand, averaged
  ⚠️ REVIEW NEEDED: BaselineService and SessionManager use DIFFERENT
    formulas for aggression!
    - BaselineService uses classic AF = (bets+raises)/calls across all actions
    - SessionManager uses per-hand raises/(raises+calls) averaged across hands
    These will produce different numbers. The BaselineService version is the
    standard "Aggression Factor"; the SessionManager version is closer to
    "Aggression Frequency". Both are valid stats but they should be labeled
    differently or unified.
  ⚠️ HARDCODED VALUE: BaselineService returns 3.0 when calls == 0 (player
    never called). This ceiling avoids infinity but is arbitrary.
Poker context: AF is a core stat. The inconsistency between live display
  (SessionManager) and historical baseline (BaselineService) means a
  coach might see different aggression numbers in different views.
```

```
Stats > C-bet flop / C-bet turn
File: server/services/BaselineService.js : lines 125-127
Logic: C-bet flop = hands where player raised preflop AND bet/raised on flop,
  divided by hands where player raised preflop.
Formula/Rule:
  cbet_flop = cbetFlopCount / pfRaiserHands
  cbet_turn = cbetTurnCount / pfRaiserHands
  Denominator = hands where the player raised preflop (pfRaiserHands)
Poker context: Standard c-bet frequency calculation. The denominator
  correctly scopes to hands where the player was the preflop aggressor.
```

```
Stats > Fold to c-bet
File: server/services/BaselineService.js : lines 117-127
Logic: Fold to c-bet = hands where player folded on the flop / hands where
  player was on the flop.
Formula/Rule:
  fold_to_cbet = foldedToCbetCount / flopFacedBet
  flopFacedBet = count of hands where the player had ANY flop action
  foldedToCbetCount = count of hands where the player folded on the flop
  ⚠️ REVIEW NEEDED: This counts ALL flop folds, not specifically folds
    facing a c-bet. A player who folds on the flop after an opponent's
    donk bet (not a c-bet) is still counted. The denominator also counts
    hands where the player checked and no bet was made (no fold opportunity).
    This over-counts the denominator and under-counts fold-to-cbet specifically.
Poker context: Fold to c-bet is an important defensive stat. The current
  approximation will show lower fold-to-cbet% than reality (diluted by
  hands where no c-bet occurred).
  Quick win: Check whether a c-bet actually occurred before counting the fold.
```

```
Stats > 3-bet percentage
File: server/services/BaselineService.js : lines 129-175
  (duplicated in: server/services/ProgressReportService.js : lines 306-348)
Logic: 3-bet% = hands where student raised after an opponent's initial raise,
  divided by hands where student faced a raise (and wasn't the opener).
Formula/Rule:
  For each hand's preflop actions (sorted by action ID):
    Find the first raiser (opener)
    IF opener == student -> skip (can't 3-bet yourself)
    ELSE -> threeBetOpps++
    IF student raised after the opener's raise -> threeBetCount++
  three_bet_pct = threeBetCount / threeBetOpps
Poker context: 3-bet% is correctly computed. The logic properly excludes
  hands where the student was the opener. Fetching ALL preflop actions
  (not just the student's) ensures correct sequence detection.
  Note: This query fetches all preflop actions for all hands in the
  period -- potential performance concern with large datasets.
```

```
Stats > Mistake rates (per 100 hands)
File: server/services/BaselineService.js : lines 203-244
Logic: Counts occurrences of each mistake tag in the player's hands and
  expresses them as a per-100-hands rate.
Formula/Rule:
  per100(count) = (count / totalHands) * 100
  Tracked: OPEN_LIMP, OVERLIMP, COLD_CALL_3BET, EQUITY_FOLD, MIN_RAISE
Poker context: Per-100 normalization allows comparison across different
  sample sizes. Used by MistakeSpikeDetector for trend detection.
```

```
Stats > BB/100 (big blinds per 100 hands)
File: server/services/BaselineService.js : lines 207-219
Logic: Converts net chip profit to big blinds per 100 hands using the
  average big blind across the player's hands.
Formula/Rule:
  avgBb = sum(hands.big_blind) / count(hands with big_blind > 0)
  bb_per_100 = (totalNet / avgBb / totalHands) * 100
Poker context: BB/100 is the standard win-rate metric in cash games.
  Using the average BB handles mixed-stakes sessions correctly.
```

## Session Quality Score

```
Quality > Composite score
File: server/services/SessionQualityService.js : lines 136-142
Logic: Computes a 0-100 session quality score from 4 weighted components.
Formula/Rule:
  score = (1 - mistake_rate) * 30
        + good_play_rate * 20
        + sizing_accuracy * 25
        + equity_score * 25
  All components clamped to [0, 1] before weighting.
  ⚠️ HARDCODED VALUES: Weights 30/20/25/25.
  ⚠️ REVIEW NEEDED: equity_score is hardcoded to 0.5 (line 132) because
    per-action equity is not stored in the DB. This means 25% of the score
    is always 12.5 points. The effective score range is 0-87.5 (from the
    other 3 components) + 12.5 (constant) = 12.5-100. A "perfect" session
    still gets 12.5 free points from the equity component.
Poker context: This score is stored in session_player_stats and displayed
  to coaches. The constant equity component deflates score variance.
  Quick win: Implement per-action equity storage, or remove the equity
  component and redistribute its weight.
```

```
Quality > Mistake rate
File: server/services/SessionQualityService.js : lines 104-108
Logic: mistake_rate = count of mistake tags / number of hands, clamped to [0,1].
Formula/Rule:
  mistakeCount = tags matching MISTAKE_TAGS set (6 tags)
  mistakeRate = clamp(mistakeCount / handIds.length, 0, 1)
  MISTAKE_TAGS: OPEN_LIMP, OVERLIMP, COLD_CALL_3BET, EQUITY_FOLD, MIN_RAISE, FOLD_TO_PROBE
Poker context: A mistake rate of 0.5 means every other hand has a mistake.
  The clamp prevents rates > 1 when multiple mistakes occur in one hand.
```

```
Quality > Good play rate
File: server/services/SessionQualityService.js : lines 104-108
Logic: good_play_rate = count of good play tags / number of hands, clamped to [0,1].
Formula/Rule:
  goodPlayCount = tags matching GOOD_PLAY_TAGS set (4 tags)
  goodPlayRate = clamp(goodPlayCount / handIds.length, 0, 1)
  GOOD_PLAY_TAGS: THIN_VALUE_RAISE, HERO_CALL, VALUE_BACKED, EQUITY_BLUFF
Poker context: Rewards skilled plays. The asymmetry (6 mistake tags vs
  4 good play tags) means mistakes are easier to accumulate than good plays.
```

```
Quality > Sizing accuracy
File: server/services/SessionQualityService.js : lines 38-47, 119-127
Logic: Fraction of bet/raise actions where the sizing falls within
  "acceptable" ranges per street.
Formula/Rule:
  sizingOk(action, street): ratio = amount / pot_at_action
    flop acceptable: [0.33, 1.0]
    turn acceptable: [0.33, 1.0]
    river acceptable: [0.50, 1.5]
    preflop: skipped (null)
  sizing_accuracy = goodSized / totalSized (default 0.5 if no data)
  ⚠️ HARDCODED VALUES: All sizing ranges.
  ⚠️ REVIEW NEEDED: The "acceptable" ranges are narrow. A 0.30 pot bet
    on the flop (common probe size) is flagged as bad sizing. An overbet
    (>1.0x pot on flop/turn) is also flagged. These ranges encode a specific
    sizing philosophy that may not match all coaching styles.
Poker context: Sizing accuracy directly affects 25% of the quality score.
  Coaches who teach overbetting as a strategy will see their students
  penalized by this metric.
  Quick win: Make these ranges configurable per school.
```

## Progress Report Service

```
Progress Report > Overall grade computation
File: server/services/ProgressReportService.js : lines 568-612
Logic: Computes a 0-100 overall progress grade from 5 weighted components.
Formula/Rule:
  1. Stat improvement (30%):
     statScore = 0.5 + (improved_count - regressed_count) / total_changes * 0.5
     "Improved" = direction correct per stat (fold_to_cbet: down = improved)
  2. Mistake reduction (30%):
     mistakeScore = 0.5 + (better_count - worse_count) / total_changes * 0.5
  3. Volume consistency (15%):
     >= 50 hands -> 1.0
     >= 20 hands -> 0.7
     >= 10 hands -> 0.4
     < 10 hands -> 0.2
  4. Scenario performance (15%):
     clean_scenarios / total_scenarios (0.5 if no data)
  5. Session quality (10%):
     quality_avg / 100 (0.5 if no data)

  grade = statScore * 30 + mistakeScore * 30 + volumeScore * 15
        + scenarioScore * 15 + qualScore * 10
  Clamped to [0, 100], rounded.
  ⚠️ HARDCODED VALUES: All weights and volume thresholds.
Poker context: This grade is the headline metric on the coach's stable
  overview. The 50/50 baseline for missing data means students with no
  scenarios or quality scores get a neutral contribution rather than
  being penalized.
```

```
Progress Report > Stat comparison significance
File: server/services/ProgressReportService.js : lines 384-403
Logic: Compares current period stats to previous period stats, flagging
  changes that represent > 10% relative shift as "significant".
Formula/Rule:
  delta = current - previous
  direction = abs(delta) < 0.005 ? 'stable' : (delta > 0 ? 'up' : 'down')
  relChange = abs(delta) / abs(previous)
  significant = relChange > 0.10
  ⚠️ HARDCODED VALUES: 0.005 stability threshold, 0.10 significance threshold.
Poker context: Identifies meaningful stat changes vs noise. A 10% relative
  change requirement prevents flagging tiny fluctuations.
```

```
Progress Report > Mistake trend direction
File: server/services/ProgressReportService.js : lines 406-415
Logic: Labels mistake rate changes as 'better', 'worse', or 'stable'.
Formula/Rule:
  delta = current_rate - previous_rate
  IF abs(delta) > 0.5 AND delta > 0 -> 'worse'
  IF abs(delta) > 0.5 AND delta < 0 -> 'better'
  ELSE -> 'stable'
  ⚠️ HARDCODED VALUE: 0.5 percentage point threshold.
Poker context: This is used in mistake trend alerts. The 0.5pp threshold
  means a change from 3.0% to 3.4% is still "stable".
```

```
Progress Report > Leak evolution
File: server/services/ProgressReportService.js : lines 430-446
Logic: Compares current leak stats to the baseline at the start of the period,
  labels as improved/worsened/stable.
Formula/Rule:
  delta = current - start_baseline
  IF delta < -0.5 -> 'improved'
  IF delta > 0.5 -> 'worsened'
  ELSE -> 'stable'
  Returns top 3 leaks sorted by starting value (highest first).
  ⚠️ HARDCODED VALUE: 0.5 threshold for both directions.
Poker context: Shows coaches whether identified leaks are getting better
  or worse over time. Top 3 keeps the report focused.
```

```
Progress Report > Quality trend detection
File: server/services/ProgressReportService.js : lines 513-519
Logic: Determines if session quality is trending up, down, or stable by
  splitting quality scores into halves and comparing averages.
Formula/Rule:
  IF fewer than 4 quality scores -> null (insufficient data)
  firstHalfAvg = avg(first half of quality scores)
  secondHalfAvg = avg(second half of quality scores)
  slope = secondHalfAvg - firstHalfAvg
  IF slope > 3 -> 'improving'
  IF slope < -3 -> 'declining'
  ELSE -> 'stable'
  ⚠️ HARDCODED VALUE: 3-point slope threshold.
Poker context: Gives coaches a quick read on whether the student's play
  is getting better or worse across sessions.
```

```
Progress Report > Hand review scoring
File: server/services/ProgressReportService.js : lines 472-488
  (duplicated in: server/services/SessionPrepService.js : lines 249-275)
Logic: Scores each hand for review value to identify the "best", "worst",
  and "most instructive" hands.
Formula/Rule:
  For each tag on the hand:
    IF tag is a mistake -> +3 points
    IF tag is a high-value mistake (EQUITY_FOLD, DREW_THIN) -> +2 bonus
    ELSE -> +1 point
  best = hand with highest net_chips
  worst = hand with lowest net_chips
  most_instructive = hand with highest review_score
  ⚠️ HARDCODED VALUES: Scoring weights 3/2/1.
Poker context: Prioritizes which hands coaches should review. The weighting
  system favors hands with multiple mistakes or high-impact mistakes.
```

```
Progress Report > Scenario success rate
File: server/services/ProgressReportService.js : lines 560-566
Logic: For each scenario, calculates the percentage of times the student
  played it without any mistake tags.
Formula/Rule:
  success_rate = round((clean_plays / total_plays) * 100)
  "clean" = no mistake tags for this student in that hand
Poker context: Tracks scenario drill progress. Coaches can see which
  scenarios the student has mastered vs still struggles with.
```

## Session Prep Service

```
Prep Brief > Leak ranking
File: server/services/SessionPrepService.js : lines 149-195
Logic: Ranks the student's stats by absolute deviation from the school-wide
  average, showing the top 3 biggest deviations.
Formula/Rule:
  school_avg[stat] = mean of all students' rolling_30d baseline for that stat
  deviation = abs(student_value - school_avg)
  trend = 'improving' if current < previous (for decreasing stats) or 'worsening'
  Return top 3 by deviation, descending.
Poker context: Identifies the student's biggest statistical outliers relative
  to peers. This is where coaches should focus attention.
  ⚠️ REVIEW NEEDED: Using absolute deviation ignores whether a deviation
    is positive or negative from a coaching perspective. A student with
    much higher PFR than average might be correctly aggressive, not "leaking".
    Consider using directional deviation (stat * sign_for_desirable_direction).
```

```
Prep Brief > Trend computation
File: server/services/SessionPrepService.js : lines 218-223
Logic: Compares current and previous 30-day baselines for each stat.
Formula/Rule:
  delta = current - previous
  IF abs(delta) < 0.005 -> 'stable'
  IF delta > 0 -> 'worsening'
  IF delta < 0 -> 'improving'
  ⚠️ REVIEW NEEDED: This assumes ALL stat increases are "worsening" (line 222).
    But for stats like PFR, aggression, and WSD, increases can be improvements.
    The function does not use a LOWER_IS_BETTER set like MilestoneDetector does.
    This means a student who improves their PFR from 15% to 20% will be
    labeled as "worsening".
Poker context: This mislabeling could mislead coaches in prep briefs.
  Quick win: Import the LOWER_IS_BETTER set from MilestoneDetector and
  use it here.
```

## Client-Side Computations

```
Leaderboard > Chips per 100 hands
File: client/src/pages/LeaderboardPage.jsx : lines 50-54
Logic: Primary leaderboard score: net chips normalized per 100 hands.
Formula/Rule: score = round(netChips / hands * 100)
  Returns null if hands == 0.
Poker context: Standard win-rate metric. Allows comparison across
  players with different sample sizes.
```

```
Leaderboard > Win rate percentage
File: client/src/pages/LeaderboardPage.jsx : lines 58-62
Logic: Win rate as percentage of hands won.
Formula/Rule: winRate = round(wins / hands * 100)
  Returns null if hands == 0.
Poker context: Supplementary metric. Less meaningful than chips/100 in
  cash games since winning many small pots can produce high win rate
  but low profit.
```

## Range Parser

```
Range Parser > Combo counting
File: server/game/RangeParser.js : lines 35-65
Logic: Enumerates specific card combinations for each range notation.
Formula/Rule:
  Pair (e.g. "AA"): 6 combos (C(4,2) suit combinations)
  Suited (e.g. "AKs"): 4 combos (one per suit)
  Offsuit (e.g. "AKo"): 12 combos (4 suits * 3 non-matching suits)
  Both (e.g. "AK"): 16 combos (4 suited + 12 offsuit)
Poker context: Correct combinatorics. Used by the scenario builder
  to deal hands from specified ranges.
```

## Board Generator

```
Board Generator > Dry board generation
File: server/game/BoardGenerator.js : lines 124-144
Logic: Generates a 3-card flop with no pair, rainbow suits, and no
  straight draw potential. Uses rejection sampling (up to 200 attempts).
Formula/Rule:
  Constraints: 3 unique ranks, 3 unique suits, no two ranks within 4 of
  each other (prevents any straight draw).
  ⚠️ HARDCODED VALUE: MAX_RETRY = 200, gap threshold = 3 (indices within 3).
  ⚠️ REVIEW NEEDED: The "no straight draw" check (indices[1]-indices[0] <= 3)
    prevents boards like 7-9-K from being classified as "dry" even though
    7-9 has a 2-gap. In poker, a board needs cards within 4 rank steps
    for a straight draw, so the <= 3 check is correct for preventing
    one-card straight draws. However, two-card straight draws (needing
    specific runouts) are not checked.
Poker context: Used by the scenario builder to create specific board textures
  for training drills.
```

```
Board Generator > Wet board generation
File: server/game/BoardGenerator.js : lines 146-166
Logic: Generates a 3-card flop that is "wet" -- has at least 2 of:
  flush draw, straight draw, paired.
Formula/Rule:
  wetScore = (hasFlushDraw ? 1 : 0) + (hasStraightDraw ? 1 : 0) + (isPaired ? 1 : 0)
  IF wetScore >= 2 -> accept as wet
  Flush draw = any 2+ cards share a suit
  Straight draw = any 2 ranks within 3 indices
  Paired = any 2 cards share a rank
  ⚠️ HARDCODED VALUE: MAX_RETRY = 200, wetScore >= 2 threshold.
Poker context: Wet boards are common in real play and require different
  strategies. Good for training students on draw-heavy boards.
```

## Blind Schedule (Tournament)

```
Tournament > Blind schedule timing
File: server/game/controllers/BlindSchedule.js : lines 24-29
Logic: Tracks time remaining in the current blind level.
Formula/Rule:
  elapsed = now - levelStartTime
  remaining = max(0, duration_minutes * 60000 - elapsed)
Poker context: Standard tournament blind clock. Each level has a
  duration in minutes and SB/BB/ante amounts.
```

---

# CROSS-CUTTING OBSERVATIONS

## Analyzer Design Observations

1. **SLOWPLAY checks flop/turn but not river** (handStrength.js:22). If a player has a monster on the river and checks, that's also a slowplay. The omission may be intentional (river is the last street, so checking the river with a monster is less clearly a mistake since there's no future street to extract value on), but it's undocumented.

2. **C_BET fires as both hand-level and player-level tag.** PostflopAnalyzer emits `C_BET` (hand-level, no player_id), while PositionalAnalyzer emits `C_BET_IP`/`C_BET_OOP` (player-level). Both fire on the same hand when conditions are met. The dedup layer in AnalyzerService keeps both since they have different tag names. This is correct but means a single c-bet generates 2 tags.

3. **MIN_RAISE breaks on first occurrence across all streets** (`break outer` at mistakes.js:109). Only one MIN_RAISE tag fires per hand, even if the player min-raises on multiple streets. FOLD_TO_PROBE does NOT break across streets, so multiple FOLD_TO_PROBE tags can fire in one hand. The inconsistency may confuse per-100-hand rate calculations.

4. **Sizing tags skip all-in actions** since `amount = 0` for all-in bets in the game engine (the amount field represents the raise-to amount, and all-in uses a special action type). This means all-in shoves get no sizing classification, which is arguably correct (they're not a sizing choice) but should be documented.

## Quick Wins Identified

| Domain | Quick Win | Effort |
|--------|-----------|--------|
| Stats | Fix WTSD denominator to use "saw flop" instead of "total hands" | Small |
| Stats | Unify aggression formula between SessionManager and BaselineService | Small |
| Stats | Add PFR <= VPIP sanity check | Trivial |
| Stats | Fix fold_to_cbet to only count folds facing an actual c-bet | Medium |
| Quality | Implement per-action equity or remove equity component from score | Medium |
| Quality | Make sizing accuracy ranges configurable per school | Medium |
| Prep Brief | Fix `_computeTrend` to use LOWER_IS_BETTER set for directional labeling | Small |
| Detectors | Replace stddev approximation with real variance in student_baselines | Medium |
| Detectors | Fix MilestoneDetector to check weekly periods, not just session count | Small |
| Bots | Use EquityService for hard bot call/fold decisions | Medium |
| Bots | Add preflop opening ranges for medium/hard bots | Medium |
| Tags | Make equity thresholds (25%, 30%, 50%, 70%) configurable | Small |
| Tags | Review MIN_RAISE detection logic (2x threshold is generous) | Small |

## Hardcoded Value Summary

All thresholds, weights, and magic numbers are hardcoded as constants in the
source files. None are configurable via database or environment variables.
Key values a poker coach should validate:

| Value | Where | Current |
|-------|-------|---------|
| Sizing buckets | tagAnalyzers/sizing.js | <0.25, 0.25-0.49, 0.50-0.79, 0.80-1.10, 1.10-2.00, >2.00 |
| Whale pot | tagAnalyzers/potType.js | >150 BB |
| Short stack | tagAnalyzers/potType.js | <20 BB |
| Deep stack | tagAnalyzers/potType.js | >100 BB |
| Drew thin | tagAnalyzers/equity.js | <25% equity |
| Value backed | tagAnalyzers/equity.js | >70% equity |
| Equity bluff | tagAnalyzers/equity.js | <30% equity |
| Equity fold | tagAnalyzers/equity.js | >50% equity |
| Fold to probe | tagAnalyzers/mistakes.js | bet < 25% pot |
| Min raise | tagAnalyzers/mistakes.js | raise <= 2x last bet |
| Session quality weights | SessionQualityService.js | 30/20/25/25 |
| Sizing accuracy ranges | SessionQualityService.js | flop [0.33, 1.0], turn [0.33, 1.0], river [0.50, 1.5] |
| Overall grade weights | ProgressReportService.js | 30/30/15/15/10 |
| Volume thresholds | ProgressReportService.js | 50/20/10 hands |
| Inactivity days | InactivityDetector.js | 5 days |
| Losing streak | LosingStreakDetector.js | 3 sessions |
| Mistake spike ratio | MistakeSpikeDetector.js | 1.5x baseline |
| Z-score threshold | RegressionDetector.js | 2.0 |
| Volume drop | VolumeDropDetector.js | 50% of average |
| Improvement threshold | MilestoneDetector.js | 0.03 (3pp) |
| ICM Monte Carlo iters | IcmService.js | 5000 |
| Bot call thresholds | BotDecisionService.js | easy 30%, medium 20%, hard 15% |
| Default starting stack | GameManager.js | 100 BB |
| Aggression cap | BaselineService.js | 3.0 when calls = 0 |
| Alert severity floor | AlertService.js | 0.2 (20%) |
| Tournament manager grace | TournamentController.js | 10,000 ms |
| Role steal rank map | TournamentController.js | superadmin=3, admin=2, coach=1 |

---

## CROSS-CUTTING ISSUES (added from sub-agent findings)

### Active Player Counting Mismatch
- **TournamentController** counts active players as `stack > 0 AND in_hand !== false`
- **TournamentGroupController** counts active players as `stack > 0` only (ignores `in_hand`)
- Risk: Table rebalancing triggers while players are mid-hand, or tournament declared over prematurely

### MISTAKE_TAGS List Divergence
Three services maintain independent MISTAKE_TAGS lists:
| Service | Tags |
|---|---|
| BaselineService.js | OPEN_LIMP, OVERLIMP, COLD_CALL_3BET, EQUITY_FOLD, MIN_RAISE |
| SessionQualityService.js | OPEN_LIMP, OVERLIMP, COLD_CALL_3BET, EQUITY_FOLD, MIN_RAISE, FOLD_TO_PROBE |
| MistakeSpikeDetector.js | OPEN_LIMP, OVERLIMP, LIMP_RERAISE, COLD_CALL_3BET, FOLD_TO_PROBE, MIN_RAISE, EQUITY_FOLD, DREW_THIN, UNDO_USED |

If one list is updated without the others, quality scores diverge from baseline stats and alerts.
**Quick win**: Extract a shared `MISTAKE_TAGS` constant into a common module.
