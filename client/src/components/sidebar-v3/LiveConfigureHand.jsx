import React, { useState, useMemo, useEffect } from 'react';
import { MiniCard, Segmented } from './shared.jsx';

const CH_RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const CH_SUITS = ['s','h','d','c'];
const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };

const TEXTURE_GROUPS = [
  { label: 'SUIT',    tags: ['rainbow','flush_draw','monotone'] },
  { label: 'PAIR',    tags: ['unpaired','paired','trips'] },
  { label: 'CONNECT', tags: ['connected','one_gap','disconnected'] },
  { label: 'HIGH',    tags: ['broadway','mid','low','ace_high'] },
  { label: 'FEEL',    tags: ['wet','dry'] },
];
const TEXTURE_LABELS = {
  rainbow: 'Rainbow', flush_draw: 'FD', monotone: 'Monotone',
  unpaired: 'Unpaired', paired: 'Paired', trips: 'Trips',
  connected: 'Connected', one_gap: '1-Gap', disconnected: 'Disconn.',
  broadway: 'Broadway', mid: 'Mid', low: 'Low', ace_high: 'A-high',
  wet: 'Wet', dry: 'Dry',
};
const TEX_GROUP_OF = {};
TEXTURE_GROUPS.forEach(({ tags }, i) => tags.forEach((t) => { TEX_GROUP_OF[t] = i; }));

const BOARD_LABELS = ['F1','F2','F3','TURN','RIVER'];

function prune(obj, keepKeys) {
  let changed = false;
  const next = {};
  for (const k of Object.keys(obj)) {
    if (keepKeys.has(k)) next[k] = obj[k];
    else changed = true;
  }
  return changed ? next : obj;
}

function rangeKeyToCombos(combo) {
  const RANK_LIST = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const SUIT_LIST = ['s','h','d','c'];
  if (combo.length === 2) {
    const out = [];
    for (let i = 0; i < SUIT_LIST.length; i++) {
      for (let j = i + 1; j < SUIT_LIST.length; j++) {
        out.push([combo[0] + SUIT_LIST[i], combo[1] + SUIT_LIST[j]]);
      }
    }
    return out;
  }
  if (combo.endsWith('s')) {
    return SUIT_LIST.map((s) => [combo[0] + s, combo[1] + s]);
  }
  if (combo.endsWith('o')) {
    const out = [];
    for (const a of SUIT_LIST) for (const b of SUIT_LIST) {
      if (a !== b) out.push([combo[0] + a, combo[1] + b]);
    }
    return out;
  }
  void RANK_LIST;
  return [];
}

