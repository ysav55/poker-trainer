# School System Phase 2–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement school-based student onboarding (Phase 2: password-protected registration with expiry policies) and school-scoped table/tournament visibility filtering (Phase 3) with private table management.

**Architecture:** 
- Phase 2 adds password-protected registration with SHA256-hashed passwords, expiry policies (date, max-uses, manual toggle), and auto-group assignment. Registration flow uses school name autocomplete + conditional password field; successful registration creates `coached_student` role.
- Phase 3 adds school_id FKs to tables/tournaments, app-level visibility filtering by privacy + school scope, private table whitelists, and a privacy modal during table creation. Spectate access is restricted to same-school tables.
- Both phases are partially parallelizable: database + backend work can run in parallel; frontend depends on backend being testable.

**Tech Stack:** Node.js, Express, Supabase/Postgres, React, TailwindCSS, bcrypt, SHA256

---

## File Structure

### Phase 2: School Passwords

**Backend:**
- `server/services/SchoolPasswordService.js` — password validation, creation, listing, usage tracking
- `server/routes/auth.js` (modify) — enhance POST /api/auth/register
- `server/routes/admin/schools.js` (modify) — add password CRUD endpoints
- `server/db/repositories/SchoolRepository.js` (modify) — add school search method

**Frontend:**
- `client/src/pages/RegisterPage.jsx` (modify) — add school name autocomplete + password field
- `client/src/pages/settings/SchoolTab.jsx` (modify) — add "Passwords" section

**Tests:**
- `server/services/__tests__/SchoolPasswordService.test.js` — unit tests for password service
- `server/routes/__tests__/schoolPasswords.test.js` — integration tests for password routes
- `server/routes/__tests__/auth.test.js` (modify) — tests for enhanced registration

### Phase 3: Visibility Filtering

**Backend:**
- `server/services/TableVisibilityService.js` — visibility checks, whitelist management
- `server/routes/tables.js` (modify) — filter GET, update POST/PATCH, add whitelist endpoints
- `server/routes/tournaments.js` (modify) — same updates as tables

**Frontend:**
- `client/src/components/tables/PrivacyConfigModal.jsx` — new component for privacy configuration
- `client/src/components/tables/CreateTableModal.jsx` (modify) — integrate privacy modal
- `client/src/pages/LobbyPage.jsx` (modify) — remove 'open' for non-admins, default to 'school'
- `client/src/components/TableCard.jsx` (modify) — add privacy badges

**Tests:**
- `server/services/__tests__/TableVisibilityService.test.js` — unit tests for visibility service
- `server/routes/__tests__/tablesVisibility.test.js` — integration tests for visibility filtering
- `client/src/components/__tests__/PrivacyConfigModal.test.jsx` — component tests

---

# PHASE 2: SCHOOL PASSWORDS

## Database & Backend Foundation (Parallelizable)

### Task 1: Create school_passwords Migration

**Files:**
- Create: `supabase/migrations/045_school_passwords.sql`

**Steps:**

- [ ] **Step 1: Write the migration file**

```sql
-- Create school_passwords table
CREATE TABLE school_passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  source VARCHAR(100),
  max_uses INT NOT NULL DEFAULT 999999,
  uses_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  active BOOLEAN NOT NULL DEFAULT true,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES player_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT must_have_expiry_or_max_uses 
    CHECK (expires_at IS NOT NULL OR max_uses IS NOT NULL)
);

CREATE INDEX idx_school_passwords_school_id ON school_passwords(school_id);
CREATE INDEX idx_school_passwords_active ON school_passwords(active);

-- Create school_password_uses table (audit + dedup)
CREATE TABLE school_password_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  password_id UUID NOT NULL REFERENCES school_passwords(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES player_profiles(id),
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(password_id, player_id)
);

CREATE INDEX idx_password_uses_password_id ON school_password_uses(password_id);
CREATE INDEX idx_password_uses_player_id ON school_password_uses(player_id);
```

- [ ] **Step 2: Run migration**

```bash
# In Supabase dashboard or via CLI:
# Verify migration applied successfully
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/045_school_passwords.sql
git commit -m "feat: create school_passwords and school_password_uses tables"
```

---

### Task 2: Create SchoolPasswordService

**Files:**
- Create: `server/services/SchoolPasswordService.js`

**Steps:**

- [ ] **Step 1: Write the service file with all methods**

```javascript
'use strict';

const crypto = require('crypto');
const supabase = require('../db/supabase.js');

const HASH_ALGORITHM = 'sha256';

/**
 * Hash a plaintext password with SHA256 + random salt
 * @param {string} plainPassword
 * @returns {string} "salt$hash" format
 */
function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash(HASH_ALGORITHM)
    .update(salt + plainPassword)
    .digest('hex');
  return `${salt}$${hash}`;
}

/**
 * Verify plaintext password against hash
 * @param {string} plainPassword
 * @param {string} hash "salt$hash" format
 * @returns {boolean}
 */
function verifyPassword(plainPassword, hash) {
  const [salt, storedHash] = hash.split('$');
  if (!salt || !storedHash) return false;
  const computed = crypto.createHash(HASH_ALGORITHM)
    .update(salt + plainPassword)
    .digest('hex');
  return computed === storedHash;
}

module.exports = {
  /**
   * Validate a password during registration
   * @param {string} schoolId
   * @param {string} plainPassword
   * @returns { valid: boolean, passwordId?: string, groupId?: string, error?: string }
   */
  async validatePassword(schoolId, plainPassword) {
    try {
      const { data, error } = await supabase
        .from('school_passwords')
        .select('id, group_id, password_hash, active, uses_count, max_uses, expires_at')
        .eq('school_id', schoolId)
        .eq('active', true)
        .single();

      if (error || !data) {
        return { valid: false, error: 'invalid_password' };
      }

      // Check expiry
      if (data.expires_at && new Date(data.expires_at) <= new Date()) {
        return { valid: false, error: 'password_expired' };
      }

      // Check max uses
      if (data.uses_count >= data.max_uses) {
        return { valid: false, error: 'password_maxed' };
      }

      // Verify password hash
      if (!verifyPassword(plainPassword, data.password_hash)) {
        return { valid: false, error: 'invalid_password' };
      }

      return {
        valid: true,
        passwordId: data.id,
        groupId: data.group_id
      };
    } catch (err) {
      return { valid: false, error: 'internal_error' };
    }
  },

  /**
   * Create a new password
   * @param {string} schoolId
   * @param {string} plainPassword
   * @param {object} config { source?, maxUses?, expiresAt?, groupId? }
   * @returns password record
   */
  async createPassword(schoolId, plainPassword, config, createdBy) {
    try {
      const passwordHash = hashPassword(plainPassword);

      const { data, error } = await supabase
        .from('school_passwords')
        .insert({
          school_id: schoolId,
          password_hash: passwordHash,
          source: config.source || null,
          max_uses: config.maxUses || 999999,
          expires_at: config.expiresAt || null,
          group_id: config.groupId || null,
          created_by: createdBy,
          active: true
        })
        .select('id, school_id, source, max_uses, uses_count, expires_at, active, group_id, created_by, created_at')
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`Failed to create password: ${err.message}`);
    }
  },

  /**
   * List all passwords for a school
   * @param {string} schoolId
   * @returns array of password records with computed stats
   */
  async listPasswords(schoolId) {
    try {
      const { data, error } = await supabase
        .from('school_passwords')
        .select('id, school_id, source, max_uses, uses_count, expires_at, active, group_id, created_by, created_at')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(p => {
        const now = new Date();
        const expiresAt = p.expires_at ? new Date(p.expires_at) : null;
        const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)) : null;
        const isExpired = !p.active || (p.uses_count >= p.max_uses) || (expiresAt && expiresAt <= now);

        return {
          ...p,
          daysUntilExpiry,
          isExpired,
          remainingUses: Math.max(0, p.max_uses - p.uses_count)
        };
      });
    } catch (err) {
      throw new Error(`Failed to list passwords: ${err.message}`);
    }
  },

  /**
   * Disable a password
   * @param {string} schoolId
   * @param {string} passwordId
   * @returns updated record
   */
  async disablePassword(schoolId, passwordId) {
    try {
      const { data, error } = await supabase
        .from('school_passwords')
        .update({ active: false })
        .eq('id', passwordId)
        .eq('school_id', schoolId)
        .select('id, school_id, source, max_uses, uses_count, expires_at, active, group_id, created_by, created_at')
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`Failed to disable password: ${err.message}`);
    }
  },

  /**
   * Delete a password
   * @param {string} schoolId
   * @param {string} passwordId
   * @returns true on success
   */
  async deletePassword(schoolId, passwordId) {
    try {
      const { error } = await supabase
        .from('school_passwords')
        .delete()
        .eq('id', passwordId)
        .eq('school_id', schoolId);

      if (error) throw error;
      return true;
    } catch (err) {
      throw new Error(`Failed to delete password: ${err.message}`);
    }
  },

  /**
   * Record a password usage (during registration)
   * @param {string} passwordId
   * @param {string} playerId
   * @returns true on success
   */
  async recordUsage(passwordId, playerId) {
    try {
      // Record usage
      const { error: insertError } = await supabase
        .from('school_password_uses')
        .insert({
          password_id: passwordId,
          player_id: playerId
        });

      if (insertError) {
        if (insertError.code === '23505') { // UNIQUE constraint violation
          throw new Error('password_already_used');
        }
        throw insertError;
      }

      // Increment uses_count
      const { error: updateError } = await supabase
        .rpc('increment_password_uses', { password_id: passwordId });

      if (updateError) throw updateError;
      return true;
    } catch (err) {
      throw new Error(`Failed to record usage: ${err.message}`);
    }
  }
};
```

