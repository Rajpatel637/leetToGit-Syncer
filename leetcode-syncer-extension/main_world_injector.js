

/**
 * main_world_injector.js — Runs in the MAIN world of LeetCode problem pages.
 *
 * Injected by background.js via chrome.scripting.executeScript({world: "MAIN"})
 * on every https://leetcode.com/problems/* page load.
 *
 * Why MAIN world: Manifest V3 content scripts run in an ISOLATED world and
 * cannot access page JavaScript variables or intercept fetch responses. To
 * observe fetch/XHR calls made by LeetCode's own frontend, we must patch
 * window.fetch from the MAIN world where the page code runs.
 *
 * Communication: MAIN world → ISOLATED world via window.postMessage.
 * The ISOLATED content_script.js listens for these messages and forwards
 * accepted submission events to the background service worker.
 *
 * ⚠️ ENDPOINT NOTE (needs verification against live API):
 *   The submission check URL pattern assumed here is:
 *     GET https://leetcode.com/submissions/detail/{submissionId}/check/
 *   LeetCode may change this endpoint. If detection stops working, inspect
 *   the Network tab on a LeetCode submission to find the current poll URL.
 *
 * This script runs once per page load. The patched window.fetch persists
 * for the lifetime of that page (including SPA navigation within LeetCode)
 * so re-injection is not needed for in-page problem switches.
 */

(function () {
  "use strict";

  const DEBUG = false; // Set to true for local development
  function log(...args) { if (DEBUG) console.log(...args); }

  log("[leetcode-syncer] ✅ MAIN world injector loaded.");

  // Guard against double-injection using a non-writable, non-configurable property
  // so that page scripts cannot disable this guard by setting the flag to false.
  const _GUARD_KEY = "__lcs_v1";
  if (Object.prototype.hasOwnProperty.call(window, _GUARD_KEY)) return;
  Object.defineProperty(window, _GUARD_KEY, {
    value: true, writable: false, configurable: false, enumerable: false,
  });

  // Abort if window.fetch is already broken or not a function
  if (typeof window.fetch !== "function") return;

  // ── Regex to match the submission check endpoint ──────────────────────────
  // ⚠️ Needs verification: inspect LeetCode's Network tab during a submission.
  const CHECK_URL_RE = /\/submissions\/detail\/(\d+)\/check\//;

  // ── Patch window.fetch ────────────────────────────────────────────────────
  const _originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await _originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === "string"
        ? args[0]
        : (args[0] instanceof Request ? args[0].url : "");

      const match = CHECK_URL_RE.exec(url);
      if (match) {
        const submissionId = match[1];
        // Clone the response so the page's own handler still reads it
        const clone = response.clone();
        clone.json().then((data) => {
          if (data?.state === "SUCCESS" && data?.status_msg === "Accepted") {
            const slug = extractSlug();
            // Fire exactly once per accepted result — the isolated content
            // script is responsible for debouncing duplicate messages.
            window.postMessage(
              {
                __leetcodeSyncer: true,
                type:         "SUBMISSION_ACCEPTED",
                submissionId: String(submissionId),
                slug:         slug,
                lang:         data.lang        ?? null,
                runtime:      data.status_runtime ?? null,
                memory:       data.status_memory   ?? null,
              },
              // Target origin: only send to the LeetCode page itself
              "https://leetcode.com"
            );
          }
        }).catch(() => {
          // Silently ignore JSON parse failures — the page's own handler
          // will deal with non-JSON or error responses.
        });
      }
    } catch (_) {
      // Never let our hook break the page's own fetch calls
    }

    return response;
  };

  // ── Patch XMLHttpRequest (fallback for older LeetCode code paths) ─────────
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__lcsUrl = url;
    return _open.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const xhr = this;
    const url = xhr.__lcsUrl ?? "";
    const match = CHECK_URL_RE.exec(url);

    if (match) {
      const submissionId = match[1];
      xhr.addEventListener("load", function () {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data?.state === "SUCCESS" && data?.status_msg === "Accepted") {
            window.postMessage(
              {
                __leetcodeSyncer: true,
                type:         "SUBMISSION_ACCEPTED",
                submissionId: String(submissionId),
                slug:         extractSlug(),
                lang:         data.lang            ?? null,
                runtime:      data.status_runtime  ?? null,
                memory:       data.status_memory   ?? null,
              },
              "https://leetcode.com"
            );
          }
        } catch (_) {}
      });
    }

    return _send.apply(this, args);
  };

  // ── Helper: extract problem slug from current URL ─────────────────────────
  function extractSlug() {
    // URL pattern: https://leetcode.com/problems/{slug}/
    const m = window.location.pathname.match(/^\/problems\/([^/]+)\//);
    return m ? m[1] : "";
  }

  log("[leetcode-syncer] MAIN world fetch + XHR hooks active.");
})();
