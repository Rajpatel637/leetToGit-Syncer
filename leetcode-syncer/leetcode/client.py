"""
leetcode/client.py — All LeetCode API communication for the syncer.

Provides the LeetCodeClient class which handles:
  - Session authentication via browser cookies
  - Paginated fetching of all Accepted submissions
  - Fetching actual solution code from submission detail HTML pages
  - Fetching problem metadata (difficulty, topics, description) via GraphQL
  - Orchestrating all of the above into a clean list of Problem objects

All HTTP requests use a 15-second timeout, built-in error handling, and a
configurable delay between requests to avoid rate-limiting.
"""

from __future__ import annotations

import re
import time
from typing import List, Optional

import requests

from .models import Problem, Submission

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

BASE_URL              = "https://leetcode.com"
GRAPHQL_URL           = "https://leetcode.com/graphql"
SUBMISSIONS_URL       = "https://leetcode.com/api/submissions/"
SUBMISSION_DETAIL_URL = "https://leetcode.com/submissions/detail/{}/"


# ---------------------------------------------------------------------------
# LeetCodeClient
# ---------------------------------------------------------------------------

class LeetCodeClient:
    """
    HTTP client for the LeetCode API.

    Uses a persistent requests.Session pre-loaded with the user's browser
    cookies so every request is authenticated as the account owner.

    Args:
        session_cookie: Value of the LEETCODE_SESSION browser cookie.
        csrf_token:     Value of the csrftoken browser cookie.
        username:       LeetCode username (used for auth verification).
        delay:          Seconds to sleep between consecutive API requests.
    """

    def __init__(
        self,
        session_cookie: str,
        csrf_token: str,
        username: str,
        delay: float = 0.5,
    ) -> None:
        self.delay    = delay
        self.username = username

        # Build a persistent session with authentication cookies + headers
        self.session = requests.Session()
        self.session.cookies.set("LEETCODE_SESSION", session_cookie, domain=".leetcode.com")
        self.session.cookies.set("csrftoken",         csrf_token,      domain=".leetcode.com")
        self.session.headers.update({
            "Content-Type": "application/json",
            "Referer":      "https://leetcode.com",
            "x-csrftoken":  csrf_token,
            "User-Agent":   (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36"
            ),
        })

    # ------------------------------------------------------------------
    # Private helper: _graphql
    # ------------------------------------------------------------------

    def _graphql(self, query: str, variables: dict) -> Optional[dict]:
        """
        Execute a GraphQL query against the LeetCode API.

        Args:
            query:     GraphQL query string.
            variables: Dictionary of query variables.

        Returns:
            The ``data`` field of the JSON response, or None on any error.
        """
        try:
            resp = self.session.post(
                GRAPHQL_URL,
                json={"query": query, "variables": variables},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                print(f"  [graphql error] {data['errors']}")
                return None
            return data.get("data")
        except requests.exceptions.Timeout:
            print("  [error] GraphQL request timed out")
            return None
        except requests.exceptions.ConnectionError:
            print("  [error] Could not connect to leetcode.com")
            return None
        except Exception as e:
            print(f"  [error] Unexpected error in GraphQL request: {e}")
            return None

    # ------------------------------------------------------------------
    # Part 3b: verify_auth
    # ------------------------------------------------------------------

    def verify_auth(self) -> bool:
        """
        Verify that the session cookie is valid by checking the user profile.

        Uses a lightweight GraphQL query that returns the username and solve
        counts. If ``matchedUser`` is not None in the response the session is
        considered valid.

        Returns:
            True if authenticated, False otherwise.
        """
        query = """
        query getUserProfile($username: String!) {
          matchedUser(username: $username) {
            username
            submitStats: submitStatsGlobal {
              acSubmissionNum {
                difficulty
                count
              }
            }
          }
        }
        """
        data = self._graphql(query, {"username": self.username})
        if data and data.get("matchedUser") is not None:
            print(f"✅ Authenticated as {self.username}")
            return True
        else:
            print("❌ Authentication failed. Check your LEETCODE_SESSION cookie.")
            return False

    # ------------------------------------------------------------------
    # Part 3c: get_all_ac_submissions
    # ------------------------------------------------------------------

    def get_all_ac_submissions(self) -> List[Submission]:
        """
        Page through /api/submissions/ and return one Submission per solved problem.

        Submissions are fetched newest-first. A dict keyed by ``title_slug``
        is used so that only the latest Accepted submission per problem is kept
        (automatic de-duplication).

        Returns:
            List of unique Submission objects for every Accepted problem.
        """
        seen: dict[str, Submission] = {}   # slug → Submission (latest wins)
        offset   = 0
        limit    = 20
        page_num = 0

        while True:
            page_num += 1
            try:
                resp = self.session.get(
                    SUBMISSIONS_URL,
                    params={"offset": offset, "limit": limit},
                    timeout=15,
                )
                resp.raise_for_status()
                payload = resp.json()
            except Exception as e:
                print(f"  [warn] Submissions page {offset} failed: {e}")
                break

            submissions_dump = payload.get("submissions_dump", [])
            for s in submissions_dump:
                if s.get("status_display") != "Accepted":
                    continue
                slug = s.get("title_slug", "")
                seen[slug] = Submission(
                    id        = str(s.get("id", "")),
                    title     = s.get("title", ""),
                    slug      = slug,
                    language  = s.get("lang", ""),
                    timestamp = int(s.get("timestamp", 0)),
                    runtime   = s.get("runtime", "N/A"),
                    memory    = s.get("memory", "N/A"),
                    code      = "",
                )

            print(f"  📄 Fetched page {page_num} — {len(seen)} unique solved so far")

            if not payload.get("has_next", False):
                break

            offset += limit
            time.sleep(self.delay)

        return list(seen.values())

    # ------------------------------------------------------------------
    # Part 3d: get_submission_and_problem_details
    # ------------------------------------------------------------------

    def get_submission_and_problem_details(self, submission_id: str, slug: str) -> Optional[dict]:
        """
        Fetch both the solution code and full problem metadata in a single GraphQL query.
        This cuts the number of HTTP requests exactly in half.
        """
        query = """
        query getSubmissionAndQuestion($submissionId: Int!, $titleSlug: String!) {
          submissionDetails(submissionId: $submissionId) {
            code
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
        """
        try:
            data = self._graphql(query, {
                "submissionId": int(submission_id),
                "titleSlug": slug
            })
            time.sleep(self.delay)

            if data is None:
                return None

            return {
                "code": data.get("submissionDetails", {}).get("code", "# Code not available"),
                "question": data.get("question")
            }

        except Exception as e:
            print(f"  [warn] Could not fetch details for {slug}: {e}")
            return None

    # ------------------------------------------------------------------
    # Part 3f: get_all_solved_problems (orchestrator)
    # ------------------------------------------------------------------

    def get_all_solved_problems(self, max_problems: int = 0) -> List[Problem]:
        """
        Orchestrate fetching of all data and return a sorted list of Problems.

        Steps:
          1. Verify authentication — raises RuntimeError on failure.
          2. Fetch all Accepted submissions (de-duplicated by problem).
          3. Optionally slice to ``max_problems`` if > 0.
          4. For each submission, fetch the solution code and GraphQL metadata.
          5. Build and return a list of Problem objects sorted by problem ID.

        Args:
            max_problems: Maximum number of problems to process. 0 = unlimited.

        Returns:
            List of Problem objects sorted ascending by numeric problem ID.

        Raises:
            RuntimeError: If authentication fails.
        """
        # Step 1 — auth check
        if not self.verify_auth():
            raise RuntimeError("Authentication failed")

        # Step 2 — collect all unique accepted submissions
        subs = self.get_all_ac_submissions()

        # Step 3 — optional limit
        if max_problems > 0:
            subs = subs[:max_problems]

        total   = len(subs)
        results: List[Problem] = []

        print(f"\n  Processing {total} submissions…\n")

        # Step 4 — enrich each submission
        for i, sub in enumerate(subs, start=1):
            print(f"  [{i}/{total}] {sub.title}")

            # Fetch BOTH code and metadata in ONE request!
            result = self.get_submission_and_problem_details(sub.id, sub.slug)
            if not result or not result.get("question"):
                print(f"  [warn] Skipping '{sub.title}' — could not fetch problem details")
                continue

            code = result["code"]
            details = result["question"]

            problem = Problem(
                id           = int(details.get("questionId", 0)),
                title        = details.get("title", sub.title),
                slug         = details.get("titleSlug", sub.slug),
                difficulty   = details.get("difficulty", "Unknown"),
                topics       = [t.get("name", "") for t in details.get("topicTags", [])],
                description  = details.get("content", ""),
                solution_code= code,
                language     = sub.language,
                runtime      = sub.runtime,
                memory       = sub.memory,
                timestamp    = sub.timestamp,
            )
            results.append(problem)

        # Step 5 — sort by problem ID ascending
        results.sort(key=lambda p: p.id)

        print(f"\n✅ Fetched {len(results)} problems successfully")
        return results