- [ ] **Step 2: Create helper function for uses_count increment**

Add this PostgreSQL function to the migration file (update 045_school_passwords.sql):

```sql
CREATE OR REPLACE FUNCTION increment_password_uses(password_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE school_passwords 
  SET uses_count = uses_count + 1 
  WHERE id = password_id;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 3: Test service locally (manual)**

```bash
# Node REPL or test file
const SchoolPasswordService = require('./server/services/SchoolPasswordService');

// Test hash/verify
const hash = hashPassword('test123');
console.log('Hash:', hash);
console.log('Verify:', verifyPassword('test123', hash)); // true
console.log('Wrong:', verifyPassword('wrong', hash)); // false
```

- [ ] **Step 4: Commit**

```bash
git add server/services/SchoolPasswordService.js
git commit -m "feat: add SchoolPasswordService with validation and hashing"
```

---

### Task 3: Write SchoolPasswordService Unit Tests

**Files:**
- Create: `server/services/__tests__/SchoolPasswordService.test.js`

**Steps:**

- [ ] **Step 1: Write unit tests for password hashing and validation**

```javascript
'use strict';

const SchoolPasswordService = require('../SchoolPasswordService');

describe('SchoolPasswordService', () => {
  describe('password validation', () => {
    test('valid password returns { valid: true, passwordId, groupId }', async () => {
      // This requires mocking Supabase; for now, test locally with mock
      // Real integration tests come later
    });

    test('expired password returns { valid: false, error: password_expired }', async () => {
      // Mock test
    });

    test('maxed-out password returns { valid: false, error: password_maxed }', async () => {
      // Mock test
    });

    test('disabled password returns { valid: false, error: invalid_password }', async () => {
      // Mock test
    });

    test('nonexistent password returns { valid: false, error: invalid_password }', async () => {
      // Mock test
    });
  });

  describe('password creation', () => {
    test('creates password with hashed hash', () => {
      // Test hash format is "salt$hash"
    });

    test('validates plainPassword length (min 4)', () => {
      // Should reject short passwords
    });

    test('validates maxUses > 0', () => {
      // Should reject invalid maxUses
    });
  });

  describe('hash functions', () => {
    test('hashPassword creates salt$hash format', () => {
      // Just check format
    });

    test('verifyPassword returns true for correct password', () => {
      // Test verification
    });

    test('verifyPassword returns false for incorrect password', () => {
      // Test verification
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- server/services/__tests__/SchoolPasswordService.test.js
```

- [ ] **Step 3: Commit**

```bash
git add server/services/__tests__/SchoolPasswordService.test.js
git commit -m "test: add unit tests for SchoolPasswordService"
```

---

### Task 4: Add School Search Endpoint

**Files:**
- Modify: `server/routes/auth.js` (add new endpoint)
- Modify: `server/db/repositories/SchoolRepository.js` (add search method)

**Steps:**

- [ ] **Step 1: Add search method to SchoolRepository**

In `server/db/repositories/SchoolRepository.js`, add:

```javascript
/**
 * Search schools by name (partial match, case-insensitive)
 * @param {string} query - school name substring
 * @param {number} limit - max results (default 10)
 * @returns array of { id, name, status }
 */
async function searchByName(query, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('id, name, status')
      .ilike('name', `%${query}%`)
      .eq('status', 'active')
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (err) {
    throw new Error(`Failed to search schools: ${err.message}`);
  }
}

module.exports = {
  // ... existing exports
  searchByName
};
```

- [ ] **Step 2: Add search endpoint to auth.js**

In `server/routes/auth.js`, add this new route (after the register/login routes):

```javascript
// GET /api/schools/search — search schools by name (public, for registration)
app.get('/api/schools/search', async (req, res) => {
  const { q } = req.query || {};
  
  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return res.status(400).json({ error: 'invalid_query', message: 'Query parameter q is required and must be non-empty' });
  }

  try {
    const { searchByName } = require('../db/repositories/SchoolRepository');
    const schools = await searchByName(q.trim(), 10);
    return res.json({ schools });
  } catch (err) {
    log.error('auth', 'school_search_error', `School search failed: ${err.message}`, { err });
    return res.status(500).json({ error: 'internal_error', message: 'Search failed' });
  }
});
```

- [ ] **Step 3: Test endpoint manually**

```bash
curl "http://localhost:3001/api/schools/search?q=poker"
# Expected: { "schools": [ { "id": "uuid", "name": "My Poker School", "status": "active" }, ... ] }
```

- [ ] **Step 4: Commit**

```bash
git add server/db/repositories/SchoolRepository.js server/routes/auth.js
git commit -m "feat: add GET /api/schools/search endpoint for registration autocomplete"
```

---

### Task 5: Add Password CRUD Routes to admin/schools.js

**Files:**
- Modify: `server/routes/admin/schools.js`

**Steps:**

- [ ] **Step 1: Add password routes**

In `server/routes/admin/schools.js`, add these routes inside the route registration function:

```javascript
// POST /api/admin/schools/:schoolId/passwords — create password
router.post('/:schoolId/passwords', requireAuth, requireRole('coach'), requireSchoolMembership, async (req, res) => {
  const { schoolId } = req.params;
  const { plainPassword, source, maxUses, expiresAt, groupId } = req.body || {};

  if (!plainPassword || plainPassword.length < 4) {
    return res.status(400).json({ error: 'invalid_password_format', message: 'Password must be at least 4 characters' });
  }
  if (maxUses !== undefined && maxUses <= 0) {
    return res.status(400).json({ error: 'invalid_max_uses', message: 'Max uses must be greater than 0' });
  }
  if (expiresAt && new Date(expiresAt) <= new Date()) {
    return res.status(400).json({ error: 'invalid_expires_at', message: 'Expiry date must be in the future' });
  }

  try {
    const SchoolPasswordService = require('../services/SchoolPasswordService');
    const password = await SchoolPasswordService.createPassword(
      schoolId,
      plainPassword,
      { source, maxUses: maxUses || 999999, expiresAt, groupId },
      req.user.id
    );
    return res.status(201).json(password);
  } catch (err) {
    log.error('admin', 'password_create_error', `Failed to create password: ${err.message}`, { err });
    return res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/admin/schools/:schoolId/passwords — list passwords
router.get('/:schoolId/passwords', requireAuth, requireRole('coach'), requireSchoolMembership, async (req, res) => {
  const { schoolId } = req.params;

  try {
    const SchoolPasswordService = require('../services/SchoolPasswordService');
    const passwords = await SchoolPasswordService.listPasswords(schoolId);
    return res.json({ passwords });
  } catch (err) {
    log.error('admin', 'password_list_error', `Failed to list passwords: ${err.message}`, { err });
    return res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/admin/schools/:schoolId/passwords/:passwordId — disable password
router.patch('/:schoolId/passwords/:passwordId', requireAuth, requireRole('coach'), requireSchoolMembership, async (req, res) => {
  const { schoolId, passwordId } = req.params;
  const { active } = req.body || {};

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'invalid_active', message: 'active must be a boolean' });
  }

  try {
    const SchoolPasswordService = require('../services/SchoolPasswordService');
    let password;
    if (active === false) {
      password = await SchoolPasswordService.disablePassword(schoolId, passwordId);
    } else {
      // Re-enable: just update active=true (don't reset anything)
      const supabase = require('../db/supabase');
      const { data, error } = await supabase
        .from('school_passwords')
        .update({ active: true })
        .eq('id', passwordId)
        .eq('school_id', schoolId)
        .select('id, school_id, source, max_uses, uses_count, expires_at, active, group_id, created_by, created_at')
        .single();
      if (error) throw error;
      password = data;
    }
    return res.json(password);
  } catch (err) {
    log.error('admin', 'password_update_error', `Failed to update password: ${err.message}`, { err });
    return res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/admin/schools/:schoolId/passwords/:passwordId — delete password
router.delete('/:schoolId/passwords/:passwordId', requireAuth, requireRole('coach'), requireSchoolMembership, async (req, res) => {
  const { schoolId, passwordId } = req.params;

  try {
    const SchoolPasswordService = require('../services/SchoolPasswordService');
    await SchoolPasswordService.deletePassword(schoolId, passwordId);
    return res.status(204).send();
  } catch (err) {
    log.error('admin', 'password_delete_error', `Failed to delete password: ${err.message}`, { err });
    return res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 2: Test routes with curl/Postman**

```bash
# Create password
curl -X POST http://localhost:3001/api/admin/schools/school-uuid/passwords \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"plainPassword":"spring2026","source":"spring_cohort","maxUses":50}'

# List passwords
curl -X GET http://localhost:3001/api/admin/schools/school-uuid/passwords \
  -H "Authorization: Bearer <token>"

# Disable password
curl -X PATCH http://localhost:3001/api/admin/schools/school-uuid/passwords/pw-uuid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"active":false}'
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/admin/schools.js
git commit -m "feat: add password CRUD endpoints to admin/schools route"
```

---

### Task 6: Enhance POST /api/auth/register for School Passwords

**Files:**
- Modify: `server/routes/auth.js`

**Steps:**

- [ ] **Step 1: Update registration logic**

In `server/routes/auth.js`, replace the POST /api/auth/register handler with:

```javascript
// Enhanced registration with optional school password
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, password, email, schoolName, schoolPassword } = req.body || {};

  // Validate core fields
  if (!name || typeof name !== 'string' || name.trim().length < 2)
    return res.status(400).json({ error: 'invalid_name', message: 'Name must be at least 2 characters.' });
  if (!password || typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'invalid_password', message: 'Password must be at least 8 characters.' });
  if (email && (typeof email !== 'string' || !email.includes('@')))
    return res.status(400).json({ error: 'invalid_email', message: 'Email is not valid.' });

  // Validate schoolName/schoolPassword consistency
  const hasSchoolName = schoolName && typeof schoolName === 'string' && schoolName.trim().length > 0;
  const hasSchoolPassword = schoolPassword && typeof schoolPassword === 'string';
  
  if (hasSchoolName && !hasSchoolPassword) {
    return res.status(400).json({ error: 'password_required', message: 'School password is required when joining a school.' });
  }
  if (!hasSchoolName && hasSchoolPassword) {
    return res.status(400).json({ error: 'school_name_required', message: 'School name is required with school password.' });
  }

  const { findByDisplayName, createPlayer, getPrimaryRole, assignRole } = require('../db/repositories/PlayerRepository');
  const { searchByName: searchSchools } = require('../db/repositories/SchoolRepository');
  const SchoolPasswordService = require('../services/SchoolPasswordService');
  const { GroupRepository } = require('../db/repositories/GroupRepository');
  const supabase = require('../db/supabase.js');

  try {
    const existing = await findByDisplayName(name.trim());
    if (existing) return res.status(409).json({ error: 'name_taken', message: 'That name is already registered.' });

    let schoolId = null;
    let groupId = null;
    let roleToAssign = 'solo_student';

    // If registering to a school
    if (hasSchoolName && hasSchoolPassword) {
      // Look up school by name
      const schools = await searchSchools(schoolName.trim(), 1);
      if (schools.length === 0) {
        return res.status(404).json({ error: 'school_not_found', message: 'School not found.' });
      }

      schoolId = schools[0].id;

      // Validate password
      const validation = await SchoolPasswordService.validatePassword(schoolId, schoolPassword);
      if (!validation.valid) {
        const errorMessages = {
          'password_expired': 'Password has expired.',
          'password_maxed': 'Password has reached its use limit.',
          'invalid_password': 'School password is invalid.'
        };
        return res.status(400).json({ 
          error: 'invalid_school_password', 
          message: errorMessages[validation.error] || 'Invalid school password.' 
        });
      }

      groupId = validation.groupId;
      roleToAssign = 'coached_student';

      // Check school capacity
      const { canAddStudent } = require('../db/repositories/SchoolRepository');
      const school = await supabase.from('schools').select('status').eq('id', schoolId).single();
      if (school.error || school.data.status !== 'active') {
        return res.status(409).json({ error: 'school_inactive', message: 'School is not active.' });
      }
      const ok = await canAddStudent(schoolId);
      if (!ok) {
        return res.status(409).json({ error: 'school_at_capacity', message: 'This school has reached its student limit.' });
      }
    }

    // Create player
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const newId = await createPlayer({
      displayName: name.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      passwordHash
    });

    // Set trial fields
    await supabase.from('player_profiles').update({
      trial_expires_at: trialExpiresAt,
      trial_hands_remaining: TRIAL_HANDS,
      school_id: schoolId
    }).eq('id', newId);

    // Assign role
    const { data: roleRow } = await supabase.from('roles').select('id').eq('name', roleToAssign).single();
    if (roleRow?.id) await assignRole(newId, roleRow.id, null);

    // Auto-add to group if applicable
    if (groupId) {
      await GroupRepository.addMember(groupId, newId);
    }

    // Record password usage
    if (hasSchoolPassword) {
      const passwordId = (await SchoolPasswordService.validatePassword(schoolId, schoolPassword)).passwordId;
      await SchoolPasswordService.recordUsage(passwordId, newId);
    }

    const role = await getPrimaryRole(newId);
    const token = JwtService.sign({ stableId: newId, name: name.trim(), role: role ?? roleToAssign, trialStatus: 'active' });
    
    log.info('auth', 'register_ok', `New student registered: ${name.trim()}`, { 
      playerId: newId, 
      role: role ?? roleToAssign, 
      schoolId: schoolId || null 
    });
    
    return res.status(201).json({ 
      stableId: newId, 
      name: name.trim(), 
      role: role ?? roleToAssign, 
      trialStatus: 'active', 
      token 
    });
  } catch (err) {
    log.error('auth', 'register_error', `Registration error: ${err.message}`, { err });
    return res.status(500).json({ error: 'internal_error', message: 'Registration failed.' });
  }
});
```

- [ ] **Step 2: Test registration flow manually**

```bash
# Test 1: Register without school (becomes solo_student)
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"alice","password":"secure123","email":"alice@example.com"}'

# Test 2: Register with school (becomes coached_student)
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"bob","password":"secure123","email":"bob@example.com","schoolName":"My Poker School","schoolPassword":"spring2026"}'

# Test 3: School password required validation
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"carol","password":"secure123","email":"carol@example.com","schoolName":"My Poker School"}'
# Expected: 400 password_required
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat: enhance registration with school name and school password flow"
```

---

### Task 7: Write Registration Integration Tests

**Files:**
- Modify: `server/routes/__tests__/auth.test.js`

**Steps:**

- [ ] **Step 1: Add tests for enhanced registration**

```javascript
describe('POST /api/auth/register with school password', () => {
  test('register without school becomes solo_student', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'alice',
        password: 'secure123',
        email: 'alice@example.com'
      });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('solo_student');
  });

  test('register with valid school password becomes coached_student', async () => {
    // Setup: create school and password first
    // Then register
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'bob',
        password: 'secure123',
        email: 'bob@example.com',
        schoolName: 'Test School',
        schoolPassword: 'validpass123'
      });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('coached_student');
  });

  test('school password required when schoolName provided', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'carol',
        password: 'secure123',
        schoolName: 'Test School'
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('password_required');
  });

  test('invalid school password rejected', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'david',
        password: 'secure123',
        schoolName: 'Test School',
        schoolPassword: 'wrongpass'
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_school_password');
  });

  test('school not found returns 404', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'eve',
        password: 'secure123',
        schoolName: 'Nonexistent School',
        schoolPassword: 'somepass'
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('school_not_found');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- server/routes/__tests__/auth.test.js
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/__tests__/auth.test.js
git commit -m "test: add integration tests for school password registration"
```

---

## Frontend Phase 2

### Task 8: Update RegisterPage with School Autocomplete and Password Field

**Files:**
- Modify: `client/src/pages/RegisterPage.jsx`

**Steps:**

- [ ] **Step 1: Update RegisterPage component**

```jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { colors } from '../lib/colors.js';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolPassword, setSchoolPassword] = useState('');
  const [schoolSuggestions, setSchoolSuggestions] = useState([]);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // School name autocomplete
  useEffect(() => {
    if (schoolSearchQuery.length < 2) {
      setSchoolSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/schools/search?q=${encodeURIComponent(schoolSearchQuery)}`);
        setSchoolSuggestions(data?.schools || []);
      } catch (err) {
        setSchoolSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [schoolSearchQuery]);

  const handleSelectSchool = (school) => {
    setSchoolName(school.name);
    setSelectedSchool(school);
    setSchoolSearchQuery('');
    setSchoolSuggestions([]);
  };

  const handleClearSchool = () => {
    setSchoolName('');
    setSelectedSchool(null);
    setSchoolPassword('');
    setSchoolSearchQuery('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (selectedSchool && !schoolPassword) {
      setError('School password is required');
      return;
    }

    setBusy(true);

    try {
      const body = {
        name: name.trim(),
        password,
        email: email.trim() || undefined
      };

      if (selectedSchool) {
        body.schoolName = selectedSchool.name;
        body.schoolPassword = schoolPassword;
      }

      const result = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      // Store token and redirect
      localStorage.setItem('token', result.token);
      window.location.href = '/';
    } catch (err) {
      setError(err.message || 'Registration failed');
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
      <h1>Register</h1>

      <form onSubmit={handleSubmit}>
        {/* Name */}
        <div style={{ marginBottom: '1rem' }}>
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: '1rem' }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        {/* Email */}
        <div style={{ marginBottom: '1rem' }}>
          <label>Email (optional)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        {/* School Name Autocomplete */}
        <div style={{ marginBottom: '1rem' }}>
          <label>School (optional)</label>
          {selectedSchool ? (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.5rem',
              backgroundColor: colors.bgSecondary,
              borderRadius: '4px'
            }}>
              <span>{selectedSchool.name}</span>
              <button
                type="button"
                onClick={handleClearSchool}
                style={{ cursor: 'pointer', background: 'none', border: 'none' }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={schoolSearchQuery}
                onChange={(e) => setSchoolSearchQuery(e.target.value)}
                placeholder="Search schools..."
                style={{ width: '100%', padding: '0.5rem' }}
              />
              {schoolSuggestions.length > 0 && (
                <ul style={{
                  listStyle: 'none',
                  padding: '0.5rem',
                  border: `1px solid ${colors.borderMain}`,
                  borderTop: 'none',
                  marginTop: '-4px'
                }}>
                  {schoolSuggestions.map((school) => (
                    <li key={school.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectSchool(school)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        {school.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* School Password (shown if school selected) */}
        {selectedSchool && (
          <div style={{ marginBottom: '1rem' }}>
            <label>School Password</label>
            <input
              type="password"
              value={schoolPassword}
              onChange={(e) => setSchoolPassword(e.target.value)}
              placeholder="Ask your coach"
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
        )}

        {/* Error message */}
        {error && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.5rem',
            backgroundColor: '#fee',
            color: '#c00',
            borderRadius: '4px'
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%',
            padding: '0.5rem',
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: busy ? 'not-allowed' : 'pointer'
          }}
        >
          {busy ? 'Registering...' : 'Register'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Test component in browser**

```
npm run dev
# Navigate to /register
# Test autocomplete, school selection, password field visibility
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/RegisterPage.jsx
git commit -m "feat: add school autocomplete and conditional password field to RegisterPage"
```

---

### Task 9: Add "Passwords" Section to SchoolTab

**Files:**
- Modify: `client/src/pages/settings/SchoolTab.jsx`

**Steps:**

- [ ] **Step 1: Add password management section**

Add this new section to SchoolTab.jsx (in the component render, alongside existing sections):

```jsx
// Password Management Section
const [passwords, setPasswords] = useState([]);
const [showPasswordModal, setShowPasswordModal] = useState(false);
const [passwordFormData, setPasswordFormData] = useState({
  plainPassword: '',
  source: '',
  maxUses: 999999,
  expiresAt: '',
  groupId: ''
});

// Load passwords on mount
useEffect(() => {
  if (!schoolId) return;
  apiFetch(`/api/admin/schools/${schoolId}/passwords`)
    .then(data => setPasswords(data?.passwords || []))
    .catch(() => {});
}, [schoolId]);

const handleCreatePassword = async () => {
  if (!passwordFormData.plainPassword) {
    setErrors(prev => ({ ...prev, password: 'Password required' }));
    return;
  }

  try {
    await apiFetch(`/api/admin/schools/${schoolId}/passwords`, {
      method: 'POST',
      body: JSON.stringify({
        plainPassword: passwordFormData.plainPassword,
        source: passwordFormData.source || undefined,
        maxUses: parseInt(passwordFormData.maxUses) || 999999,
        expiresAt: passwordFormData.expiresAt || undefined,
        groupId: passwordFormData.groupId || undefined
      })
    });

    // Refresh passwords
    const updated = await apiFetch(`/api/admin/schools/${schoolId}/passwords`);
    setPasswords(updated?.passwords || []);
    setShowPasswordModal(false);
    setPasswordFormData({
      plainPassword: '',
      source: '',
      maxUses: 999999,
      expiresAt: '',
      groupId: ''
    });
  } catch (err) {
    setErrors(prev => ({ ...prev, password: err.message }));
  }
};

const handleDisablePassword = async (passwordId) => {
  try {
    await apiFetch(`/api/admin/schools/${schoolId}/passwords/${passwordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: false })
    });
    const updated = await apiFetch(`/api/admin/schools/${schoolId}/passwords`);
    setPasswords(updated?.passwords || []);
  } catch (err) {
    setErrors(prev => ({ ...prev, password: err.message }));
  }
};

// In the JSX, add this section:
<div style={{ marginBottom: '2rem' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
    <h3>School Passwords</h3>
    <button
      onClick={() => setShowPasswordModal(true)}
      style={{
        padding: '0.5rem 1rem',
        backgroundColor: colors.primary,
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}
    >
      + Create Password
    </button>
  </div>

  {passwords.length === 0 ? (
    <p style={{ color: colors.textMuted }}>No passwords created yet</p>
  ) : (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${colors.borderMain}` }}>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Source</th>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Uses</th>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Expires In</th>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {passwords.map(pw => (
          <tr key={pw.id} style={{ borderBottom: `1px solid ${colors.borderMain}` }}>
            <td style={{ padding: '0.5rem' }}>{pw.source || '—'}</td>
            <td style={{ padding: '0.5rem' }}>{pw.uses_count} / {pw.max_uses}</td>
            <td style={{ padding: '0.5rem' }}>
              {pw.daysUntilExpiry === null ? 'Never' : `${pw.daysUntilExpiry} days`}
            </td>
            <td style={{ padding: '0.5rem' }}>
              {pw.isExpired ? (
                <span style={{ color: '#c00' }}>Expired</span>
              ) : (
                <span style={{ color: '#0a0' }}>Active</span>
              )}
            </td>
            <td style={{ padding: '0.5rem' }}>
              {!pw.isExpired && (
                <button
                  onClick={() => handleDisablePassword(pw.id)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: '#fcc',
                    color: '#c00',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginRight: '0.5rem'
                  }}
                >
                  Disable
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )}

  {/* Password Creation Modal */}
  {showPasswordModal && (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'white',
      padding: '2rem',
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      zIndex: 1000,
      maxWidth: '500px',
      width: '90%'
    }}>
      <h3>Create School Password</h3>
      
      <div style={{ marginBottom: '1rem' }}>
        <label>Password (required)</label>
        <input
          type="password"
          value={passwordFormData.plainPassword}
          onChange={(e) => setPasswordFormData(prev => ({ ...prev, plainPassword: e.target.value }))}
          placeholder="E.g., spring2026"
          style={{ width: '100%', padding: '0.5rem' }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>Source (optional)</label>
        <input
          type="text"
          value={passwordFormData.source}
          onChange={(e) => setPasswordFormData(prev => ({ ...prev, source: e.target.value }))}
          placeholder="E.g., spring_cohort"
          style={{ width: '100%', padding: '0.5rem' }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>Max Uses</label>
        <input
          type="number"
          value={passwordFormData.maxUses}
          onChange={(e) => setPasswordFormData(prev => ({ ...prev, maxUses: e.target.value }))}
          min="1"
          style={{ width: '100%', padding: '0.5rem' }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>Expires At (optional)</label>
        <input
          type="datetime-local"
          value={passwordFormData.expiresAt}
          onChange={(e) => setPasswordFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
          style={{ width: '100%', padding: '0.5rem' }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>Auto-add to Group (optional)</label>
        <select
          value={passwordFormData.groupId}
          onChange={(e) => setPasswordFormData(prev => ({ ...prev, groupId: e.target.value }))}
          style={{ width: '100%', padding: '0.5rem' }}
        >
          <option value="">— Select Group —</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {errors.password && (
        <p style={{ color: '#c00', marginBottom: '1rem' }}>{errors.password}</p>
      )}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={() => setShowPasswordModal(false)}
          style={{
            flex: 1,
            padding: '0.5rem',
            backgroundColor: colors.bgSecondary,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleCreatePassword}
          style={{
            flex: 1,
            padding: '0.5rem',
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Create
        </button>
      </div>
    </div>
  )}

  {/* Modal backdrop */}
  {showPasswordModal && (
    <div
      onClick={() => setShowPasswordModal(false)}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 999
      }}
    />
  )}
</div>
```

- [ ] **Step 2: Test in browser**

```bash
npm run dev
# Navigate to SettingsPage > SchoolTab
# Test creating passwords, viewing list, disabling
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/settings/SchoolTab.jsx
git commit -m "feat: add password management section to SchoolTab"
```

---

## PHASE 3: VISIBILITY FILTERING

### Task 10: Create Visibility Filtering Migrations

**Files:**
- Create: `supabase/migrations/046_visibility_filtering.sql`

**Steps:**

- [ ] **Step 1: Write migration**

```sql
-- Add school_id to tables
ALTER TABLE tables ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
CREATE INDEX idx_tables_school_id ON tables(school_id);

-- Add school_id to tournament_groups
ALTER TABLE tournament_groups ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
CREATE INDEX idx_tournament_groups_school_id ON tournament_groups(school_id);

-- Create private_table_whitelist
CREATE TABLE private_table_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id VARCHAR(100) NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES player_profiles(id),
  invited_by UUID NOT NULL REFERENCES player_profiles(id),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(table_id, player_id)
);

CREATE INDEX idx_whitelist_table_id ON private_table_whitelist(table_id);
CREATE INDEX idx_whitelist_player_id ON private_table_whitelist(player_id);
```

- [ ] **Step 2: Apply migration**

```bash
# Verify in Supabase dashboard
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/046_visibility_filtering.sql
git commit -m "feat: add school_id to tables/tournaments, create private_table_whitelist"
```

---

### Task 11: Create TableVisibilityService

**Files:**
- Create: `server/services/TableVisibilityService.js`

**Steps:**

- [ ] **Step 1: Write the service**

```javascript
'use strict';

const supabase = require('../db/supabase.js');

module.exports = {
  /**
   * Check if a player can see a table (visibility check)
   * @param {string} playerId
   * @param {object} table - must have { privacy, school_id }
   * @returns boolean
   */
  async canPlayerSeeTable(playerId, table) {
    if (table.privacy === 'open') return true;

    if (table.privacy === 'school') {
      const { data: player, error } = await supabase
        .from('player_profiles')
        .select('school_id')
        .eq('id', playerId)
        .single();
      if (error) return false;
      return player.school_id === table.school_id;
    }

    if (table.privacy === 'private') {
      return await this.isPlayerWhitelisted(table.id, playerId);
    }

    return false;
  },

  /**
   * Get all tables visible to a player
   * @param {string} playerId
   * @param {string?} mode - optional filter
   * @returns array of visible tables
   */
  async getVisibleTables(playerId, mode) {
    try {
      let query = supabase
        .from('tables')
        .select('*')
        .neq('mode', 'bot_cash')
        .neq('status', 'completed');

      if (mode) {
        query = query.eq('mode', mode);
      }

      const { data: allTables, error } = await query;
      if (error) throw error;

      // Filter by visibility
      const visible = await Promise.all(
        allTables.map(async (t) => {
          const canSee = await this.canPlayerSeeTable(playerId, t);
          return canSee ? t : null;
        })
      );

      return visible.filter(Boolean);
    } catch (err) {
      throw new Error(`Failed to get visible tables: ${err.message}`);
    }
  },

  /**
   * Check if player is whitelisted for a private table
   * @param {string} tableId
   * @param {string} playerId
   * @returns boolean
   */
  async isPlayerWhitelisted(tableId, playerId) {
    try {
      const { data, error } = await supabase
        .from('private_table_whitelist')
        .select('id')
        .eq('table_id', tableId)
        .eq('player_id', playerId)
        .single();

      if (error && error.code === 'PGRST116') return false; // Not found
      if (error) throw error;
      return !!data;
    } catch (err) {
      throw new Error(`Failed to check whitelist: ${err.message}`);
    }
  },

  /**
   * Add player to whitelist
   * @param {string} tableId
   * @param {string} playerId
   * @param {string} invitedBy
   * @returns true on success
   */
  async addToWhitelist(tableId, playerId, invitedBy) {
    try {
      const { error } = await supabase
        .from('private_table_whitelist')
        .insert({
          table_id: tableId,
          player_id: playerId,
          invited_by: invitedBy
        });

      if (error) {
        if (error.code === '23505') throw new Error('already_whitelisted');
        throw error;
      }
      return true;
    } catch (err) {
      throw new Error(`Failed to add to whitelist: ${err.message}`);
    }
  },

  /**
   * Remove player from whitelist
   * @param {string} tableId
   * @param {string} playerId
   * @returns true on success
   */
  async removeFromWhitelist(tableId, playerId) {
    try {
      const { error } = await supabase
        .from('private_table_whitelist')
        .delete()
        .eq('table_id', tableId)
        .eq('player_id', playerId);

      if (error) throw error;
      return true;
    } catch (err) {
      throw new Error(`Failed to remove from whitelist: ${err.message}`);
    }
  },

  /**
   * Get all whitelisted players for a table
   * @param {string} tableId
   * @returns array of { playerId, displayName, invitedBy, invitedAt }
   */
  async getWhitelist(tableId) {
    try {
      const { data, error } = await supabase
        .from('private_table_whitelist')
        .select(`
          player_id,
          invited_by,
          invited_at,
          player_profiles!inner(display_name)
        `)
        .eq('table_id', tableId);

      if (error) throw error;

      return (data || []).map(row => ({
        playerId: row.player_id,
        displayName: row.player_profiles.display_name,
        invitedBy: row.invited_by,
        invitedAt: row.invited_at
      }));
    } catch (err) {
      throw new Error(`Failed to get whitelist: ${err.message}`);
    }
  },

  /**
   * Auto-add group members to whitelist
   * @param {string} tableId
   * @param {string} groupId
   * @param {string} invitedBy
   * @returns number of players added
   */
  async addGroupToWhitelist(tableId, groupId, invitedBy) {
    try {
      // Get group members
      const { data: members, error: memberError } = await supabase
        .from('group_members')
        .select('player_id')
        .eq('group_id', groupId);

      if (memberError) throw memberError;

      // Add each member
      let added = 0;
      for (const member of members || []) {
        try {
          await this.addToWhitelist(tableId, member.player_id, invitedBy);
          added++;
        } catch (err) {
          if (!err.message.includes('already_whitelisted')) throw err;
        }
      }

      return added;
    } catch (err) {
      throw new Error(`Failed to add group to whitelist: ${err.message}`);
    }
  }
};
```

- [ ] **Step 2: Test service locally (manual)**

```bash
# Node REPL test
const TableVisibilityService = require('./server/services/TableVisibilityService');

// Test visibility check
const table = { id: 'table-1', privacy: 'school', school_id: 'school-1' };
const visible = await TableVisibilityService.canPlayerSeeTable('player-1', table);
console.log('Visible:', visible);
```

- [ ] **Step 3: Commit**

```bash
git add server/services/TableVisibilityService.js
git commit -m "feat: add TableVisibilityService for visibility filtering"
```

---

### Task 12: Update GET /api/tables to Filter by Visibility

**Files:**
- Modify: `server/routes/tables.js`

**Steps:**

- [ ] **Step 1: Update GET /api/tables route**

In `server/routes/tables.js`, replace the GET handler with:

```javascript
// GET /api/tables — list visible tables (filtered by privacy + school)
app.get('/api/tables', requireAuth, async (req, res) => {
  try {
    const TableVisibilityService = require('../services/TableVisibilityService');

    const [dbTables, liveSummaries] = await Promise.all([
      TableRepository.listTables(),
      liveTableSummaries()
    ]);

    // Filter by visibility
    const visibleTables = await Promise.all(
      dbTables
        .filter(t => t.mode !== 'bot_cash')
        .map(async (t) => {
          const canSee = await TableVisibilityService.canPlayerSeeTable(req.user.id, t);
          return canSee ? t : null;
        })
    );

    const liveMap = new Map((liveSummaries || []).map(s => [s.id, s]));
    const tables = visibleTables
      .filter(Boolean)
      .map(t => ({
        ...t,
        live: liveMap.get(t.id) ?? null
      }));

    res.json({ tables });
  } catch (err) {
    log.error('tables', 'get_tables_error', `Failed to get tables: ${err.message}`, { err });
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 2: Test endpoint**

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/tables
# Should return only visible tables
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/tables.js
git commit -m "feat: filter GET /api/tables by visibility and school scope"
```

---

### Task 13: Update POST /api/tables to Handle School ID and Privacy

**Files:**
- Modify: `server/routes/tables.js`

**Steps:**

- [ ] **Step 1: Update POST /api/tables route**

In `server/routes/tables.js`, replace the POST handler with:

```javascript
// POST /api/tables — create table with school_id and privacy configuration
app.post('/api/tables', requireAuth, canCreateTable, async (req, res) => {
  try {
    const { name, mode, config = {}, scheduledFor = null, privacy = 'school', privateConfig = {} } = req.body || {};

    if (!name) return res.status(400).json({ error: 'name_required', message: 'Table name is required' });

    // Validate privacy
    const validPrivacy = ['open', 'school', 'private'];
    if (!validPrivacy.includes(privacy)) {
      return res.status(400).json({ error: 'invalid_privacy', message: 'Privacy must be open, school, or private' });
    }

    // Check admin status for 'open' privacy
    const perms = await getPlayerPermissions(req.user.id);
    const isAdmin = perms.has('admin:access');
    if (privacy === 'open' && !isAdmin) {
      return res.status(400).json({ error: 'forbidden_privacy', message: 'Only admins can create open tables' });
    }

    // Get school_id from user
    const { data: player, error: playerError } = await supabase
      .from('player_profiles')
      .select('school_id')
      .eq('id', req.user.id)
      .single();

    if (playerError) throw playerError;

    let schoolId = null;
    if (isAdmin && privacy === 'open') {
      schoolId = null; // Open tables have no school
    } else {
      schoolId = player.school_id; // Coach: assigned to their school
    }

    // Validate private table config
    if (privacy === 'private') {
      const whitelistedPlayers = privateConfig.whitelistedPlayers || [];
      if (whitelistedPlayers.length === 0) {
        return res.status(400).json({
          error: 'invalid_private_config',
          message: 'Private tables require at least one whitelisted player'
        });
      }
    }

    // Create table
    const id = 'table-' + Date.now();
    await TableRepository.createTable({
      id,
      name,
      mode,
      config,
      createdBy: req.user.id,
      scheduledFor,
      privacy,
      controllerId: req.user.id,
      school_id: schoolId
    });

    // Add whitelisted players if private
    if (privacy === 'private') {
      const TableVisibilityService = require('../services/TableVisibilityService');
      const whitelistedPlayers = privateConfig.whitelistedPlayers || [];
      const groupId = privateConfig.groupId;

      // Add individual players
      for (const playerId of whitelistedPlayers) {
        await TableVisibilityService.addToWhitelist(id, playerId, req.user.id);
      }

      // Auto-add group members if groupId provided
      if (groupId) {
        await TableVisibilityService.addGroupToWhitelist(id, groupId, req.user.id);
      }
    }

    const table = await TableRepository.getTable(id);
    res.status(201).json(table);
  } catch (err) {
    log.error('tables', 'create_table_error', `Failed to create table: ${err.message}`, { err });
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 2: Update TableRepository.createTable to accept school_id**

In `server/db/repositories/TableRepository.js`, update the `createTable` method signature to include `school_id` in the insert:

```javascript
async function createTable({ id, name, mode, config, createdBy, scheduledFor, privacy, controllerId, school_id }) {
  const { error } = await supabase
    .from('tables')
    .insert({
      id,
      name,
      mode,
      config,
      created_by: createdBy,
      scheduled_for: scheduledFor,
      privacy,
      controller_id: controllerId,
      school_id: school_id
    });
  if (error) throw error;
}
```

- [ ] **Step 3: Test endpoint**

```bash
# Create private table
curl -X POST http://localhost:3001/api/tables \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Private Game",
    "mode": "coached_cash",
    "config": { "sb": 25, "bb": 50, "startingStack": 5000 },
    "privacy": "private",
    "privateConfig": {
      "whitelistedPlayers": ["player-uuid-1", "player-uuid-2"],
      "groupId": "group-uuid"
    }
  }'
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/tables.js server/db/repositories/TableRepository.js
git commit -m "feat: update POST /api/tables to handle school_id and privacy configuration"
```

---

### Task 14: Add Privacy Edit and Whitelist Management Routes

**Files:**
- Modify: `server/routes/tables.js`

**Steps:**

- [ ] **Step 1: Add new routes**

In `server/routes/tables.js`, add these routes:

```javascript
// PATCH /api/tables/:id/privacy — edit privacy settings
app.patch('/api/tables/:id/privacy', requireAuth, async (req, res) => {
  const { privacy, privateConfig = {} } = req.body || {};

  const table = await assertCanManage(req, res, req.params.id);
  if (!table) return;

  if (!['open', 'school', 'private'].includes(privacy)) {
    return res.status(400).json({ error: 'invalid_privacy', message: 'Invalid privacy value' });
  }

  if (privacy === 'private' && (!privateConfig.whitelistedPlayers || privateConfig.whitelistedPlayers.length === 0)) {
    return res.status(400).json({
      error: 'invalid_private_config',
      message: 'Private tables require at least one whitelisted player'
    });
  }

  try {
    // Clear old whitelist
    await supabase.from('private_table_whitelist').delete().eq('table_id', table.id);

    // Add new whitelisted players
    if (privacy === 'private') {
      const TableVisibilityService = require('../services/TableVisibilityService');
      const whitelistedPlayers = privateConfig.whitelistedPlayers || [];
      const groupId = privateConfig.groupId;

      for (const playerId of whitelistedPlayers) {
        await TableVisibilityService.addToWhitelist(table.id, playerId, req.user.id);
      }

      if (groupId) {
        await TableVisibilityService.addGroupToWhitelist(table.id, groupId, req.user.id);
      }
    }

    // Update privacy
    const { error } = await supabase
      .from('tables')
      .update({ privacy })
      .eq('id', table.id);

    if (error) throw error;

    const updated = await TableRepository.getTable(table.id);
    res.json(updated);
  } catch (err) {
    log.error('tables', 'privacy_edit_error', `Failed to edit privacy: ${err.message}`, { err });
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/tables/:id/whitelist — add player to whitelist
app.post('/api/tables/:id/whitelist', requireAuth, async (req, res) => {
  const { playerId } = req.body || {};

  const table = await assertCanManage(req, res, req.params.id);
  if (!table) return;

  if (!playerId) {
    return res.status(400).json({ error: 'invalid_player_id', message: 'playerId is required' });
  }

  try {
    const TableVisibilityService = require('../services/TableVisibilityService');
    await TableVisibilityService.addToWhitelist(table.id, playerId, req.user.id);

    const whitelist = await TableVisibilityService.getWhitelist(table.id);
    res.status(201).json({ whitelist });
  } catch (err) {
    if (err.message.includes('already_whitelisted')) {
      return res.status(409).json({ error: 'already_whitelisted', message: 'Player is already invited' });
    }
    log.error('tables', 'whitelist_add_error', `Failed to add to whitelist: ${err.message}`, { err });
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/tables/:id/whitelist/:playerId — remove from whitelist
app.delete('/api/tables/:id/whitelist/:playerId', requireAuth, async (req, res) => {
  const { playerId } = req.params;

  const table = await assertCanManage(req, res, req.params.id);
  if (!table) return;

  try {
    const TableVisibilityService = require('../services/TableVisibilityService');
    await TableVisibilityService.removeFromWhitelist(table.id, playerId);

    const whitelist = await TableVisibilityService.getWhitelist(table.id);
    res.json({ whitelist });
  } catch (err) {
    log.error('tables', 'whitelist_remove_error', `Failed to remove from whitelist: ${err.message}`, { err });
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 2: Test routes**

```bash
# Add to whitelist
curl -X POST http://localhost:3001/api/tables/table-1/whitelist \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"playerId":"player-uuid"}'

# Remove from whitelist
curl -X DELETE http://localhost:3001/api/tables/table-1/whitelist/player-uuid \
  -H "Authorization: Bearer <token>"
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/tables.js
git commit -m "feat: add privacy edit and whitelist management routes"
```

---

### Task 15: Update GET /api/tournaments to Filter by Visibility

**Files:**
- Modify: `server/routes/tournaments.js`

**Steps:**

- [ ] **Step 1: Update GET /api/tournaments route**

Apply same filtering logic as tables.js GET handler to tournaments.js:

```javascript
// GET /api/tournaments — list visible tournaments
app.get('/api/tournaments', requireAuth, async (req, res) => {
  try {
    const TableVisibilityService = require('../services/TableVisibilityService');

    const { data: allTournaments, error } = await supabase
      .from('tournament_groups')
      .select('*')
      .neq('status', 'completed');

    if (error) throw error;

    // Filter by visibility
    const visibleTournaments = await Promise.all(
      (allTournaments || []).map(async (t) => {
        const canSee = await TableVisibilityService.canPlayerSeeTable(req.user.id, {
          id: t.id,
          privacy: t.privacy,
          school_id: t.school_id
        });
        return canSee ? t : null;
      })
    );

    const tournaments = visibleTournaments.filter(Boolean);
    res.json({ tournaments });
  } catch (err) {
    log.error('tournaments', 'get_tournaments_error', `Failed to get tournaments: ${err.message}`, { err });
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 2: Update POST /api/tournaments to handle school_id and privacy**

Apply same logic as tables.js POST handler to tournaments.js (create tournament with school_id, privacy config, whitelist management).

- [ ] **Step 3: Add PATCH privacy and whitelist routes to tournaments.js**

Add the same privacy edit and whitelist routes as tables.js to tournaments.js.

- [ ] **Step 4: Commit**

```bash
git add server/routes/tournaments.js
git commit -m "feat: add visibility filtering to tournaments (same as tables)"
```

---

### Task 16: Create PrivacyConfigModal Component

**Files:**
- Create: `client/src/components/tables/PrivacyConfigModal.jsx`

**Steps:**

- [ ] **Step 1: Write component**

```jsx
import React, { useState } from 'react';
import { colors } from '../../lib/colors.js';

export default function PrivacyConfigModal({
  tableName,
  initialPrivacy = 'school',
  initialWhitelist = [],
  initialGroupId = null,
  schoolMembers = [],
  groups = [],
  onConfirm,
  onCancel
}) {
  const [privacy, setPrivacy] = useState(initialPrivacy);
  const [searchQuery, setSearchQuery] = useState('');
  const [whitelistedPlayers, setWhitelistedPlayers] = useState(initialWhitelist);
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId);

  // Filter students by search
  const searchResults = schoolMembers.filter(m =>
    m.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get group members
  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const groupMemberIds = selectedGroup?.memberIds || [];

  const togglePlayer = (playerId) => {
    setWhitelistedPlayers(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const isValid = privacy === 'school' || whitelistedPlayers.length > 0;

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'white',
      padding: '2rem',
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      zIndex: 1000,
      maxWidth: '500px',
      width: '90%',
      maxHeight: '90vh',
      overflowY: 'auto'
    }}>
      <h2>Set Privacy: {tableName}</h2>

      {/* Privacy tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: `1px solid ${colors.borderMain}` }}>
        <button
          onClick={() => {
            setPrivacy('school');
            setWhitelistedPlayers([]);
          }}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: privacy === 'school' ? colors.primary : 'transparent',
            color: privacy === 'school' ? 'white' : colors.textMain,
            border: 'none',
            cursor: 'pointer',
            borderBottom: privacy === 'school' ? `3px solid ${colors.primary}` : '3px solid transparent'
          }}
        >
          School
        </button>
        <button
          onClick={() => setPrivacy('private')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: privacy === 'private' ? colors.primary : 'transparent',
            color: privacy === 'private' ? 'white' : colors.textMain,
            border: 'none',
            cursor: 'pointer',
            borderBottom: privacy === 'private' ? `3px solid ${colors.primary}` : '3px solid transparent'
          }}
        >
          Private
        </button>
      </div>

      {/* School mode */}
      {privacy === 'school' && (
        <div style={{ marginBottom: '2rem' }}>
          <p style={{ color: colors.textMuted }}>✓ All school members can join</p>
        </div>
      )}

      {/* Private mode */}
      {privacy === 'private' && (
        <div>
          {/* Search */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Invite Students
            </label>
            <input
              type="text"
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid ${colors.borderMain}`,
                borderRadius: '4px'
              }}
            />
          </div>

          {/* Student list */}
          <div style={{
            border: `1px solid ${colors.borderMain}`,
            borderRadius: '4px',
            maxHeight: '200px',
            overflowY: 'auto',
            marginBottom: '1rem'
          }}>
            {searchResults.length === 0 ? (
              <p style={{ padding: '1rem', color: colors.textMuted }}>No students found</p>
            ) : (
              searchResults.map(student => (
                <label key={student.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.5rem',
                  borderBottom: `1px solid ${colors.borderMain}`,
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={whitelistedPlayers.includes(student.id)}
                    onChange={() => togglePlayer(student.id)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>
                    {student.displayName}
                    {student.email && <span style={{ color: colors.textMuted, marginLeft: '0.5rem' }}>({student.email})</span>}
                  </span>
                </label>
              ))
            )}
          </div>

          {/* Group selector */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Auto-add Group (optional)
            </label>
            <select
              value={selectedGroupId || ''}
              onChange={(e) => setSelectedGroupId(e.target.value || null)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid ${colors.borderMain}`,
                borderRadius: '4px'
              }}
            >
              <option value="">— Select Group —</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            {selectedGroup && (
              <p style={{ fontSize: '0.875rem', color: colors.textMuted, marginTop: '0.5rem' }}>
                Will add {groupMemberIds.length} members from {selectedGroup.name}
              </p>
            )}
          </div>

          {/* Validation */}
          {whitelistedPlayers.length === 0 && (
            <div style={{ padding: '0.5rem', backgroundColor: '#fef3cd', borderRadius: '4px', marginBottom: '1rem' }}>
              ⚠ Add at least 1 student
            </div>
          )}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '0.5rem',
            backgroundColor: colors.bgSecondary,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(privacy, {
            whitelistedPlayers,
            groupId: selectedGroupId
          })}
          disabled={!isValid}
          style={{
            flex: 1,
            padding: '0.5rem',
            backgroundColor: isValid ? colors.primary : colors.bgSecondary,
            color: isValid ? 'white' : colors.textMuted,
            border: 'none',
            borderRadius: '4px',
            cursor: isValid ? 'pointer' : 'not-allowed'
          }}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test component in isolation**

```bash
npm run dev
# No direct route yet; will integrate into CreateTableModal
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tables/PrivacyConfigModal.jsx
git commit -m "feat: create PrivacyConfigModal component"
```

---

### Task 17: Integrate PrivacyConfigModal into CreateTableModal

**Files:**
- Modify: `client/src/components/tables/CreateTableModal.jsx`

**Steps:**

- [ ] **Step 1: Update CreateTableModal to show privacy modal**

In CreateTableModal, modify the component to:

```jsx
import PrivacyConfigModal from './PrivacyConfigModal.jsx';

// Inside CreateTableModal component:
const [showPrivacyConfig, setShowPrivacyConfig] = useState(false);
const [pendingPrivacy, setPendingPrivacy] = useState('school');
const [pendingPrivateConfig, setPendingPrivateConfig] = useState({});

// ... existing state ...

const handlePrivacyChange = (newPrivacy) => {
  setPrivacy(newPrivacy);
  if (newPrivacy === 'private') {
    setShowPrivacyConfig(true);
    setPendingPrivacy(newPrivacy);
  }
};

const handlePrivacyConfirm = (finalPrivacy, privateConfig) => {
  setPrivacy(finalPrivacy);
  setPendingPrivateConfig(privateConfig);
  setShowPrivacyConfig(false);
  // Automatically submit
  handleCreate();
};

// In JSX, replace privacy dropdown with:
<div style={{ marginBottom: '1rem' }}>
  <label>Privacy</label>
  <select
    value={privacy}
    onChange={(e) => handlePrivacyChange(e.target.value)}
    style={{ width: '100%', padding: '0.5rem' }}
  >
    {/* Only show 'open' for admins */}
    {isAdmin && <option value="open">Open</option>}
    <option value="school">School</option>
    <option value="private">Private</option>
  </select>
</div>

// Add modal before the main modal JSX:
{showPrivacyConfig && (
  <>
    <PrivacyConfigModal
      tableName={name}
      initialPrivacy={pendingPrivacy}
      schoolMembers={schoolMembers}
      groups={groups}
      onConfirm={handlePrivacyConfirm}
      onCancel={() => {
        setShowPrivacyConfig(false);
        setPrivacy('school'); // Reset
      }}
    />
    <div
      onClick={() => {
        setShowPrivacyConfig(false);
        setPrivacy('school');
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 999
      }}
    />
  </>
)}
```

- [ ] **Step 2: Test flow in browser**

```bash
npm run dev
# Create table, select private → modal opens → configure → create
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tables/CreateTableModal.jsx
git commit -m "feat: integrate PrivacyConfigModal into CreateTableModal"
```

---

### Task 18: Update LobbyPage and TableCard for Privacy Display

**Files:**
- Modify: `client/src/pages/LobbyPage.jsx`
- Modify: `client/src/components/TableCard.jsx`

**Steps:**

- [ ] **Step 1: Update LobbyPage**

In LobbyPage.jsx:
1. Remove 'open' option from PRIVACY_OPTIONS for non-admins
2. Change default privacy from 'open' to 'school'
3. Pass school/groups data to CreateTableModal for privacy modal

```jsx
const PRIVACY_OPTIONS = isAdmin
  ? [
      { value: 'open', label: 'Open' },
      { value: 'school', label: 'School' },
      { value: 'private', label: 'Private' }
    ]
  : [
      { value: 'school', label: 'School' },
      { value: 'private', label: 'Private' }
    ];

// Default privacy:
const [privacy, setPrivacy] = useState('school'); // was 'open'
```

- [ ] **Step 2: Update TableCard**

In TableCard.jsx, add privacy badge:

```jsx
const privacyBadgeConfig = {
  'open': { icon: '🌐', label: 'Open', color: '#3b82f6' },
  'school': { icon: '🏫', label: 'School', color: '#6b7280' },
  'private': { icon: '🔒', label: 'Private', color: '#dc2626' }
};

const badge = privacyBadgeConfig[table.privacy];

// In JSX:
<div style={{
  display: 'inline-block',
  padding: '0.25rem 0.5rem',
  backgroundColor: badge.color,
  color: 'white',
  borderRadius: '4px',
  fontSize: '0.875rem',
  marginRight: '0.5rem'
}}>
  {badge.icon} {badge.label}
</div>

// If admin table and open:
{table.created_by === adminId && table.privacy === 'open' && (
  <span style={{
    display: 'inline-block',
    padding: '0.25rem 0.5rem',
    backgroundColor: '#fbbf24',
    color: '#000',
    borderRadius: '4px',
    fontSize: '0.75rem'
  }}>
    ADMIN
  </span>
)}
```

- [ ] **Step 3: Test in browser**

```bash
npm run dev
# Check that:
# - 'open' option not shown for non-admins
# - Default privacy is 'school'
# - Privacy badges display correctly on cards
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/LobbyPage.jsx client/src/components/TableCard.jsx
git commit -m "feat: update LobbyPage and TableCard for privacy display"
```

---

### Task 19: Spectate Access Control

**Files:**
- Modify: `server/routes/tables.js`

**Steps:**

- [ ] **Step 1: Add spectate validation to GET single table**

In `server/routes/tables.js`, update the GET /:id handler to check spectate access:

```javascript
// GET /api/tables/:id — get single table (with spectate access check)
app.get('/api/tables/:id', requireAuth, async (req, res) => {
  try {
    const [table, liveSummaries] = await Promise.all([
      TableRepository.getTable(req.params.id),
      liveTableSummaries()
    ]);

    if (!table) return res.status(404).json({ error: 'Table not found' });

    // Check visibility (for spectate)
    const TableVisibilityService = require('../services/TableVisibilityService');
    const canSee = await TableVisibilityService.canPlayerSeeTable(req.user.id, table);
    if (!canSee) {
      return res.status(403).json({ error: 'forbidden', message: 'You cannot spectate tables outside your school' });
    }

    const liveMap = new Map((liveSummaries || []).map(s => [s.id, s]));
    const withLive = {
      ...table,
      live: liveMap.get(table.id) ?? null
    };

    res.json(withLive);
  } catch (err) {
    log.error('tables', 'get_table_error', `Failed to get table: ${err.message}`, { err });
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 2: Test spectate restrictions**

```bash
# Try to spectate a table from another school
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/tables/other-school-table
# Should return 403
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/tables.js
git commit -m "feat: add spectate access control (restrict to same school)"
```

---

## Summary

**Phase 2 (Tasks 1–9):** Database + backend + frontend for school password registration with expiry policies. Users register with optional school name → password becomes `coached_student`, users without school become `solo_student`.

**Phase 3 (Tasks 10–19):** Database + backend + frontend for school-scoped visibility filtering. Tables/tournaments filtered by privacy + school scope. Private tables have whitelist + modal configuration during creation. Spectate restricted to same school.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-16-school-system-phase2-3.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**