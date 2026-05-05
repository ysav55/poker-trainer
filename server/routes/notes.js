'use strict';

const repo = require('../db/repositories/HandNotesRepository.js');
const requireRole = require('../auth/requireRole.js');
const requireSchool = require('../auth/requireSchool.js');
const supabase = require('../db/supabase.js');

const MAX_BODY = 500;

function validateBody(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_BODY) return null;
  return trimmed;
}

async function attachAuthorName(notes) {
  if (!notes || notes.length === 0) return notes;
  const ids = [...new Set(notes.map((n) => n.author_player_id).filter(Boolean))];
  if (ids.length === 0) return notes;
  const { data } = await supabase
    .from('player_profiles')
    .select('id, name')
    .in('id', ids);
  const nameById = new Map((data ?? []).map((p) => [p.id, p.name]));
  return notes.map((n) => ({
    ...n,
    author_name: n.author_player_id ? (nameById.get(n.author_player_id) ?? 'Coach (deleted)') : 'Coach (deleted)',
  }));
}

module.exports = function registerNoteRoutes(app, { requireAuth }) {
  const coachOnly = requireRole('coach');

  app.get('/api/hands/:handId/notes', requireAuth, coachOnly, requireSchool, async (req, res) => {
    try {
      const notes = await repo.listForHand(req.params.handId, req.user.school_id);
      const enriched = await attachAuthorName(notes);
      res.json({ notes: enriched });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  app.post('/api/hands/:handId/notes', requireAuth, coachOnly, requireSchool, async (req, res) => {
    const body = validateBody(req.body?.body);
    if (!body) return res.status(400).json({ error: 'invalid_body', message: 'Body must be 1–500 chars.' });
    try {
      const note = await repo.create(req.params.handId, req.user.school_id, req.user.id, body);
      const [enriched] = await attachAuthorName([note]);
      res.status(201).json({ note: enriched });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  app.patch('/api/notes/:noteId', requireAuth, coachOnly, requireSchool, async (req, res) => {
    const body = validateBody(req.body?.body);
    if (!body) return res.status(400).json({ error: 'invalid_body', message: 'Body must be 1–500 chars.' });
    try {
      const note = await repo.update(req.params.noteId, req.user.school_id, body);
      if (!note) return res.status(404).json({ error: 'note_not_found' });
      const [enriched] = await attachAuthorName([note]);
      res.json({ note: enriched });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  app.delete('/api/notes/:noteId', requireAuth, coachOnly, requireSchool, async (req, res) => {
    try {
      await repo.delete(req.params.noteId, req.user.school_id);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  app.post('/api/hands/notes-counts', requireAuth, coachOnly, requireSchool, async (req, res) => {
    const handIds = req.body?.handIds;
    if (!Array.isArray(handIds)) {
      return res.status(400).json({ error: 'invalid_payload', message: 'handIds must be an array.' });
    }
    try {
      const counts = await repo.batchCounts(handIds, req.user.school_id);
      res.json({ counts: Object.fromEntries(counts) });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });
};
