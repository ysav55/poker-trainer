/* Sidebar shell — composes Head + Tabs + Body + Foot.
   Per spec: Next-hand footer behavior changes per tab. */

const { useState: useStateShell } = React;

function Sidebar({ tab, onTabChange }) {
  const data = window.SIDEBAR_V2_DATA;
  const [paused, setPaused] = useStateShell(data.gameState.paused);

  // Status pill reflects current context
  let status = 'live';
  if (paused) status = 'paused';
  else if (tab === 'review') status = 'review';
  else if (data.gameState.is_scenario) status = 'scenario';

  // Subtitle
  const subtitle = {
    live:     'Coach · Ariela',
    drills:   'Drill Builder',
    history:  'Session · 142 hands',
    review:   `Hand #${data.review.handNumber}`,
    settings: 'Table Setup',
  }[tab];

  // Footer varies per tab (per "Next-hand button behavior change" in spec)
  function Foot() {
    if (tab === 'live') {
      return (
        <>
          <button className="btn ghost" style={{ flex: 0.8 }} onClick={() => setPaused(p => !p)}>
            {paused ? '▶' : '❚❚'} {paused ? 'Resume' : 'Pause'}
          </button>
          <button className="btn" style={{ flex: 1 }}>⚑ Tag Hand</button>
          <button className="btn primary" style={{ flex: 1.3 }}>Next Hand →</button>
        </>
      );
    }
    if (tab === 'drills') {
      return (
        <>
          <button className="btn ghost" style={{ flex: 1 }}>Clear</button>
          <button className="btn primary" style={{ flex: 1.6 }}>Launch Hand →</button>
        </>
      );
    }
    if (tab === 'history') {
      return (
        <>
          <button className="btn" style={{ flex: 1 }}>Export CSV</button>
          <button className="btn primary" style={{ flex: 1.6 }}
            onClick={() => onTabChange('review')}>Review Selected →</button>
        </>
      );
    }
    if (tab === 'review') {
      return (
        <>
          <button className="btn" style={{ flex: 1 }}>Save Branch</button>
          <button className="btn primary" style={{ flex: 1.6 }}>Run This Spot →</button>
        </>
      );
    }
    // settings
    return (
      <>
        <button className="btn ghost" style={{ flex: 1 }}>Reset</button>
        <button className="btn primary" style={{ flex: 1.6 }}>Apply Next Hand →</button>
      </>
    );
  }

  return (
    <div className="sb">
      <window.Head status={status} subtitle={subtitle} />
      <window.TabBar tab={tab} onTabChange={onTabChange} />
      <div className="sb-body">
        {tab === 'live'     && <window.TabLive     data={data} />}
        {tab === 'drills'   && <window.TabDrills   data={data} />}
        {tab === 'history'  && <window.TabHistory  data={data} onLoadReview={() => onTabChange('review')} />}
        {tab === 'review'   && <window.TabReview   data={data} onBack={() => onTabChange('live')} />}
        {tab === 'settings' && <window.TabSettings data={data} />}
      </div>
      <div className="sb-foot">
        <Foot/>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
