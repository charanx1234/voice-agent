"""
FRIDAY Cognitive Engine — Unified Cognitive Controller
Central intelligence coordinator binding all cognitive modules:
Input Normalization -> Context Engine -> Intent Router -> Complexity Router ->
Model Orchestrator -> Tool Orchestrator -> Quality Control -> Latency Monitor.
"""

from __future__ import annotations
import time
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass, field

from .intent_router import IntentRouter, IntentCategory, IntentClassificationResult
from .complexity_router import ComplexityRouter, ReasoningLevel, ComplexityEvaluationResult
from .model_orchestrator import ModelOrchestrator, ModelSelectionResult
from .context_engine import ContextEngine, ContextBundle
from .memory_retriever import MemoryRetriever, MemoryItem
from .tool_orchestrator import ToolOrchestrator, ToolExecutionPlan, ToolExecutionResult
from .response_streamer import ResponseStreamer, StreamChunk, StreamEventType
from .response_quality import ResponseQualityController, QualityCheckResult
from .latency_monitor import LatencyMonitor, RequestTimingMetrics


@dataclass
class CognitiveRequest:
    request_id: str
    message: str
    session_id: str = "default_session"
    input_source: str = "text"  # 'text', 'voice', 'pet', 'quicktools'
    conversation_history: List[Dict[str, Any]] = field(default_factory=list)
    candidate_memories: List[MemoryItem] = field(default_factory=list)
    extended_documents: List[Dict[str, str]] = field(default_factory=list)
    active_provider: str = "gemini"
    active_model_name: Optional[str] = None
    personality_mode: str = "moderate"
    language: str = "en-IN"
    require_confirmations: Dict[str, bool] = field(default_factory=dict)
    audio_base64: Optional[str] = None


@dataclass
class CognitiveResponse:
    request_id: str
    text: str
    reasoning_level: ReasoningLevel
    intent_category: IntentCategory
    provider_used: str
    model_used: str
    tool_results: List[ToolExecutionResult]
    timing: RequestTimingMetrics
    error: Optional[str] = None
    cancelled: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "requestId": self.request_id,
            "text": self.text,
            "reasoningLevel": self.reasoning_level.value,
            "intentCategory": self.intent_category.value,
            "providerUsed": self.provider_used,
            "modelUsed": self.model_used,
            "toolResults": [
                {
                    "toolName": t.tool_name,
                    "arguments": t.arguments,
                    "success": t.success,
                    "result": t.result,
                    "error": t.error,
                    "executionTimeMs": t.execution_time_ms,
                }
                for t in self.tool_results
            ],
            "timing": self.timing.to_dict(),
            "error": self.error,
            "cancelled": self.cancelled,
        }


