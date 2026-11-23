"""
FRIDAY Cognitive Engine — Smart Memory Retriever
Provides relevance-ranked, deduplicated, recency-weighted memory retrieval
compatible with FRIDAY's existing SQLite memory store.
"""

from __future__ import annotations
import math
import re
import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class MemoryItem:
    id: str
    kind: str  # 'fact', 'preference', 'project', 'decision', 'contact'
    title: str
    content: str
    importance: int  # 1 to 5
    created_at: float  # Unix timestamp in seconds
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class RankedMemory:
    item: MemoryItem
    relevance_score: float  # 0.0 to 1.0
    matched_terms: List[str]
    recency_factor: float
    importance_factor: float


class MemoryRetriever:
    """
    Ranks long-term memories using hybrid keyword-overlap, importance weighting,
    and exponential temporal decay.
    """

    STOPWORDS = {
        "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "of", "with",
        "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does",
        "did", "can", "could", "will", "would", "should", "i", "you", "he", "she",
        "it", "we", "they", "my", "your", "his", "her", "their", "this", "that"
    }

    def __init__(
        self,
        relevance_threshold: float = 0.25,
        recency_half_life_days: float = 14.0,
        max_results: int = 7
    ):
        self.relevance_threshold = relevance_threshold
        self.recency_half_life_seconds = recency_half_life_days * 86400.0
        self.max_results = max_results

    def _tokenize(self, text: str) -> List[str]:
        words = re.findall(r"\b[a-zA-Z0-9_]{2,}\b", (text or "").lower())
        return [w for w in words if w not in self.STOPWORDS]

    def rank_memories(
        self,
        query: str,
        candidates: List[MemoryItem],
        intent_hint: Optional[str] = None
    ) -> List[RankedMemory]:
        """
        Ranks candidate memories against the user query.
        Formula:
          score = (0.5 * term_overlap) + (0.3 * importance_norm) + (0.2 * recency_weight)
        """
        query_tokens = set(self._tokenize(query))
        if not query_tokens and not candidates:
            return []

        now = time.time()
        ranked: List[RankedMemory] = []
        seen_contents = set()

        for mem in candidates:
            # Deduplication
            normalized_content = re.sub(r"\s+", " ", mem.content.strip().lower())
            if normalized_content in seen_contents:
                continue
            seen_contents.add(normalized_content)

            mem_tokens = set(self._tokenize(mem.title + " " + mem.content))
            matched_terms = list(query_tokens.intersection(mem_tokens))

            # Term overlap score (Jaccard or token match ratio)
            if query_tokens:
                term_overlap = len(matched_terms) / float(len(query_tokens))
                # Boost if exact title match
                if mem.title.lower() in query.lower():
                    term_overlap = min(1.0, term_overlap + 0.4)
            else:
                term_overlap = 0.1

            # Importance factor (1..5 -> 0.2..1.0)
            importance_norm = min(max(mem.importance / 5.0, 0.2), 1.0)

            # Recency factor with half-life decay
            age_seconds = max(0.0, now - mem.created_at)
            recency_factor = math.exp(-0.693 * age_seconds / self.recency_half_life_seconds)

            # Intent kind bonus
            kind_bonus = 0.0
            if intent_hint == "programming" and mem.kind in ("project", "decision"):
                kind_bonus = 0.15
            elif intent_hint == "general_conversation" and mem.kind in ("preference", "fact"):
                kind_bonus = 0.10

            composite_score = (
                (0.50 * term_overlap) +
                (0.30 * importance_norm) +
                (0.20 * recency_factor) +
                kind_bonus
            )
            composite_score = min(max(composite_score, 0.0), 1.0)

            if composite_score >= self.relevance_threshold:
                ranked.append(RankedMemory(
                    item=mem,
                    relevance_score=composite_score,
                    matched_terms=matched_terms,
                    recency_factor=recency_factor,
                    importance_factor=importance_norm
                ))

        # Sort descending by composite relevance
        ranked.sort(key=lambda r: r.relevance_score, reverse=True)
        return ranked[:self.max_results]

    def format_context_block(self, ranked: List[RankedMemory]) -> str:
        """Renders ranked memories into the prompt context block."""
        if not ranked:
            return ""

        lines = []
        for r in ranked:
            m = r.item
            important_tag = ", important" if m.importance >= 4 else ""
            lines.append(f"- [{m.kind}{important_tag}] {m.title}: {m.content}")

        return (
            "LONG-TERM MEMORY (relevant details remembered from earlier conversations):\n"
            + "\n".join(lines)
            + "\n\nGuidelines: Use these memories naturally when relevant. Never cite the database verbatim."
        )
