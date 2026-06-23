"""
sync.py — Main CLI entry point for the LeetCode → GitHub Syncer.

Usage:
    python sync.py                              # Full sync to GitHub
    python sync.py --dry-run                    # Preview files locally, no push
    python sync.py --dry-run --output-dir ./out # Write preview to custom dir
    python sync.py --max 50                     # Sync only latest 50 problems
    python sync.py --delay 1.0                  # Custom delay between requests
    python sync.py --commit-msg "Weekly sync"   # Custom GitHub commit message
    python sync.py --no-auth-check              # Skip LeetCode auth verification

Run `python sync.py --help` for full usage information.
"""

import argparse
import sys

from leetcode import LeetCodeClient
from github_sync import build_file_tree, write_locally, GitHubUploader


# ---------------------------------------------------------------------------
# Part 6a — Argument parser
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    """
    Parse and return command-line arguments.

    Returns:
        Parsed argument namespace with attributes: dry_run, output_dir,
        max, delay, commit_msg, no_auth_check.
    """
    parser = argparse.ArgumentParser(
        prog="sync.py",
        description=(
            "🧩 LeetCode → GitHub Syncer\n"
            "Fetches all your Accepted LeetCode submissions and pushes them\n"
            "to a GitHub repository with auto-generated READMEs."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python sync.py                        # Full sync to GitHub\n"
            "  python sync.py --dry-run              # Preview locally\n"
            "  python sync.py --max 50               # Limit to 50 problems\n"
            "  python sync.py --commit-msg 'Weekly'  # Custom commit message\n"
        ),
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help=(
            "Build all files locally without pushing to GitHub. "
            "Use with --output-dir to control where files are written."
        ),
    )

    parser.add_argument(
        "--output-dir",
        type=str,
        default="./output",
        metavar="DIR",
        help="Directory to write files in dry-run mode (default: ./output).",
    )

    parser.add_argument(
        "--max",
        type=int,
        default=0,
        metavar="N",
        help=(
            "Maximum number of problems to fetch and sync. "
            "0 means fetch all (default: 0)."
        ),
    )

    parser.add_argument(
        "--delay",
        type=float,
        default=None,
        metavar="SECONDS",
        help=(
            "Seconds to wait between API requests. "
            "Overrides REQUEST_DELAY from .env (default: use .env value)."
        ),
    )

    parser.add_argument(
        "--commit-msg",
        type=str,
        default=None,
        metavar="MSG",
        help=(
            "Custom GitHub commit message. "
            "If omitted, an auto-generated message with timestamp is used."
        ),
    )

    parser.add_argument(
        "--no-auth-check",
        action="store_true",
        default=False,
        help=(
            "Skip the LeetCode authentication verification step. "
            "Useful if the GraphQL profile endpoint is temporarily unavailable."
        ),
    )

    return parser.parse_args()


# ---------------------------------------------------------------------------
# Part 6b — Main function
# ---------------------------------------------------------------------------

def main() -> None:
    """
    Orchestrate the full LeetCode → GitHub sync workflow.

    Steps:
      1. Parse CLI arguments
      2. Load and validate config from .env
      3. Initialise the LeetCode client
      4. Fetch all solved problems (with optional limit)
      5. Build the complete file tree
      6. Either write locally (dry-run) or push to GitHub
    """
    args = parse_args()

    # Banner
    print("=" * 60)
    print("  🧩 LeetCode → GitHub Syncer")
    print("=" * 60)

    # ------------------------------------------------------------------
    # Step 1: Load config
    # ------------------------------------------------------------------
    print("\n📋 Loading config…")
    try:
        import config
    except ValueError as e:
        print(e)
        sys.exit(1)

    # ------------------------------------------------------------------
    # Step 2: Initialise LeetCode client
    # ------------------------------------------------------------------
    print(f"\n🔐 Connecting to LeetCode as '{config.LEETCODE_USERNAME}'…")
    client = LeetCodeClient(
        session_cookie=config.LEETCODE_SESSION,
        csrf_token=config.CSRF_TOKEN,
        username=config.LEETCODE_USERNAME,
        delay=args.delay if args.delay is not None else config.REQUEST_DELAY,
    )

    # Optional: skip auth check (e.g. GraphQL profile endpoint is flaky)
    if args.no_auth_check:
        print("  ⚠️  Skipping auth check (--no-auth-check flag set)")

    # ------------------------------------------------------------------
    # Step 3: Fetch solved problems
    # ------------------------------------------------------------------
    print("\n📥 Fetching solved problems…\n")
    try:
        max_problems = args.max if args.max else config.MAX_SUBMISSIONS
        problems = client.get_all_solved_problems(max_problems=max_problems)
    except RuntimeError as e:
        print(f"❌ {e}")
        sys.exit(1)

    if not problems:
        print("⚠️  No solved problems found. Exiting.")
        sys.exit(0)

    # ------------------------------------------------------------------
    # Step 4: Build file tree
    # ------------------------------------------------------------------
    print(f"\n📦 Building file tree for {len(problems)} problems…")
    files = build_file_tree(problems, config.LEETCODE_USERNAME)
    print(f"   → {len(files)} files to create/update")

    # ------------------------------------------------------------------
    # Step 5: Push or dry-run
    # ------------------------------------------------------------------
    if args.dry_run:
        print(f"\n🧪 Dry-run mode — writing to {args.output_dir}")
        write_locally(files, args.output_dir)
        print("\n✅ Dry-run complete. No files were pushed to GitHub.")
    else:
        print(f"\n🚀 Pushing to GitHub ({config.GITHUB_REPO})…\n")
        uploader = GitHubUploader(
            token=config.GITHUB_TOKEN,
            repo=config.GITHUB_REPO,
            branch=config.GITHUB_BRANCH,
        )
        success = uploader.push(files, commit_message=args.commit_msg)
        if not success:
            print("\n❌ Push failed. See errors above.")
            sys.exit(1)

    print("\n🎉 All done!")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    main()
