"""
github_sync/builder.py — Converts Problem objects into file content strings.

Provides functions to generate:
  - Per-problem README.md  (description + metadata table + solution code)
  - Per-problem solution.{ext} (header comment + raw solution code)
  - Root README.md          (master dashboard with stats, topics, problem table)
  - A full file-tree dict   (path → content) ready for the GitHub uploader
  - A local write helper    (for dry-run / preview mode)

All functions are pure (no I/O except write_locally) and accept only the
dataclass types defined in leetcode/models.py.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import List

from leetcode.models import Problem


# ---------------------------------------------------------------------------
# Part 4a — HTML → Markdown converter (private helper)
# ---------------------------------------------------------------------------

def _html_to_markdown(html: str) -> str:
    """
    Convert a LeetCode HTML problem description to clean Markdown.

    Replacements are applied in a deliberate order so that inner tags are
    handled before outer container tags. All remaining HTML tags are stripped
    and common HTML entities are decoded.

    Args:
        html: Raw HTML string from the GraphQL ``content`` field.

    Returns:
        A clean Markdown string suitable for embedding in a README.
    """
    if not html:
        return "_No description available._"

    # Code blocks — must come before inline <code> so fences wrap the whole block
    html = re.sub(r"<pre>(.*?)</pre>", r"\n```\n\1\n```\n", html, flags=re.S)

    # Inline code
    html = re.sub(r"<code>(.*?)</code>", r"`\1`", html, flags=re.S)

    # Bold
    html = re.sub(r"<strong>(.*?)</strong>", r"**\1**", html, flags=re.S)
    html = re.sub(r"<b>(.*?)</b>",           r"**\1**", html, flags=re.S)

    # Italic
    html = re.sub(r"<em>(.*?)</em>", r"*\1*", html, flags=re.S)

    # Paragraphs
    html = re.sub(r"<p>(.*?)</p>", r"\1\n\n", html, flags=re.S)

    # List items
    html = re.sub(r"<li>(.*?)</li>",       r"- \1\n", html, flags=re.S)
    html = re.sub(r"<[ou]l>(.*?)</[ou]l>", r"\1\n",   html, flags=re.S)

    # Superscript / subscript
    html = re.sub(r"<sup>(.*?)</sup>", r"^\1", html, flags=re.S)
    html = re.sub(r"<sub>(.*?)</sub>", r"_\1", html, flags=re.S)

    # Line breaks
    html = html.replace("<br/>", "\n").replace("<br>", "\n")

    # Strip all remaining HTML tags
    html = re.sub(r"<[^>]+>", "", html)

    # HTML entities
    entities = {
        "&lt;":   "<",  "&gt;":   ">",  "&amp;":  "&",
        "&quot;": '"',  "&#39;":  "'",  "&nbsp;": " ",
        "&le;":   "≤",  "&ge;":   "≥",  "&ne;":   "≠",
    }
    for entity, char in entities.items():
        html = html.replace(entity, char)

    # Collapse runs of 3+ newlines down to 2
    html = re.sub(r"\n{3,}", "\n\n", html)

    return html.strip()


# ---------------------------------------------------------------------------
# Difficulty emoji helper
# ---------------------------------------------------------------------------

def _difficulty_emoji(difficulty: str) -> str:
    """Return the emoji badge for a given difficulty string."""
    return {"Easy": "🟢", "Medium": "🟡", "Hard": "🔴"}.get(difficulty, "⚪")


# ---------------------------------------------------------------------------
# Comment prefix helper (for solution file headers)
# ---------------------------------------------------------------------------

def _comment_prefix(language: str) -> str:
    """
    Return the single-line comment prefix for the given language slug.

    Python / Ruby / Bash  →  #
    SQL (mysql)           →  --
    Everything else       →  //
    """
    if language in ("python3", "python", "ruby", "bash"):
        return "#"
    if language in ("mysql",):
        return "--"
    return "//"


# ---------------------------------------------------------------------------
# Part 4b — build_problem_readme
# ---------------------------------------------------------------------------

def build_problem_readme(problem: Problem) -> str:
    """
    Build the full Markdown content for a per-problem README.md.

    Includes a metadata table (difficulty, topics, language, runtime, memory,
    solved date), the converted problem description, and the solution code in
    a fenced code block with the correct language identifier.

    Args:
        problem: A fully-populated Problem dataclass instance.

    Returns:
        A Markdown string ready to be written as README.md.
    """
    emoji   = _difficulty_emoji(problem.difficulty)
    solved  = datetime.fromtimestamp(problem.timestamp).strftime("%Y-%m-%d")
    topics  = " ".join(f"`{t}`" for t in problem.topics) if problem.topics else "`Uncategorized`"
    lc_url  = f"https://leetcode.com/problems/{problem.slug}/"
    description_md = _html_to_markdown(problem.description)

    # Language identifier for the fenced code block
    lang_id = problem.language  # e.g. "python3", "cpp" — GitHub renders these

    return f"""\
