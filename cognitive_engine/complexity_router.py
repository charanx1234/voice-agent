"""
FRIDAY Cognitive Engine — Adaptive Complexity Router
Evaluates reasoning complexity into four discrete tiers:
- L0_INSTANT: Greetings, acknowledgements, direct commands (<50ms local path)
- L1_STANDARD: Everyday questions, definitions, concise single-step responses
- L2_ADVANCED: Debugging, code comparisons, technical troubleshooting, multi-part queries
- L3_DEEP_REASONING: Software architecture, systems design, multi-file planning
"""

from __future__ import annotations
import re
from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from .intent_router import IntentCategory, IntentClassificationResult


class ReasoningLevel(str, Enum):
    L0_INSTANT = "L0"
    L1_STANDARD = "L1"
    L2_ADVANCED = "L2"
    L3_DEEP_REASONING = "L3"


@dataclass
class ComplexityEvaluationResult:
    level: ReasoningLevel
    score: float  # 0.0 to 1.0 scale
    reason: str
    detected_factors: List[str]
    requires_tools: bool
    requires_deep_context: bool


class ComplexityRouter:
    """
    Evaluates reasoning difficulty using intent, structural indicators,
    semantic keywords, and dialogue state.
    """

    # L0 Patterns (Instant local greetings, polite filler, simple status)
    L0_GREETINGS = re.compile(
        r"^(hi|hello|hey|good (morning|afternoon|evening|night)|namaste|vanakkam|thanks|thank you|ok|okay|bye|goodbye|see you|who are you|what is your name)(\s+friday)?[\s.!]*$",
        re.I
    )
    L0_DIRECT_ACTIONS = re.compile(
        r"^(open|launch|close|quit|mute|unmute|what time is it|what is the date|battery level|pause|resume|next song)\b",
        re.I
    )

    # L3 Indicators (Deep architecture, distributed systems, formal proofs, multi-step design)
    L3_KEYWORDS = re.compile(
        r"\b(architecture|distributed system|microservices|consensus|raft|paxos|compiler|race condition|deadlock|"
        r"zero-knowledge|formal verification|kernel|scalability bottleneck|fault tolerance|disaster recovery|"
        r"database sharding|multi-region|eventual consistency|threat model|end-to-end security audit)\b",
        re.I
    )

    # L2 Indicators (Debugging, technical comparison, multi-part troubleshooting)
    L2_KEYWORDS = re.compile(
        r"\b(debug|exception|stack trace|segfault|memory leak|optimize|profiling|refactor|"
        r"compare|versus|tradeoff|analyze|explain why this fails|unit test|integration test)\b",
        re.I
    )

    # Multi-part question markers ("1. ..., 2. ...", "first ..., second ..., then ...")
    MULTIPART_MARKERS = re.compile(
        r"(\b(firstly|secondly|furthermore|additionally|also explain|and also|step 1|step 2|\(1\)|\(2\)|1\.|2\.)\b|\?\s*.*\?)",
        re.I
    )

    def __init__(
        self,
        l1_threshold: float = 0.25,
        l2_threshold: float = 0.55,
        l3_threshold: float = 0.80,
    ):
        self.l1_threshold = l1_threshold
        self.l2_threshold = l2_threshold
        self.l3_threshold = l3_threshold

    def evaluate(
        self,
        message: str,
        intent_result: IntentClassificationResult,
        conversation_history: Optional[List[Dict[str, Any]]] = None
    ) -> ComplexityEvaluationResult:
        text = (message or "").strip()
        history = conversation_history or []
        factors: List[str] = []
        score = 0.0

        # Check L0 first (Instant)
        if self.L0_GREETINGS.match(text):
            return ComplexityEvaluationResult(
                level=ReasoningLevel.L0_INSTANT,
                score=0.05,
                reason="Standard greeting or acknowledgement",
                detected_factors=["greeting_or_acknowledgement"],
                requires_tools=False,
                requires_deep_context=False
            )

        if self.L0_DIRECT_ACTIONS.match(text) and len(text.split()) <= 6:
            return ComplexityEvaluationResult(
                level=ReasoningLevel.L0_INSTANT,
                score=0.10,
                reason="Single direct system command or fast status check",
                detected_factors=["direct_system_command"],
                requires_tools=True,
                requires_deep_context=False
            )

        # Base complexity from Intent
        intent = intent_result.category
        if intent in (IntentCategory.DESKTOP_AUTOMATION, IntentCategory.FILE_OPERATIONS):
            score += 0.20
            factors.append(f"intent:{intent.value}")
        elif intent in (IntentCategory.GENERAL_CONVERSATION, IntentCategory.LEARNING_EXPLANATION):
            score += 0.25
            factors.append(f"intent:{intent.value}")
        elif intent in (IntentCategory.RESEARCH, IntentCategory.MATHEMATICAL_REASONING):
            score += 0.45
            factors.append(f"intent:{intent.value}")
        elif intent in (IntentCategory.PROGRAMMING, IntentCategory.COMPARISON):
            score += 0.55
            factors.append(f"intent:{intent.value}")
        elif intent in (IntentCategory.DEBUGGING, IntentCategory.SCREEN_UNDERSTANDING):
            score += 0.65
            factors.append(f"intent:{intent.value}")
        elif intent == IntentCategory.PLANNING:
            score += 0.75
            factors.append(f"intent:{intent.value}")

        # Semantic keywords check (Short but deep vs long but simple)
        l3_matches = self.L3_KEYWORDS.findall(text)
        if l3_matches:
            score += 0.35
            factors.append(f"l3_keywords:{','.join(l3_matches[:3])}")

        l2_matches = self.L2_KEYWORDS.findall(text)
        if l2_matches:
            score += 0.20
            factors.append(f"l2_keywords:{','.join(l2_matches[:3])}")

        # Code snippet detection
        if "```" in text or re.search(r"[{};()\[\]=>]{3,}", text):
            score += 0.20
            factors.append("code_block_present")

        # Multi-part question detection
        if self.MULTIPART_MARKERS.search(text):
            score += 0.15
            factors.append("multi_part_question")

        # Conversational context influence (e.g. ongoing technical discussion)
        recent_turns = [m.get("text", "") for m in history[-4:] if m.get("role") == "user"]
        if any(self.L3_KEYWORDS.search(t) for t in recent_turns):
            score += 0.15
            factors.append("active_technical_context")
        elif any(self.L2_KEYWORDS.search(t) for t in recent_turns):
            score += 0.10
            factors.append("active_debugging_context")

        # Normalize score between 0.0 and 1.0
        score = min(max(score, 0.0), 1.0)

        # Decide tier based on thresholds
        requires_tools = len(intent_result.suggested_tools) > 0 or intent in (
            IntentCategory.DESKTOP_AUTOMATION,
            IntentCategory.SCREEN_UNDERSTANDING,
            IntentCategory.FILE_OPERATIONS,
            IntentCategory.RESEARCH
        )

        if score >= self.l3_threshold:
            level = ReasoningLevel.L3_DEEP_REASONING
            reason = f"Deep reasoning required (score={score:.2f}, factors={'; '.join(factors)})"
            requires_deep_context = True
        elif score >= self.l2_threshold:
            level = ReasoningLevel.L2_ADVANCED
            reason = f"Advanced problem-solving required (score={score:.2f}, factors={'; '.join(factors)})"
            requires_deep_context = True
        elif score >= self.l1_threshold:
            level = ReasoningLevel.L1_STANDARD
            reason = f"Standard question/response (score={score:.2f}, factors={'; '.join(factors)})"
            requires_deep_context = False
        else:
            level = ReasoningLevel.L0_INSTANT
            reason = f"Instant response path (score={score:.2f})"
            requires_deep_context = False

        return ComplexityEvaluationResult(
            level=level,
            score=score,
            reason=reason,
            detected_factors=factors,
            requires_tools=requires_tools,
            requires_deep_context=requires_deep_context
        )
