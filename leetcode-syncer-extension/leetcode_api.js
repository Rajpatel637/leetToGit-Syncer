/**
 * leetcode_api.js — LeetCode API Client
 *
 * Phase 6: Provides methods to fetch full submission details and question metadata.
 * Uses `getLeetCodeAuth()` to read the CSRF token, which is required for GraphQL POSTs.
 * Cookies (LEETCODE_SESSION) are automatically sent by the browser because the
 * target is the same origin, provided we use `credentials: "include"`.
 */

import { getLeetCodeAuth } from "./leetcode_auth.js";

const GRAPHQL_URL = "https://leetcode.com/graphql/";
// Base URL without a limit param so callers can set their own limit cleanly
const SUBMISSIONS_API_BASE = "https://leetcode.com/api/submissions/?offset=0";

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL Client
// ─────────────────────────────────────────────────────────────────────────────

async function graphql(query, variables = {}, retries = 3) {
  const auth = await getLeetCodeAuth();
  if (!auth) throw new Error("Not logged into LeetCode.");

  for (let attempt = 0; attempt < retries; attempt++) {
    const resp = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrftoken": auth.csrfToken,
        "Referer": "https://leetcode.com/",
      },
      credentials: "include", // Sends LEETCODE_SESSION automatically
      body: JSON.stringify({ query, variables }),
    });

    if (resp.status === 429) {
      console.warn(`[leetcode-syncer] Rate limited (429). Retrying in 2 seconds...`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    if (!resp.ok) {
      throw new Error(`GraphQL error: HTTP ${resp.status}`);
    }

    const payload = await resp.json();
    if (payload.errors && payload.errors.length > 0) {
      // Log detail at debug level only — never surface raw API error strings to the console
      // since they can contain session-context information readable by other extensions.
      console.debug("[leetcode-syncer] GraphQL error detail:", payload.errors[0].message);
      throw new Error("GraphQL returned errors — check debug console for details.");
    }
    return payload.data;
  }
  throw new Error("GraphQL failed after maximum retries due to rate limiting.");
}

// ─────────────────────────────────────────────────────────────────────────────
// API Methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch question details: title, ID, difficulty, HTML content, and topics.
 * @param {string} slug
 */
export async function getQuestionDetails(slug) {
  const query = `
    query questionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        title
        titleSlug
        difficulty
        content
        topicTags {
          name
        }
      }
    }
  `;
  const data = await graphql(query, { titleSlug: slug });
  return data?.question || null;
}

/**
 * Find the latest accepted submission ID for a given slug.
 * @param {string} slug
 * @returns {Promise<string|null>} The submission ID as a string, or null.
 */