class CognitiveController:
    """
    Unified entry point for AI processing across FRIDAY.
    Used by typed chat, voice input, desktop pet, and application events.
    """

    def __init__(
        self,
        intent_router: Optional[IntentRouter] = None,
        complexity_router: Optional[ComplexityRouter] = None,
        model_orchestrator: Optional[ModelOrchestrator] = None,
        context_engine: Optional[ContextEngine] = None,
        memory_retriever: Optional[MemoryRetriever] = None,
        tool_orchestrator: Optional[ToolOrchestrator] = None,
        response_streamer: Optional[ResponseStreamer] = None,
        quality_controller: Optional[ResponseQualityController] = None,
        latency_monitor: Optional[LatencyMonitor] = None,
    ):
        self.latency_monitor = latency_monitor or LatencyMonitor()
        self.intent_router = intent_router or IntentRouter()
        self.complexity_router = complexity_router or ComplexityRouter()
        self.model_orchestrator = model_orchestrator or ModelOrchestrator()
        self.memory_retriever = memory_retriever or MemoryRetriever()
        self.context_engine = context_engine or ContextEngine(memory_retriever=self.memory_retriever)
        self.tool_orchestrator = tool_orchestrator or ToolOrchestrator()
        self.response_streamer = response_streamer or ResponseStreamer()
        self.quality_controller = quality_controller or ResponseQualityController()

    def process_request(
        self,
        request: CognitiveRequest,
        model_invoker: Optional[Callable[[Dict[str, Any]], str]] = None,
        tool_invoker: Optional[Callable[[ToolExecutionPlan], ToolExecutionResult]] = None,
        on_chunk: Optional[Callable[[StreamChunk], None]] = None,
    ) -> CognitiveResponse:
        """
        Executes the full cognitive pipeline for a user request.
        """
        req_id = request.request_id
        timing = self.latency_monitor.start_request(
            request_id=req_id,
            session_id=request.session_id,
            input_source=request.input_source
        )
        self.response_streamer.open_stream(req_id, on_chunk)

        # 1. Intent Classification
        self.latency_monitor.start_phase(req_id, "intent_routing")
        intent_res = self.intent_router.classify(request.message, request.conversation_history)
        self.latency_monitor.end_phase(req_id, "intent_routing")

        # 2. Complexity Routing
        self.latency_monitor.start_phase(req_id, "complexity_routing")
        complexity_res = self.complexity_router.evaluate(
            request.message,
            intent_res,
            request.conversation_history
        )
        self.latency_monitor.end_phase(req_id, "complexity_routing")

        # 3. Context Construction
        self.latency_monitor.start_phase(req_id, "context_retrieval")
        context_bundle = self.context_engine.assemble(
            current_message=request.message,
            base_system_instruction="You are FRIDAY, an intelligent and helpful desktop assistant.",
            conversation_history=request.conversation_history,
            candidate_memories=request.candidate_memories,
            extended_docs=request.extended_documents,
            intent_hint=intent_res.category.value,
            reasoning_level=complexity_res.level.value
        )
        self.latency_monitor.end_phase(req_id, "context_retrieval")

        # 4. Model Selection
        model_selection = self.model_orchestrator.select_model(
            reasoning_level=complexity_res.level,
            active_provider=request.active_provider,
            active_model_name=request.active_model_name,
            require_tools=complexity_res.requires_tools,
            require_audio=bool(request.audio_base64)
        )

        tool_results: List[ToolExecutionResult] = []

        # 5. Check if Direct Tool Execution is planned
        tool_plan = self.tool_orchestrator.plan_tool_execution(
            intent_result=intent_res,
            user_message=request.message,
            require_confirmations_config=request.require_confirmations
        )

        # 6. FAST PATH: Level 0 (Instant) without external LLM call if direct answer is available
        if complexity_res.level == ReasoningLevel.L0_INSTANT and not request.audio_base64:
            if tool_plan and tool_invoker:
                self.latency_monitor.start_phase(req_id, "tool_execution")
                t_res = tool_invoker(tool_plan)
                tool_results.append(t_res)
                self.latency_monitor.end_phase(req_id, "tool_execution")

                fast_reply = f"{tool_plan.tool_name} executed successfully."
                if isinstance(t_res.result, dict) and t_res.result.get("message"):
                    fast_reply = t_res.result["message"]

                self.response_streamer.emit_delta(req_id, fast_reply)
                self.response_streamer.emit_complete(req_id)
                self.latency_monitor.finish_request(
                    request_id=req_id,
                    reasoning_level="L0",
                    intent_category=intent_res.category.value,
                    provider_used="local_fast",
                    model_used="direct_execution"
                )
                return CognitiveResponse(
                    request_id=req_id,
                    text=fast_reply,
                    reasoning_level=ReasoningLevel.L0_INSTANT,
                    intent_category=intent_res.category,
                    provider_used="local_fast",
                    model_used="direct_execution",
                    tool_results=tool_results,
                    timing=timing
                )

        # 7. Model Execution
        generated_text = ""
        error_msg: Optional[str] = None
        self.latency_monitor.start_phase(req_id, "model_execution")

        if model_invoker:
            try:
                invoke_payload = {
                    "requestId": req_id,
                    "provider": model_selection.provider,
                    "model": model_selection.model_id,
                    "reasoningLevel": complexity_res.level.value,
                    "contextBundle": {
                        "systemInstruction": context_bundle.system_instruction,
                        "messages": context_bundle.immediate_messages,
                    },
                    "requireTools": complexity_res.requires_tools,
                }
                generated_text = model_invoker(invoke_payload)
                self.latency_monitor.record_first_token(req_id)
            except Exception as e:
                error_msg = str(e)
        else:
            # Fallback default response when running in mock / local unit test mode
            generated_text = f"Cognitive response for '{request.message}' via {model_selection.provider}:{model_selection.model_id}"

        self.latency_monitor.end_phase(req_id, "model_execution")

        # 8. Quality Control
        quality_res = self.quality_controller.validate_and_sanitize(
            response_text=generated_text,
            user_query=request.message,
            tool_results=tool_results,
            personality_mode=request.personality_mode
        )
        final_text = quality_res.sanitized_text

        # 9. Finalize Stream
        self.response_streamer.emit_delta(req_id, final_text)
        self.response_streamer.emit_complete(req_id)

        self.latency_monitor.finish_request(
            request_id=req_id,
            reasoning_level=complexity_res.level.value,
            intent_category=intent_res.category.value,
            provider_used=model_selection.provider,
            model_used=model_selection.model_id,
            error=error_msg
        )

        return CognitiveResponse(
            request_id=req_id,
            text=final_text,
            reasoning_level=complexity_res.level,
            intent_category=intent_res.category,
            provider_used=model_selection.provider,
            model_used=model_selection.model_id,
            tool_results=tool_results,
            timing=timing,
            error=error_msg
        )
