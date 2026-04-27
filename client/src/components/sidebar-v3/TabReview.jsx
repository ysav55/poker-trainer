import React, { useState } from 'react';
import { MiniCard } from './shared.jsx';

export default function TabReview({ data, selectedHandId, onBack }) {
  const r = data.review;
  const [currentStreet, setCurrentStreet] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [branchOpen, setBranchOpen] = useState(null);

  // Phase 3 wire-up captures selectedHandId from TabHistory clicks. Phase 4
  // will load replay state via the existing useReplay hook + load_replay
  // socket event. Until then, surface that the selection registered so the
  // click-from-History handoff isn't a dead end.
  if (selectedHandId && !r.loaded) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 28 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700, marginBottom: 10 }}>
          Hand selected
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-dim)', wordBreak: 'break-all', marginBottom: 14 }}>
          {selectedHandId}
        </div>
        <div style={{ color: 'var(--ink-dim)', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
          Replay loading + decision-tree branching wires up in Phase 4 (uses the existing <code style={{ fontFamily: 'var(--mono)' }}>load_replay</code> socket event).
        </div>
        <button className="btn" onClick={onBack}>← Back to Live</button>
      </div>
    );
  }

  if (!r.loaded) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 10 }}>
          No hand loaded
        </div>
        <div style={{ color: 'var(--ink-dim)', fontSize: 12, marginBottom: 14 }}>
          Pick a hand from History to review and branch.
        </div>
        <button className="btn primary" onClick={onBack}>Open History</button>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ padding: '11px 12px 10px' }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--accent)', lineHeight: 1 }}>Hand #{r.handNumber}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: r.result.heroWon ? 'var(--ok)' : 'var(--bad)', fontWeight: 700 }}>
              {r.result.heroWon ? '+' : ''}{r.result.net}
            </span>
          </div>
          <button className="btn ghost sm" onClick={onBack}>← Live</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Hero</div>
            <div style={{ display: 'flex' }}>
              {r.heroHand.map((c, i) => <MiniCard key={i} code={c} />)}
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: 'var(--line)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Board</div>
            <div style={{ display: 'flex' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                r.board[i] ? <MiniCard key={i} code={r.board[i]} /> : <MiniCard key={i} ghost />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '10px 12px' }}>
        <div className="card-head" style={{ marginBottom: 8 }}>
          <div className="card-title">Replay</div>
          <div className="card-kicker">{r.streets[currentStreet].name.split('·')[0].trim()}</div>
        </div>
        <div className="row" style={{ gap: 5 }}>
          <button className="btn sm" disabled={currentStreet === 0} onClick={() => setCurrentStreet((s) => Math.max(0, s - 1))}>‹ Prev</button>
          <button className="btn sm primary full" onClick={() => setPlaying((p) => !p)}>
            {playing ? '❚❚ Pause' : '▶ Play Street'}
          </button>
          <button className="btn sm" disabled={currentStreet === r.streets.length - 1} onClick={() => setCurrentStreet((s) => Math.min(r.streets.length - 1, s + 1))}>Next ›</button>
        </div>
        <div className="row" style={{ gap: 4, marginTop: 10 }}>
          {r.streets.map((s, i) => (
            <button
              key={i}
              onClick={() => setCurrentStreet(i)}
              style={{
                flex: 1, height: 24,
                border: `1px solid ${i === currentStreet ? 'var(--accent)' : 'var(--line)'}`,
                background: i <= currentStreet ? 'rgba(201,163,93,0.12)' : 'transparent',
                borderRadius: 6, cursor: 'pointer',
                color: i === currentStreet ? 'var(--accent-hot)' : 'var(--ink-dim)',
                fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
              }}
            >{s.name.split('·')[0].trim()}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ flex: 1 }}>
        <div className="card-head">
          <div className="card-title">Decision Tree</div>
          <div className="card-kicker">branch hero spots</div>
        </div>
        <div style={{ position: 'relative', paddingLeft: 12 }}>
          <div style={{ position: 'absolute', left: 3, top: 6, bottom: 6, width: 1, background: 'var(--line-strong)' }} />
          {r.streets.slice(0, currentStreet + 1).map((street, si) => (
            <div key={si} style={{ marginBottom: 12 }}>
              <div style={{ position: 'relative', fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 7, marginLeft: -4 }}>
                <span style={{ position: 'absolute', left: -11, top: 4, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
                {street.name}
              </div>
              {street.nodes.map((node) => (
                <div key={node.id}>
                  <div
                    onClick={() => node.branchable && setBranchOpen(branchOpen === node.id ? null : node.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px 1fr auto',
                      alignItems: 'baseline', gap: 8,
                      padding: '5px 2px', fontSize: 12,
                      cursor: node.branchable ? 'pointer' : 'default',
                      color: node.isHero ? 'var(--accent-hot)' : 'var(--ink)',
                      fontWeight: node.isHero ? 600 : 400,
                    }}
                  >
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: node.isHero ? 'var(--accent)' : 'var(--ink-faint)', letterSpacing: '0.04em' }}>{node.who}</span>
                    <span>{node.act}</span>
                    {node.branchable && (
                      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent)', padding: '2px 6px', border: '1px solid var(--accent-dim)', borderRadius: 999 }}>branch</span>
                    )}
                  </div>
                  {branchOpen === node.id && node.branches && (
                    <div style={{ marginLeft: 60, marginTop: 4, marginBottom: 6, padding: '8px 10px', background: 'rgba(155,124,255,0.06)', border: '1px solid rgba(155,124,255,0.25)', borderRadius: 6 }}>
                      <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: 6 }}>Branch from here</div>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {node.branches.map((b) => (
                          <span key={b} className="chip" style={{ background: 'rgba(155,124,255,0.1)', borderColor: 'rgba(155,124,255,0.35)', color: 'var(--purple)' }}>{b}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
