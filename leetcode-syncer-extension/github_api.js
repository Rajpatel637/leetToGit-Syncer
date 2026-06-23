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

const DEBUG = false; // Set to true for local development
function log(...args) { if (DEBUG) console.log(...args); }

/**
 * Fetch all existing problem slugs from the GitHub repository tree.
 * Used to avoid re-syncing problems that are already on GitHub.
 */
export async function getExistingGitHubProblems() {
  try {
    const settings = await getGitHubSettings();
    const repoUrl = `https://api.github.com/repos/${settings.repo}`;
    const headers = {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `Bearer ${settings.pat}`
    };

    const refResp = await fetchWithBackoff(`${repoUrl}/git/refs/heads/${settings.branch}`, { headers });
    if (!refResp.ok) return new Set();
    const refData = await refResp.json();
    const latestCommitSha = refData.object.sha;

    const commitResp = await fetchWithBackoff(`${repoUrl}/git/commits/${latestCommitSha}`, { headers });
    if (!commitResp.ok) return new Set();
    const commitData = await commitResp.json();
    const baseTreeSha = commitData.tree.sha;

    const treeResp = await fetchWithBackoff(`${repoUrl}/git/trees/${baseTreeSha}`, { headers });
    if (!treeResp.ok) return new Set();
    const treeData = await treeResp.json();

    const existingSlugs = new Set();
    for (const item of treeData.tree) {
      if (item.type === "tree") {
        // Extract the slug from folder names like "0001-two-sum" -> "two-sum"
        const match = item.path.match(/^\d{4}-(.+)$/);
        if (match) existingSlugs.add(match[1]);
      }
    }
    return existingSlugs;
  } catch (e) {
    console.warn("[leetcode-syncer] Failed to fetch existing GitHub problems:", e);
    return new Set();
  }
}

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
  retries = Math.min(retries, 5); // Hard cap: never more than 5 attempts
  let delay = 1000;
  for (let attempt = 0; attempt < retries; attempt++) {
    const resp = await fetch(url, options);

    // Retry on 429 or 5xx (but not on the last attempt)
    if ((resp.status === 429 || resp.status >= 500) && attempt < retries - 1) {
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
  const [sessionData, localData] = await Promise.all([
    chrome.storage.session.get("githubPat").catch(() => ({})),
    chrome.storage.local.get(["githubPat", "githubRepo", "githubBranch"]),
  ]);
  const pat  = sessionData.githubPat || localData.githubPat;
  const repo = localData.githubRepo;

  if (!pat || !repo) {
    throw new Error("Missing GitHub PAT or Repository in settings. Open Settings to configure.");
  }

  // Validate repo format to prevent URL injection into GitHub API calls
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
    throw new Error("Stored GitHub repo format is invalid — please reconfigure in Settings.");
  }

  return {
    pat,
    repo,
    branch: localData.githubBranch || "main",
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
  log(`[leetcode-syncer] 📤 Starting GitHub push for ${payload.slug}...`);
  const settings = await getGitHubSettings();

  // Sanitize slug: strip anything outside a-z 0-9 hyphen to prevent path traversal.
  // The slug also comes from LeetCode's GraphQL response (titleSlug), which is
  // distinct from the slug validated earlier in background.js.
  const safeSlug = (payload.slug || "").replace(/[^a-z0-9-]/g, "").slice(0, 100);
  if (!safeSlug) throw new Error("Invalid slug in payload — aborting push.");

  // Sanitize title: strip newlines (commit message injection) and backticks
  const safeTitle = (payload.title || "Unknown").replace(/[\r\n`]/g, " ").trim();

  // Folder naming convention from CLI: "0001-two-sum"
  const paddedId = String(payload.questionId).padStart(4, "0");
  const folderName = `${paddedId}-${safeSlug}`;

  // 1. Build and push README.md
  const readmePath = `${folderName}/README.md`;
  const readmeContent = buildProblemReadme(payload);
  await pushFile(
    readmePath,
    readmeContent,
    `docs: sync README for ${safeTitle}`,
    settings
  );
  log(`[leetcode-syncer] ✅ Pushed ${readmePath}`);

  // 2. Build and push solution code
  const ext = getExtension(payload.lang);
  const solutionPath = `${folderName}/${paddedId}-${safeSlug}.${ext}`;
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
  solCommitMsg += ` - ${safeTitle}`;

  await pushFile(
    solutionPath,
    solutionContent,
    solCommitMsg,
    settings
  );
  log(`[leetcode-syncer] ✅ Pushed ${solutionPath}`);

  log(`[leetcode-syncer] 🎉 Successfully pushed ${payload.title} to GitHub!`);
}

/**
 * Bulk push multiple files in a single atomic commit using the GitHub Trees API.
 * This is exponentially faster than pushing files one by one.
 * @param {Array<{path: string, content: string}>} files 
 * @param {string} commitMessage 
 */
export async function pushBulkToGitHub(files, commitMessage = "Bulk sync past LeetCode submissions") {
  if (!files || files.length === 0) return;
  log(`[leetcode-syncer] 📤 Starting bulk push of ${files.length} files...`);

  const settings = await getGitHubSettings();
  const repoUrl = `https://api.github.com/repos/${settings.repo}`;
  const headers = {
    "Accept": "application/vnd.github.v3+json",
    "Authorization": `Bearer ${settings.pat}`,
    "Content-Type": "application/json",
  };

  // 1. Get latest commit SHA
  const refResp = await fetchWithBackoff(`${repoUrl}/git/refs/heads/${settings.branch}`, { headers });
  if (refResp.status === 404) {
    throw new Error(`Branch ${settings.branch} not found in ${settings.repo}. Please initialize the repo with a README first.`);
  }
  if (!refResp.ok) throw new Error(`Failed to get branch ref: ${refResp.status}`);
  const refData = await refResp.json();
  const latestCommitSha = refData.object.sha;

  // 2. Get base tree SHA
  const commitResp = await fetchWithBackoff(`${repoUrl}/git/commits/${latestCommitSha}`, { headers });
  if (!commitResp.ok) throw new Error(`Failed to get commit: ${commitResp.status}`);
  const commitData = await commitResp.json();
  const baseTreeSha = commitData.tree.sha;

  // 3. Create new tree
  const tree = files.map(file => ({
    path: file.path,
    mode: "100644",
    type: "blob",
    content: file.content
  }));

  const treeResp = await fetchWithBackoff(`${repoUrl}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree })
  });
  if (!treeResp.ok) throw new Error(`Failed to create tree: ${treeResp.status}`);
  const treeData = await treeResp.json();
  const newTreeSha = treeData.sha;

  // 4. Create new commit
  const newCommitResp = await fetchWithBackoff(`${repoUrl}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: commitMessage,
      tree: newTreeSha,
      parents: [latestCommitSha]
    })
  });
  if (!newCommitResp.ok) throw new Error(`Failed to create commit: ${newCommitResp.status}`);
  const newCommitData = await newCommitResp.json();
  const newCommitSha = newCommitData.sha;

  // 5. Update branch reference
  const updateRefResp = await fetchWithBackoff(`${repoUrl}/git/refs/heads/${settings.branch}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: newCommitSha })
  });
  if (!updateRefResp.ok) throw new Error(`Failed to update branch ref: ${updateRefResp.status}`);

  log(`[leetcode-syncer] 🎉 Successfully pushed ${files.length} files via atomic commit!`);
}