export default function ConfigureHand({ data, emit }) {
  const { gameState } = data;
  const phase = gameState.phase;
  // 'waiting' phase + open config_phase → applied immediately on the server.
  // Any other phase → server queues onto pendingHandConfig and consumes it at
  // the next resetForNextHand. Either way the click is valid.
  const isBetweenHands = phase === 'waiting';
  const isQueued = !!gameState.pending_hand_config;
  const [applied, setApplied] = useState(false);

  const [mode, setMode] = useState('hybrid');
  const [target, setTarget] = useState(null);
  const [slot, setSlot] = useState(0);
  const [inputMode, setInputMode] = useState({});
  const [granted, setGranted] = useState({});
  const [ranges, setRanges] = useState({});
  const [board, setBoard] = useState([null, null, null, null, null]);
  const [textures, setTextures] = useState([]);

  const usedCards = useMemo(() => {
    const used = new Set(board.filter(Boolean));
    Object.values(granted).forEach((pair) => pair.forEach((c) => c && used.add(c)));
    gameState.players.forEach((p) => {
      (p.hole_cards || []).forEach((c) => { if (c && c !== 'HIDDEN') used.add(c); });
    });
    return used;
  }, [board, granted, gameState]);

  // Drop overrides for players who have left the table. Without this, granted/ranges
  // grow unbounded and stale config from a departed player's stableId could be sent
  // on the next applyConfig (silently dropped server-side, but still bloat).
  useEffect(() => {
    const liveStableIds = new Set(gameState.players.map((p) => p.stableId));
    setGranted((prev) => prune(prev, liveStableIds));
    setRanges((prev) => prune(prev, liveStableIds));
    setInputMode((prev) => prune(prev, liveStableIds));
    setTarget((prev) => (prev && prev !== 'board' && !liveStableIds.has(prev) ? null : prev));
  }, [gameState.players]);

  function pickCard(card) {
    if (!target) return;
    if (target === 'board') {
      setBoard((prev) => {
        const next = [...prev];
        next[slot] = card;
        return next;
      });
      setSlot((s) => Math.min(4, s + 1));
    } else {
      setGranted((prev) => {
        const cur = prev[target] || [null, null];
        const next = [...cur];
        next[slot] = card;
        return { ...prev, [target]: next };
      });
      setSlot((s) => (s === 0 ? 1 : 0));
    }
  }

  function clearAll() {
    setGranted({}); setRanges({}); setBoard([null, null, null, null, null]); setTextures([]); setTarget(null);
    setApplied(false);
  }

  function applyConfig() {
    if (!emit?.updateHandConfig) return;
    const stableToId = {};
    gameState.players.forEach((p) => { stableToId[p.stableId] = p.id; });
    const hole_cards = {};
    Object.entries(granted).forEach(([sid, pair]) => {
      const pid = stableToId[sid];
      if (pid) hole_cards[pid] = pair;
    });
    const hole_cards_combos = {};
    Object.entries(ranges).forEach(([sid, cells]) => {
      const pid = stableToId[sid];
      if (pid) hole_cards_combos[pid] = Object.keys(cells).flatMap(rangeKeyToCombos);
    });
    emit.updateHandConfig({
      mode,
      hole_cards,
      hole_cards_combos,
      board,
      board_texture: textures,
    });
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  }

  function clearTarget() {
    if (!target) return;
    if (target === 'board') {
      setBoard([null, null, null, null, null]);
      setTextures([]);
    } else {
      setGranted((prev) => { const n = { ...prev }; delete n[target]; return n; });
      setRanges((prev) => { const n = { ...prev }; delete n[target]; return n; });
    }
  }

  function toggleTexture(tag) {
    setTextures((prev) => {
      const groupIdx = TEX_GROUP_OF[tag];
      const filtered = prev.filter((t) => TEX_GROUP_OF[t] !== groupIdx);
      if (prev.includes(tag)) return filtered;
      return [...filtered, tag];
    });
  }

  const targetIsPlayer = target && target !== 'board';
  const targetPair = targetIsPlayer ? (granted[target] || [null, null]) : board;
  const targetRangeCells = targetIsPlayer ? (ranges[target] || {}) : null;
  const targetMode = targetIsPlayer ? (inputMode[target] || 'cards') : 'cards';

  function setTargetMode(m) {
    if (!targetIsPlayer) return;
    setInputMode((prev) => ({ ...prev, [target]: m }));
  }

  function toggleRangeCell(combo) {
    if (!targetIsPlayer) return;
    setRanges((prev) => {
      const cur = { ...(prev[target] || {}) };
      if (cur[combo]) delete cur[combo]; else cur[combo] = true;
      return { ...prev, [target]: cur };
    });
  }

  const playerKicker = (() => {
    const setCount = Object.keys(granted).length + Object.keys(ranges).length;
    const boardCount = board.filter(Boolean).length;
    const texCount = textures.length;
    const parts = [];
    if (setCount) parts.push(`${setCount} player${setCount === 1 ? '' : 's'}`);
    if (boardCount) parts.push(`${boardCount}/5 board`);
    if (texCount) parts.push(`${texCount} tex`);
    return parts.length ? parts.join(' · ') : 'no overrides';
  })();

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Configure Hand</div>
        <div className="card-kicker" style={isQueued ? { color: 'var(--accent-hot)' } : null}>
          {isQueued ? '⏱ queued for next hand' : playerKicker}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <Segmented
          cols={3}
          options={[
            { value: 'rng',    label: 'RNG' },
            { value: 'manual', label: 'Manual' },
            { value: 'hybrid', label: 'Hybrid' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 5, lineHeight: 1.4 }}>
          {mode === 'rng' && 'All cards dealt randomly — overrides ignored.'}
          {mode === 'manual' && 'Every card you set below; rest stay blank.'}
          {mode === 'hybrid' && 'Use the cards & textures you set; RNG fills the rest.'}
        </div>
      </div>

      <div className="lbl" style={{ marginBottom: 5 }}>Target</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 9 }}>
        {gameState.players.filter((p) => p.in_hand).map((p) => {
          const isOn = target === p.stableId;
          const set = (granted[p.stableId] || []).filter(Boolean).length;
          const rangeSize = Object.keys(ranges[p.stableId] || {}).length;
          const hasRange = rangeSize > 0;
          return (
            <button
              key={p.stableId}
              className={'chip' + (isOn ? ' active' : '')}
              onClick={() => {
                if (isOn) { setTarget(null); }
                else {
                  setTarget(p.stableId);
                  setSlot(set === 1 ? 1 : 0);
                }
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              {p.name.split(' ')[0]}
              {set > 0 && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: isOn ? '#1a1208' : 'var(--ok)' }}>{set}/2</span>
              )}
              {hasRange && !set && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: isOn ? '#1a1208' : 'var(--info)' }}>{rangeSize}c</span>
              )}
            </button>
          );
        })}

        <button
          className={'chip' + (target === 'board' ? ' active' : '')}
          onClick={() => {
            if (target === 'board') setTarget(null);
            else { setTarget('board'); setSlot(board.findIndex((c) => !c) === -1 ? 0 : board.findIndex((c) => !c)); }
          }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            borderColor: target === 'board' ? 'var(--accent)' : 'rgba(106,168,255,0.35)',
            color: target === 'board' ? undefined : 'var(--info)',
          }}
        >
          BOARD
          {board.filter(Boolean).length > 0 && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: target === 'board' ? '#1a1208' : 'var(--ok)' }}>
              {board.filter(Boolean).length}/5
            </span>
          )}
        </button>
      </div>

      {target && (
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 7, padding: '9px 10px 10px' }}>
          <div className="row between" style={{ marginBottom: 7 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>
              {target === 'board' ? 'Board cards' : 'Hole cards'}
            </span>
            {targetIsPlayer ? (
              <div style={{ display: 'flex', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: 1 }}>
                {[
                  { v: 'cards', l: 'Cards' },
                  { v: 'range', l: 'Range' },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setTargetMode(opt.v)}
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                      padding: '3px 8px',
                      background: targetMode === opt.v ? 'rgba(201,163,93,0.18)' : 'transparent',
                      color: targetMode === opt.v ? 'var(--accent-hot)' : 'var(--ink-faint)',
                      border: 'none', borderRadius: 3, cursor: 'pointer',
                    }}
                  >{opt.l}</button>
                ))}
              </div>
            ) : (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-dim)' }}>{BOARD_LABELS[slot] || ''}</span>
            )}
          </div>

          {(targetIsPlayer ? targetMode === 'cards' : true) && (
            <div className="row" style={{ gap: 4, marginBottom: 9 }}>
              {(targetIsPlayer ? [0, 1] : [0, 1, 2, 3, 4]).map((i) => {
                const card = targetPair[i];
                const isActive = slot === i;
                return (
                  <button
                    key={i}
                    onClick={() => setSlot(i)}
                    style={{
                      flex: 1, height: targetIsPlayer ? 44 : 38,
                      background: isActive ? 'rgba(201,163,93,0.12)' : 'var(--bg-2)',
                      border: `1.5px ${card ? 'solid' : 'dashed'} ${isActive ? 'var(--accent)' : 'var(--line-strong)'}`,
                      borderRadius: 6, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      padding: 0, gap: 2,
                    }}
                  >
                    {!targetIsPlayer && (
                      <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--ink-faint)', textTransform: 'uppercase', lineHeight: 1 }}>
                        {BOARD_LABELS[i]}
                      </span>
                    )}
                    {card ? <MiniCard code={card} /> : <span style={{ color: 'var(--ink-faint)', fontSize: 16 }}>?</span>}
                  </button>
                );
              })}
              <button className="btn ghost sm" style={{ alignSelf: 'stretch' }} onClick={clearTarget} title="Clear this target">×</button>
            </div>
          )}

          {targetIsPlayer && targetMode === 'range' ? (
            <RangeMatrix selected={targetRangeCells} onToggle={toggleRangeCell} />
          ) : (
            <CardGrid usedCards={usedCards} onPick={pickCard} />
          )}

          {target === 'board' && (
            <div style={{ marginTop: 10 }}>
              <div className="lbl" style={{ marginBottom: 5 }}>Texture (constrains empty slots)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {TEXTURE_GROUPS.map((grp) => (
                  <div key={grp.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700, color: 'var(--ink-faint)', letterSpacing: '0.18em', minWidth: 46 }}>
                      {grp.label}
                    </span>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {grp.tags.map((tag) => {
                        const isOn = textures.includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => toggleTexture(tag)}
                            className={'chip' + (isOn ? ' active' : ' ghost')}
                            style={{ fontSize: 9, padding: '2px 7px' }}
                          >{TEXTURE_LABELS[tag]}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ gap: 6, marginTop: 9 }}>
        <button className="btn ghost sm" onClick={clearAll} style={{ flex: 1 }}>Clear All</button>
        <button
          className="btn sm primary"
          style={{ flex: 1.4 }}
          onClick={applyConfig}
          disabled={!emit?.updateHandConfig}
          title={isBetweenHands ? 'Apply config now (phase: waiting)' : 'Queue for next hand — server applies at hand reset'}
        >
          {applied
            ? (isBetweenHands ? '✓ Applied' : '✓ Queued')
            : (isBetweenHands ? 'Apply Now' : 'Apply Next Hand')}
        </button>
      </div>
    </div>
  );
}

function CardGrid({ usedCards, onPick }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 2 }}>
      {CH_SUITS.flatMap((suit) => CH_RANKS.map((rank) => {
        const code = rank + suit;
        const used = usedCards.has(code);
        const red = suit === 'h' || suit === 'd';
        return (
          <button
            key={code}
            disabled={used}
            onClick={() => onPick(code)}
            title={code}
            style={{
              height: 22,
              background: used ? 'rgba(255,255,255,0.02)' : 'var(--bg-2)',
              border: `1px solid ${used ? 'transparent' : 'var(--line)'}`,
              borderRadius: 3,
              color: used ? 'var(--ink-faint)' : (red ? 'var(--bad)' : 'var(--ink)'),
              fontFamily: 'var(--sans)',
              fontSize: 9, fontWeight: 700,
              cursor: used ? 'not-allowed' : 'pointer',
              padding: 0, lineHeight: 1,
              opacity: used ? 0.35 : 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              if (!used) {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.background = 'rgba(201,163,93,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!used) {
                e.currentTarget.style.borderColor = 'var(--line)';
                e.currentTarget.style.background = 'var(--bg-2)';
              }
            }}
          >{rank}{SUIT_GLYPH[suit]}</button>
        );
      }))}
    </div>
  );
}

