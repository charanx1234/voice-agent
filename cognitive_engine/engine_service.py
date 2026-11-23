"""
FRIDAY Cognitive Engine — Service Daemon / JSON-RPC Protocol Server
Enables bi-directional stdio communication between Electron / Node.js and the Python engine.
"""

from __future__ import annotations
import sys
import json
import traceback
from typing import Dict, Any

if __package__ is None or not __package__:
    import os
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from cognitive_engine.cognitive_controller import CognitiveController, CognitiveRequest
    from cognitive_engine.intent_router import IntentRouter
    from cognitive_engine.complexity_router import ComplexityRouter
    from cognitive_engine.memory_retriever import MemoryRetriever, MemoryItem
    from cognitive_engine.context_engine import ContextEngine
    from cognitive_engine.model_orchestrator import ModelOrchestrator
    from cognitive_engine.latency_monitor import LatencyMonitor
    from cognitive_engine.hardware import (
        HardwareIntelligenceEngine,
        HardwareDetector,
        WorkloadAssessor,
        ReferenceModelFactory,
        DevicePreference,
    )
else:
    from .cognitive_controller import CognitiveController, CognitiveRequest
    from .intent_router import IntentRouter
    from .complexity_router import ComplexityRouter
    from .memory_retriever import MemoryRetriever, MemoryItem
    from .context_engine import ContextEngine
    from .model_orchestrator import ModelOrchestrator
    from .latency_monitor import LatencyMonitor
    from .hardware import (
        HardwareIntelligenceEngine,
        HardwareDetector,
        WorkloadAssessor,
        ReferenceModelFactory,
        DevicePreference,
    )


