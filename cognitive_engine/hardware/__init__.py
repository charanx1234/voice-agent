"""
FRIDAY Hardware Intelligence Engine
Provides hardware detection, OpenVINO NPU integration, device routing,
workload assessment, and resilient fallback across Intel NPU, Arc GPU, and CPU.
"""

from .hardware_detector import HardwareDetector, HardwareDevice, HardwareInventory
from .openvino_backend import OpenVinoBackend, ModelMetadata, InferenceRequestHandle
from .hardware_router import (
    HardwareTaskRouter,
    HardwareIntelligenceEngine,
    ExecutionDevice,
    DevicePreference,
    InferenceResult,
    DiagnosticReport,
)
from .workload_assessor import WorkloadAssessor, WorkloadAssessment
from .reference_models import ReferenceModelFactory

__all__ = [
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