function RangeMatrix({ selected, onToggle }) {
  const totalCombos = useMemo(() => {
    let n = 0;
    for (const k in selected) {
      if (k.length === 2) n += 6;
      else if (k.endsWith('s')) n += 4;
      else n += 12;
    }
    return n;
  }, [selected]);
  const pct = ((totalCombos / 1326) * 100).toFixed(1);

  const QUICK = [
    { l: 'Top 5%',  combos: ['AA','KK','QQ','JJ','TT','99','AKs','AKo','AQs'] },
    { l: 'Top 15%', combos: ['AA','KK','QQ','JJ','TT','99','88','77','66','AKs','AKo','AQs','AQo','AJs','AJo','ATs','KQs','KQo','KJs'] },
    { l: 'Pairs',   combos: ['AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22'] },
    { l: 'Suited',  combos: 'all_suited' },
  ];

  function applyQuick(q) {
    const next = {};
    if (q.combos === 'all_suited') {
      for (let i = 0; i < CH_RANKS.length; i++) {
        for (let j = 0; j < CH_RANKS.length; j++) {
          if (i < j) next[`${CH_RANKS[i]}${CH_RANKS[j]}s`] = true;
        }
      }
    } else {
      q.combos.forEach((c) => { next[c] = true; });
    }
    Object.keys(selected).forEach((k) => onToggle(k));
    Object.keys(next).forEach((k) => onToggle(k));
  }

  function clear() {
    Object.keys(selected).forEach((k) => onToggle(k));
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1 }}>
        {CH_RANKS.map((r1, i) =>
          CH_RANKS.map((r2, j) => {
            let combo;
            if (i === j) combo = r1 + r2;
            else if (i < j) combo = r1 + r2 + 's';
            else combo = r2 + r1 + 'o';
            const isOn = !!selected[combo];
            const isPair = i === j;
            const isSuited = i < j;

            const baseColor = isPair ? 'rgba(240,208,96,0.16)'
              : isSuited ? 'rgba(106,168,255,0.10)'
              : 'rgba(155,124,255,0.08)';
            const borderColor = isPair ? 'rgba(240,208,96,0.3)'
              : isSuited ? 'rgba(106,168,255,0.22)'
              : 'rgba(155,124,255,0.18)';

            return (
              <button
                key={i + '-' + j}
                onClick={() => onToggle(combo)}
                title={combo}
                style={{
                  aspectRatio: '1',
                  background: isOn ? 'var(--accent)' : baseColor,
                  border: `1px solid ${isOn ? 'var(--accent-hot)' : borderColor}`,
                  borderRadius: 2,
                  color: isOn ? '#1a1208' : 'var(--ink)',
                  fontFamily: 'var(--sans)',
                  fontSize: 7.5, fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0, lineHeight: 1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 0,
                }}
              >{combo.replace(/[so]$/, '')}</button>
            );
          })
        )}
      </div>

      <div className="row between" style={{ marginTop: 7 }}>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {QUICK.map((q) => (
            <button
              key={q.l}
              className="chip ghost"
              onClick={() => applyQuick(q)}
              style={{ fontSize: 9, padding: '2px 7px' }}
            >{q.l}</button>
          ))}
          <button
            className="chip ghost"
            onClick={clear}
            style={{ fontSize: 9, padding: '2px 7px', color: 'var(--bad)', borderColor: 'rgba(224,104,104,0.3)' }}
          >Clear</button>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>
          {totalCombos} combos · {pct}%
        </span>
      </div>
    </>
  );
}
