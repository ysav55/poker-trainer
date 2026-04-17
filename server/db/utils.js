'use strict';

/**
 * Shared database utilities.
 * Imported by all repository modules — do not import from repositories here.
 */

/**
 * Throw on Supabase error (as a real Error instance), otherwise return data.
 * Converts Supabase's plain error object { message, code, details, hint }
 * into an Error so callers see err.message and a stack trace.
 */
function q(promise) {
  return promise.then(({ data, error }) => {
    if (error) {
      const err = new Error(error.message || 'Database error');
      err.code    = error.code;
      err.details = error.details;
      err.hint    = error.hint;
      throw err;
    }
    return data;
  });
}

/** Transform hand_tags rows into { auto_tags, mistake_tags, sizing_tags, coach_tags } arrays. */
function parseTags(hand_tags = []) {
  return {
    auto_tags:    hand_tags.filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: hand_tags.filter(t => t.tag_type === 'mistake').map(t => t.tag),
    sizing_tags:  hand_tags.filter(t => t.tag_type === 'sizing').map(t => t.tag),
    coach_tags:   hand_tags.filter(t => t.tag_type === 'coach').map(t => t.tag),
  };
}

module.exports = { q, parseTags };
