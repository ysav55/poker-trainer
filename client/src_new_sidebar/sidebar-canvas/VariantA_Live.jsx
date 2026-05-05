/* Variant A · Live
   The current sidebar: equity gauge, action feed, drills library.
   This is the "same vibe" baseline. */

const { useState: useStateA } = React;

function VariantA_Live() {
  const d = window.SIDEBAR_DATA;
  const [tab, setTab] = useStateA('live');

  return (
    <div className="sb">
      <div className="sb-head">
        <div className="sb-logo">
          FeltSide
          <small>Coach Console</small>
        </div>
      </div>
      <div className="sb-tabs">
        {['Live','Library','Drills','Review'].map(t => (
          <div
            key={t}
            className={'sb-tab' + (tab === t.toLowerCase() ? ' active' : '')}
            onClick={() => setTab(t.toLowerCase())}
          >{t}</div>
        ))}
      </div>

      <div className="sb-body">
        {/* Equity */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Live Equity</div>
            <div className="card-kicker">flop · 3 left</div>
          </div>
          {d.equity.map(e => (
            <div key={e.id} style={{ marginBottom: 7 }}>
              <div className="eq-row">
                <span className={'eq-name' + (e.isMe ? ' me' : '')}>
                  {e.name}{e.isMe ? ' · you' : ''}
                </span>
                <span className="eq-pct" style={{ color: e.color }}>{e.pct}%</span>
              </div>
              <div className="eq-bar">
                <div className="eq-bar-fill" style={{ width: `${e.pct}%`, background: e.color }}/>
              </div>
            </div>
          ))}
        </div>

        {/* Feed */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Action Feed</div>
            <div className="card-kicker">this hand</div>
          </div>
          {d.feed.map((f, i) => (
            <div key={i} className="feed-row" style={f.pending ? { opacity: 0.6 } : null}>
              <span className="feed-phase">{f.phase}</span>
              <span className="feed-text">
                <b>{f.who}</b> {f.act}{f.pending ? ' …' : ''}
              </span>
              <span className="feed-amt">{f.amt}</span>
            </div>
          ))}
        </div>

        {/* Drills */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Drills Library</div>
            <div className="card-kicker">for Ariela</div>
          </div>
          {d.drills.map(x => (
            <div key={x.title} className="drill">
              <div>
                <div className="drill-title">{x.title}</div>
                <div className="drill-meta">{x.meta}</div>
              </div>
              <div className="drill-go">Run →</div>
            </div>
          ))}
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

window.VariantA_Live = VariantA_Live;
