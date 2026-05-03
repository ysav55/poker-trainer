/* ── BoardCards.jsx ─────────────────────────────────────────────────────────
   Reimagined community card row. Treats the board like a "story strip":
   tall slab reserves, phase progress indicator above, each revealed card
   flips in with a slight cascade delay.
─────────────────────────────────────────────────────────────────────────── */

const PHASE_ORDER = ['preflop', 'flop', 'turn', 'river', 'showdown'];
const REVEALED_BY_PHASE = {
  waiting: 0, preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5, replay: 5,
};

function BoardCards({ board = [], phase = 'waiting', T, potDisplay, bigBlind, bbView }) {
  const revealed = REVEALED_BY_PHASE[phase] ?? 0;
  const slots = Array.from({ length: 5 }, (_, i) => board[i] ?? null);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      position: 'relative',
    }}>
      {/* Phase strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {['PRE', 'FLOP', 'TURN', 'RIVER'].map((label, idx) => {
          const idxMap = ['preflop', 'flop', 'turn', 'river'];
          const curIdx = PHASE_ORDER.indexOf(phase);
          const thisIdx = PHASE_ORDER.indexOf(idxMap[idx]);
          const active = phase === idxMap[idx];
          const done = curIdx > thisIdx;
          return (
            <React.Fragment key={label}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
                color: active ? T.accent : done ? T.textDim : T.textMuted,
                fontFamily: "'JetBrains Mono', monospace",
                transition: 'color 300ms',
              }}>{label}</span>
              {idx < 3 && (
                <span style={{
                  width: 14, height: 1,
                  background: done ? T.accent : T.border,
                  opacity: done ? 0.7 : 1,
                }}/>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Pot display — large, confident */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 2, minHeight: 46,
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.28em',
          color: T.textMuted,
        }}>TOTAL POT</div>
        <div style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: 30, fontWeight: 400, lineHeight: 1,
          color: T.text, letterSpacing: '-0.02em',
          fontFeatureSettings: '"tnum"',
        }}>
          {potDisplay}
        </div>
      </div>

      {/* Card slots */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {slots.map((c, i) => {
          const isRevealed = i < revealed && c;
          if (isRevealed) {
            return <Card key={i} card={c} theme={T} size="md" flipDelay={i * 80}/>;
          }
          return (
            <div key={i} style={{
              width: 56, height: 80, borderRadius: 8,
              border: `1px dashed ${T.border}`,
              background: 'rgba(255,255,255,0.02)',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: T.textMuted, fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                opacity: 0.5,
              }}>{i + 1}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.BoardCards = BoardCards;
