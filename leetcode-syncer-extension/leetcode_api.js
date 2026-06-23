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
const SUBMISSIONS_API = "https://leetcode.com/api/submissions/?offset=0&limit=10";

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL Client
// ─────────────────────────────────────────────────────────────────────────────

async function graphql(query, variables = {}) {
  const auth = await getLeetCodeAuth();
  if (!auth) throw new Error("Not logged into LeetCode.");

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

  if (!resp.ok) {
    throw new Error(`GraphQL error: HTTP ${resp.status}`);
  }

  const payload = await resp.json();
  if (payload.errors && payload.errors.length > 0) {
    throw new Error(`GraphQL returned errors: ${payload.errors[0].message}`);
  }
  return payload.data;
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
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Append timestamp to bust browser cache
    const url = `${SUBMISSIONS_API.replace('limit=10', 'limit=20')}&_=${Date.now()}`;
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

    if (attempt < retries) {
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
  const data = await graphql(query, { submissionId: parseInt(submissionId, 10) });
  return data?.submissionDetails || null;
}
