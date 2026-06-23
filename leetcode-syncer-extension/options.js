/**
 * options.js — Settings page logic for LeetCode → GitHub Syncer (Phase 3 + 8).
 *
 * Storage keys (MUST match github_api.js):
 *   githubPat, githubRepo, githubBranch, expiresOn
 *
 * Security notes:
 *   - Token is NEVER logged, even partially, except as a masked display string.
 *   - All dynamic text is inserted via textContent — never innerHTML.
 *   - Validation call is read-only (GET) — no writes during the test.
 */

"use strict";

import { startBulkSync } from "./bulk_sync.js";

// Module-scoped token cache — keeps PAT out of the DOM (not visible in DevTools Elements)
let _savedToken = "";

const GITHUB_API = "https://api.github.com";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function maskToken(token) {
  if (!token || token.length < 8) return "****";
  const firstUnderscore  = token.indexOf("_");
  const secondUnderscore = token.indexOf("_", firstUnderscore + 1);
  const prefix = secondUnderscore > 0 ? token.slice(0, secondUnderscore + 1) : "ghp_";
  return prefix + "****" + token.slice(-4);
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const msPerDay = 86_400_000;
  const target = new Date(isoDate);
  return Math.ceil((target.setHours(23, 59, 59, 999) - Date.now()) / msPerDay);
}

function setStatus(type, message) {
  const el = document.getElementById("status-token");
  if (!el) return;
  el.className   = `status ${type} visible`;
  const icons    = { ok: "✅", error: "❌", warn: "⚠️", testing: "⏳" };
  el.textContent = `${icons[type] ?? ""} ${message}`;
}