class EngineService:
    def __init__(self):
        self.controller = CognitiveController()

    def handle_line(self, line: str) -> None:
        line = line.strip()
        if not line:
            return

        try:
            req = json.loads(line)
        except Exception as e:
            self._send_error(None, f"Invalid JSON payload: {e}")
            return

        req_id = req.get("id")
        action = req.get("action", "")

        try:
            if action == "ping":
                self._send_response(req_id, {"status": "ok", "message": "pong"})

            elif action == "classify_intent":
                msg = req.get("message", "")
                history = req.get("history", [])
                res = self.controller.intent_router.classify(msg, history)
                self._send_response(req_id, {
                    "category": res.category.value,
                    "confidence": res.confidence,
                    "isFollowUp": res.is_contextual_follow_up,
                    "suggestedTools": res.suggested_tools,
                })

            elif action == "evaluate_complexity":
                msg = req.get("message", "")
                history = req.get("history", [])
                intent_res = self.controller.intent_router.classify(msg, history)
                res = self.controller.complexity_router.evaluate(msg, intent_res, history)
                self._send_response(req_id, {
                    "level": res.level.value,
                    "score": res.score,
                    "reason": res.reason,
                    "requiresTools": res.requires_tools,
                    "requiresDeepContext": res.requires_deep_context,
                })

            elif action == "rank_memories":
                query = req.get("query", "")
                raw_candidates = req.get("candidates", [])
                candidates = [
                    MemoryItem(
                        id=c.get("id", ""),
                        kind=c.get("kind", "fact"),
                        title=c.get("title", ""),
                        content=c.get("content", ""),
                        importance=c.get("importance", 3),
                        created_at=c.get("createdAt", 0.0),
                    )
                    for c in raw_candidates
                ]
                ranked = self.controller.memory_retriever.rank_memories(query, candidates)
                self._send_response(req_id, {
                    "ranked": [
                        {
                            "id": r.item.id,
                            "title": r.item.title,
                            "content": r.item.content,
                            "relevanceScore": r.relevance_score,
                            "matchedTerms": r.matched_terms,
                        }
                        for r in ranked
                    ]
                })

            elif action == "process_request":
                cog_req = CognitiveRequest(
                    request_id=req.get("requestId", f"req_{int(req_id or 0)}"),
                    message=req.get("message", ""),
                    session_id=req.get("sessionId", "session_1"),
                    input_source=req.get("inputSource", "text"),
                    conversation_history=req.get("conversationHistory", []),
                    active_provider=req.get("activeProvider", "gemini"),
                    active_model_name=req.get("activeModelName"),
                    personality_mode=req.get("personalityMode", "moderate"),
                    language=req.get("language", "en-IN"),
                )

                def on_chunk(chunk):
                    # Stream chunks immediately back over stdout
                    chunk_payload = {
                        "event": "stream_chunk",
                        "data": chunk.to_dict()
                    }
                    sys.stdout.write(json.dumps(chunk_payload) + "\n")
                    sys.stdout.flush()

                res = self.controller.process_request(cog_req, on_chunk=on_chunk)
                self._send_response(req_id, res.to_dict())

            elif action == "hardware_detect":
                detector = HardwareDetector()
                inv = detector.get_inventory(refresh=req.get("refresh", False))
                self._send_response(req_id, inv.to_dict())

            elif action == "hardware_status":
                hw_engine = HardwareIntelligenceEngine.get_instance()
                self._send_response(req_id, hw_engine.get_hardware_status())

            elif action == "hardware_set_preference":
                pref = req.get("preference", "auto")
                hw_engine = HardwareIntelligenceEngine.get_instance()
                hw_engine.set_preference(pref)
                self._send_response(req_id, {"status": "ok", "preference": hw_engine.preference.value})

            elif action == "hardware_diagnostics_report":
                hw_engine = HardwareIntelligenceEngine.get_instance()
                report = hw_engine.generate_diagnostic_report()
                self._send_response(req_id, report.to_dict())

            elif action == "hardware_assess_workload":
                w_id = req.get("workloadId")
                if w_id:
                    assessment = WorkloadAssessor.get_assessment(w_id)
                    self._send_response(req_id, assessment.to_dict() if assessment else None)
                else:
                    self._send_response(req_id, WorkloadAssessor.to_report())

            elif action == "hardware_infer":
                hw_engine = HardwareIntelligenceEngine.get_instance()
                model_id = req.get("modelId", "tiny_test")
                inputs = req.get("inputs", [[1.0, 2.0, 3.0, 4.0]])
                override_pref = req.get("preference")

                # Build model on the fly or load reference
                if model_id == "tiny_test":
                    model = ReferenceModelFactory.create_tiny_test_model("TinyTest")
                elif model_id == "language_classifier":
                    model = ReferenceModelFactory.create_language_classifier("LangClassifier")
                elif model_id == "acoustic_vad":
                    model = ReferenceModelFactory.create_acoustic_vad_model("AcousticVAD")
                elif model_id == "dynamic_test":
                    model = ReferenceModelFactory.create_dynamic_test_model("DynTest")
                elif os.path.exists(str(model_id)):
                    model = model_id
                else:
                    model = ReferenceModelFactory.create_tiny_test_model(model_id)

                import numpy as np
                np_inputs = np.array(inputs, dtype=np.float32)

                res = hw_engine.execute_workload(
                    model_or_path=model,
                    model_id=model_id,
                    inputs=np_inputs,
                    override_preference=DevicePreference(override_pref) if override_pref else None,
                )
                self._send_response(req_id, res.to_dict())

            else:
                self._send_error(req_id, f"Unknown action: {action}")

        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            self._send_error(req_id, f"Execution failed: {str(e)}")

    def _send_response(self, req_id: Any, result: Any) -> None:
        payload = {"id": req_id, "result": result}
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()

    def _send_error(self, req_id: Any, error: str) -> None:
        payload = {"id": req_id, "error": error}
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()

    def run(self) -> None:
        for line in sys.stdin:
            self.handle_line(line)


if __name__ == "__main__":
    service = EngineService()
    service.run()
