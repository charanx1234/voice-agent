"""
FRIDAY Cognitive Engine — Lightweight Intent Router
Performs fast (<2ms), deterministic, context-aware intent classification
across 13 primary categories without requiring expensive LLM round-trips.
"""

from __future__ import annotations
import re
from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


class IntentCategory(str, Enum):
    GENERAL_CONVERSATION = "general_conversation"
    LEARNING_EXPLANATION = "learning_explanation"
    PROGRAMMING = "programming"
    DEBUGGING = "debugging"
    RESEARCH = "research"
    COMPARISON = "comparison"
    PLANNING = "planning"
    MATHEMATICAL_REASONING = "mathematical_reasoning"
    FILE_OPERATIONS = "file_operations"
    DESKTOP_AUTOMATION = "desktop_automation"
    SCREEN_UNDERSTANDING = "screen_understanding"
    MEMORY_MANAGEMENT = "memory_management"
    FOLLOW_UP = "follow_up"


@dataclass
class IntentClassificationResult:
    category: IntentCategory
    confidence: float
    detected_patterns: List[str]
    is_contextual_follow_up: bool
    underlying_intent: Optional[IntentCategory] = None
    suggested_tools: List[str] = None

    def __post_init__(self):
        if self.suggested_tools is None:
            self.suggested_tools = []


