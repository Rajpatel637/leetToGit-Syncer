"""
github_sync/uploader.py — Pushes the solution file-tree to GitHub.

Uses the GitHub Git Trees API to create a single atomic commit containing
all files. This approach is significantly faster and produces a cleaner git
history than making one API call per file.

Workflow (called via GitHubUploader.push()):
  1. Verify the target repository is accessible
  2. Get the SHA of the latest commit on the target branch
  3. Get the SHA of the base tree from that commit
  4. Create blob objects for every file (parallelised sequentially with progress)
  5. Create a new tree that references all blobs
  6. Create a new commit pointing at the new tree
  7. Update the branch ref to point at the new commit

All requests use timeout=15 and descriptive error messages.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import requests

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

GITHUB_API = "https://api.github.com"


# ---------------------------------------------------------------------------
# GitHubUploader
# ---------------------------------------------------------------------------

class GitHubUploader:
    """
    Pushes a file-tree dictionary to a GitHub repository in a single commit.

    Args:
        token:  GitHub Personal Access Token with ``repo`` scope.
        repo:   Repository in ``owner/name`` format, e.g. ``"alice/leetcode-solutions"``.
        branch: Target branch name (default ``"main"``).
    """

    def __init__(self, token: str, repo: str, branch: str = "main") -> None:
        self.repo   = repo
        self.branch = branch

        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"token {token}",
            "Accept":        "application/vnd.github.v3+json",
            "Content-Type":  "application/json",
            "User-Agent":    "leetcode-syncer/1.0",
        })

    # ------------------------------------------------------------------
    # Part 5b — verify_repo
    # ------------------------------------------------------------------

    def verify_repo(self) -> bool:
        """
        Check that the target repository exists and is accessible with the
        provided token.

        Returns:
            True if the repo is accessible, False otherwise.
        """
        url = f"{GITHUB_API}/repos/{self.repo}"
        try:
            resp = self.session.get(url, timeout=15)
            if resp.status_code == 200:
                print(f"✅ GitHub repo '{self.repo}' is accessible")
                return True
            elif resp.status_code == 404:
                print(
                    f"❌ Repo '{self.repo}' not found. "
                    "Make sure it exists and your token has repo scope."
                )
                return False
            else:
                print(
                    f"❌ Unexpected status {resp.status_code} when checking repo '{self.repo}'"
                )
                return False
        except Exception as e:
            print(f"❌ Error verifying repo '{self.repo}': {e}")
            return False

    # ------------------------------------------------------------------
    # Part 5c — _get_latest_commit_sha (private)
    # ------------------------------------------------------------------

    def _get_latest_commit_sha(self) -> Optional[str]:
        """
        Fetch the SHA of the latest commit on the target branch.

        Returns:
            The commit SHA string, or None on failure.
        """
        url = f"{GITHUB_API}/repos/{self.repo}/git/ref/heads/{self.branch}"
        try:
            resp = self.session.get(url, timeout=15)
            if resp.status_code == 200:
                return resp.json()["object"]["sha"]
            elif resp.status_code == 404:
                print(f"❌ Branch '{self.branch}' not found in '{self.repo}'")
                return None
            else:
                print(
                    f"❌ Could not get latest commit SHA "
                    f"(status {resp.status_code}): {resp.text}"
                )
                return None
        except Exception as e:
            print(f"❌ Error fetching latest commit SHA: {e}")
            return None

    # ------------------------------------------------------------------
    # Part 5d — _get_base_tree_sha (private)
    # ------------------------------------------------------------------

    def _get_base_tree_sha(self, commit_sha: str) -> Optional[str]:
        """
        Fetch the tree SHA associated with a given commit.

        Args:
            commit_sha: The full SHA of the commit to inspect.

        Returns:
            The tree SHA string, or None on failure.
        """
        url = f"{GITHUB_API}/repos/{self.repo}/git/commits/{commit_sha}"
        try:
            resp = self.session.get(url, timeout=15)
            if resp.status_code == 200:
                return resp.json()["tree"]["sha"]
            else:
                print(
                    f"❌ Could not get base tree SHA "
                    f"(status {resp.status_code}): {resp.text}"
                )
                return None
        except Exception as e:
            print(f"❌ Error fetching base tree SHA: {e}")
            return None

    # ------------------------------------------------------------------
    # Part 5e — _create_blobs (private)
    # ------------------------------------------------------------------

    def _create_blobs(self, files: dict[str, str]) -> list[dict]:
        """
        Upload each file as a Git blob and return tree-item dicts.

        Iterates through every file in ``files``, POSTs the content to the
        GitHub blobs API, and builds the list of tree items needed by
        ``_create_tree()``.

        Args:
            files: Dict of relative path → file content string.

        Returns:
            List of tree item dicts, each with keys ``path``, ``mode``,
            ``type``, and ``sha``.
        """
        url        = f"{GITHUB_API}/repos/{self.repo}/git/blobs"
        tree_items = []
        total      = len(files)

        for i, (path, content) in enumerate(files.items(), start=1):
            print(f"  ☁️  Uploading {i}/{total}: {path}")
            try:
                resp = self.session.post(
                    url,
                    json={"content": content, "encoding": "utf-8"},
                    timeout=15,
                )
                if resp.status_code == 201:
                    tree_items.append({
                        "path": path,
                        "mode": "100644",
                        "type": "blob",
                        "sha":  resp.json()["sha"],
                    })
                else:
                    print(f"  [warn] Failed to create blob for {path} (status {resp.status_code})")
            except Exception as e:
                print(f"  [warn] Failed to create blob for {path}: {e}")

        return tree_items

    # ------------------------------------------------------------------
    # Part 5f — _create_tree (private)
    # ------------------------------------------------------------------

    def _create_tree(self, base_tree_sha: str, tree_items: list[dict]) -> Optional[str]:
        """
        Create a new Git tree that layers the provided blobs on top of the
        existing base tree.

        Args:
            base_tree_sha: SHA of the existing tree to base the new one on.
            tree_items:    List of tree-item dicts from ``_create_blobs()``.

        Returns:
            SHA of the newly created tree, or None on failure.
        """
        url = f"{GITHUB_API}/repos/{self.repo}/git/trees"
        try:
            resp = self.session.post(
                url,
                json={"base_tree": base_tree_sha, "tree": tree_items},
                timeout=15,
            )
            if resp.status_code == 201:
                return resp.json()["sha"]
            else:
                print(
                    f"❌ Failed to create tree "
                    f"(status {resp.status_code}): {resp.text}"
                )
                return None
        except Exception as e:
            print(f"❌ Error creating tree: {e}")
            return None

    # ------------------------------------------------------------------
    # Part 5g — _create_commit (private)
    # ------------------------------------------------------------------

    def _create_commit(
        self,
        tree_sha:   str,
        parent_sha: str,
        message:    str,
    ) -> Optional[str]:
        """
        Create a new Git commit object.

        Args:
            tree_sha:   SHA of the tree to attach to the commit.
            parent_sha: SHA of the parent commit.
            message:    Commit message string.

        Returns:
            SHA of the newly created commit, or None on failure.
        """
        url = f"{GITHUB_API}/repos/{self.repo}/git/commits"
        try:
            resp = self.session.post(
                url,
                json={
                    "message": message,
                    "tree":    tree_sha,
                    "parents": [parent_sha],
                },
                timeout=15,
            )
            if resp.status_code == 201:
                return resp.json()["sha"]
            else:
                print(
                    f"❌ Failed to create commit "
                    f"(status {resp.status_code}): {resp.text}"
                )
                return None
        except Exception as e:
            print(f"❌ Error creating commit: {e}")
            return None

    # ------------------------------------------------------------------
    # Part 5h — _update_branch (private)
    # ------------------------------------------------------------------

    def _update_branch(self, commit_sha: str) -> bool:
        """
        Move the branch ref to point at the new commit (fast-forward).

        Args:
            commit_sha: SHA of the new commit to set as the branch HEAD.

        Returns:
            True if the branch was updated successfully, False otherwise.
        """
        url = f"{GITHUB_API}/repos/{self.repo}/git/refs/heads/{self.branch}"
        try:
            resp = self.session.patch(
                url,
                json={"sha": commit_sha},
                timeout=15,
            )
            if resp.status_code == 200:
                return True
            else:
                print(
                    f"❌ Failed to update branch '{self.branch}' "
                    f"(status {resp.status_code}): {resp.text}"
                )
                return False
        except Exception as e:
            print(f"❌ Error updating branch '{self.branch}': {e}")
            return False

    # ------------------------------------------------------------------
    # Part 5i — push (public entry point)
    # ------------------------------------------------------------------

    def push(
        self,
        files:          dict[str, str],
        commit_message: Optional[str] = None,
    ) -> bool:
        """
        Push all files to GitHub as a single atomic commit.

        Orchestrates the full Git Trees API workflow:
          verify_repo → get latest commit SHA → get base tree SHA →
          create blobs → create new tree → create commit → update branch ref.

        Args:
            files:          Dict of relative path → file content.
            commit_message: Optional custom commit message. A descriptive
                            default is generated if None.

        Returns:
            True if the push succeeded, False if any step failed.
        """
        # Default commit message includes UTC timestamp and file count
        if commit_message is None:
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
            commit_message = (
                f"sync: update solutions [{ts} UTC] ({len(files)} files)"
            )

        # Step 1 — verify repo is accessible
        if not self.verify_repo():
            return False

        # Step 2 — get latest commit SHA on target branch
        latest_sha = self._get_latest_commit_sha()
        if latest_sha is None:
            return False

        # Step 3 — get the base tree SHA from that commit
        base_tree_sha = self._get_base_tree_sha(latest_sha)
        if base_tree_sha is None:
            return False

        # Step 4 — upload every file as a blob
        print(f"\n  Uploading {len(files)} files to GitHub…\n")
        tree_items = self._create_blobs(files)

        # Step 5 — abort if no blobs were created
        if not tree_items:
            print("⚠️  No blobs were created successfully — aborting push.")
            return False

        # Step 6 — create new tree
        print(f"\n  Creating tree with {len(tree_items)} entries…")
        new_tree_sha = self._create_tree(base_tree_sha, tree_items)
        if new_tree_sha is None:
            return False

        # Step 7 — create commit
        print("  Creating commit…")
        new_commit_sha = self._create_commit(new_tree_sha, latest_sha, commit_message)
        if new_commit_sha is None:
            return False

        # Step 8 — update branch ref
        print(f"  Updating branch '{self.branch}'…")
        if not self._update_branch(new_commit_sha):
            return False

        # Step 9 — success
        print(f"\n✅ Successfully pushed {len(files)} files to {self.repo}/{self.branch}")
        print(f"🔗 https://github.com/{self.repo}")
        return True