function updateExpiryInfo(isoDate) {
  const el = document.getElementById("expiry-info");
  if (!el) return;
  const days = daysUntil(isoDate);
  if (days === null) { el.textContent = ""; el.className = "expiry-info"; return; }
  if (days < 0) {
    el.textContent = "⛔ Token has expired — please generate a new one.";
    el.className   = "expiry-info error";
  } else if (days <= 14) {
    el.textContent = `⚠️ Token expires in ${days} day${days === 1 ? "" : "s"} — consider renewing soon.`;
    el.className   = "expiry-info warn";
  } else {
    el.textContent = `✓ Token valid for ${days} more day${days === 1 ? "" : "s"}.`;
    el.className   = "expiry-info";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Load saved settings
// ─────────────────────────────────────────────────────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.local.get(["githubPat", "expiresOn", "githubRepo", "githubBranch", "rememberToken"]);
  const sessionData = await chrome.storage.session.get("githubPat").catch(() => ({}));
  const activePat = sessionData.githubPat || data.githubPat;

  if (activePat) {
    const tokenInput = document.getElementById("field-token");
    _savedToken = activePat;
    tokenInput.placeholder = maskToken(activePat);
  }

  const rememberCheckbox = document.getElementById("field-remember");
  if (data.rememberToken === false) {
    rememberCheckbox.checked = false;
  }

  if (data.expiresOn) {
    document.getElementById("field-expires").value = data.expiresOn;
    updateExpiryInfo(data.expiresOn);
  }
  if (data.githubRepo)   document.getElementById("field-repo").value   = data.githubRepo;
  if (data.githubBranch) document.getElementById("field-branch").value = data.githubBranch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate token + repo (read-only GET, no writes)
// ─────────────────────────────────────────────────────────────────────────────

async function validateToken(token, repo) {
  let resp;
  try {
    resp = await fetch(`${GITHUB_API}/repos/${repo}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });
  } catch {
    return { ok: false, message: "Network error — check your internet connection." };
  }
  if (resp.status === 200) {
    const body = await resp.json();
    return { ok: true, message: `Connected ✓ — "${body.full_name}" is accessible.` };
  }
  if (resp.status === 401)
    return { ok: false, message: "Token invalid or revoked. Generate a new fine-grained PAT at github.com/settings/personal-access-tokens." };
  if (resp.status === 403)
    return { ok: false, message: "Token valid but access denied. Ensure the PAT is scoped to this repo with Contents: Read & write." };
  if (resp.status === 404)
    return { ok: false, message: `Repo "${repo}" not found. Check the owner/repo-name format.` };
  return { ok: false, message: `Unexpected GitHub response (HTTP ${resp.status}). Try again.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Save & Test handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleSaveAndTest() {
  const btn        = document.getElementById("btn-save");
  const savedNote  = document.getElementById("saved-note");
  const tokenInput = document.getElementById("field-token");

  const rawToken  = tokenInput.value.trim() || _savedToken || "";
  const expiresOn = document.getElementById("field-expires").value.trim();
  const repo      = document.getElementById("field-repo").value.trim();
  const branch    = document.getElementById("field-branch").value.trim() || "main";

  if (!rawToken) { setStatus("error", "Please paste your GitHub Personal Access Token."); return; }
  // Strict owner/repo format: only alphanumeric, hyphen, dot, underscore
  if (!repo || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
    setStatus("error", 'Repository must be in "owner/repo-name" format (letters, numbers, hyphens, dots only).');
    return;
  }

  btn.disabled = true;
  setStatus("testing", "Testing connection to GitHub…");

  const result = await validateToken(rawToken, repo);
  if (!result.ok) { setStatus("error", result.message); btn.disabled = false; return; }

  // Save storage based on the "Remember token" checkbox
  const remember = document.getElementById("field-remember").checked;
  if (remember) {
    await chrome.storage.local.set({ githubPat: rawToken, githubRepo: repo, githubBranch: branch, expiresOn, rememberToken: true });
    await chrome.storage.session.remove("githubPat").catch(() => {});
  } else {
    await chrome.storage.session.set({ githubPat: rawToken }).catch(() => {});
    await chrome.storage.local.remove("githubPat");
    await chrome.storage.local.set({ githubRepo: repo, githubBranch: branch, expiresOn, rememberToken: false });
  }

  tokenInput.value       = "";
  tokenInput.placeholder = maskToken(rawToken);
  _savedToken            = rawToken;

  setStatus("ok", result.message);
  savedNote.classList.add("visible");
  setTimeout(() => savedNote.classList.remove("visible"), 3000);
  btn.disabled = false;
  updateExpiryInfo(expiresOn);
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();

  const tokenInput = document.getElementById("field-token");
  const revealBtn  = document.getElementById("btn-reveal");
  revealBtn.addEventListener("click", () => {
    const isHidden = tokenInput.type === "password";
    tokenInput.type = isHidden ? "text" : "password";
    revealBtn.textContent = isHidden ? "🙈" : "👁";
  });

  document.getElementById("field-expires").addEventListener("change", (e) => updateExpiryInfo(e.target.value));
  document.getElementById("btn-save").addEventListener("click", handleSaveAndTest);

  // Bulk Sync Wiring
  const optInCheckbox = document.getElementById("field-sync-opt-in");
  const btnBulkSync = document.getElementById("btn-bulk-sync");
  const bulkProgress = document.getElementById("bulk-sync-progress");

  optInCheckbox.addEventListener("change", (e) => {
    btnBulkSync.disabled = !e.target.checked;
  });

  btnBulkSync.addEventListener("click", async () => {
    btnBulkSync.disabled = true;
    optInCheckbox.disabled = true;
    bulkProgress.className = "status testing visible";
    
    try {
      await startBulkSync((msg) => {
        bulkProgress.textContent = msg;
        if (msg.includes("✅")) bulkProgress.className = "status ok visible";
        if (msg.includes("❌")) bulkProgress.className = "status error visible";
      });
    } catch (err) {
      bulkProgress.textContent = "❌ " + err.message;
      bulkProgress.className = "status error visible";
    } finally {
      optInCheckbox.disabled = false;
      // Keep sync button disabled if completed successfully to prevent accidental re-runs
      if (!bulkProgress.textContent.includes("✅")) {
        btnBulkSync.disabled = false;
      }
    }
  });
});
