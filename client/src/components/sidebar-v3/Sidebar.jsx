import React, { useState } from 'react';
import '../../styles/sidebar-v3.css';
import { Head, TabBar } from './shared.jsx';
import TabLive from './TabLive.jsx';
import TabDrills from './TabDrills.jsx';
import TabHistory from './TabHistory.jsx';
import TabReview from './TabReview.jsx';
import TabSettings from './TabSettings.jsx';
import { SIDEBAR_V3_DATA } from './data.js';

export default function SidebarV3({ data = SIDEBAR_V3_DATA, emit = null, tableId = null, initialTab = 'live' }) {
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('fs.sb3.tab') || initialTab; }
    catch { return initialTab; }
  });
  function setAndPersist(t) {
    try { localStorage.setItem('fs.sb3.tab', t); } catch { /* ignore */ }
    setTab(t);
  }

  const paused = !!data.gameState.paused;
  const phase = data.gameState.phase;

  // Selected hand for Review tab — TabHistory captures the hand_id on click;
  // Phase 4 wires the actual replay-load. Until then TabReview shows a
  // "selected" placeholder so the click handoff isn't a dead end.
  const [selectedHandId, setSelectedHandId] = useState(null);
  function loadReview(handId) {
    setSelectedHandId(handId ?? null);
    setAndPersist('review');
  }

  let status = 'live';
  if (paused) status = 'paused';
  else if (tab === 'review') status = 'review';
  else if (data.gameState.is_scenario) status = 'scenario';

  const subtitle = {
    live:     'Coach',
    drills:   'Drill Builder',
    history:  `Session · ${data.session?.hands ?? 0} hands`,
    review:   `Hand #${data.review.handNumber}`,
    settings: 'Table Setup',
  }[tab];

  function Foot() {
    // Buttons without a Phase 1 wire-up are explicitly disabled with a Phase-N
    // tooltip — better than silent no-ops on gold-styled buttons that read as
    // primary actions. Each gets its real onClick when its phase ships.
    if (tab === 'live') {
      const canStart = phase === 'waiting' && !!emit?.startConfiguredHand;
      return (
        <>
          <button
            className="btn ghost"
            style={{ flex: 0.8 }}
            onClick={() => emit?.togglePause?.()}
            disabled={!emit?.togglePause}
          >
            {paused ? '▶' : '❚❚'} {paused ? 'Resume' : 'Pause'}
          </button>
          <button className="btn" style={{ flex: 1 }} disabled title="Tag dialog wires in Phase 2">⚑ Tag Hand</button>
          <button
            className="btn primary"
            style={{ flex: 1.3 }}
            disabled={!canStart}
            onClick={() => emit?.startConfiguredHand?.()}
            title={canStart ? 'Start the configured hand now' : 'Available between hands (phase: waiting)'}
          >Next Hand →</button>
        </>
      );
    }
    if (tab === 'drills') {
      return (
        <>
          <button className="btn ghost" style={{ flex: 1 }} disabled title="Phase 3">Clear</button>
          <button className="btn primary" style={{ flex: 1.6 }} disabled title="Phase 3">Launch Hand →</button>
        </>
      );
    }
    if (tab === 'history') {
      return (
        <>
          <button className="btn" style={{ flex: 1 }} disabled title="Phase 3">Export CSV</button>
          <button
            className="btn primary"
            style={{ flex: 1.6 }}
            onClick={() => setAndPersist('review')}
            title="Open the Review tab"
          >Review Selected →</button>
        </>
      );
    }
    if (tab === 'review') {
      return (
        <>
          <button className="btn" style={{ flex: 1 }} disabled title="Phase 4 (branch_to_drill)">Save Branch</button>
          <button className="btn primary" style={{ flex: 1.6 }} disabled title="Phase 4">Run This Spot →</button>
        </>
      );
    }
    return (
      <>
        <button className="btn ghost" style={{ flex: 1 }} disabled title="Phase 5">Reset</button>
        <button className="btn primary" style={{ flex: 1.6 }} disabled title="Phase 5 (blinds + seats apply)">Apply Next Hand →</button>
      </>
    );
  }

  return (
    <div className="sb-v3" style={{ width: 360, flexShrink: 0 }}>
      <Head status={status} subtitle={subtitle} />
      <TabBar tab={tab} onTabChange={setAndPersist} />
      <div className="sb-body">
        {tab === 'live'     && <TabLive     data={data} emit={emit} />}
        {tab === 'drills'   && <TabDrills   data={data} emit={emit} />}
        {tab === 'history'  && <TabHistory  data={data} tableId={tableId} onLoadReview={loadReview} />}
        {tab === 'review'   && <TabReview
                                   data={data}
                                   selectedHandId={selectedHandId}
                                   onBack={() => { setSelectedHandId(null); setAndPersist('live'); }}
                                />}
        {tab === 'settings' && <TabSettings data={data} />}
      </div>
      <div className="sb-foot">
        <Foot />
      </div>
    </div>
  );
}
