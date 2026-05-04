'use strict';

const supabase = require('../supabase');

// ─── Column list ──────────────────────────────────────────────────────────────

const NOTE_COLUMNS = 'id, hand_id, school_id, author_player_id, body, created_at, updated_at';

// ─── List notes for a hand ─────────────────────────────────────────────────────

async function listForHand(handId, schoolId) {
  const { data, error } = await supabase
    .from('hand_notes')
    .select(NOTE_COLUMNS)
    .eq('hand_id', handId)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: true });

  if (error) return [];
  return data ?? [];
}

// ─── Create a note ────────────────────────────────────────────────────────────

async function create(handId, schoolId, authorPlayerId, body) {
  const { data, error } = await supabase
    .from('hand_notes')
    .insert({
      hand_id: handId,
      school_id: schoolId,
      author_player_id: authorPlayerId,
      body,
    })
    .select(NOTE_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─── Update a note ────────────────────────────────────────────────────────────

async function update(noteId, schoolId, body) {
  const { data, error } = await supabase
    .from('hand_notes')
    .update({
      body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', noteId)
    .eq('school_id', schoolId)
    .select(NOTE_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─── Delete a note ────────────────────────────────────────────────────────────

async function deleteNote(noteId, schoolId) {
  const { error } = await supabase
    .from('hand_notes')
    .delete()
    .eq('id', noteId)
    .eq('school_id', schoolId);

  if (error) throw new Error(error.message);
}

// ─── Count notes for a hand ───────────────────────────────────────────────────

async function countForHand(handId, schoolId) {
  const { count, error } = await supabase
    .from('hand_notes')
    .select('id', { count: 'exact', head: true })
    .eq('hand_id', handId)
    .eq('school_id', schoolId);

  if (error) return 0;
  return count ?? 0;
}

// ─── Batch count notes for multiple hands ──────────────────────────────────────

async function batchCounts(handIds, schoolId) {
  if (!Array.isArray(handIds) || handIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('hand_notes')
    .select('hand_id')
    .eq('school_id', schoolId)
    .in('hand_id', handIds);

  if (error || !data) return new Map();

  const counts = new Map();
  for (const row of data) {
    counts.set(row.hand_id, (counts.get(row.hand_id) ?? 0) + 1);
  }
  return counts;
}

module.exports = {
  listForHand,
  create,
  update,
  delete: deleteNote,
  countForHand,
  batchCounts,
};
