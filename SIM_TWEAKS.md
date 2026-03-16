# Simulation Tuning Log

All timing changes made to `simulate_batches.js` relative to the original defaults.
Revert by restoring the values in the **Original** column.

| Location in file | Parameter | Original | Current | Rationale |
|---|---|---|---|---|
| `playHand` → `nextState` default | game_state wait timeout | `3000` ms | `1500` ms | localhost round-trip < 5ms; 1.5s is still generous for DB writes |
| `playManualHand` → `nextState` default | game_state wait timeout | `4000` ms | `1500` ms | same |
| `playHand` `finally` block | reset fallback timer | `1500` ms → `2000` ms | `400` ms | server emits waiting in <10ms on localhost; fallback only needed if reset fails |
| `playManualHand` `finally` block | reset fallback timer | `1500` ms → `2000` ms | `400` ms | same |
| `playManualHand` before `open_config_phase` | settle delay | `150` ms | `30` ms | just a yield to flush the queue; 30ms is plenty |
| `playManualHand` after `update_hand_config` | config propagation delay | `100` ms | `20` ms | server processes synchronously; minimal yield needed |
| `setStack` helper | stack-adjust settle | `80` ms | `20` ms | adjust_stack is synchronous in GameManager |
| `runBatch` after teardown | between-batch pause | `300` ms | `80` ms | just lets TTL/socket cleanup start; not blocking |

## Bug Fixes Applied (not timer tweaks — do NOT revert these)

| Fix | Location | Before | After |
|---|---|---|---|
| Manual config detection | `playManualHand` config wait loop | `s.phase === 'config'` | `s.config_phase === true` |
| sync_error classification | `onServerError` in `playHand` | counted as crash | counted as anomaly only |
| Raise amount formula | `pickAction` | `amount = min_raise + extra` (below minimum) | `amount = current_bet + min_raise + extra` (correct total) |
| All-in runout stall | `playHand` + `playManualHand` null-turn branch | waited for 3 consecutive null states before emitting `force_next_street`; called `nextState()` after first null → 1.5s timeout | emit `force_next_street` immediately on first null `current_turn` |

## Notes
- These values are tuned for **localhost** only. Real-network deployments need higher timeouts.
- The `nextState` fallback timer is the biggest time-saver: each crash cost 3–8s under old values vs ~1.5s now.
- Manual config batches (B11–B20, B24) still crash 100% — see open issue: `open_config_phase` hangs. Timer reduction doesn't fix that root cause.
- To revert all: restore the Original column values in `simulate_batches.js`.
