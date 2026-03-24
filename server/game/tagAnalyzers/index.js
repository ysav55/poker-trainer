'use strict';

/**
 * Tag analyzer registry.
 * Each entry is an analyzer object: { name, analyze(ctx) → TagResult[] }
 *
 * TagResult shape:
 *   { tag: string, tag_type: 'auto'|'mistake'|'sizing', player_id?: UUID, action_id?: number }
 *
 * Order matters only for readability — all analyzers receive the same ctx
 * and their results are collected independently.
 */

const StreetAnalyzer       = require('./street');
const PreflopAnalyzer      = require('./preflop');
const PostflopAnalyzer     = require('./postflop');
const PotTypeAnalyzer      = require('./potType');
const BoardAnalyzer        = require('./board');
const MistakeAnalyzer      = require('./mistakes');
const { SizingAnalyzer }   = require('./sizing');
const PositionalAnalyzer   = require('./positional');
const HandStrengthAnalyzer = require('./handStrength');

const ANALYZER_REGISTRY = [
  StreetAnalyzer,
  PreflopAnalyzer,
  PostflopAnalyzer,
  PotTypeAnalyzer,
  BoardAnalyzer,
  MistakeAnalyzer,
  SizingAnalyzer,
  PositionalAnalyzer,
  HandStrengthAnalyzer,
];

module.exports = { ANALYZER_REGISTRY };
