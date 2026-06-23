/**
 * github_api.js — Phase 7: GitHub REST API Client
 *
 * Responsibilities:
 * - Read PAT, repo, and branch from chrome.storage.local.
 * - Encode content to base64 properly (handling Unicode).
 * - Push files to GitHub via the Contents API.
 * - Fetch the existing file SHA if updating an existing file.
 * - Handle 401/403 errors and surface them explicitly.
 */

import { buildProblemReadme, buildSolutionFile, getExtension } from "./github_builder.js";

// Safe Base64 encoding for Unicode strings (btoa fails on non-ASCII characters)
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * fetch() with exponential backoff for GitHub rate-limit (429) and server errors (5xx).
 * Respects the Retry-After response header when present.
 * Max 3 retries: delays of ~1s, 2s, 4s.
 */
async function fetchWithBackoff(url, options, retries = 3) {
  let delay = 1000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(url, options);

    // Retry on 429 or 5xx
    if ((resp.status === 429 || resp.status >= 500) && attempt < retries) {
      const retryAfter = parseInt(resp.headers.get("Retry-After") || "0", 10) * 1000;
      const waitMs = retryAfter > 0 ? retryAfter : delay;
      console.warn(`[leetcode-syncer] GitHub ${resp.status} — retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise(r => setTimeout(r, waitMs));
      delay *= 2; // exponential backoff
      continue;
    }
    return resp;
  }
}

/**
 * Get current settings from chrome.storage.local
 */
async function getGitHubSettings() {
  const data = await chrome.storage.local.get(["githubPat", "githubRepo", "githubBranch"]);
  if (!data.githubPat || !data.githubRepo) {
    throw new Error("Missing GitHub PAT or Repository in settings.");
  }
  return {
    pat: data.githubPat,
    repo: data.githubRepo,
    branch: data.githubBranch || "main",
  };
}

/**
 * Get the SHA of an existing file (required to update it).
 * Returns null if the file does not exist (404).
 */
async function getFileSha(path, settings) {
  const url = `https://api.github.com/repos/${settings.repo}/contents/${path}?ref=${settings.branch}`;
  const resp = await fetchWithBackoff(url, {
    method: "GET",
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `Bearer ${settings.pat}`,
    },
  });

  if (resp.status === 404) return null;
  
  if (resp.status === 401 || resp.status === 403) {
    throw new Error("GITHUB_AUTH_FAILED");
  }
  if (!resp.ok) throw new Error(`Failed to check file SHA: ${resp.status}`);

  const data = await resp.json();
  return data.sha;
}

/**
 * Push a single file to GitHub.
 */
async function pushFile(path, content, commitMessage, settings) {
  const url = `https://api.github.com/repos/${settings.repo}/contents/${path}`;
  
  // 1. Check if file exists to get its SHA
  const sha = await getFileSha(path, settings);

  // 2. Put the file
  const body = {
    message: commitMessage,
    content: utf8ToBase64(content),
    branch: settings.branch,
  };
  if (sha) body.sha = sha;

  const resp = await fetchWithBackoff(url, {
    method: "PUT",
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `Bearer ${settings.pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new Error("GITHUB_AUTH_FAILED");
  }
  if (!resp.ok) {
    throw new Error(`Failed to push ${path}: ${resp.statusText}`);
  }
}

/**
 * Orchestrate the generation and pushing of a solved problem to GitHub.
 * @param {Object} payload The payload assembled by sync_orchestrator.js
 */
export async function pushToGitHub(payload) {
  console.log(`[leetcode-syncer] 📤 Starting GitHub push for ${payload.slug}...`);
  const settings = await getGitHubSettings();

  // Folder naming convention from CLI: "0001-two-sum"
  const paddedId = String(payload.questionId).padStart(4, "0");
  const folderName = `${paddedId}-${payload.slug}`;
  
  // 1. Build and push README.md
  const readmePath = `${folderName}/README.md`;
  const readmeContent = buildProblemReadme(payload);
  await pushFile(
    readmePath,
    readmeContent,
    `docs: sync README for ${payload.title}`,
    settings
  );
  console.log(`[leetcode-syncer] ✅ Pushed ${readmePath}`);

  // 2. Build and push solution code
  const ext = getExtension(payload.lang);
  const solutionPath = `${folderName}/${paddedId}-${payload.slug}.${ext}`;
  const solutionContent = buildSolutionFile(payload);

  // Build commit message exactly like: Time: 0 ms (100%), Space: 34.4 MB (14.61%) - Two Sum
  let solCommitMsg = `Time: ${payload.runtime}`;
  if (typeof payload.runtimePercentile === "number") {
    solCommitMsg += ` (${payload.runtimePercentile.toFixed(2)}%)`;
  }
  solCommitMsg += `, Space: ${payload.memory}`;
  if (typeof payload.memoryPercentile === "number") {
    solCommitMsg += ` (${payload.memoryPercentile.toFixed(2)}%)`;
  }
  solCommitMsg += ` - ${payload.title}`;

  await pushFile(
    solutionPath,
    solutionContent,
    solCommitMsg,
    settings
  );
  console.log(`[leetcode-syncer] ✅ Pushed ${solutionPath}`);

  console.log(`[leetcode-syncer] 🎉 Successfully pushed ${payload.title} to GitHub!`);
}
