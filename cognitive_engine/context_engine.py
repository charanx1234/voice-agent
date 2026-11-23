"""
FRIDAY Cognitive Engine — Smart Context Engine
Assembles multi-layered context (Immediate, Retrieved, Extended) with token
budget enforcement, relevance ranking, and lightweight conversation summarization.
"""

from __future__ import annotations
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from .memory_retriever import MemoryRetriever, MemoryItem, RankedMemory


class ContextLayer:
    IMMEDIATE = "immediate"
    RETRIEVED = "retrieved"
    EXTENDED = "extended"


@dataclass
class ContextBundle:
    system_instruction: str
    immediate_messages: List[Dict[str, str]]
    retrieved_memory_block: str
    extended_context_block: str
    situation_brief: str
    estimated_token_count: int
    truncated: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_provider_contents(self) -> List[Dict[str, Any]]:
        """Converts bundle into a standard multi-turn provider contents structure."""
        turns: List[Dict[str, Any]] = []
        for msg in self.immediate_messages:
            role = "user" if msg.get("role") == "user" else "model"
            turns.append({
                "role": role,
                "parts": [{"text": msg.get("text", "")}]
            })
        return turns


class ContextEngine:
    """
    Constructs coherent, bounded context windows without blowing token limits
    or omitting critical conversation dependencies.
    """

    CHAR_PER_TOKEN = 4  # Rule-of-thumb approximation

    def __init__(
        self,
        memory_retriever: Optional[MemoryRetriever] = None,
        max_context_budget_tokens: int = 4096,
        max_immediate_turns: int = 10,
    ):
        self.memory_retriever = memory_retriever or MemoryRetriever()
        self.max_context_budget_tokens = max_context_budget_tokens
        self.max_immediate_turns = max_immediate_turns

    def estimate_tokens(self, text: str) -> int:
        return max(1, len(text or "") // self.CHAR_PER_TOKEN)

    def extract_situation_brief(
        self,
        current_message: str,
        conversation_history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Lightweight situation briefing without extra LLM requests.
        Identifies active topic, follow-up state, and user-specified constraints.
        """
        text = (current_message or "").strip()
        history = [m for m in (conversation_history or []) if m.get("role") != "system"]

        # Topic detection
        clean_text = re.sub(r"^(hey|hello|hi|please|friday|can you|tell me|explain)\b[\s,]*", "", text, flags=re.I)
        topic = clean_text.split(".")[0][:80].strip() or "general discussion"

        # Follow-up check
        is_follow_up = False
        if history and (
            re.match(r"^(why|how|and|so|then|what about|but|also)\b", text, re.I) or
            len(text.split()) <= 6 and re.search(r"\b(it|that|this|those|these)\b", text, re.I)
        ):
            is_follow_up = True

        # Stated constraints extraction from recent user turns
        constraints: List[str] = []
        constraint_regex = re.compile(
            r"\b(?:i (?:prefer|want|need|use|don't use)|must|should not|never|always|only use)\b.*",
            re.I
        )
        for msg in reversed(history[-6:]):
            if msg.get("role") == "user":
                t = msg.get("text", "")
                m = constraint_regex.search(t)
                if m:
                    constraints.append(m.group(0).strip())

        brief_str = f"SITUATION BRIEF:\n- Current Topic: {topic}\n- Follow-Up Turn: {is_follow_up}"
        if constraints:
            brief_str += f"\n- Active User Constraints: {'; '.join(constraints[:3])}"

        return {
            "topic": topic,
            "is_follow_up": is_follow_up,
            "constraints": constraints[:3],
            "brief_text": brief_str
        }

    def assemble(
        self,
        current_message: str,
        base_system_instruction: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        candidate_memories: Optional[List[MemoryItem]] = None,
        extended_docs: Optional[List[Dict[str, str]]] = None,
        intent_hint: Optional[str] = None,
        reasoning_level: str = "L1",
        budget_tokens_override: Optional[int] = None
    ) -> ContextBundle:
        budget = budget_tokens_override or self.max_context_budget_tokens
        history = conversation_history or []
        truncated = False

        # 1. Situation Brief
        brief_data = self.extract_situation_brief(current_message, history)
        brief_text = brief_data["brief_text"]

        # 2. Retrieved Context (Layer 2)
        memory_block = ""
        ranked_memories: List[RankedMemory] = []
        if candidate_memories and reasoning_level != "L0":
            ranked_memories = self.memory_retriever.rank_memories(
                query=current_message,
                candidates=candidate_memories,
                intent_hint=intent_hint
            )
            memory_block = self.memory_retriever.format_context_block(ranked_memories)

        # 3. Extended Context (Layer 3 - only for L2 and L3)
        extended_block = ""
        if extended_docs and reasoning_level in ("L2", "L3"):
            ext_parts = []
            for doc in extended_docs[:3]:
                title = doc.get("title", "Resource")
                body = doc.get("content", "")[:1000]
                ext_parts.append(f"[{title}]:\n{body}")
            if ext_parts:
                extended_block = "EXTENDED CONTEXT:\n" + "\n\n".join(ext_parts)

        # 4. Immediate Context (Layer 1)
        recent_turns: List[Dict[str, str]] = []
        for msg in history[-self.max_immediate_turns:]:
            role = msg.get("role", "user")
            txt = msg.get("text", "")
            if txt:
                recent_turns.append({"role": role, "text": txt})

        # Append current user message
        recent_turns.append({"role": "user", "text": current_message})

        # 5. Full System Instruction Assembly
        instruction_components = [base_system_instruction.strip()]
        if brief_text:
            instruction_components.append(brief_text)
        if memory_block:
            instruction_components.append(memory_block)
        if extended_block:
            instruction_components.append(extended_block)

        combined_instruction = "\n\n".join(instruction_components)

        # 6. Budget Enforcement
        total_tokens = self.estimate_tokens(combined_instruction)
        for turn in recent_turns:
            total_tokens += self.estimate_tokens(turn.get("text", ""))

        if total_tokens > budget:
            truncated = True
            # First, drop oldest dialogue turns before current message
            while total_tokens > budget and len(recent_turns) > 2:
                dropped = recent_turns.pop(0)
                total_tokens -= self.estimate_tokens(dropped.get("text", ""))

            # If still over budget, truncate extended context
            if total_tokens > budget and extended_block:
                instruction_components = [base_system_instruction.strip(), brief_text]
                if memory_block:
                    instruction_components.append(memory_block)
                combined_instruction = "\n\n".join(instruction_components)
                total_tokens = self.estimate_tokens(combined_instruction)
                for turn in recent_turns:
                    total_tokens += self.estimate_tokens(turn.get("text", ""))

        return ContextBundle(
            system_instruction=combined_instruction,
            immediate_messages=recent_turns,
            retrieved_memory_block=memory_block,
            extended_context_block=extended_block,
            situation_brief=brief_text,
            estimated_token_count=total_tokens,
            truncated=truncated,
            metadata={
                "topic": brief_data["topic"],
                "ranked_memory_count": len(ranked_memories),
                "reasoning_level": reasoning_level,
            }
        )
