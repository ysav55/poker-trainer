/* Variant D · Commander
   Action-first control surface. Big buttons at top for what the coach does
   most (Pause, Tag, Next, Deal), then a compact hand card, then drills.
   Built for one-handed coach operation during a live session. */

const { useState: useStateD } = React;

function VariantD_Commander() {
  const d = window.SIDEBAR_DATA;
  const [tab, setTab] = useStateD('session');
  const [paused, setPaused] = useStateD(false);

  const Big = ({ label, sub, tone, onClick }) => {
    const palette = {
      primary: {
        bg: 'linear-gradient(180deg, #c9a35d, #8c6a2a)',
        bd: 'rgba(255,220,150,0.5)',
        fg: '#1a1208',
      },
      warn: {
        bg: 'linear-gradient(180deg, rgba(245,178,91,0.18), rgba(245,178,91,0.04))',
        bd: 'rgba(245,178,91,0.35)',
        fg: '#f5b25b',
      },
      neutral: {
        bg: 'rgba(201,163,93,0.06)',
        bd: 'rgba(201,163,93,0.22)',
        fg: '#c9a35d',
      },
    }[tone ?? 'neutral'];
    return (
      <button
        onClick={onClick}
        style={{
          padding: '11px 10px',
          borderRadius: 10,
          background: palette.bg,
          border: `1px solid ${palette.bd}`,
          color: palette.fg,
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          textAlign: 'center',
          transition: 'filter 150ms',
        }}
        onMouseOver={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
        onMouseOut={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
      >
        <span style={{
          fontFamily: "'General Sans', sans-serif",
          fontSize: 11, fontWeight: 800,
          letterSpacing: '0.2em', textTransform: 'uppercase',
        }}>{label}</span>
        {sub && <span style={{
          fontSize: 9,
          opacity: 0.7,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.02em',
        }}>{sub}</span>}
      </button>
    );
  };

  return (
    <div className="sb">
      <div className="sb-head" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      }}>
        <div className="sb-logo">
          FeltSide
          <small>Commander · Ariela</small>
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, color: paused ? '#f5b25b' : '#4ad991',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: paused ? '#f5b25b' : '#4ad991',
            boxShadow: `0 0 8px ${paused ? '#f5b25b' : '#4ad991'}`,
          }}/>
          {paused ? 'PAUSED' : 'LIVE'}
        </div>
      </div>

      <div className="sb-tabs">
        {['Session','Hand','Players','Drills'].map(t => (
          <div
            key={t}
            className={'sb-tab' + (tab === t.toLowerCase() ? ' active' : '')}
            onClick={() => setTab(t.toLowerCase())}
          >{t}</div>
        ))}
      </div>

      <div className="sb-body" style={{ gap: 12 }}>
        {/* Primary action grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          <Big
            label={paused ? 'Resume' : 'Pause'}
            sub={paused ? 'resume clock' : 'freeze table'}
            tone="warn"
            onClick={() => setPaused(p => !p)}
          />
          <Big label="Next Hand" sub="deal · shuffle" tone="primary" />
          <Big label="Tag" sub="bookmark +" tone="neutral" />
          <Big label="Scenario" sub="launch preset" tone="neutral" />
        </div>

        {/* Hand card */}
        <div style={{
          padding: '12px',
          borderRadius: 10,
          background: '#0f1219',
          border: '1px solid rgba(201,163,93,0.12)',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 8,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.28em',
              textTransform: 'uppercase', color: '#c9a35d',
            }}>Hand #{d.hand.number}</div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: 'rgba(240,236,227,0.5)',
            }}>flop · 3 left</div>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
            paddingBottom: 10,
            borderBottom: '1px solid rgba(201,163,93,0.08)',
          }}>
            <div>
              <div style={{ fontSize: 8, letterSpacing: '0.22em', color: 'rgba(240,236,227,0.4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>Pot</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, color: '#c9a35d', lineHeight: 1 }}>420</div>
            </div>
            <div>
              <div style={{ fontSize: 8, letterSpacing: '0.22em', color: 'rgba(240,236,227,0.4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>To Call</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, color: '#f0d060', lineHeight: 1 }}>80</div>
            </div>
            <div>
              <div style={{ fontSize: 8, letterSpacing: '0.22em', color: 'rgba(240,236,227,0.4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>My Eq</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, color: '#4ad991', lineHeight: 1 }}>42%</div>
            </div>
          </div>

          {/* Equity bar */}
          <div style={{ marginTop: 10 }}>
            <div style={{
              display: 'flex', borderRadius: 3, overflow: 'hidden',
              height: 6, marginBottom: 6,
            }}>
              {d.equity.map(e => (
                <div key={e.id} style={{ width: `${e.pct}%`, height: '100%', background: e.color }}/>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, fontSize: 10.5 }}>
              {d.equity.map(e => (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'baseline', gap: 5,
                  color: e.isMe ? '#f0d060' : 'rgba(240,236,227,0.75)',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: e.color }}/>
                  <span style={{ flex: 1 }}>{e.name.split(' ')[0]}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: e.color }}>{e.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Drills shortcut strip */}
        <div style={{
          padding: '10px 12px',
          borderRadius: 10,
          background: '#0f1219',
          border: '1px solid rgba(201,163,93,0.12)',
        }}>
          <div className="card-head" style={{ marginBottom: 8 }}>
            <div className="card-title">Quick Drills</div>
            <div className="card-kicker">for Ariela</div>
          </div>
          {d.drills.slice(0, 2).map(x => (
            <div key={x.title} className="drill">
              <div>
                <div className="drill-title">{x.title}</div>
                <div className="drill-meta">{x.meta}</div>
              </div>
              <div className="drill-go">Run →</div>
            </div>
          ))}
        </div>

        {/* Session meta */}
        <div style={{
          padding: '8px 12px',
          borderRadius: 10,
          background: '#080a10',
          border: '1px solid rgba(201,163,93,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(240,236,227,0.45)', fontWeight: 700 }}>Session</div>
          <div style={{ display: 'flex', gap: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
            <span style={{ color: 'rgba(240,236,227,0.75)' }}>142 hands</span>
            <span style={{ color: '#c9a35d' }}>87 min</span>
          </div>
        </div>
      </div>

      <div className="sb-foot">
        <button className="sb-btn" style={{ flex: 0.6 }}>Undo</button>
        <button className="sb-btn" style={{ flex: 0.6 }}>Rollback</button>
        <button className="sb-btn primary" style={{ flex: 1.8 }}>End Session →</button>
      </div>
    </div>
  );
}

window.VariantD_Commander = VariantD_Commander;