class IntentRouter:
    """
    Lightweight rule-based and contextual intent classifier.
    Handles English, Hinglish, and Telugu (Tenglish) commands.
    """

    # 1. Screen Understanding Patterns
    SCREEN_PATTERNS = [
        re.compile(r"\b(screen|display|monitor|window|screenshot|look at (this|my screen)|what('s| is) on my screen)\b", re.I),
        re.compile(r"\b(analyze (this|my) screen|see this error|read (this|the) text on screen)\b", re.I),
    ]

    # 2. Desktop Automation Patterns
    DESKTOP_PATTERNS = [
        re.compile(r"\b(open|launch|start|run|close|kill|quit|maximize|minimize|restore)\s+[a-z0-9_.-]+", re.I),
        re.compile(r"\b(mute|unmute|volume (up|down|to|set)|brightness (up|down|to|set)|sleep|shutdown|restart)\b", re.I),
        re.compile(r"\b(move mouse|click (start|button|here)|scroll (up|down)|type (this|my clipboard))\b", re.I),
        re.compile(r"\b(open chey|close chey|chalao|kholo|band karo)\b", re.I),
    ]

    # 3. File Operations Patterns
    FILE_PATTERNS = [
        re.compile(r"\b(file|folder|directory|rename|move file|delete file|copy file|find file|search folder|list files)\b", re.I),
        re.compile(r"\b(read file|save note|list notes|delete note|batch rename)\b", re.I),
    ]

    # 4. Memory Management Patterns
    MEMORY_PATTERNS = [
        re.compile(r"\b(remember (that|this)|don't forget|save to memory|what do you remember|forget (that|everything)|my favorite|my preference)\b", re.I),
        re.compile(r"\b(gurthupettuko|yaad rakhna)\b", re.I),
    ]

    # 5. Debugging Patterns
    DEBUGGING_PATTERNS = [
        re.compile(r"\b(debug|bug|bugs|error|errors|exception|exceptions|crash|crashes|crashing|stack trace|segfault|nullpointer|failed|fails|broken|not working|doesn't work|fix this|resolve|race condition|deadlock|concurrency|[a-z]+error|[a-z]+exception)\b", re.I),
        re.compile(r"\b(why (is this|isn't this|does this) (fail|error|break|not work)|work avvatledu|error vastundi)\b", re.I),
    ]

    # 6. Programming Patterns
    PROGRAMMING_PATTERNS = [
        re.compile(r"\b(code|function|class|method|interface|algorithm|typescript|javascript|python|react|html|css|sql|rust|c\+\+|api|refactor|compile)\b", re.I),
        re.compile(r"\b(write a script|generate (code|function)|create a component|regex)\b", re.I),
    ]

    # 7. Mathematical Reasoning Patterns
    MATH_PATTERNS = [
        re.compile(r"\b(calculate|compute|solve|equation|integral|derivative|matrix|algebra|probability|statistics|sin|cos|log|\d+\s*[\+\-\*\/\^]\s*\d+)\b", re.I),
        re.compile(r"\b(what is \d+ (plus|minus|times|divided by|percent of))\b", re.I),
    ]

    # 8. Comparison Patterns
    COMPARISON_PATTERNS = [
        re.compile(r"\b(compare|versus|vs\.?|difference between|better than|pros and cons|which is better|tradeoffs?)\b", re.I),
    ]

    # 9. Planning & Architecture Patterns
    PLANNING_PATTERNS = [
        re.compile(r"\b(plan|architecture|roadmap|strategy|design (system|architecture)|step by step guide|how should we structure)\b", re.I),
        re.compile(r"\b(milestones|project setup|workflow design)\b", re.I),
    ]

    # 10. Research Patterns
    RESEARCH_PATTERNS = [
        re.compile(r"\b(research|search web|google|lookup|find out|latest news|current price|weather|forecast|who is|when was)\b", re.I),
        re.compile(r"\b(information on|tell me about current|weather in)\b", re.I),
    ]

    # 11. Learning & Explanation Patterns
    LEARNING_PATTERNS = [
        re.compile(r"\b(explain|teach me|how does .* work|what (is|are)( the concept of| a| an)?|define|definition of|walk me through|understand)\b", re.I),
    ]

    # 12. Follow-Up Indicators
    FOLLOW_UP_PATTERNS = [
        re.compile(r"^(why|how|and|so|then|what about|how about|but|also|why not|can you elaborate|explain more)\b", re.I),
        re.compile(r"\b(it|that|this|those|these|the same|the previous|what you just said)\b", re.I),
    ]

    def classify(
        self,
        message: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None
    ) -> IntentClassificationResult:
        text = (message or "").strip()
        history = conversation_history or []

        if not text:
            return IntentClassificationResult(
                category=IntentCategory.GENERAL_CONVERSATION,
                confidence=0.5,
                detected_patterns=["empty_input"],
                is_contextual_follow_up=False,
            )

        # Contextual follow-up detection
        is_follow_up = False
        underlying: Optional[IntentCategory] = None
        words = text.split()
        if len(words) <= 7 and any(p.search(text) for p in self.FOLLOW_UP_PATTERNS):
            is_follow_up = True
            if history:
                # Infer underlying intent from previous turn
                last_user_msg = next((m.get("text", "") for m in reversed(history) if m.get("role") == "user"), "")
                if last_user_msg:
                    prev_result = self.classify(last_user_msg, [])
                    underlying = prev_result.category

        # 1. Screen Understanding
        for pat in self.SCREEN_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.SCREEN_UNDERSTANDING,
                    confidence=0.95,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up,
                    suggested_tools=["capture_screen", "analyze_screen_region"]
                )

        # 2. Desktop Automation
        for pat in self.DESKTOP_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.DESKTOP_AUTOMATION,
                    confidence=0.92,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up,
                    suggested_tools=["launch_allowed_app", "control_system_volume", "windows_brightness"]
                )

        # 3. File Operations
        for pat in self.FILE_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.FILE_OPERATIONS,
                    confidence=0.88,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up,
                    suggested_tools=["find_files", "save_note", "batch_renamer"]
                )

        # 4. Memory Management
        for pat in self.MEMORY_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.MEMORY_MANAGEMENT,
                    confidence=0.90,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up,
                    suggested_tools=["save_memory", "search_memory"]
                )

        # 5. Debugging
        for pat in self.DEBUGGING_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.DEBUGGING,
                    confidence=0.89,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up,
                    underlying_intent=underlying
                )

        # 6. Planning & Architecture
        for pat in self.PLANNING_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.PLANNING,
                    confidence=0.86,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up
                )

        # 7. Comparison
        for pat in self.COMPARISON_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.COMPARISON,
                    confidence=0.85,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up
                )

        # 8. Mathematical Reasoning
        for pat in self.MATH_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.MATHEMATICAL_REASONING,
                    confidence=0.88,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up
                )

        # 9. Learning & Explanation (Takes precedence over raw keyword matches like "api" or "code")
        for pat in self.LEARNING_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.LEARNING_EXPLANATION,
                    confidence=0.88,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up
                )

        # 10. Programming
        for pat in self.PROGRAMMING_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.PROGRAMMING,
                    confidence=0.84,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up
                )

        # 11. Research
        for pat in self.RESEARCH_PATTERNS:
            if pat.search(text):
                return IntentClassificationResult(
                    category=IntentCategory.RESEARCH,
                    confidence=0.82,
                    detected_patterns=[pat.pattern],
                    is_contextual_follow_up=is_follow_up,
                    suggested_tools=["web_search", "get_live_weather"]
                )

        # 12. Standalone follow-up with prior context
        if is_follow_up and underlying:
            return IntentClassificationResult(
                category=IntentCategory.FOLLOW_UP,
                confidence=0.80,
                detected_patterns=["contextual_follow_up"],
                is_contextual_follow_up=True,
                underlying_intent=underlying
            )

        # Default: General Conversation
        return IntentClassificationResult(
            category=IntentCategory.GENERAL_CONVERSATION,
            confidence=0.70,
            detected_patterns=["default_conversational"],
            is_contextual_follow_up=is_follow_up
        )
