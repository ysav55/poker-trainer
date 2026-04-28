-- Migration 062: Fix critical race condition in password increment
--
-- Issue: increment_password_uses() from migration 059 is not atomic.
-- Two concurrent calls can both read uses_count=99, both increment to 100,
-- violating max_uses=100. Fixes data integrity + enables unlimited password reuse.
--
-- Solution: Use SELECT FOR UPDATE to lock row before read-check-update cycle.
-- Also fixes:
-- - created_by FK without ON DELETE (audit trail breaks if coach deleted)
-- - Missing index on (school_id, active) for efficient filtering

-- 1. Fix the atomic operation (replace function)
CREATE OR REPLACE FUNCTION increment_password_uses(password_id UUID)
RETURNS TABLE(success BOOLEAN, error_message TEXT) AS $$
DECLARE
  v_max_uses INT;
  v_current_uses INT;
BEGIN
  -- Atomic read-check-update using SELECT FOR UPDATE (row-level lock)
  -- This ensures no concurrent thread can modify uses_count between read and update
  SELECT uses_count, max_uses
  INTO v_current_uses, v_max_uses
  FROM school_passwords
  WHERE id = password_id
  FOR UPDATE;  -- ← CRITICAL: locks this row until transaction commits

  -- Check limit AFTER acquiring lock
  IF v_max_uses IS NOT NULL AND v_current_uses >= v_max_uses THEN
    RETURN QUERY SELECT FALSE, 'Password usage limit exceeded'::TEXT;
    RETURN;
  END IF;

  -- Check expiration
  IF EXISTS (
    SELECT 1 FROM school_passwords
    WHERE id = password_id
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
  ) THEN
    RETURN QUERY SELECT FALSE, 'Password has expired'::TEXT;
    RETURN;
  END IF;

  -- Check active status
  IF NOT EXISTS (
    SELECT 1 FROM school_passwords WHERE id = password_id AND active = true
  ) THEN
    RETURN QUERY SELECT FALSE, 'Password is not active'::TEXT;
    RETURN;
  END IF;

  -- All checks passed; increment atomically
  UPDATE school_passwords
  SET uses_count = uses_count + 1
  WHERE id = password_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix created_by FK (add ON DELETE SET NULL to preserve audit trail)
ALTER TABLE school_passwords
DROP CONSTRAINT IF EXISTS school_passwords_created_by_fkey;

ALTER TABLE school_passwords
ADD CONSTRAINT school_passwords_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES player_profiles(id) ON DELETE SET NULL;

-- 3. Add missing index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_school_passwords_school_active
  ON school_passwords(school_id, active)
  WHERE active = true;

-- 4. Add index for pagination/lookups by school
CREATE INDEX IF NOT EXISTS idx_school_passwords_created_at
  ON school_passwords(school_id, created_at DESC);

-- 5. Verify audit table exists (optional: document dependency)
-- NOTE: Application should log password uses to a separate immutable audit log.
-- school_password_uses table has unique constraint (password_id, player_id) which
-- prevents duplicate registrations but doesn't provide full audit trail.
-- Consider: Add audit_log table with ALL password events (create, use, expire, revoke).
