/**
 * background.js — Service worker for LeetCode → GitHub Syncer.
 *
 * Phase 5 additions:
 *   - chrome.tabs.onUpdated: injects main_world_injector.js into the MAIN
 *     world of any LeetCode problem page when it finishes loading.
 *   - SUBMISSION_ACCEPTED message handler (stub — Phase 6 adds sync logic).
 *
 * Phase 4: CHECK_LEETCODE_AUTH message handler (reads LeetCode cookies).
 */

import { isLoggedIntoLeetCode } from "./leetcode_auth.js";
import { queueSync } from "./sync_orchestrator.js";

// Catch any uncaught error in the service worker and surface it clearly
globalThis.addEventListener("error", (event) => {
  console.error("[leetcode-syncer] 🔥 Uncaught SW error:", event.message, event.filename, event.lineno);
});
globalThis.addEventListener("unhandledrejection", (event) => {
  console.error("[leetcode-syncer] 🔥 Unhandled promise rejection:", event.reason);
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[leetcode-syncer] Installed. Open the options page to configure.");
  } else if (details.reason === "update") {
    console.log(`[leetcode-syncer] Updated to v${chrome.runtime.getManifest().version}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Inject MAIN world fetch interceptor on LeetCode problem pages
// ─────────────────────────────────────────────────────────────────────────────
//
// Why tabs.onUpdated instead of a content_scripts declaration:
//   main_world_injector.js must run in the MAIN world (to patch window.fetch),
//   but content_scripts declared in manifest.json default to ISOLATED world.
//   chrome.scripting.executeScript with {world: "MAIN"} is the sanctioned
//   MV3 approach. The "scripting" permission + host_permission for
//   https://leetcode.com/* together authorise this injection.
//
// The injected script persists for the page's lifetime (including SPA
// navigation), so re-injection is not needed when the user switches problems
// within the same tab without a full page reload.

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act on full page loads that complete on a LeetCode problem page
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.startsWith("https://leetcode.com/problems/")) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files:  ["main_world_injector.js"],
      world:  "MAIN",
    });
    console.debug("[leetcode-syncer] MAIN world injector injected into tab", tabId);
  } catch (err) {
    // Common causes: tab was closed, navigation happened before injection,
    // or the extension doesn't have access (should not occur given host_permission).
    console.warn("[leetcode-syncer] Could not inject MAIN world script:", err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Message router
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {

    // Phase 5 — Content script requests MAIN world injection on page load.
    // This fires for both full page loads AND SPA navigation, making it more
    // reliable than the tabs.onUpdated listener (which only fires on full loads).
    case "REQUEST_MAIN_INJECTION": {
      if (!_sender?.tab?.id) break;
      chrome.scripting.executeScript({
        target: { tabId: _sender.tab.id },
        files:  ["main_world_injector.js"],
        world:  "MAIN",
      }).then(() => {
        console.debug("[leetcode-syncer] MAIN world injector injected via content script request.");
      }).catch((err) => {
        console.warn("[leetcode-syncer] Injection failed:", err.message);
      });
      break;
    }
    case "CHECK_LEETCODE_AUTH": {
      isLoggedIntoLeetCode()
        .then((loggedIn) => sendResponse({ loggedIn }))
        .catch(() => sendResponse({ loggedIn: false }));
      return true; // keep channel open for async response
    }

    // Phase 5/6 — A problem was just accepted on LeetCode.
    // We queue it for syncing (which adds a 3s debounce).
    case "SUBMISSION_ACCEPTED": {
      const { slug } = message;
      console.log(`[leetcode-syncer] 🎉 SUBMISSION ACCEPTED event received for: ${slug}`);
      queueSync(slug);
      sendResponse({ received: true });
      return false;
    }

    default:
      console.warn("[leetcode-syncer] Unknown message type:", message.type);
      break;
  }
});
