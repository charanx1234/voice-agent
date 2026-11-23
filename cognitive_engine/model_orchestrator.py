"""
FRIDAY Cognitive Engine — Model Orchestrator
Selects and dispatches models from FRIDAY's existing configured AI providers
(Gemini, OpenAI, Anthropic, OpenRouter, DeepSeek, Groq, Mistral, Custom)
according to the required reasoning tier (L0-L3), task category, and fallback policy.
"""

from __future__ import annotations
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from .complexity_router import ReasoningLevel


@dataclass
class ModelCapability:
    provider: str
    model_id: str
    context_window: int
    supports_streaming: bool = True
    supports_tools: bool = True
    supports_multimodal_audio: bool = False
    supports_multimodal_vision: bool = True
    optimal_reasoning_level: ReasoningLevel = ReasoningLevel.L1_STANDARD
    is_reasoning_model: bool = False
    coding_suitability: float = 0.8  # 0.0 to 1.0


@dataclass
class ModelSelectionResult:
    provider: str
    model_id: str
    reasoning_level: ReasoningLevel
    selection_reason: str
    fallback_candidates: List[Dict[str, str]]
    capability: Optional[ModelCapability] = None


class ModelOrchestrator:
    """
    Registry of configured models and dynamic capability-aware model selector.
    Strictly preserves user configurations while picking optimal models for L0-L3.
    """

    KNOWN_MODELS: Dict[str, Dict[str, ModelCapability]] = {
        "gemini": {
            "gemini-3.5-flash-lite": ModelCapability(
                provider="gemini",
                model_id="gemini-3.5-flash-lite",
                context_window=1048576,
                supports_multimodal_audio=True,
                optimal_reasoning_level=ReasoningLevel.L1_STANDARD,
                coding_suitability=0.82
            ),
            "gemini-3.5-flash": ModelCapability(
                provider="gemini",
                model_id="gemini-3.5-flash",
                context_window=1048576,
                supports_multimodal_audio=True,
                optimal_reasoning_level=ReasoningLevel.L2_ADVANCED,
                coding_suitability=0.88
            ),
            "gemini-3.1-pro-preview": ModelCapability(
                provider="gemini",
                model_id="gemini-3.1-pro-preview",
                context_window=2097152,
                supports_multimodal_audio=True,
                optimal_reasoning_level=ReasoningLevel.L3_DEEP_REASONING,
                is_reasoning_model=True,
                coding_suitability=0.96
            ),
            "gemini-2.5-flash": ModelCapability(
                provider="gemini",
                model_id="gemini-2.5-flash",
                context_window=1048576,
                supports_multimodal_audio=True,
                optimal_reasoning_level=ReasoningLevel.L1_STANDARD,
                coding_suitability=0.80
            ),
        },
        "openai": {
            "gpt-4o-mini": ModelCapability(
                provider="openai",
                model_id="gpt-4o-mini",
                context_window=128000,
                optimal_reasoning_level=ReasoningLevel.L1_STANDARD,
                coding_suitability=0.84
            ),
            "gpt-4o": ModelCapability(
                provider="openai",
                model_id="gpt-4o",
                context_window=128000,
                optimal_reasoning_level=ReasoningLevel.L2_ADVANCED,
                coding_suitability=0.92
            ),
            "o1-mini": ModelCapability(
                provider="openai",
                model_id="o1-mini",
                context_window=128000,
                supports_streaming=False,
                supports_tools=False,
                optimal_reasoning_level=ReasoningLevel.L3_DEEP_REASONING,
                is_reasoning_model=True,
                coding_suitability=0.95
            ),
        },
        "anthropic": {
            "claude-3-5-haiku-20241022": ModelCapability(
                provider="anthropic",
                model_id="claude-3-5-haiku-20241022",
                context_window=200000,
                optimal_reasoning_level=ReasoningLevel.L1_STANDARD,
                coding_suitability=0.86
            ),
            "claude-3-5-sonnet-20241022": ModelCapability(
                provider="anthropic",
                model_id="claude-3-5-sonnet-20241022",
                context_window=200000,
                optimal_reasoning_level=ReasoningLevel.L3_DEEP_REASONING,
                is_reasoning_model=True,
                coding_suitability=0.97
            ),
        },
        "deepseek": {
            "deepseek-chat": ModelCapability(
                provider="deepseek",
                model_id="deepseek-chat",
                context_window=64000,
                optimal_reasoning_level=ReasoningLevel.L2_ADVANCED,
                coding_suitability=0.90
            ),
            "deepseek-reasoner": ModelCapability(
                provider="deepseek",
                model_id="deepseek-reasoner",
                context_window=64000,
                optimal_reasoning_level=ReasoningLevel.L3_DEEP_REASONING,
                is_reasoning_model=True,
                coding_suitability=0.96
            ),
        },
        "groq": {
            "llama-3.3-70b-versatile": ModelCapability(
                provider="groq",
                model_id="llama-3.3-70b-versatile",
                context_window=128000,
                optimal_reasoning_level=ReasoningLevel.L2_ADVANCED,
                coding_suitability=0.88
            ),
        },
    }

    def __init__(self, default_provider: str = "gemini"):
        self.default_provider = default_provider

    def select_model(
        self,
        reasoning_level: ReasoningLevel,
        active_provider: str,
        active_model_name: Optional[str] = None,
        configured_providers: Optional[Dict[str, Any]] = None,
        require_tools: bool = False,
        require_audio: bool = False,
    ) -> ModelSelectionResult:
        """
        Determines the most suitable configured model for the given reasoning level.
        Preserves user provider selection while choosing capable tiers.
        """
        provider = active_provider or self.default_provider
        provider_models = self.KNOWN_MODELS.get(provider, {})

        # Default fallback candidate list
        fallbacks: List[Dict[str, str]] = []
        for p_name, p_models in self.KNOWN_MODELS.items():
            for m_id in p_models:
                if p_name != provider or m_id != active_model_name:
                    fallbacks.append({"provider": p_name, "model": m_id})

        # Level 0 (Instant) - always choose the fastest model or local execution
        if reasoning_level == ReasoningLevel.L0_INSTANT:
            if provider == "gemini":
                chosen = "gemini-3.5-flash-lite"
            elif provider == "openai":
                chosen = "gpt-4o-mini"
            elif provider == "anthropic":
                chosen = "claude-3-5-haiku-20241022"
            else:
                chosen = active_model_name or "default"

            return ModelSelectionResult(
                provider=provider,
                model_id=chosen,
                reasoning_level=reasoning_level,
                selection_reason="Fastest available model for instant conversational turn",
                fallback_candidates=fallbacks[:3],
                capability=provider_models.get(chosen)
            )

        # Level 3 (Deep Reasoning)
        if reasoning_level == ReasoningLevel.L3_DEEP_REASONING:
            if provider == "gemini":
                chosen = "gemini-3.1-pro-preview"
            elif provider == "openai":
                chosen = "gpt-4o" if require_tools else "o1-mini"
            elif provider == "anthropic":
                chosen = "claude-3-5-sonnet-20241022"
            elif provider == "deepseek":
                chosen = "deepseek-reasoner"
            else:
                chosen = active_model_name or "default"

            return ModelSelectionResult(
                provider=provider,
                model_id=chosen,
                reasoning_level=reasoning_level,
                selection_reason="Selected highest capability model for multi-step reasoning",
                fallback_candidates=fallbacks[:4],
                capability=provider_models.get(chosen)
            )

        # Level 2 (Advanced)
        if reasoning_level == ReasoningLevel.L2_ADVANCED:
            if provider == "gemini":
                chosen = "gemini-3.5-flash"
            elif provider == "openai":
                chosen = "gpt-4o"
            elif provider == "anthropic":
                chosen = "claude-3-5-sonnet-20241022"
            elif provider == "deepseek":
                chosen = "deepseek-chat"
            else:
                chosen = active_model_name or "default"

            return ModelSelectionResult(
                provider=provider,
                model_id=chosen,
                reasoning_level=reasoning_level,
                selection_reason="Selected balanced high-performance model for technical problem solving",
                fallback_candidates=fallbacks[:3],
                capability=provider_models.get(chosen)
            )

        # Level 1 (Standard) - default
        chosen = active_model_name or (
            "gemini-3.5-flash-lite" if provider == "gemini" else "default"
        )
        return ModelSelectionResult(
            provider=provider,
            model_id=chosen,
            reasoning_level=reasoning_level,
            selection_reason="Selected standard model for regular conversational tasks",
            fallback_candidates=fallbacks[:3],
            capability=provider_models.get(chosen)
        )
