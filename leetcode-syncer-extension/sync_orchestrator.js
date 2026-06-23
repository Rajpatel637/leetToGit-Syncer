/**
 * sync_orchestrator.js — Phase 6: Orchestration and Deduplication
 *
 * Responsibilities:
 * 1. Debounce incoming sync requests using chrome.alarms (3s delay).
 * 2. De-duplicate against chrome.storage.local to prevent re-syncing
 *    already synced problems.
 * 3. Fetch full payload (metadata + code) via leetcode_api.js.
 */

import { getQuestionDetails, getLatestAcceptedSubmissionId, getSubmissionDetails } from "./leetcode_api.js";
import { pushToGitHub } from "./github_api.js";

const DEBUG = false; // Set to true for local development
function log(...args) { if (DEBUG) console.log(...args); }

// Key prefix for tracking synced slugs in chrome.storage.local
const SYNCED_PREFIX = "synced_";

// ─────────────────────────────────────────────────────────────────────────────
// Storage & Deduplication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a problem is already marked as synced in local storage.
 */
async function isAlreadySynced(slug) {
  const key = `${SYNCED_PREFIX}${slug}`;
  const data = await chrome.storage.local.get(key);
  return !!data[key];
}

/**
 * Mark a problem as successfully synced.
 */
export async function markAsSynced(slug, submissionId) {
  const key = `${SYNCED_PREFIX}${slug}`;
  await chrome.storage.local.set({ [key]: { submissionId, timestamp: Date.now() } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The core sync pipeline for a single problem slug.
 * Called by the alarm handler after the 3-second debounce.
 */
export async function executeSync(slug) {
  log(`[leetcode-syncer] 🚀 Starting sync pipeline for: ${slug}`);

  // 1. De-duplication check
  if (await isAlreadySynced(slug)) {
    log(`[leetcode-syncer] ⏭️ Slug '${slug}' already synced. Skipping.`);
    return;
  }

  // Set pending badge
  chrome.action.setBadgeText({ text: "⏳" });
  chrome.action.setBadgeBackgroundColor({ color: "#d29922" }); // Yellow

  try {
    // 2. Fetch Submission ID
    const submissionId = await getLatestAcceptedSubmissionId(slug);
    if (!submissionId) {
      throw new Error(`Could not find latest Accepted submission for ${slug}`);
    }
    log(`[leetcode-syncer] Found submission ID: ${submissionId}`);

    // 3. Fetch Problem Metadata
    const question = await getQuestionDetails(slug);
    if (!question) {
      throw new Error(`Could not fetch GraphQL metadata for ${slug}`);
    }
    log(`[leetcode-syncer] Fetched metadata for: ${question.title}`);

    // 4. Fetch Submission Details (Code, Runtime, Memory, Lang)
    const details = await getSubmissionDetails(submissionId);
    if (!details || !details.code) {
      throw new Error(`Could not fetch GraphQL submission details for ${submissionId}`);
    }
    log(`[leetcode-syncer] Fetched ${details.code.length} bytes of source code.`);

    // 5. Build Final Payload
    const payload = {
      slug: question.titleSlug,
      title: question.title,
      questionId: question.questionId,
      difficulty: question.difficulty,
      content: question.content,
      topics: question.topicTags.map(t => t.name),
      submissionId,
      code: details.code,
      lang: details.lang?.name || "unknown",
      runtime: details.runtimeDisplay || "N/A",
      runtimePercentile: details.runtimePercentile || null,
      memory: details.memoryDisplay || "N/A",
      memoryPercentile: details.memoryPercentile || null,
    };

    log("[leetcode-syncer] 🏗️ Assembled Full Payload");
    
    // 6. Push to GitHub
    await pushToGitHub(payload);

    // 7. Mark as synced locally
    await markAsSynced(slug, submissionId);

    // Set success badge, clear after 5s
    chrome.action.setBadgeText({ text: "✓" });
    chrome.action.setBadgeBackgroundColor({ color: "#2ea043" }); // Green
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 5000);

  } catch (error) {
    console.error(`[leetcode-syncer] ❌ Sync failed for ${slug}:`, error.message);
    if (error.message === "GITHUB_AUTH_FAILED") {
      console.warn("[leetcode-syncer] GitHub token expired or invalid! Update it in the extension options.");
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#da3633" }); // Red
    } else {
      chrome.action.setBadgeText({ text: "✕" });
      chrome.action.setBadgeBackgroundColor({ color: "#da3633" }); // Red
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 5000);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Debounce Queue (Alarms)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queue a problem for syncing with a 3-second debounce.
 *
 * The slug is written to chrome.storage.local BEFORE the timeout fires so
 * that if the service worker is evicted in the 3-second window (inherent MV3
 * limitation), the intent is preserved and can be retried on the next SW wake.
 *
 * Note: chrome.alarms enforce a 1-minute minimum in published extensions, so
 * we use setTimeout here (safe for short durations) with storage as a safety net.
 */
export async function queueSync(slug) {
  const pendingKey = `pending_${slug}`;
  log(`[leetcode-syncer] ⏱️ Queuing sync for '${slug}' in 3 seconds...`);

  // Persist intent before the async gap — SW eviction resilience
  await chrome.storage.local.set({ [pendingKey]: Date.now() });

  setTimeout(async () => {
    await chrome.storage.local.remove(pendingKey);
    executeSync(slug);
  }, 3000);
}

/**
 * On browser startup, retry any pending syncs that were dropped due to SW eviction.
 */
chrome.runtime.onStartup.addListener(async () => {
  const all = await chrome.storage.local.get(null);
  for (const key of Object.keys(all)) {
    if (key.startsWith("pending_")) {
      const slug = key.replace("pending_", "");
      console.warn(`[leetcode-syncer] ⚠️ Recovering dropped sync for '${slug}' from previous session.`);
      await chrome.storage.local.remove(key);
      executeSync(slug);
    }
  }
});