# {problem.padded_id}. {problem.title}

> **[View on LeetCode]({lc_url})** &nbsp;|&nbsp; {emoji} {problem.difficulty}

## 📊 Details

| Field | Info |
|-------|------|
| **Difficulty** | {emoji} {problem.difficulty} |
| **Topics** | {topics} |
| **Language** | {problem.language_label} |
| **Runtime** | {problem.runtime} |
| **Memory** | {problem.memory} |
| **Solved** | {solved} |

---

## 📝 Problem

{description_md}

---

## 💡 Solution

```{lang_id}
{problem.solution_code}
```
"""


# ---------------------------------------------------------------------------
# Part 4c — build_solution_file
# ---------------------------------------------------------------------------

def build_solution_file(problem: Problem) -> str:
    """
    Build the full content for the solution source file (e.g. solution.py).

    Prepends a standardised header comment block containing problem metadata,
    then appends the raw solution code. The comment style is chosen based on
    the problem's language (# for Python/Ruby/Bash, -- for SQL, // otherwise).

    Args:
        problem: A fully-populated Problem dataclass instance.

    Returns:
        A string containing the header comment and solution code.
    """
    prefix  = _comment_prefix(problem.language)
    solved  = datetime.fromtimestamp(problem.timestamp).strftime("%Y-%m-%d")
    lc_url  = f"https://leetcode.com/problems/{problem.slug}/"
    topics  = ", ".join(problem.topics) if problem.topics else "Uncategorized"
    sep     = f"{prefix} " + "-" * 57

    header = (
        f"{prefix} {problem.padded_id}. {problem.title}\n"
        f"{prefix} Difficulty : {problem.difficulty}\n"
        f"{prefix} Topics     : {topics}\n"
        f"{prefix} Runtime    : {problem.runtime}  |  Memory : {problem.memory}\n"
        f"{prefix} Solved     : {solved}\n"
        f"{prefix} Link       : {lc_url}\n"
        f"{sep}\n"
    )

    return header + "\n" + problem.solution_code


# ---------------------------------------------------------------------------
# Part 4d — build_master_readme
# ---------------------------------------------------------------------------

def build_master_readme(problems: List[Problem], username: str) -> str:
    """
    Generate the root README.md for the solutions repository.

    Sections (in order):
      1. Title and last-updated timestamp
      2. Progress stats table (Easy / Medium / Hard counts)
      3. Topic breakdown table (top 15 topics with ASCII progress bars)
      4. Repository folder structure explanation
      5. Full problems table sorted by problem ID

    Args:
        problems: Sorted list of Problem objects.
        username: LeetCode username displayed in the title.

    Returns:
        A Markdown string for the root README.md of the solutions repo.
    """
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # --- Section 1: Title ---------------------------------------------------
    title_section = f"""\
# 🧩 LeetCode Solutions — {username}

> Auto-synced · Last updated: {now_utc}
"""

    # --- Section 2: Progress stats ------------------------------------------
    easy   = sum(1 for p in problems if p.difficulty == "Easy")
    medium = sum(1 for p in problems if p.difficulty == "Medium")
    hard   = sum(1 for p in problems if p.difficulty == "Hard")
    total  = len(problems)
    TOTAL_LC = 2900  # approximate total problems on LeetCode
    pct    = round(total / TOTAL_LC * 100, 1)

    progress_section = f"""\
