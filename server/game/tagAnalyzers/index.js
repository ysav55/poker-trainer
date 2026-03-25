'use strict';

/**
 * Tag analyzer registry.
 * Each entry satisfies the Analyzer interface below.
 *
 * Order matters only for readability — all analyzers receive the same ctx
 * and their results are collected independently via Promise.allSettled.
 */

/**
 * @typedef {Object} TagResult
 * @property {string} tag                              - Unique identifier, SCREAMING_SNAKE_CASE
 * @property {'auto'|'mistake'|'sizing'} tag_type      - Category
 * @property {string|undefined} player_id             - UUID. Omit for hand-level tags.
 * @property {number|undefined} action_id             - hand_actions.id. Omit unless per-action.
 */

/**
 * @typedef {Object} Analyzer
 * @property {string} name
 * @property {function(object): TagResult[]} analyze   - Must not throw; returns [] on no match.
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
