/**
 * popup.js — Popup logic for LeetCode → GitHub Syncer (Phase 8).
 *
 * Reads settings and LeetCode auth status from chrome.storage / background,
 * and renders the appropriate UI state. All text via textContent (no innerHTML).
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const msPerDay = 86_400_000;
  const target = new Date(isoDate);
  return Math.ceil((target.setHours(23, 59, 59, 999) - Date.now()) / msPerDay);
}

function setRow(id, state, text) {
  const row = document.getElementById(id);
  if (!row) return;
  row.className = `status-row ${state}`;
  row.querySelector("span").textContent = text;
}

function setBody(icon, strongText, bodyText) {
  document.getElementById("popup-status-icon").textContent = icon;
  const el = document.getElementById("popup-status-text");
  // Build DOM safely — never use innerHTML with dynamic content
  el.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = strongText;
  el.appendChild(strong);
  el.appendChild(document.createElement("br"));
  el.appendChild(document.createTextNode(bodyText));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main render
// ─────────────────────────────────────────────────────────────────────────────

async function render() {
  // Version badge
  const manifest = chrome.runtime.getManifest();
  const versionEl = document.getElementById("header-version");
  if (versionEl) versionEl.textContent = `v${manifest.version}`;

  // Read settings (PAT might be in session or local depending on user preference)
  const [sessionData, localData] = await Promise.all([
    chrome.storage.session.get("githubPat").catch(() => ({})),
    chrome.storage.local.get(["githubPat", "githubRepo", "githubBranch", "expiresOn"]),
  ]);
  const activePat = sessionData.githubPat || localData.githubPat;
  const hasPat  = !!activePat;
  const hasRepo = !!localData.githubRepo;
  const data    = { ...localData }; // for expiresOn / githubRepo display below

  // Show status rows section once we have something to show
  document.getElementById("status-rows").classList.remove("status-rows--hidden");

  // ── GitHub status ──
  if (!hasPat || !hasRepo) {
    setRow("row-github", "off", "GitHub — not configured");
    setBody("⚙️", "Setup required.", "Open settings to connect your GitHub token and start syncing solutions.");
    return;
  }

  // Expiry warning
  const days = daysUntil(data.expiresOn);
  if (days !== null && days < 0) {
    setRow("row-github", "off", `GitHub — token expired!`);
    const warn = document.getElementById("popup-expiry-warn");
    warn.className = "expiry-warn expiry-warn--error";
    warn.textContent = "⛔ GitHub token has expired — open Settings to renew it.";
    setBody("🔑", "Token expired.", "Open Settings and paste a new fine-grained PAT to resume syncing.");
    return;
  } else if (days !== null && days <= 14) {
    const warn = document.getElementById("popup-expiry-warn");
    warn.className = "expiry-warn expiry-warn--warn";
    warn.textContent = `⚠️ GitHub token expires in ${days} day${days === 1 ? "" : "s"} — consider renewing soon.`;
  }

  setRow("row-github", "ok", `GitHub — ${data.githubRepo}`);

  // ── LeetCode status — ask background for cookie check ──
  let lcLoggedIn = false;
  try {
    const result = await chrome.runtime.sendMessage({ type: "CHECK_LEETCODE_AUTH" });
    lcLoggedIn = result?.loggedIn ?? false;
  } catch {
    lcLoggedIn = false;
  }

  const lcWarn = document.getElementById("lc-login-warn");
  if (lcLoggedIn) {
    setRow("row-leetcode", "ok", "LeetCode — logged in ✓");
    lcWarn.classList.add("lc-login-warn--hidden");
  } else {
    setRow("row-leetcode", "off", "LeetCode — not logged in");
    lcWarn.classList.remove("lc-login-warn--hidden");
  }

  // ── Body status ──
  if (lcLoggedIn) {
    setBody("✅", "Ready to sync!", "Solve a LeetCode problem and get Accepted — it will sync to GitHub automatically.");
  } else {
    setBody("⚠️", "LeetCode session missing.", "Log in to LeetCode in this browser and re-open this popup.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  render();
  document.getElementById("btn-open-settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  // Clicking the expiry warning also opens settings
  document.getElementById("popup-expiry-warn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});
