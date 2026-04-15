'use strict';

const SchoolSettingsService = require('../../services/SchoolSettingsService');

// Mock Supabase
const mockSupabase = {
  from: jest.fn(),
};

jest.mock('../../db/supabase', () => mockSupabase);

describe('SchoolSettingsService', () => {
  const schoolId = 'school-123';
  const updatedBy = 'coach-456';
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SchoolSettingsService(mockSupabase);

    // Setup default mock chain
    const mockChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockSupabase.from.mockReturnValue(mockChain);
  });

  describe('Identity validation', () => {
    it('validates name: required, 1–100 chars, trimmed', async () => {
      // Valid
      expect(() => service._validateIdentity({ name: 'My School', description: 'A great school' })).not.toThrow();

      // Missing name
      expect(() => service._validateIdentity({ description: 'Test' })).toThrow('name is required');

      // Empty name
      expect(() => service._validateIdentity({ name: '   ', description: 'Test' })).toThrow('name cannot be empty');

      // Too long
      expect(() => service._validateIdentity({ name: 'x'.repeat(101), description: 'Test' })).toThrow('name must be 1–100 chars');

      // Description > 500
      expect(() => service._validateIdentity({ name: 'School', description: 'x'.repeat(501) })).toThrow('description must be 0–500 chars');
    });
  });

  describe('Table defaults validation', () => {
    it('validates min < max blinds and stacks', () => {
      // Valid
      expect(() => service._validateTableDefaults({
        min_sb: 5, max_sb: 50, min_bb: 10, max_bb: 100,
        min_starting_stack: 1000, max_starting_stack: 50000
      })).not.toThrow();

      // min_sb >= max_sb
      expect(() => service._validateTableDefaults({
        min_sb: 50, max_sb: 50, min_bb: 10, max_bb: 100,
        min_starting_stack: 1000, max_starting_stack: 50000
      })).toThrow('min_sb must be < max_sb');

      // min_bb >= max_bb
      expect(() => service._validateTableDefaults({
        min_sb: 5, max_sb: 50, min_bb: 100, max_bb: 100,
        min_starting_stack: 1000, max_starting_stack: 50000
      })).toThrow('min_bb must be < max_bb');

      // min_starting_stack >= max_starting_stack
      expect(() => service._validateTableDefaults({
        min_sb: 5, max_sb: 50, min_bb: 10, max_bb: 100,
        min_starting_stack: 50000, max_starting_stack: 50000
      })).toThrow('min_starting_stack must be < max_starting_stack');
    });
  });

  describe('Staking defaults validation', () => {
    it('validates coach_split_pct 0–100, makeup_policy enum', () => {
      // Valid
      expect(() => service._validateStakingDefaults({
        coach_split_pct: 50, makeup_policy: 'carries',
        bankroll_cap: 25000, contract_duration_months: 6
      })).not.toThrow();

      // coach_split_pct out of range
      expect(() => service._validateStakingDefaults({
        coach_split_pct: 101, makeup_policy: 'carries',
        bankroll_cap: 25000, contract_duration_months: 6
      })).toThrow('coach_split_pct must be 0–100');

      // Invalid makeup_policy
      expect(() => service._validateStakingDefaults({
        coach_split_pct: 50, makeup_policy: 'invalid',
        bankroll_cap: 25000, contract_duration_months: 6
      })).toThrow('makeup_policy must be one of: carries, resets_monthly, resets_on_settle');

      // contract_duration_months out of range
      expect(() => service._validateStakingDefaults({
        coach_split_pct: 50, makeup_policy: 'carries',
        bankroll_cap: 25000, contract_duration_months: 37
      })).toThrow('contract_duration_months must be 1–36');
    });
  });

  describe('Leaderboard config validation', () => {
    it('validates metrics enum, update_frequency enum', () => {
      // Valid
      expect(() => service._validateLeaderboardConfig({
        primary_metric: 'net_chips', secondary_metric: 'win_rate',
        update_frequency: 'after_session'
      })).not.toThrow();

      // Invalid primary metric
      expect(() => service._validateLeaderboardConfig({
        primary_metric: 'invalid', secondary_metric: 'win_rate',
        update_frequency: 'after_session'
      })).toThrow('primary_metric must be one of: net_chips, bb_per_100, win_rate, hands_played');

      // Invalid update_frequency
      expect(() => service._validateLeaderboardConfig({
        primary_metric: 'net_chips', secondary_metric: 'win_rate',
        update_frequency: 'invalid'
      })).toThrow('update_frequency must be one of: after_session, hourly, daily');
    });
  });

  describe('Platforms validation', () => {
    it('validates array, max 20 items, max 50 chars per item', () => {
      // Valid
      expect(() => service._validatePlatforms({
        platforms: ['PokerStars', 'GGPoker', '888poker']
      })).not.toThrow();

      // Not an array
      expect(() => service._validatePlatforms({
        platforms: 'PokerStars'
      })).toThrow('platforms must be an array');

      // Too many items (> 20)
      const tooMany = Array.from({ length: 21 }, (_, i) => `Platform${i}`);
      expect(() => service._validatePlatforms({ platforms: tooMany })).toThrow('platforms array cannot exceed 20 items');

      // Item > 50 chars
      expect(() => service._validatePlatforms({
        platforms: ['x'.repeat(51)]
      })).toThrow('each platform name must be ≤50 chars');

      // Empty item
      expect(() => service._validatePlatforms({
        platforms: ['PokerStars', '', 'GGPoker']
      })).toThrow('platform names cannot be empty');
    });
  });

  describe('Appearance validation', () => {
    it('validates hex colors (7 chars #RRGGBB), logo_url nullable', () => {
      // Valid
      expect(() => service._validateAppearance({
        felt_color: '#1e5235', primary_color: '#d4af37', logo_url: 'https://example.com/logo.png'
      })).not.toThrow();

      // Invalid hex: not 7 chars
      expect(() => service._validateAppearance({
        felt_color: '#1e52', primary_color: '#d4af37', logo_url: null
      })).toThrow('felt_color must be a valid hex color (#RRGGBB)');

      // Invalid hex: invalid format
      expect(() => service._validateAppearance({
        felt_color: '1e5235', primary_color: '#d4af37', logo_url: null
      })).toThrow('felt_color must be a valid hex color (#RRGGBB)');

      // Invalid URL
      expect(() => service._validateAppearance({
        felt_color: '#1e5235', primary_color: '#d4af37', logo_url: 'not-a-url'
      })).toThrow('logo_url must be a valid URL or null');
    });
  });

  describe('Auto-pause timeout validation', () => {
    it('validates idle_minutes 5–120', () => {
      // Valid
      expect(() => service._validateAutoPauseTimeout({ idle_minutes: 15 })).not.toThrow();

      // Too low
      expect(() => service._validateAutoPauseTimeout({ idle_minutes: 4 })).toThrow('idle_minutes must be 5–120');

      // Too high
      expect(() => service._validateAutoPauseTimeout({ idle_minutes: 121 })).toThrow('idle_minutes must be 5–120');
    });
  });
});