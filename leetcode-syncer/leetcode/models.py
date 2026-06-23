"""
leetcode/models.py — Dataclasses representing LeetCode data throughout the app.

Defines two dataclasses:
  - Submission: raw data returned from the /api/submissions/ endpoint.
  - Problem:    enriched data combining a Submission with GraphQL metadata
                (difficulty, topics, description). Includes computed properties
                for folder naming, file extensions, and language labels.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


# ---------------------------------------------------------------------------
# Language mapping tables
# ---------------------------------------------------------------------------

# Maps LeetCode language slugs → file extension
_EXTENSION_MAP: dict[str, str] = {
    "python3":    "py",
    "python":     "py",
    "cpp":        "cpp",
    "java":       "java",
    "c":          "c",
    "csharp":     "cs",
    "javascript": "js",
    "typescript": "ts",
    "go":         "go",
    "rust":       "rs",
    "kotlin":     "kt",
    "swift":      "swift",
    "scala":      "scala",
    "ruby":       "rb",
    "php":        "php",
    "mysql":      "sql",
    "bash":       "sh",
}

# Maps LeetCode language slugs → human-readable label
_LABEL_MAP: dict[str, str] = {
    "python3":    "Python",
    "python":     "Python",
    "cpp":        "C++",
    "java":       "Java",
    "c":          "C",
    "csharp":     "C#",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "go":         "Go",
    "rust":       "Rust",
    "kotlin":     "Kotlin",
    "swift":      "Swift",
    "scala":      "Scala",
    "ruby":       "Ruby",
    "php":        "PHP",
    "mysql":      "SQL",
    "bash":       "Bash",
}


# ---------------------------------------------------------------------------
# Submission dataclass
# ---------------------------------------------------------------------------

@dataclass
class Submission:
    """
    Raw submission data returned from the LeetCode /api/submissions/ endpoint.

    Fields are populated directly from the API JSON response. The `code` field
    starts as an empty string and is filled in later by get_submission_code().
    """

    id: str          # Submission ID (used to fetch code from the detail page)
    title: str       # Problem title, e.g. "Two Sum"
    slug: str        # URL slug, e.g. "two-sum"
    language: str    # Language slug, e.g. "python3", "cpp", "java"
    timestamp: int   # Unix epoch when the submission was made
    runtime: str     # e.g. "45 ms" (or "N/A" if not returned by the API)
    memory: str      # e.g. "16.4 MB" (or "N/A" if not returned by the API)
    code: str = ""   # Actual solution code — empty until fetched separately


# ---------------------------------------------------------------------------
# Problem dataclass
# ---------------------------------------------------------------------------

@dataclass
class Problem:
    """
    Enriched problem data combining a Submission with GraphQL metadata.

    Created inside LeetCodeClient.get_all_solved_problems() after both the
    submission code and the GraphQL problem details have been fetched.
    Includes computed properties for generating file paths and content headers.
    """

    id: int                        # Numeric problem ID, e.g. 1 for "Two Sum"
    title: str                     # "Two Sum"
    slug: str                      # "two-sum"
    difficulty: str                # "Easy" | "Medium" | "Hard"
    topics: List[str]              # e.g. ["Array", "Hash Table"]
    description: str               # Raw HTML content from GraphQL
    solution_code: str             # The accepted solution code
    language: str                  # Language slug, e.g. "python3"
    runtime: str                   # e.g. "45 ms"
    memory: str                    # e.g. "16.4 MB"
    timestamp: int                 # Unix epoch of the accepted submission

    # ------------------------------------------------------------------
    # Computed properties
    # ------------------------------------------------------------------

    @property
    def padded_id(self) -> str:
        """Zero-padded 4-digit problem ID string. e.g. 1 → '0001', 42 → '0042'."""
        return str(self.id).zfill(4)

    @property
    def folder_name(self) -> str:
        """
        Filesystem-safe folder name combining padded ID and sanitised title.

        Spaces and forward-slashes in the title are replaced with hyphens so the
        name is safe to use as a directory path on all platforms.
        Example: 1, "Two Sum"  →  "0001-Two-Sum"
        Example: 7, "Reverse Integer" → "0007-Reverse-Integer"
        """
        safe_title = self.title.replace(" ", "-").replace("/", "-")
        return f"{self.padded_id}-{safe_title}"

    @property
    def primary_topic(self) -> str:
        """
        Returns the first topic tag, or 'Uncategorized' if the list is empty.

        Used as the middle directory level in the solutions folder tree:
        solutions/{difficulty}/{primary_topic}/{folder_name}/
        """
        return self.topics[0] if self.topics else "Uncategorized"

    @property
    def file_extension(self) -> str:
        """
        Maps the LeetCode language slug to a file extension.

        Falls back to 'txt' for any unrecognised language slug so that no
        submission is ever silently dropped.
        """
        return _EXTENSION_MAP.get(self.language, "txt")

    @property
    def language_label(self) -> str:
        """
        Maps the LeetCode language slug to a human-readable display name.

        Falls back to 'Unknown' for any unrecognised language slug.
        """
        return _LABEL_MAP.get(self.language, "Unknown")
