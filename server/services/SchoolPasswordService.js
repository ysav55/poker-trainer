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
        .single();

      if (error || !data) {
        return { valid: false, error: 'invalid_password' };
      }

      // Check active status FIRST (most informative error)
      if (!data.active) {
        return { valid: false, error: 'password_disabled' };
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