export async function getLatestAcceptedSubmissionId(slug, retries = 3) {
  retries = Math.min(retries, 5); // Hard cap: never more than 5 total attempts
  for (let attempt = 0; attempt < retries; attempt++) {
    // Append timestamp to bust browser cache
    const url = `${SUBMISSIONS_API_BASE}&limit=20&_=${Date.now()}`;
    const resp = await fetch(url, {
      method: "GET",
      credentials: "include",
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data && data.submissions_dump) {
        // Find the first matching accepted submission
        for (const sub of data.submissions_dump) {
          if (sub.title_slug === slug && sub.status_display === "Accepted") {
            return String(sub.id);
          }
        }
      }
    }

    if (attempt < retries - 1) {
      console.warn(`[leetcode-syncer] Submission not found in REST API yet. Retrying in 2s (attempt ${attempt + 1}/${retries})...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return null;
}

/**
 * Fetch full submission details (code, runtime, memory, lang) via GraphQL.
 * @param {string|number} submissionId
 * @returns {Promise<Object|null>}
 */
export async function getSubmissionDetails(submissionId) {
  // Validate submissionId is a safe positive integer before it enters GraphQL
  const numId = parseInt(submissionId, 10);
  if (!Number.isFinite(numId) || numId <= 0 || numId > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Invalid submissionId: ${submissionId}`);
  }

  const query = `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        code
        timestamp
        statusCode
        runtimeDisplay
        runtimePercentile
        memoryDisplay
        memoryPercentile
        lang {
          name
          verboseName
        }
      }
    }
  `;
  const data = await graphql(query, { submissionId: numId });
  return data?.submissionDetails || null;
}

/**
 * Paginates through /api/submissions/ to fetch a list of all unique accepted submissions.
 * Submissions are returned newest-first. De-duplicates so only the latest accepted
 * submission per problem is kept.
 * @param {Function} [progressCallback] Optional callback fired after each page (receives current count).
 * @returns {Promise<Array<Object>>} List of basic submission objects.
 */
export async function getAllAcceptedSubmissions(progressCallback = () => {}) {
  const seen = new Map(); // slug -> submission
  let offset = 0;
  const limit = 20;

  while (true) {
    const url = `https://leetcode.com/api/submissions/?offset=${offset}&limit=${limit}&_=${Date.now()}`;
    const resp = await fetch(url, { method: "GET", credentials: "include" });
    
    if (resp.status === 429) {
      console.warn(`[leetcode-syncer] Rate limited on submissions. Retrying in 2 seconds...`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    if (!resp.ok) {
      console.warn(`[leetcode-syncer] Submissions page offset ${offset} failed: HTTP ${resp.status}`);
      break;
    }

    const data = await resp.json();
    if (!data || !data.submissions_dump) break;

    for (const sub of data.submissions_dump) {
      if (sub.status_display === "Accepted" && !seen.has(sub.title_slug)) {
        seen.set(sub.title_slug, {
          id: String(sub.id),
          title: sub.title,
          slug: sub.title_slug,
          lang: sub.lang,
          timestamp: parseInt(sub.timestamp, 10),
          runtime: sub.runtime,
          memory: sub.memory
        });
      }
    }

    progressCallback(seen.size);

    if (!data.has_next) break;
    offset += limit;

    // Safety delay to prevent Cloudflare 403 Forbidden blocks during rapid pagination
    await new Promise(r => setTimeout(r, 500));
  }

  return Array.from(seen.values());
}

/**
 * Fetch both the solution code and full problem metadata in a single GraphQL query.
 * @param {string|number} submissionId 
 * @param {string} slug 
 * @returns {Promise<Object|null>}
 */
export async function getSubmissionAndProblemDetails(submissionId, slug) {
  const numId = parseInt(submissionId, 10);
  if (!Number.isFinite(numId) || numId <= 0 || numId > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Invalid submissionId: ${submissionId}`);
  }

  const query = `
    query getSubmissionAndQuestion($submissionId: Int!, $titleSlug: String!) {
      submissionDetails(submissionId: $submissionId) {
        code
        timestamp
        statusCode
        runtimeDisplay
        runtimePercentile
        memoryDisplay
        memoryPercentile
        lang {
          name
          verboseName
        }
      }
      question(titleSlug: $titleSlug) {
        questionId
        title
        titleSlug
        difficulty
        content
        topicTags {
          name
        }
      }
    }
  `;
  const data = await graphql(query, { submissionId: numId, titleSlug: slug });
  if (!data) return null;

  let codeDetails = data.submissionDetails;

  // Fallback for older submissions where GraphQL returns null for submissionDetails
  if (!codeDetails || !codeDetails.code) {
    try {
      const resp = await fetch(`https://leetcode.com/submissions/detail/${numId}/`, { credentials: "include" });
      const html = await resp.text();
      const match = html.match(/submissionCode:\s*'((?:[^'\\]|\\.)*)'/);
      let fallbackCode = "// Code not found";
      
      if (match) {
        // Decode JS string escapes from the HTML script block
        fallbackCode = match[1]
          .replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }

      codeDetails = {
        code: fallbackCode,
        runtimeDisplay: null,
        memoryDisplay: null,
        runtimePercentile: null,
        memoryPercentile: null
      };
    } catch (e) {
      console.warn(`[leetcode-syncer] Fallback code fetch failed for ${numId}:`, e);
      codeDetails = { code: "// Code not found" };
    }
  }

  return {
    codeDetails: codeDetails,
    question: data.question
  };
}
