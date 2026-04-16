'use strict';

const supabase = require('../../db/supabase');
const { q } = require('../../db/utils');

/**
 * Integration test: Concurrent password increment atomicity
 *
 * Verifies that increment_password_uses() is atomic and prevents
 * exceeding max_uses limit under concurrent load.
 *
 * CRITICAL: This tests the fix from migration 062 (SELECT FOR UPDATE locking)
 */

describe('Password Atomicity (migration 062)', () => {
  let schoolId, passwordId;

  beforeAll(async () => {
    // Setup: Create test school + password
    const school = await q(
      supabase
        .from('schools')
        .insert({ name: 'Test School Atomicity' })
        .select()
        .single()
    );
    schoolId = school.id;

    const profile = await q(
      supabase
        .from('player_profiles')
        .insert({ display_name: 'Test User' })
        .select()
        .single()
    );

    const password = await q(
      supabase
        .from('school_passwords')
        .insert({
          school_id: schoolId,
          password_hash: 'hash_test_123',
          max_uses: 3,  // Key: only 3 uses allowed
          created_by: profile.id,
          active: true,
        })
        .select()
        .single()
    );
    passwordId = password.id;
  });

  afterAll(async () => {
    // Cleanup
    await q(supabase.from('school_passwords').delete().eq('id', passwordId));
    await q(supabase.from('schools').delete().eq('id', schoolId));
  });

  // ─────────────────────────────────────────────────────────────────────────

  test('should allow single increment within limit', async () => {
    const result = await q(
      supabase.rpc('increment_password_uses', { password_id: passwordId })
    );

    // BEFORE fix: would return { success: false } or error
    // AFTER fix: returns { success: true }
    expect(result).toHaveProperty('success', true);

    // Verify uses_count incremented
    const password = await q(
      supabase
        .from('school_passwords')
        .select('uses_count')
        .eq('id', passwordId)
        .single()
    );
    expect(password.uses_count).toBeGreaterThan(0);
  });

  test('should block increment when max_uses reached', async () => {
    // Max uses = 3; already incremented 1× above
    // Increment 2 more times to reach limit
    for (let i = 0; i < 2; i++) {
      await q(supabase.rpc('increment_password_uses', { password_id: passwordId }));
    }

    // Now uses_count = 3 (at limit)
    // Fourth attempt should fail
    const result = await q(
      supabase.rpc('increment_password_uses', { password_id: passwordId })
    );

    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error_message', 'Password usage limit exceeded');
  });

  test('should be atomic under concurrent load', async () => {
    // Reset for this test
    const newPassword = await q(
      supabase
        .from('school_passwords')
        .insert({
          school_id: schoolId,
          password_hash: 'hash_concurrent_test',
          max_uses: 10,  // Allow 10 uses
          created_by: (await q(
            supabase
              .from('player_profiles')
              .select('id')
              .limit(1)
              .single()
          )).id,
          active: true,
        })
        .select()
        .single()
    );

    const concurrentPassword = newPassword.id;

    // Simulate 20 concurrent calls (more than max_uses=10)
    // Without atomic locking, many would slip through
    const promises = Array(20).fill(null).map(() =>
      q(supabase.rpc('increment_password_uses', { password_id: concurrentPassword }))
    );

    const results = await Promise.all(promises);

    // Count successes + failures
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;

    // EXPECTED (with atomic SELECT FOR UPDATE):
    // - 10 successes (max_uses limit)
    // - 10 failures (exceeded limit)
    // NOT: mix of success/failure in random order (race condition)

    expect(successes).toBe(10);
    expect(failures).toBe(10);

    // Verify final uses_count is exactly 10 (no overshoot)
    const final = await q(
      supabase
        .from('school_passwords')
        .select('uses_count')
        .eq('id', concurrentPassword)
        .single()
    );

    expect(final.uses_count).toBe(10); // Must be exactly max_uses, not higher

    // Cleanup
    await q(supabase.from('school_passwords').delete().eq('id', concurrentPassword));
  });

  test('should reject expired passwords', async () => {
    const profile = await q(
      supabase
        .from('player_profiles')
        .select('id')
        .limit(1)
        .single()
    );

    const expired = await q(
      supabase
        .from('school_passwords')
        .insert({
          school_id: schoolId,
          password_hash: 'expired_hash',
          max_uses: 999,
          expires_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
          created_by: profile.id,
          active: true,
        })
        .select()
        .single()
    );

    const result = await q(
      supabase.rpc('increment_password_uses', { password_id: expired.id })
    );

    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error_message', 'Password has expired');

    // Cleanup
    await q(supabase.from('school_passwords').delete().eq('id', expired.id));
  });

  test('should reject inactive passwords', async () => {
    const profile = await q(
      supabase
        .from('player_profiles')
        .select('id')
        .limit(1)
        .single()
    );

    const inactive = await q(
      supabase
        .from('school_passwords')
        .insert({
          school_id: schoolId,
          password_hash: 'inactive_hash',
          max_uses: 999,
          created_by: profile.id,
          active: false,  // Inactive
        })
        .select()
        .single()
    );

    const result = await q(
      supabase.rpc('increment_password_uses', { password_id: inactive.id })
    );

    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error_message', 'Password is not active');

    // Cleanup
    await q(supabase.from('school_passwords').delete().eq('id', inactive.id));
  });
});