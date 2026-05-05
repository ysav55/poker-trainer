/* Variant B · Timeline
   The hand as a vertical timeline with per-street cards. Each street is a
   collapsible block showing the board delta, actions taken, and the
   pot/equity state at the END of that street. Coach reads top-down. */

const { useState: useStateB } = React;

function VariantB_Timeline() {
  const d = window.SIDEBAR_DATA;
  const [tab, setTab] = useStateB('replay');

  // Derived: pot progression per street
  const streetState = [
    { label: 'Preflop', board: null, potEnd: 200, actions: [
      { who: 'Noa',    act: 'raise',  amt: 60, color: '#4ad991' },
      { who: 'Ariela', act: 'call',   amt: 60, color: '#f0d060', isMe: true },
      { who: 'Ido',    act: 'call',   amt: 60, color: '#6aa8ff' },
      { who: 'Guy',    act: 'fold',   amt: null, color: '#7a7a7a' },
    ] },
    { label: 'Flop', board: ['Ks','9d','4c'], potEnd: 420, active: true, actions: [
      { who: 'Noa',    act: 'bet',    amt: 160, color: '#4ad991' },
      { who: 'Ariela', act: 'call',   amt: 80,  color: '#f0d060', isMe: true, pending: true },
    ] },
    { label: 'Turn',  board: null, potEnd: null, future: true, actions: [] },
    { label: 'River', board: null, potEnd: null, future: true, actions: [] },
  ];

  function renderCard(card) {
    const rank = card[0];
    const suit = card[1];
    const suitChar = suit === 's' ? '♠' : suit === 'h' ? '♥' : suit === 'd' ? '♦' : '♣';
    const isRed = suit === 'h' || suit === 'd';
    return (
      <span key={card} style={{
        display: 'inline-flex', alignItems: 'center', gap: 1,
        padding: '2px 6px',
        background: '#0b0d14',
        border: '1px solid rgba(201,163,93,0.25)',
        borderRadius: 4,
        fontFamily: "'General Sans', sans-serif",
        fontSize: 11, fontWeight: 700,
        color: isRed ? '#e06868' : '#ece9e3',
        marginRight: 4,
      }}>
        {rank === 'T' ? '10' : rank}{suitChar}
      </span>
    );
  }

  return (
    <div className="sb">
      <div className="sb-head">
        <div className="sb-logo">
          FeltSide
          <small>Hand Replay · #{d.hand.number}</small>
        </div>
      </div>
      <div className="sb-tabs">
        {['Live','Replay','Notes','Drills'].map(t => (
          <div
            key={t}
            className={'sb-tab' + (tab === t.toLowerCase() ? ' active' : '')}
            onClick={() => setTab(t.toLowerCase())}
          >{t}</div>
        ))}
      </div>

      <div className="sb-body" style={{ gap: 0, padding: '16px 0 14px' }}>
        {/* Timeline */}
        <div style={{ position: 'relative', padding: '0 18px' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', left: 28, top: 4, bottom: 4,
            width: 1, background: 'rgba(201,163,93,0.15)',
          }}/>

          {streetState.map((s, i) => (
            <div key={s.label} style={{
              position: 'relative',
              paddingLeft: 30,
              paddingBottom: i === streetState.length - 1 ? 0 : 16,
            }}>
              {/* Node dot */}
              <div style={{
                position: 'absolute',
                left: 5, top: 4,
                width: 16, height: 16, borderRadius: '50%',
                background: s.active ? '#c9a35d' : s.future ? '#0b0d14' : '#1a1f2a',
                border: `1.5px solid ${s.future ? 'rgba(201,163,93,0.2)' : '#c9a35d'}`,
                boxShadow: s.active ? '0 0 12px rgba(201,163,93,0.65)' : 'none',
                zIndex: 2,
              }}/>

              {/* Street label + board */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: s.actions.length ? 6 : 2,
              }}>
                <span style={{
                  fontFamily: "'General Sans', sans-serif",
                  fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.26em', textTransform: 'uppercase',
                  color: s.future ? 'rgba(240,236,227,0.25)' : s.active ? '#f0d060' : '#c9a35d',
                }}>{s.label}</span>
                {s.board && <span style={{ display: 'inline-flex' }}>
                  {s.board.map(renderCard)}
                </span>}
                {s.potEnd != null && (
                  <span style={{
                    marginLeft: 'auto',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: 'rgba(240,236,227,0.6)',
                  }}>pot {s.potEnd}</span>
                )}
              </div>

              {/* Actions on this street */}
              {s.actions.map((a, j) => (
                <div key={j} style={{
                  display: 'grid',
                  gridTemplateColumns: '8px 1fr auto',
                  gap: 8, alignItems: 'baseline',
                  padding: '3px 0',
                  opacity: a.pending ? 0.55 : 1,
                }}>
                  <span style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: a.color,
                    alignSelf: 'center',
                  }}/>
                  <span style={{
                    fontSize: 12,
                    color: a.isMe ? '#f0d060' : '#ece9e3',
                    fontWeight: a.isMe ? 600 : 400,
                  }}>
                    {a.who}{' '}
                    <span style={{ color: 'rgba(240,236,227,0.55)' }}>
                      {a.act}{a.pending ? ' …' : ''}
                    </span>
                  </span>
                  {a.amt != null && (
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11, fontWeight: 600,
                      color: 'rgba(240,236,227,0.8)',
                    }}>{a.amt}</span>
                  )}
                </div>
              ))}

              {s.future && (
                <div style={{
                  fontSize: 10, letterSpacing: '0.2em',
                  color: 'rgba(240,236,227,0.25)',
                  paddingTop: 2,
                }}>—</div>
              )}
            </div>
          ))}
        </div>

        {/* Live equity strip — compact inline */}
        <div style={{
          margin: '14px 14px 0',
          padding: '10px 12px',
          borderRadius: 10,
          background: '#0f1219',
          border: '1px solid rgba(201,163,93,0.12)',
        }}>
          <div className="card-head" style={{ marginBottom: 7 }}>
            <div className="card-title">Equity at flop</div>
            <div className="card-kicker">live</div>
          </div>
          <div style={{
            display: 'flex', borderRadius: 3, overflow: 'hidden',
            height: 6, marginBottom: 6,
          }}>
            {d.equity.map(e => (
              <div key={e.id} style={{
                width: `${e.pct}%`, height: '100%',
                background: e.color,
              }}/>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10.5 }}>
            {d.equity.map(e => (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'baseline', gap: 5,
                color: e.isMe ? '#f0d060' : 'rgba(240,236,227,0.78)',
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: e.color,
                }}/>
                <span style={{ flex: 1 }}>{e.name}</span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700, color: e.color,
                }}>{e.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sb-foot">
        <button className="sb-btn">◀ Prev</button>
        <button className="sb-btn">Tag</button>
        <button className="sb-btn primary">Next ▶</button>
      </div>
    </div>
  );
}

window.VariantB_Timeline = VariantB_Timeline;