## 📊 Progress

| 🟢 Easy | 🟡 Medium | 🔴 Hard | ✅ Total |
|---------|----------|---------|---------|
| {easy}  | {medium} | {hard}  | {total} ({pct}% of ~{TOTAL_LC}) |
"""

    # --- Section 3: Topic breakdown -----------------------------------------
    topic_counts: dict[str, int] = {}
    for p in problems:
        for t in p.topics:
            topic_counts[t] = topic_counts.get(t, 0) + 1

    sorted_topics = sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:15]
    max_count     = sorted_topics[0][1] if sorted_topics else 1

    topic_rows = []
    for topic, count in sorted_topics:
        filled = min(round(count / 4), 10)
        bar    = "█" * filled + "░" * (10 - filled)
        topic_rows.append(f"| {topic} | {count} | {bar} |")

    topics_table = "\n".join(topic_rows)
    topics_section = f"""\
## 🏷️ Topics

| Topic | Count | Bar |
|-------|-------|-----|
{topics_table}
"""

    # --- Section 4: Folder structure ----------------------------------------
    structure_section = """\
## 📁 Structure

```
solutions/
├── Easy/
│   ├── Array/
│   │   └── 0001-Two-Sum/
│   │       ├── README.md       # Problem description + metadata
│   │       └── solution.py     # Solution with header comment
│   └── String/
│       └── ...
├── Medium/
│   └── Dynamic-Programming/
│       └── ...
└── Hard/
    └── ...
```
"""

    # --- Section 5: Full problems table -------------------------------------
    rows = []
    for p in problems:
        emoji   = _difficulty_emoji(p.difficulty)
        topics  = ", ".join(p.topics[:2]) if p.topics else "Uncategorized"
        path    = f"solutions/{p.difficulty}/{p.primary_topic}/{p.folder_name}/README.md"
        rows.append(
            f"| [{p.padded_id}]({path}) "
            f"| [{p.title}]({path}) "
            f"| {emoji} {p.difficulty} "
            f"| {topics} "
            f"| {p.language_label} |"
        )

    problems_table = "\n".join(rows)
    problems_section = f"""\
## 📋 All Problems

| # | Title | Difficulty | Topics | Language |
|---|-------|-----------|--------|----------|
{problems_table}
"""

    return "\n".join([
        title_section,
        progress_section,
        topics_section,
        structure_section,
        problems_section,
    ])


# ---------------------------------------------------------------------------
# Part 4e — build_file_tree
# ---------------------------------------------------------------------------

def build_file_tree(problems: List[Problem], username: str) -> dict[str, str]:
    """
    Build the complete file-tree dictionary for the solutions repository.

    Keys are relative file paths (e.g. ``"solutions/Easy/Array/0001-Two-Sum/README.md"``).
    Values are the full string content of each file.

    Args:
        problems: Sorted list of Problem objects.
        username: LeetCode username (passed to build_master_readme).

    Returns:
        A dict mapping relative path → file content string.
    """
    files: dict[str, str] = {}

    # Root README
    files["README.md"] = build_master_readme(problems, username)

    for p in problems:
        base = f"solutions/{p.difficulty}/{p.primary_topic}/{p.folder_name}"
        files[f"{base}/README.md"]              = build_problem_readme(p)
        files[f"{base}/solution.{p.file_extension}"] = build_solution_file(p)

    return files


# ---------------------------------------------------------------------------
# Part 4f — write_locally (dry-run helper)
# ---------------------------------------------------------------------------

def write_locally(files: dict[str, str], output_dir: str) -> None:
    """
    Write all files in the file-tree dict to the local filesystem.

    Creates any missing parent directories automatically. Intended for use in
    dry-run / preview mode so the user can inspect the output before pushing.

    Args:
        files:      Dict of relative path → file content (from build_file_tree).
        output_dir: Root directory under which all files will be written.
    """
    count = 0
    for rel_path, content in files.items():
        abs_path = os.path.join(output_dir, rel_path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "w", encoding="utf-8") as fh:
            fh.write(content)
        print(f"  📝 {rel_path}")
        count += 1

    print(f"✅ Written {count} files to {output_dir}")
