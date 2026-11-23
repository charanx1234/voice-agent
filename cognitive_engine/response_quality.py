"""
FRIDAY Cognitive Engine — Response Quality Controller
Performs fast, rule-based response validation:
- Guards against hallucinated tool actions
- Validates markdown block closure (unclosed code fences)
- Strips redundant filler phrases
- Preserves personality modes (Simple, Moderate, Roast)
"""

from __future__ import annotations
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from .tool_orchestrator import ToolExecutionResult


@dataclass
class QualityCheckResult:
    passed: bool
    sanitized_text: str
    reasons: List[str]
    has_unverified_action_claim: bool = False


class ResponseQualityController:
    """
    Lightweight sanity verification applied to model outputs prior to final delivery.
    Runs entirely locally (<1ms) without secondary LLM latency.
    """

    REDUNDANT_PREAMBLE = re.compile(
        r"^(sure,?\s*(i can help with that|here is the answer|certainly|as an ai language model|let me explain)[\s.!:]*)+",
        re.I
    )

    ACTION_CLAIMS = [
        re.compile(r"\b(i (have )?(opened|launched|started|closed|shut down|restarted))\b", re.I),
        re.compile(r"\b(i (have )?(saved|deleted|created) (the|your) (file|note|folder))\b", re.I),
    ]

    def validate_and_sanitize(
        self,
        response_text: str,
        user_query: str,
        tool_results: Optional[List[ToolExecutionResult]] = None,
        personality_mode: str = "moderate"
    ) -> QualityCheckResult:
        text = (response_text or "").strip()
        reasons: List[str] = []
        tools = tool_results or []

        # 1. Non-empty check
        if not text:
            return QualityCheckResult(
                passed=False,
                sanitized_text="I processed that, but produced an empty response. Could you rephrase your question?",
                reasons=["empty_model_response"]
            )

        # 2. Strip robotic boilerplate preamble in Moderate / Roast modes
        if personality_mode in ("moderate", "roast"):
            cleaned = self.REDUNDANT_PREAMBLE.sub("", text).strip()
            if cleaned:
                text = cleaned
                reasons.append("stripped_redundant_preamble")

        # 3. Unverified action claim verification
        # If the model claims it opened an app or modified a file, verify that a corresponding tool succeeded
        has_unverified_claim = False
        for claim_pat in self.ACTION_CLAIMS:
            if claim_pat.search(text):
                # Verify that at least one consequential tool succeeded
                successful_tools = [t for t in tools if t.success]
                if not successful_tools:
                    has_unverified_claim = True
                    reasons.append("unverified_action_claim_detected")
                    # Append clarification to avoid misleading user
                    text += "\n\n*(Note: Please verify that the intended desktop action completed successfully on your system.)*"
                    break

        # 4. Markdown code fence validation
        code_fence_count = text.count("```")
        if code_fence_count % 2 != 0:
            text += "\n```"
            reasons.append("closed_unclosed_code_fence")

        return QualityCheckResult(
            passed=True,
            sanitized_text=text,
            reasons=reasons,
            has_unverified_action_claim=has_unverified_claim
        )
