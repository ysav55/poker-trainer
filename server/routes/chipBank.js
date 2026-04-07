'use strict';

/**
 * Chip Bank REST routes.
 *
 *   GET  /api/players/:id/chip-balance    — any authenticated user (own balance) or coach/admin
 *   POST /api/players/:id/chips           — coach/admin reload
 *   POST /api/players/:id/chip-adjust     — admin manual adjustment
 *   GET  /api/players/:id/chip-history    — transaction log (own or coach/admin)
 */

const { requireFeature } = require('../auth/featureGate');

module.exports = function registerChipBankRoutes(app, { requireAuth, requireRole }) {
  const { getBalance, getTransactionHistory, reload, adjustment } = require('../db/repositories/ChipBankRepository');
  const gateChipBank = requireFeature('chip_bank');

  // ── GET /api/players/:id/chip-balance ────────────────────────────────────────
  app.get('/api/players/:id/chip-balance', requireAuth, gateChipBank, async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    // Players can only read their own balance; coaches/admins can read anyone's
    const isOwnProfile = user.stableId === id || user.id === id;
    const isElevated   = ['coach', 'admin', 'superadmin'].includes(user.role);
    if (!isOwnProfile && !isElevated)
      return res.status(403).json({ error: 'forbidden', message: 'You can only view your own chip balance.' });

    try {
      const balance = await getBalance(id);
      return res.json({ playerId: id, balance });
    } catch (err) {
      return res.status(500).json({ error: 'internal_error', message: 'Failed to retrieve chip balance.' });
    }
  });

  // ── POST /api/players/:id/chips — coach/admin reload ─────────────────────────
  app.post('/api/players/:id/chips', requireAuth, gateChipBank, requireRole('coach'), async (req, res) => {
    const { id } = req.params;
    const { amount, notes } = req.body || {};

    if (!Number.isInteger(amount) || amount <= 0)
      return res.status(400).json({ error: 'invalid_amount', message: 'amount must be a positive integer.' });

    try {
      const newBalance = await reload(id, amount, req.user.stableId || req.user.id, notes ?? null);
      return res.json({ success: true, playerId: id, newBalance });
    } catch (err) {
      if (err.message === 'insufficient_funds')
        return res.status(422).json({ error: 'insufficient_funds', message: 'Balance would go below zero.' });
      return res.status(500).json({ error: 'internal_error', message: 'Chip reload failed.' });
    }
  });

  // ── POST /api/players/:id/chip-adjust — admin manual adjustment ──────────────
  app.post('/api/players/:id/chip-adjust', requireAuth, gateChipBank, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { amount, notes } = req.body || {};

    if (!Number.isInteger(amount) || amount === 0)
      return res.status(400).json({ error: 'invalid_amount', message: 'amount must be a non-zero integer.' });

    try {
      const newBalance = await adjustment(id, amount, req.user.stableId || req.user.id, notes ?? null);
      return res.json({ success: true, playerId: id, newBalance });
    } catch (err) {
      if (err.message === 'insufficient_funds')
        return res.status(422).json({ error: 'insufficient_funds', message: 'Balance would go below zero.' });
      return res.status(500).json({ error: 'internal_error', message: 'Chip adjustment failed.' });
    }
  });

  // ── GET /api/players/:id/chip-history ────────────────────────────────────────
  app.get('/api/players/:id/chip-history', requireAuth, gateChipBank, async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    const isOwnProfile = user.stableId === id || user.id === id;
    const isElevated   = ['coach', 'admin', 'superadmin'].includes(user.role);
    if (!isOwnProfile && !isElevated)
      return res.status(403).json({ error: 'forbidden', message: 'You can only view your own chip history.' });

    const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    try {
      const transactions = await getTransactionHistory(id, { limit, offset });
      return res.json({ playerId: id, transactions, limit, offset });
    } catch (err) {
      return res.status(500).json({ error: 'internal_error', message: 'Failed to retrieve chip history.' });
    }
  });
};
