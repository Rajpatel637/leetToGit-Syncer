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
  console.log(`[leetcode-syncer] 🚀 Starting sync pipeline for: ${slug}`);

  // 1. De-duplication check
  if (await isAlreadySynced(slug)) {
    console.log(`[leetcode-syncer] ⏭️ Slug '${slug}' already synced. Skipping.`);
    return;
  }

  try {
    // 2. Fetch Submission ID
    const submissionId = await getLatestAcceptedSubmissionId(slug);
    if (!submissionId) {
      throw new Error(`Could not find latest Accepted submission for ${slug}`);
    }
    console.log(`[leetcode-syncer] Found submission ID: ${submissionId}`);

    // 3. Fetch Problem Metadata
    const question = await getQuestionDetails(slug);
    if (!question) {
      throw new Error(`Could not fetch GraphQL metadata for ${slug}`);
    }
    console.log(`[leetcode-syncer] Fetched metadata for: ${question.title}`);

    // 4. Fetch Submission Details (Code, Runtime, Memory, Lang)
    const details = await getSubmissionDetails(submissionId);
    if (!details || !details.code) {
      throw new Error(`Could not fetch GraphQL submission details for ${submissionId}`);
    }
    console.log(`[leetcode-syncer] Fetched ${details.code.length} bytes of source code.`);

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

    console.log("[leetcode-syncer] 🏗️ Assembled Full Payload");
    
    // 6. Push to GitHub
    await pushToGitHub(payload);

    // 7. Mark as synced locally
    await markAsSynced(slug, submissionId);

  } catch (error) {
    console.error(`[leetcode-syncer] ❌ Sync failed for ${slug}:`, error.message);
    if (error.message === "GITHUB_AUTH_FAILED") {
      console.warn("[leetcode-syncer] GitHub token expired or invalid! Update it in the extension options.");
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#ff0000" });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Debounce Queue (Alarms)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queue a problem for syncing.
 * We use chrome.alarms to wait 3 seconds before executing.
 * This gives LeetCode's backend time to finalize the submission in their DB,
 * ensuring our API calls find the latest data.
 */
export function queueSync(slug) {
  const alarmName = `sync_${slug}`;
  console.log(`[leetcode-syncer] ⏱️ Queuing sync for '${slug}' in 3 seconds...`);
  
  // Create an alarm to fire roughly 3 seconds from now.
  // Note: chrome.alarms minimum delay is officially 1 min for non-unpacked extensions,
  // but unpacked/testing extensions often allow shorter, or we can use setTimeout
  // inside the service worker (though SW might sleep). We'll use setTimeout
  // wrapped in a wake-lock (or just standard SW execution since 3s is short).
  
  // For a reliable 3s delay in a Service Worker, setTimeout is safe 
  // IF it's under 5 minutes (SW lifecycle). We will use setTimeout here 
  // rather than chrome.alarms because alarms enforce a 1 minute minimum in production.
  setTimeout(() => {
    executeSync(slug);
  }, 3000);
}
