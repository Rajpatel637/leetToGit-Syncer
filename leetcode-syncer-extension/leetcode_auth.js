/**
 * leetcode_auth.js — LeetCode authentication cookie reader.
 *
 * Provides getLeetCodeAuth() which reads the two session cookies needed for
 * all LeetCode API calls directly from the browser's cookie store.
 *
 * SECURITY RULES (per Phase 4 spec):
 *   - Cookies are returned IN MEMORY ONLY — never written to chrome.storage,
 *     localStorage, or any file. (Rule 14)
 *   - Only the PRESENCE of cookies is ever logged — never the values. (Rule 6)
 *   - Call getLeetCodeAuth() fresh before each sync operation — do not cache
 *     the returned values, so stale or rotated cookies are never used.
 *
 * This module is imported by background.js (service worker) for sync logic,
 * and directly called by popup.js for the login-status UI check.
 *
 * The cookies permission + https://leetcode.com/* host_permission in
 * manifest.json are both required for chrome.cookies.get() to work.
 */

"use strict";

const LEETCODE_ORIGIN = "https://leetcode.com";

/**
 * @typedef {Object} LeetCodeAuth
 * @property {string} sessionCookie  Value of LEETCODE_SESSION
 * @property {string} csrfToken      Value of csrftoken
 */

/**
 * Read the LeetCode session cookies from the browser's cookie store.
 *
 * Returns both cookie values in memory only — never persisted anywhere.
 * Returns null if either cookie is missing (user is not logged in).
 *
 * @returns {Promise<LeetCodeAuth|null>}
 */
export async function getLeetCodeAuth() {
  try {
    const [sessionCookie, csrfCookie] = await Promise.all([
      chrome.cookies.get({ url: LEETCODE_ORIGIN, name: "LEETCODE_SESSION" }),
      chrome.cookies.get({ url: LEETCODE_ORIGIN, name: "csrftoken" }),
    ]);

    // Log ONLY presence — never log the values (Rule 6)
    console.debug(
      "[leetcode-syncer] Cookie check:",
      `LEETCODE_SESSION=${sessionCookie ? "present" : "missing"}`,
      `csrftoken=${csrfCookie ? "present" : "missing"}`
    );

    if (!sessionCookie || !csrfCookie) {
      return null;
    }

    // Return only the CSRF token in memory — LEETCODE_SESSION is sent automatically
    // by the browser via credentials:"include", so its value never needs to be in JS.
    return {
      csrfToken: csrfCookie.value,
    };
  } catch (err) {
    console.error("[leetcode-syncer] Error reading LeetCode cookies:", err.message);
    return null;
  }
}

/**
 * Check whether the user is currently logged into LeetCode.
 * This is a lightweight wrapper around getLeetCodeAuth() for UI checks —
 * it intentionally discards the cookie values so they never linger in scope.
 *
 * @returns {Promise<boolean>}
 */
export async function isLoggedIntoLeetCode() {
  const auth = await getLeetCodeAuth();
  // auth is discarded here — this function only checks presence
  return auth !== null;
}
