'use strict';

const { describe, it, expect, beforeEach } = require('@jest/globals');

const SharedState = require('../state/SharedState.js');

describe('SharedState — activeCoachLocks', () => {
  beforeEach(() => {
    SharedState.activeCoachLocks.clear();
  });

  it('exposes a Map keyed by tableId', () => {
    expect(SharedState.activeCoachLocks).toBeInstanceOf(Map);
  });

  it('claim/release roundtrip', () => {
    SharedState.activeCoachLocks.set('t1', 'coach-a');
    expect(SharedState.activeCoachLocks.get('t1')).toBe('coach-a');
    SharedState.activeCoachLocks.delete('t1');
    expect(SharedState.activeCoachLocks.has('t1')).toBe(false);
  });
});

describe('SharedState — pendingBlinds', () => {
  beforeEach(() => {
    SharedState.pendingBlinds.clear();
  });

  it('exposes a Map keyed by tableId', () => {
    expect(SharedState.pendingBlinds).toBeInstanceOf(Map);
  });

  it('stores {sb, bb, queuedBy, queuedAt}', () => {
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: 123 });
    expect(SharedState.pendingBlinds.get('t1')).toMatchObject({ sb: 25, bb: 50 });
  });
});
