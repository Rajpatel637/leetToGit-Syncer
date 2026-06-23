/**
 * content_script.js — ISOLATED world content script for LeetCode problem pages.
 *
 * Matches: https://leetcode.com/problems/*
 * Declared in manifest.json content_scripts, runs at document_idle.
 *
 * Detection strategy: MutationObserver watching for the "Accepted" result element.
 * LeetCode (Next.js) injects [data-e2e-locator="submission-result"].marked_as_success
 * into the DOM when a submission is accepted. This is more reliable than intercepting
 * the network request since LeetCode's check endpoint URL has changed.
 *
 * Security:
 *   - Never writes any cookie value or token to the DOM or storage.
 *   - Only logs slugs and IDs — never sensitive data.
 */

"use strict";

console.log("[leetcode-syncer] ✅ Content script loaded on:", window.location.href);

// Track slugs we've already fired for to prevent duplicate syncs
const _seenSlugs = new Map(); // slug → timestamp of last fire

// After firing for a problem, ignore further "Accepted" events for this long.
const DEBOUNCE_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the problem slug from the current URL.
 * e.g. https://leetcode.com/problems/two-sum/description/ → "two-sum"
 */
function getSlug() {
  const m = window.location.pathname.match(/^\/problems\/([^/]+)\//);
  return m ? m[1] : null;
}

/**
 * Try to detect the submission language from the language selector in the DOM.
 * Returns null if not found — Phase 6 will fetch it via GraphQL anyway.
 */
function detectLang() {
  // LeetCode renders the selected language in a button/select element.
  // Selector is best-effort; may need updating if LeetCode redesigns.
  const el =
    document.querySelector('[data-e2e-locator="code-lang-button"]') ||
    document.querySelector('.ant-select-selection-item') ||
    document.querySelector('[id*="lang-select"]');
  return el ? el.textContent.trim().toLowerCase() : null;
}

/**
 * Try to find the submission ID from DOM links after acceptance.
 * LeetCode sometimes renders a "View Submission" link with the ID in it.
 * Returns null if not found.
 */
function detectSubmissionId() {
  // Look for links like /submissions/detail/1234567890/ in the page
  const links = document.querySelectorAll('a[href*="/submissions/detail/"]');
  for (const link of links) {
    const m = link.href.match(/\/submissions\/detail\/(\d+)\//);
    if (m) return m[1];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fire on Accepted result
// ─────────────────────────────────────────────────────────────────────────────

function onAccepted() {
  const slug = getSlug();
  if (!slug) {
    console.warn("[leetcode-syncer] Could not determine slug from URL — skipping.");
    return;
  }

  // Debounce: don't fire again for the same slug within DEBOUNCE_MS
  const now = Date.now();
  const lastFired = _seenSlugs.get(slug) || 0;
  if (now - lastFired < DEBOUNCE_MS) {
    console.log("[leetcode-syncer] Debounce active for", slug, "— skipping duplicate.");
    return;
  }
  _seenSlugs.set(slug, now);

  const lang         = detectLang();
  const submissionId = detectSubmissionId();

  console.log(
    "[leetcode-syncer] 🎉 Accepted detected!",
    `slug=${slug}`,
    `lang=${lang ?? "unknown"}`,
    `submissionId=${submissionId ?? "unknown"}`
  );

  // Forward to background service worker
  chrome.runtime.sendMessage({
    type:         "SUBMISSION_ACCEPTED",
    slug:         slug,
    lang:         lang         ?? null,
    submissionId: submissionId ?? null,
    runtime:      null, // Phase 6 fetches this via GraphQL
    memory:       null,
  }).catch((err) => {
    console.warn("[leetcode-syncer] Could not reach background:", err?.message);
    // Remove debounce entry so user can retry by re-submitting
    _seenSlugs.delete(slug);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MutationObserver — watch for Accepted result in DOM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if an element IS or CONTAINS the Accepted result indicator.
 * LeetCode renders: <span data-e2e-locator="submission-result" class="marked_as_success">Accepted</span>
 */
function checkNodeForAccepted(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  // Check the node itself
  if (isAcceptedElement(node)) {
    onAccepted();
    return;
  }

  // Check descendants (LeetCode may insert a subtree at once)
  if (node.querySelectorAll) {
    const elements = node.querySelectorAll("span, div");
    for (const el of elements) {
      if (isAcceptedElement(el)) {
        onAccepted();
        return;
      }
    }
  }
}

function isAcceptedElement(el) {
  const text = el.textContent?.trim();
  if (text !== "Accepted") return false;

  const className = (el.className || "").toLowerCase();
  const dataLocator = (el.dataset?.e2eLocator || "").toLowerCase();

  // LeetCode uses various classes for the success state across different UI versions:
  // - "marked_as_success" (older UI)
  // - "text-green-s" or "text-green-60" or "dark-green-s" (newer Tailwind UI)
  const isSuccessDesign = 
    className.includes("success") || 
    className.includes("green") || 
    dataLocator.includes("submission-result");

  return isSuccessDesign;
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    // Check modified attributes on existing nodes (class changes)
    if (mutation.type === "attributes") {
      checkNodeForAccepted(mutation.target);
    }
    // Check newly added nodes
    if (mutation.type === "childList") {
      for (const node of mutation.addedNodes) {
        checkNodeForAccepted(node);
      }
    }
  }
});

// Observe the entire document body for DOM additions and attribute changes
observer.observe(document.body, {
  childList:  true,
  subtree:    true,
  attributes: true,
  attributeFilter: ["class"], // only watch class changes (not data-* etc.)
});

// Run an immediate check in case the page loaded directly onto an already-Accepted submission
setTimeout(() => {
  const elements = document.querySelectorAll("span, div");
  for (const el of elements) {
    if (isAcceptedElement(el)) {
      console.log("[leetcode-syncer] Found existing Accepted result on load!");
      onAccepted();
      return;
    }
  }
}, 1000);

console.log("[leetcode-syncer] Content script active on:", window.location.pathname);

// ─────────────────────────────────────────────────────────────────────────────
// Fallback: Listen for messages from the MAIN world injector (fetch/XHR hooks)
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener("message", (event) => {
  // Only accept messages from our own window + injector
  if (event.source !== window || !event.data || !event.data.__leetcodeSyncer) return;

  if (event.data.type === "SUBMISSION_ACCEPTED") {
    const { slug, lang, submissionId } = event.data;
    if (!slug) return;

    // Apply the same debounce
    const now = Date.now();
    const lastFired = _seenSlugs.get(slug) || 0;
    if (now - lastFired < DEBOUNCE_MS) {
      console.log("[leetcode-syncer] Debounce active for network hook — skipping.");
      return;
    }
    _seenSlugs.set(slug, now);

    console.log(
      "[leetcode-syncer] 🎉 Accepted detected via Network hook!",
      `slug=${slug}`,
      `lang=${lang ?? "unknown"}`,
      `submissionId=${submissionId ?? "unknown"}`
    );

    chrome.runtime.sendMessage({
      type:         "SUBMISSION_ACCEPTED",
      slug:         slug,
      lang:         lang         ?? null,
      submissionId: submissionId ?? null,
    }).catch((err) => {
      console.warn("[leetcode-syncer] Could not reach background:", err?.message);
      _seenSlugs.delete(slug);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Request MAIN world injection (kept for fetch hook as backup)
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: "REQUEST_MAIN_INJECTION" }).catch(() => {
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "REQUEST_MAIN_INJECTION" }).catch(() => {});
  }, 500);
});
