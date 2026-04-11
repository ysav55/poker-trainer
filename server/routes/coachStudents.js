'use strict';

/**
 * Coach → Student CRM endpoints
 *
 *   GET  /api/coach/students/:id/playlists         — W-2: playlists with play counts
 *   GET  /api/coach/students/:id/scenario-history  — W-3: hands played per scenario
 *   GET  /api/coach/students/:id/staking           — W-4: staking contract + monthly + notes
 *   POST /api/coach/students/:id/staking/notes     — W-5: add a staking note
 *
 * Mounted at /api/coach/students with requireAuth + requireRole('coach') applied externally.
 */

const express  = require('express');
const supabase = require('../db/supabase');
const requireStudentAssignment = require('../auth/requireStudentAssignment');

const router = express.Router({ mergeParams: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(req) {
  return req.user?.id ?? req.user?.stableId;
}

// ─── GET /:id/playlists (W-2) ─────────────────────────────────────────────────

router.get('/:id/playlists', requireStudentAssignment, async (req, res) => {
  try {
    const studentId = req.studentId;

    const coachId = uid(req);

    // 1. Playlists created by coach that are not deleted
    const { data: playlists, error: plError } = await supabase
      .from('playlists')
      .select('playlist_id, name, created_at')
      .eq('created_by', coachId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (plError) throw plError;

    if (!playlists || playlists.length === 0) {
      return res.json({ playlists: [] });
    }

    const playlistIds = playlists.map(p => p.playlist_id);

    // 2. Count items per playlist
    const { data: items, error: itemsError } = await supabase
      .from('playlist_items')
      .select('playlist_id')
      .in('playlist_id', playlistIds);

    if (itemsError) throw itemsError;

    const itemCountMap = {};
    for (const item of (items || [])) {
      itemCountMap[item.playlist_id] = (itemCountMap[item.playlist_id] || 0) + 1;
    }

    // 3. Count items dealt to this student via drill_sessions
    //    A drill session counts when studentId is in opted_in_players
    const { data: drillSessions, error: dsError } = await supabase
      .from('drill_sessions')
      .select('playlist_id, items_dealt')
      .in('playlist_id', playlistIds)
      .contains('opted_in_players', [studentId]);

    if (dsError) throw dsError;

    // Sum items_dealt per playlist for this student
    const playedMap = {};
    for (const ds of (drillSessions || [])) {
      playedMap[ds.playlist_id] = (playedMap[ds.playlist_id] || 0) + (ds.items_dealt || 0);
    }

    const result = playlists.map(p => ({
      id:      p.playlist_id,
      name:    p.name,
      total:   itemCountMap[p.playlist_id] || 0,
      played:  playedMap[p.playlist_id]    || 0,
      correct: null,
    }));

    return res.json({ playlists: result });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ─── GET /:id/scenario-history (W-3) ─────────────────────────────────────────

router.get('/:id/scenario-history', requireStudentAssignment, async (req, res) => {
  try {
    const studentId = req.studentId;

    // 1. All hands that have a scenario_id, most recent first
    const { data: hands, error: handsError } = await supabase
      .from('hands')
      .select('hand_id, scenario_id, created_at')
      .not('scenario_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (handsError) throw handsError;
    if (!hands || hands.length === 0) {
      return res.json({ history: [] });
    }

    const handIds = hands.map(h => h.hand_id);

    // 2. Filter to only hands where this student was a player
    const { data: playerEntries, error: hpError } = await supabase
      .from('hand_players')
      .select('hand_id')
      .eq('player_id', studentId)
      .in('hand_id', handIds);

    if (hpError) throw hpError;

    const studentHandIds = new Set((playerEntries || []).map(e => e.hand_id));

    // 3. Narrow hands list to student's hands
    const studentHands = hands.filter(h => studentHandIds.has(h.hand_id));

    if (studentHands.length === 0) {
      return res.json({ history: [] });
    }

    // 4. Fetch scenario names
    const scenarioIds = [...new Set(studentHands.map(h => h.scenario_id))];
    const { data: scenarios, error: scError } = await supabase
      .from('scenarios')
      .select('id, name')
      .in('id', scenarioIds);

    if (scError) throw scError;

    const scenarioMap = {};
    for (const s of (scenarios || [])) {
      scenarioMap[s.id] = s.name;
    }

    // 5. Build response, limit to 50
    const history = studentHands.slice(0, 50).map(h => ({
      id:            h.hand_id,
      hand_id:       h.hand_id,
      scenario_name: scenarioMap[h.scenario_id] ?? null,
      created_at:    h.created_at,
    }));

    return res.json({ history });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ─── GET /:id/staking (W-4) ──────────────────────────────────────────────────

router.get('/:id/staking', requireStudentAssignment, async (req, res) => {
  try {
    const studentId = req.studentId;

    const coachId = uid(req);

    // 1. Most recent active/paused contract for this student-coach pair
    const { data: contracts, error: cError } = await supabase
      .from('staking_contracts')
      .select('*')
      .eq('coach_id', coachId)
      .eq('player_id', studentId)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (cError) throw cError;

    const contract = contracts?.[0] ?? null;

    if (!contract) {
      return res.json({ contract: null, monthly: [], notes: [] });
    }

    // 2. Aggregate staking_sessions by month
    const { data: sessions, error: sError } = await supabase
      .from('staking_sessions')
      .select('session_date, buy_in, cashout, status')
      .eq('contract_id', contract.id)
      .neq('status', 'deleted');

    if (sError) throw sError;

    const monthMap = {};
    for (const s of (sessions || [])) {
      const month = (s.session_date || '').slice(0, 7); // YYYY-MM
      if (!month) continue;
      if (!monthMap[month]) {
        monthMap[month] = { month, buy_ins: 0, cashouts: 0, net: 0 };
      }
      monthMap[month].buy_ins   += parseFloat(s.buy_in   || 0);
      monthMap[month].cashouts  += parseFloat(s.cashout  || 0);
      monthMap[month].net       += parseFloat(s.cashout  || 0) - parseFloat(s.buy_in || 0);
    }

    const monthly = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month));

    // 3. Fetch staking notes for this contract
    const { data: notesRows, error: nError } = await supabase
      .from('staking_notes')
      .select('id, text, created_at')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: false });

    if (nError) throw nError;

    const notes = (notesRows || []).map(n => ({
      id:         n.id,
      text:       n.text,
      created_at: n.created_at,
    }));

    return res.json({ contract, monthly, notes });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ─── POST /:id/staking/notes (W-5) ───────────────────────────────────────────

router.post('/:id/staking/notes', requireStudentAssignment, async (req, res) => {
  try {
    const studentId = req.studentId;

    const coachId = uid(req);

    // 1. Validate body
    const text = (req.body?.text ?? '').trim();
    if (!text) {
      return res.status(400).json({ error: 'validation_error', message: 'text is required' });
    }

    // 2. Find active/paused contract
    const { data: contracts, error: cError } = await supabase
      .from('staking_contracts')
      .select('id')
      .eq('coach_id', coachId)
      .eq('player_id', studentId)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (cError) throw cError;

    const contract = contracts?.[0] ?? null;

    if (!contract) {
      return res.status(404).json({ error: 'no_contract' });
    }

    // 3. Insert note
    const { data: note, error: insertError } = await supabase
      .from('staking_notes')
      .insert({
        contract_id: contract.id,
        coach_id:    coachId,
        player_id:   studentId,
        text,
      })
      .select('id, text, created_at')
      .single();

    if (insertError) throw insertError;

    return res.status(201).json({ note });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
