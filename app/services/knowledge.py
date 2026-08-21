"""Lightweight keyword retrieval over the curated knowledge base.

Deliberately NOT a full RAG pipeline: entries are small, curated and few
(dozens), so substring keyword matching (Chinese phrases + English tokens)
is fast, deterministic and testable. A full RAG system is out of scope for
this project (see README).
"""
from __future__ import annotations

import re


class Entry:
    __slots__ = ("id", "title", "category", "keywords", "content", "source")

    def __init__(self, id: str, title: str, category: str, keywords: list[str], content: str, source: str):
        self.id = id
        self.title = title
        self.category = category
        self.keywords = keywords
        self.content = content
        self.source = source


class KnowledgeBase:
    def __init__(self, entries: list[dict]):
        self._entries: list[Entry] = []
        for e in entries:
            self._entries.append(
                Entry(
                    id=e["id"],
                    title=e["title"],
                    category=e["category"],
                    keywords=list(e["keywords"]),
                    content=e["content"],
                    source=e["source"],
                )
            )

    def search(self, question: str) -> Entry | None:
        """Return the best-matching entry, or None when nothing matches."""
        q = (question or "").strip().lower()
        if not q:
            return None

        best: Entry | None = None
        best_score = 0
        for entry in self._entries:
            score = self._score(entry, q)
            if score > best_score:
                best, best_score = entry, score
        return best if best_score >= 1 else None

    def _score(self, entry: Entry, q_lower: str) -> int:
        score = 0
        tokens = set(re.findall(r"[a-z0-9]+", q_lower))
        for kw in entry.keywords:
            k = kw.lower().strip()
            if not k:
                continue
            if k in q_lower:
                score += 1
            elif re.fullmatch(r"[a-z0-9][a-z0-9 ]*", k) and k.split() and set(k.split()) & tokens:
                # English keyword: match when any significant token appears.
                score += 1
        return score
