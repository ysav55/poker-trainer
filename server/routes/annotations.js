'use strict';

/**
 * Annotations routes
 *
 * GET  /api/hands/:handId/annotations          — list annotations for a hand
 * POST /api/hands/:handId/annotations          — add an annotation
 * DELETE /api/annotations/:annotationId        — delete an annotation
 */
module.exports = function registerAnnotationRoutes(app, { requireAuth, supabaseAdmin }) {

  // GET /api/hands/:handId/annotations
  app.get('/api/hands/:handId/annotations', requireAuth, async (req, res) => {
    try {
      const { handId } = req.params;
      const { data, error } = await supabaseAdmin
        .from('hand_annotations')
        .select('id, hand_id, action_index, author_id, text, created_at')
        .eq('hand_id', handId)
        .order('action_index', { ascending: true });

      if (error) throw error;
      res.json({ annotations: data ?? [] });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // POST /api/hands/:handId/annotations
  app.post('/api/hands/:handId/annotations', requireAuth, async (req, res) => {
    try {
      const { handId } = req.params;
      const { action_index, text } = req.body || {};

      if (action_index == null || typeof action_index !== 'number')
        return res.status(400).json({ error: 'invalid_input', message: 'action_index (number) is required.' });
      if (!text || typeof text !== 'string' || !text.trim())
        return res.status(400).json({ error: 'invalid_input', message: 'text is required.' });

      const authorId = req.user?.id ?? null;

      const { data, error } = await supabaseAdmin
        .from('hand_annotations')
        .insert({ hand_id: handId, action_index, author_id: authorId, text: text.trim() })
        .select('id, hand_id, action_index, author_id, text, created_at')
        .single();

      if (error) throw error;
      res.status(201).json({ annotation: data });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // DELETE /api/annotations/:annotationId
  app.delete('/api/annotations/:annotationId', requireAuth, async (req, res) => {
    try {
      const { annotationId } = req.params;
      const userId = req.user?.id ?? null;

      // Only allow deletion by author or coach
      const { data: existing } = await supabaseAdmin
        .from('hand_annotations')
        .select('id, author_id')
        .eq('id', annotationId)
        .single();

      if (!existing) return res.status(404).json({ error: 'not_found' });

      if (existing.author_id && existing.author_id !== userId) {
        return res.status(403).json({ error: 'forbidden', message: 'Only the author can delete this annotation.' });
      }

      const { error } = await supabaseAdmin
        .from('hand_annotations')
        .delete()
        .eq('id', annotationId);

      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });
};
