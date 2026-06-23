"""
github_sync/__init__.py — Public API for the github_sync package.

Exports:
  build_file_tree      — builds the full { path: content } dict for a solutions repo
  write_locally        — writes the file-tree dict to disk (dry-run helper)
  build_problem_readme — builds the Markdown README for a single problem
  GitHubUploader       — pushes the file-tree to GitHub via the Git Trees API
"""

from .builder import build_file_tree, write_locally, build_problem_readme
from .uploader import GitHubUploader

__all__ = ["build_file_tree", "write_locally", "build_problem_readme", "GitHubUploader"]
