"""
FRIDAY Cognitive Engine V1
Adaptive, relevance-based, multi-model cognitive architecture for the FRIDAY AI Desktop Companion.
"""

from .cognitive_controller import CognitiveController, CognitiveRequest, CognitiveResponse
from .intent_router import IntentRouter, IntentCategory, IntentClassificationResult
from .complexity_router import ComplexityRouter, ReasoningLevel, ComplexityEvaluationResult
from .model_orchestrator import ModelOrchestrator, ModelCapability, ModelSelectionResult
from .context_engine import ContextEngine, ContextBundle, ContextLayer
from .memory_retriever import MemoryRetriever, MemoryItem, RankedMemory
from .tool_orchestrator import ToolOrchestrator, ToolExecutionPlan, ToolExecutionResult
from .response_streamer import ResponseStreamer, StreamChunk, StreamEventType
from .response_quality import ResponseQualityController, QualityCheckResult
from .latency_monitor import LatencyMonitor, RequestTimingMetrics
from .hardware import (
    HardwareDetector,
    HardwareDevice,
    HardwareInventory,
    OpenVinoBackend,
    ModelMetadata,
    InferenceRequestHandle,
    HardwareTaskRouter,
    HardwareIntelligenceEngine,
    ExecutionDevice,
    DevicePreference,
    InferenceResult,
    DiagnosticReport,
    WorkloadAssessor,
    WorkloadAssessment,
    ReferenceModelFactory,
)

__all__ = [
    "CognitiveController",
    "CognitiveRequest",
    "CognitiveResponse",
    "IntentRouter",
    "IntentCategory",
    "IntentClassificationResult",
    "ComplexityRouter",
    "ReasoningLevel",
    "ComplexityEvaluationResult",
    "ModelOrchestrator",
    "ModelCapability",
    "ModelSelectionResult",
    "ContextEngine",
    "ContextBundle",
    "ContextLayer",
    "MemoryRetriever",
    "MemoryItem",
    "RankedMemory",
    "ToolOrchestrator",
    "ToolExecutionPlan",
    "ToolExecutionResult",
    "ResponseStreamer",
    "StreamChunk",
    "StreamEventType",
    "ResponseQualityController",
    "QualityCheckResult",
    "LatencyMonitor",
    "RequestTimingMetrics",
    "HardwareDetector",
    "HardwareDevice",
    "HardwareInventory",
    "OpenVinoBackend",
    "ModelMetadata",
    "InferenceRequestHandle",
    "HardwareTaskRouter",
    "HardwareIntelligenceEngine",
    "ExecutionDevice",
    "DevicePreference",
    "InferenceResult",
    "DiagnosticReport",
    "WorkloadAssessor",
    "WorkloadAssessment",
    "ReferenceModelFactory",
]
