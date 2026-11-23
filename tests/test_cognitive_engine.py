"""
Unit tests for FRIDAY Cognitive Engine V1 (Python)
Verifies adaptive routing, multi-layer context, model orchestration,
tool execution validation, and response quality.
"""

import unittest
import time
from cognitive_engine.intent_router import IntentRouter, IntentCategory
from cognitive_engine.complexity_router import ComplexityRouter, ReasoningLevel
from cognitive_engine.memory_retriever import MemoryRetriever, MemoryItem
from cognitive_engine.context_engine import ContextEngine
from cognitive_engine.model_orchestrator import ModelOrchestrator
from cognitive_engine.tool_orchestrator import ToolOrchestrator, ToolExecutionResult
from cognitive_engine.response_streamer import ResponseStreamer, StreamEventType
from cognitive_engine.response_quality import ResponseQualityController
from cognitive_engine.latency_monitor import LatencyMonitor, redact_secrets
from cognitive_engine.cognitive_controller import CognitiveController, CognitiveRequest


class TestCognitiveEngine(unittest.TestCase):

    def setUp(self):
        self.intent_router = IntentRouter()
        self.complexity_router = ComplexityRouter()
        self.memory_retriever = MemoryRetriever()
        self.context_engine = ContextEngine(memory_retriever=self.memory_retriever)
        self.model_orchestrator = ModelOrchestrator()
        self.tool_orchestrator = ToolOrchestrator()
        self.response_streamer = ResponseStreamer()
        self.quality_controller = ResponseQualityController()
        self.latency_monitor = LatencyMonitor()
        self.controller = CognitiveController(
            intent_router=self.intent_router,
            complexity_router=self.complexity_router,
            model_orchestrator=self.model_orchestrator,
            context_engine=self.context_engine,
            memory_retriever=self.memory_retriever,
            tool_orchestrator=self.tool_orchestrator,
            response_streamer=self.response_streamer,
            quality_controller=self.quality_controller,
            latency_monitor=self.latency_monitor
        )

    # 1. Intent Router Tests
    def test_intent_classification(self):
        # Greetings
        res = self.intent_router.classify("Hello Friday")
        self.assertEqual(res.category, IntentCategory.GENERAL_CONVERSATION)

        # Desktop automation
        res = self.intent_router.classify("open Spotify and play music")
        self.assertEqual(res.category, IntentCategory.DESKTOP_AUTOMATION)

        # Screen understanding
        res = self.intent_router.classify("Analyze my screen and see this error")
        self.assertEqual(res.category, IntentCategory.SCREEN_UNDERSTANDING)

        # Debugging
        res = self.intent_router.classify("Fix this nullpointer exception in my React app")
        self.assertEqual(res.category, IntentCategory.DEBUGGING)

        # Planning
        res = self.intent_router.classify("Create an architecture roadmap for microservices migration")
        self.assertEqual(res.category, IntentCategory.PLANNING)

        # Math
        res = self.intent_router.classify("Calculate the derivative of x^2 + 5x")
        self.assertEqual(res.category, IntentCategory.MATHEMATICAL_REASONING)

        # Contextual follow-up
        history = [{"role": "user", "text": "I'm having a bug in my python code: index out of range."}]
        res = self.intent_router.classify("Why is it happening?", history)
        self.assertTrue(res.is_contextual_follow_up)
        self.assertEqual(res.underlying_intent, IntentCategory.DEBUGGING)

    # 2. Complexity Router Tests
    def test_complexity_levels(self):
        # L0: Simple greeting
        intent_res = self.intent_router.classify("Good morning!")
        comp = self.complexity_router.evaluate("Good morning!", intent_res)
        self.assertEqual(comp.level, ReasoningLevel.L0_INSTANT)

        # L1: Standard definition
        intent_res = self.intent_router.classify("What is a REST API?")
        comp = self.complexity_router.evaluate("What is a REST API?", intent_res)
        self.assertEqual(comp.level, ReasoningLevel.L1_STANDARD)

        # L2: Debugging / Comparison
        intent_res = self.intent_router.classify("Compare React vs Vue for state management tradeoffs")
        comp = self.complexity_router.evaluate("Compare React vs Vue for state management tradeoffs", intent_res)
        self.assertIn(comp.level, (ReasoningLevel.L2_ADVANCED, ReasoningLevel.L3_DEEP_REASONING))

        # L3: Short but deep architecture problem
        short_deep = "Resolve this distributed consensus split-brain race condition in Raft"
        intent_res = self.intent_router.classify(short_deep)
        comp = self.complexity_router.evaluate(short_deep, intent_res)
        self.assertEqual(comp.level, ReasoningLevel.L3_DEEP_REASONING)

        # L0/L1: Long but simple message
        long_simple = "Good morning Friday, hope your day is going well, could you please tell me what today's date is?"
        intent_res = self.intent_router.classify(long_simple)
        comp = self.complexity_router.evaluate(long_simple, intent_res)
        self.assertIn(comp.level, (ReasoningLevel.L0_INSTANT, ReasoningLevel.L1_STANDARD))

    # 3. Memory Retrieval Tests
    def test_memory_retrieval_and_ranking(self):
        now = time.time()
        candidates = [
            MemoryItem(id="1", kind="preference", title="Diet", content="Prefers vegetarian food", importance=4, created_at=now),
            MemoryItem(id="2", kind="project", title="Friday", content="Working on Friday cognitive engine in Python", importance=5, created_at=now),
            MemoryItem(id="3", kind="fact", title="Pet", content="Has a golden retriever named Max", importance=2, created_at=now - 100000),
        ]
        ranked = self.memory_retriever.rank_memories("Tell me about the Friday engine project", candidates)
        self.assertGreater(len(ranked), 0)
        self.assertEqual(ranked[0].item.id, "2")
        self.assertGreater(ranked[0].relevance_score, 0.4)

    # 4. Context Engine Assembly & Budget
    def test_context_engine_budget(self):
        bundle = self.context_engine.assemble(
            current_message="How do I optimize SQL indexes?",
            base_system_instruction="Base system instructions.",
            conversation_history=[
                {"role": "user", "text": "I am working on a PostgreSQL database."},
                {"role": "assistant", "text": "Great! What kind of queries are slow?"}
            ],
            budget_tokens_override=500
        )
        self.assertFalse(bundle.truncated)
        self.assertIn("PostgreSQL", bundle.immediate_messages[0]["text"])

    # 5. Model Orchestration Tests
    def test_model_orchestration(self):
        # L0 selection for Gemini
        res_l0 = self.model_orchestrator.select_model(ReasoningLevel.L0_INSTANT, active_provider="gemini")
        self.assertEqual(res_l0.model_id, "gemini-3.5-flash-lite")

        # L3 selection for Gemini
        res_l3 = self.model_orchestrator.select_model(ReasoningLevel.L3_DEEP_REASONING, active_provider="gemini")
        self.assertEqual(res_l3.model_id, "gemini-3.1-pro-preview")

        # L2 selection for Anthropic
        res_anthropic = self.model_orchestrator.select_model(ReasoningLevel.L2_ADVANCED, active_provider="anthropic")
        self.assertEqual(res_anthropic.model_id, "claude-3-5-sonnet-20241022")

    # 6. Tool Orchestrator Tests
    def test_tool_orchestration(self):
        intent_res = self.intent_router.classify("launch Spotify")
        plan = self.tool_orchestrator.plan_tool_execution(intent_res, "launch Spotify")
        self.assertIsNotNone(plan)
        self.assertEqual(plan.tool_name, "launch_allowed_app")

        # Outcome validation
        valid_res = ToolExecutionResult(tool_name="launch_allowed_app", arguments={}, success=True, result={"success": True})
        self.assertTrue(self.tool_orchestrator.validate_tool_outcome(valid_res))

        failed_res = ToolExecutionResult(tool_name="launch_allowed_app", arguments={}, success=False, result=None, error="Not found")
        self.assertFalse(self.tool_orchestrator.validate_tool_outcome(failed_res))

    # 7. Response Streamer & Cancellation
    def test_response_streamer(self):
        chunks = []
        req_id = "test_req_1"
        self.response_streamer.open_stream(req_id, on_chunk=lambda c: chunks.append(c))

        self.response_streamer.emit_delta(req_id, "Hello ")
        self.response_streamer.emit_delta(req_id, "World")
        full = self.response_streamer.emit_complete(req_id)

        self.assertEqual(full, "Hello World")
        self.assertEqual(len(chunks), 3)  # 2 deltas + 1 complete

    # 8. Quality Controller Tests
    def test_quality_controller(self):
        # Code fence repair
        broken_markdown = "Here is the code:\n```python\nprint('hello')"
        res = self.quality_controller.validate_and_sanitize(broken_markdown, "show me code")
        self.assertTrue(res.sanitized_text.endswith("```"))

        # Preamble stripping in roast/moderate
        verbose = "Sure, I can help with that. The capital of France is Paris."
        res = self.quality_controller.validate_and_sanitize(verbose, "capital of france", personality_mode="moderate")
        self.assertEqual(res.sanitized_text, "The capital of France is Paris.")

    # 9. Latency Monitor & Secret Redaction
    def test_latency_monitor_and_redaction(self):
        sensitive = "Connecting to Gemini with key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5"
        redacted = redact_secrets(sensitive)
        self.assertNotIn("AIzaSy", redacted)
        self.assertIn("[REDACTED_KEY]", redacted)

        metrics = self.latency_monitor.start_request("req_timing")
        self.latency_monitor.start_phase("req_timing", "context_retrieval")
        time.sleep(0.01)
        self.latency_monitor.end_phase("req_timing", "context_retrieval")
        finished = self.latency_monitor.finish_request("req_timing")
        self.assertGreater(finished.context_retrieval_ms, 5.0)

    # 10. End-to-End Cognitive Controller Flow
    def test_cognitive_controller_e2e(self):
        req = CognitiveRequest(
            request_id="req_e2e_1",
            message="Explain Dijkstra's shortest path algorithm",
            active_provider="gemini",
            personality_mode="moderate"
        )
        resp = self.controller.process_request(req)
        self.assertEqual(resp.request_id, "req_e2e_1")
        self.assertIn(resp.reasoning_level, (ReasoningLevel.L1_STANDARD, ReasoningLevel.L2_ADVANCED))
        self.assertIsNotNone(resp.text)
        self.assertGreater(resp.timing.total_duration_ms, 0)


if __name__ == "__main__":
    unittest.main()
