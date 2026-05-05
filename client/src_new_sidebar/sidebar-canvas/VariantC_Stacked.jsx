/* Variant C · Stacked
   Dense tactical readout: a glanceable dashboard of the current situation.
   Two-column grid of tiny cards with a single datum each — made for "eyes up,
   read in 200ms" moments. No scroll needed for the essentials. */

const { useState: useStateC } = React;

function VariantC_Stacked() {
  const d = window.SIDEBAR_DATA;
  const [tab, setTab] = useStateC('read');

  const Tile = ({ label, value, accent, mono = true, sub }) => (
    <div style={{
      background: '#0f1219',
      border: '1px solid rgba(201,163,93,0.12)',
      borderRadius: 9,
      padding: '10px 12px',
    }}>
      <div style={{
        fontSize: 8, fontWeight: 800,
        letterSpacing: '0.26em',
        textTransform: 'uppercase',
        color: 'rgba(201,163,93,0.6)',
        marginBottom: 5,
      }}>{label}</div>
      <div style={{
        fontFamily: mono ? "'JetBrains Mono', monospace" : "'Instrument Serif', serif",
        fontSize: mono ? 18 : 22,
        fontWeight: 700,
        color: accent ?? '#ece9e3',
        lineHeight: 1,
      }}>{value}</div>
      {sub && <div style={{
        fontSize: 9,
        color: 'rgba(240,236,227,0.4)',
        marginTop: 3,
        letterSpacing: '0.05em',
      }}>{sub}</div>}
    </div>
  );

  return (
    <div className="sb">
      <div className="sb-head">
        <div className="sb-logo">
          FeltSide
          <small>Tactical Readout</small>
        </div>
      </div>
      <div className="sb-tabs">
        {['Read','Feed','Notes','Library'].map(t => (
          <div
            key={t}
            className={'sb-tab' + (tab === t.toLowerCase() ? ' active' : '')}
            onClick={() => setTab(t.toLowerCase())}
          >{t}</div>
        ))}
      </div>

      <div className="sb-body" style={{ gap: 10 }}>
        {/* Context header */}
        <div style={{
          padding: '10px 12px',
          borderRadius: 10,
          background: 'linear-gradient(180deg, rgba(201,163,93,0.08), rgba(201,163,93,0.02))',
          border: '1px solid rgba(201,163,93,0.18)',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.28em',
            textTransform: 'uppercase', color: '#c9a35d',
            marginBottom: 4,
          }}>Situation</div>
          <div style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 18, fontStyle: 'italic',
            color: '#ece9e3', lineHeight: 1.15,
          }}>3-bet pot · 4-way</div>
          <div style={{
            fontSize: 11,
            color: 'rgba(240,236,227,0.55)',
            marginTop: 3,
          }}>MP vs BTN · out of position · <span style={{ color: '#c9a35d' }}>K♠ 9♦ 4♣</span></div>
        </div>

        {/* 2×3 readouts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Tile label="My Eq" value="42%" accent="#f0d060" />
          <Tile label="Pot Odds" value="16.7%" />
          <Tile label="EV" value="+38" accent="#4ad991" sub="vs call · static" />
          <Tile label="SPR" value="3.4" />
          <Tile label="Pot" value="420" />
          <Tile label="To Call" value="80" accent="#f0d060" />
        </div>

        {/* Texture chips */}
        <div style={{
          padding: '10px 12px',
          borderRadius: 10,
          background: '#0f1219',
          border: '1px solid rgba(201,163,93,0.12)',
        }}>
          <div className="card-head" style={{ marginBottom: 8 }}>
            <div className="card-title">Board Texture</div>
            <div className="card-kicker">flop</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {[
              { k: 'Dry',        tone: 'good' },
              { k: 'K-high',     tone: 'good' },
              { k: 'Rainbow',    tone: 'good' },
              { k: 'Uncoord.',   tone: 'good' },
              { k: 'No BDFD',    tone: 'neutral' },
            ].map(c => (
              <span key={c.k} style={{
                fontSize: 10, fontWeight: 600,
                letterSpacing: '0.05em',
                padding: '3px 8px',
                borderRadius: 999,
                color: c.tone === 'good' ? '#4ad991' : '#ece9e3',
                border: `1px solid ${c.tone === 'good' ? 'rgba(74,217,145,0.28)' : 'rgba(201,163,93,0.18)'}`,
                background: c.tone === 'good' ? 'rgba(74,217,145,0.06)' : 'rgba(201,163,93,0.04)',
              }}>{c.k}</span>
            ))}
          </div>
        </div>

        {/* Equity distribution – very compact */}
        <div style={{
          padding: '10px 12px',
          borderRadius: 10,
          background: '#0f1219',
          border: '1px solid rgba(201,163,93,0.12)',
        }}>
          <div className="card-head" style={{ marginBottom: 8 }}>
            <div className="card-title">Equity Split</div>
            <div className="card-kicker">4-way</div>
          </div>
          <div style={{
            display: 'flex', borderRadius: 3, overflow: 'hidden',
            height: 8, marginBottom: 7,
          }}>
            {d.equity.map(e => (
              <div key={e.id} style={{
                width: `${e.pct}%`, height: '100%',
                background: e.color,
              }}/>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {d.equity.map(e => (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'baseline', gap: 5,
                fontSize: 11,
                color: e.isMe ? '#f0d060' : 'rgba(240,236,227,0.78)',
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: e.color,
                }}/>
                <span style={{ flex: 1 }}>{e.name.split(' ')[0]}</span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700, color: e.color,
                }}>{e.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Session strip */}
        <div style={{
          padding: '8px 12px',
          borderRadius: 10,
          background: '#080a10',
          border: '1px solid rgba(201,163,93,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(240,236,227,0.45)', fontWeight: 700 }}>Session</div>
          <div style={{ display: 'flex', gap: 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
            <span style={{ color: 'rgba(240,236,227,0.75)' }}>#142 hands</span>
            <span style={{ color: '#c9a35d' }}>87 min</span>
          </div>
        </div>
      </div>

      <div className="sb-foot">
        <button className="sb-btn">Pause</button>
        <button className="sb-btn">Tag</button>
        <button className="sb-btn primary">Next Hand</button>
      </div>
    </div>
  );
}

window.VariantC_Stacked = VariantC_Stacked;
