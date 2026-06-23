"""
leetcode/__init__.py — Public API for the leetcode package.

Exports:
  LeetCodeClient — handles all HTTP communication with leetcode.com
  Problem        — enriched dataclass combining submission + GraphQL data
  Submission     — raw submission dataclass from the submissions API
"""

from .client import LeetCodeClient
from .models import Problem, Submission

__all__ = ["LeetCodeClient", "Problem", "Submission"]
