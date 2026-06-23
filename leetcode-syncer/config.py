"""
config.py — Configuration loader for LeetCode → GitHub Syncer.

Reads all required environment variables from a .env file, validates that
none are missing or still set to placeholder values, and exports them as
typed module-level constants for use across the entire application.

Usage:
    import config
    print(config.LEETCODE_USERNAME)
"""

import os
from dotenv import load_dotenv

# Load variables from .env file (if present) into the environment
load_dotenv()


def _require(key: str, hint: str) -> str:
    """
    Read an environment variable by name and validate it is set and not a placeholder.

    Args:
        key:  The name of the environment variable to read.
        hint: A human-readable hint shown to the user when the variable is missing.

    Returns:
        The string value of the environment variable (stripped of whitespace).

    Raises:
        ValueError: If the variable is missing, empty, or still set to a
                    placeholder value (i.e. it starts with "your_").
    """
    val = os.getenv(key, "").strip()
    if not val or val.startswith("your_"):
        raise ValueError(
            f"\n[config error] '{key}' is not set in your .env file.\n"
            f"Hint: {hint}\n"
            f"Copy .env.example to .env and fill in your values."
        )
    return val


# ---------------------------------------------------------------------------
# LeetCode credentials
# ---------------------------------------------------------------------------

LEETCODE_SESSION: str = _require(
    "LEETCODE_SESSION",
    "Go to leetcode.com → DevTools (F12) → Application → Cookies → "
    "leetcode.com and copy the value of 'LEETCODE_SESSION'.",
)

CSRF_TOKEN: str = _require(
    "LEETCODE_CSRF_TOKEN",
    "Go to leetcode.com → DevTools (F12) → Application → Cookies → "
    "leetcode.com and copy the value of 'csrftoken'.",
)

LEETCODE_USERNAME: str = _require(
    "LEETCODE_USERNAME",
    "Enter your LeetCode username (the one shown in your profile URL).",
)

# ---------------------------------------------------------------------------
# GitHub credentials
# ---------------------------------------------------------------------------

GITHUB_TOKEN: str = _require(
    "GITHUB_TOKEN",
    "Create a Personal Access Token at https://github.com/settings/tokens "
    "with the 'repo' scope selected.",
)

GITHUB_REPO: str = _require(
    "GITHUB_REPO",
    "Set this to 'username/repo-name', e.g. 'rajpatel637/leetcode-solutions'. "
    "The repo must already exist on GitHub.",
)

GITHUB_BRANCH: str = _require(
    "GITHUB_BRANCH",
    "Set this to the target branch name, e.g. 'main' or 'master'.",
)

# ---------------------------------------------------------------------------
# Sync settings (with safe defaults)
# ---------------------------------------------------------------------------

_raw_delay = os.getenv("REQUEST_DELAY", "0.5").strip()
try:
    REQUEST_DELAY: float = float(_raw_delay)
    if REQUEST_DELAY < 0.3:
        print(
            f"[config warning] REQUEST_DELAY={REQUEST_DELAY} is very low. "
            "Setting to minimum of 0.3s to avoid rate-limiting."
        )
        REQUEST_DELAY = 0.3
except ValueError:
    print(f"[config warning] Invalid REQUEST_DELAY='{_raw_delay}'. Using default 0.5s.")
    REQUEST_DELAY = 0.5

_raw_max = os.getenv("MAX_SUBMISSIONS", "0").strip()
try:
    MAX_SUBMISSIONS: int = int(_raw_max)
except ValueError:
    print(f"[config warning] Invalid MAX_SUBMISSIONS='{_raw_max}'. Using default 0 (unlimited).")
    MAX_SUBMISSIONS = 0
