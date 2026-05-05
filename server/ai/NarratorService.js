'use strict';

/**
 * NarratorService (Tier 2 LLM)
 *
 * Turns structured Tier 1 data into readable plain-text narratives using Claude.
 *
 * All methods degrade gracefully — if ANTHROPIC_API_KEY is missing or the
 * LLM call fails for any reason, the method returns null. The LLM is NEVER
 * in the critical path. UI renders structured data when narrative is null.
 *
 * Methods:
 *   narrateAlerts(alerts, studentProfiles)  → 3-5 sentence alert digest
 *   narratePrepBrief(briefData)             → paragraph summarizing prep brief
 *   narrateProgressReport(reportData)       → 3-5 sentence report summary
 *   narrateStableOverview(stableData)       → stable-wide summary paragraph
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL   = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT =
  'You are a data narrator for a poker coaching platform. You turn structured ' +
  'poker statistics into concise, actionable summaries for coaches. Use poker ' +
  'terminology accurately. Never invent data — only describe what is provided. ' +
  'Keep output to 3–5 sentences. Output plain text only. No markdown. No bullet points.';

// ─── Core LLM call ────────────────────────────────────────────────────────────

async function _callClaude(userContent) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:    MODEL,
        max_tokens: 300,
        system:   SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data?.content?.[0]?.text ?? null;
  } catch (_) {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Narrates a list of alerts into a 3-5 sentence digest.
 *
 * @param {object[]} alerts          Active alert_instances rows (severity desc).
 * @param {object[]} studentProfiles Optional student profiles (for count context).
 * @returns {Promise<string|null>}
 */
async function narrateAlerts(alerts, studentProfiles) {
  if (!alerts || alerts.length === 0) return null;

  const urgentAlerts   = alerts.filter(a => a.severity >= 0.7);
  const moderateAlerts = alerts.filter(a => a.severity >= 0.3 && a.severity < 0.7);
  const milestones     = alerts.filter(a => a.alert_type === 'positive_milestone');

  const payload = JSON.stringify({
    urgent_alerts:   urgentAlerts.slice(0, 5),
    moderate_alerts: moderateAlerts.slice(0, 5),
    milestones:      milestones.slice(0, 3),
    total_alerts:    alerts.length,
    stable_stats:    { total: studentProfiles?.length ?? 0 },
  });

  return _callClaude(`Summarize these coaching alerts for the coach dashboard:\n\n${payload}`);
}

/**
 * Narrates a session prep brief into a summary paragraph.
 *
 * @param {object} briefData The structured brief from SessionPrepService.
 * @returns {Promise<string|null>}
 */
async function narratePrepBrief(briefData) {
  if (!briefData) return null;

  // Trim to key sections to stay within token limits.
  const payload = JSON.stringify({
    leaks:          briefData.leaks           ?? [],
    flagged_hands:  (briefData.flagged_hands  ?? []).slice(0, 3),
    active_alerts:  (briefData.active_alerts  ?? []).slice(0, 3),
    stats_snapshot: (briefData.stats_snapshot ?? []).slice(0, 5),
  });

  return _callClaude(`Summarize this session prep brief in one paragraph:\n\n${payload}`);
}

/**
 * Narrates a progress report into 3-5 sentences.
 *
 * @param {object} reportData The structured report from ProgressReportService.
 * @returns {Promise<string|null>}
 */
async function narrateProgressReport(reportData) {
  if (!reportData) return null;
  return _callClaude(
    `Summarize this student progress report in 3-5 sentences:\n\n${JSON.stringify(reportData)}`
  );
}

/**
 * Narrates a stable overview into a summary paragraph.
 *
 * @param {object} stableData Aggregated stable-wide data.
 * @returns {Promise<string|null>}
 */
async function narrateStableOverview(stableData) {
  if (!stableData) return null;
  return _callClaude(
    `Summarize this stable overview in one paragraph:\n\n${JSON.stringify(stableData)}`
  );
}

module.exports = { narrateAlerts, narratePrepBrief, narrateProgressReport, narrateStableOverview };
