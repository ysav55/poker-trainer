import { useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

function parseTags(hand_tags = []) {
  return {
    auto_tags:    (hand_tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: (hand_tags || []).filter(t => t.tag_type === 'mistake').map(t => t.tag),
    sizing_tags:  (hand_tags || []).filter(t => t.tag_type === 'sizing').map(t => t.tag),
    coach_tags:   (hand_tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
  };
}

export function useHistory() {
  const [hands, setHands]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [handDetail, setHandDetail] = useState(null);

  const fetchHands = useCallback(async (tableId = 'main-table') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '10', ...(tableId ? { tableId } : {}) });
      const data = await apiFetch(`/api/hands?${params}`);
      setHands((data.hands || []).map(h => ({ ...h, ...parseTags(h.hand_tags) })));
    } catch { /* server may not be ready */ }
    setLoading(false);
  }, []);

  const fetchHandDetail = useCallback(async (handId) => {
    try {
      const data = await apiFetch(`/api/hands/${handId}`);
      if (data) {
        setHandDetail({
          ...data,
          ...parseTags(data.hand_tags),
          players: (data.hand_players || []).map(hp => ({
            player_id:   hp.player_id,
            player_name: hp.player_name,
            seat:        hp.seat,
            stack_start: hp.stack_start,
            stack_end:   hp.stack_end,
            hole_cards:  hp.hole_cards || [],
            is_winner:   hp.is_winner,
            vpip:        hp.vpip,
            pfr:         hp.pfr,
          })),
          actions: (data.hand_actions || []).map(a => ({
            player_id:   a.player_id,
            player_name: a.player_name,
            street:      a.street,
            action:      a.action,
            amount:      a.amount,
            timestamp:   a.created_at,
            is_reverted: a.is_reverted,
          })),
        });
      }
    } catch {}
  }, []);

  const clearDetail = useCallback(() => setHandDetail(null), []);

  return { hands, loading, handDetail, fetchHands, fetchHandDetail, clearDetail };
}
