'use strict';

const supabase = require('../supabase');
const { q } = require('../utils');

// ─── Coach Tags ───────────────────────────────────────────────────────────────

async function updateCoachTags(handId, tags) {
  const tagArray = Array.isArray(tags) ? tags : [];

  await q(supabase.from('hand_tags').delete()
    .eq('hand_id', handId).eq('tag_type', 'coach'));

  if (tagArray.length > 0) {
    await q(supabase.from('hand_tags').insert(
      tagArray.map(tag => ({ hand_id: handId, tag, tag_type: 'coach' }))
    ));
  }
}

// ─── Auto / Mistake / Sizing Tags (used by AnalyzerService) ──────────────────

/**
 * Atomically replace auto, mistake, and sizing tags for a hand.
 * Coach tags are left untouched.
 * @param {string} handId
 * @param {Array<{hand_id, tag, tag_type, player_id, action_id}>} tagRows
 */
async function replaceAutoTags(handId, tagRows) {
  await q(supabase.from('hand_tags').delete()
    .eq('hand_id', handId)
    .in('tag_type', ['auto', 'mistake', 'sizing']));

  if (tagRows.length > 0) {
    await q(supabase.from('hand_tags').insert(tagRows));
  }
}

module.exports = { updateCoachTags, replaceAutoTags };
