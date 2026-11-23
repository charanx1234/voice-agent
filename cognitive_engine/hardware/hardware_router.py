"""
FRIDAY Hardware Intelligence Engine — Central Hardware Task Router
Orchestrates workload dispatch across Intel AI Boost NPU, Intel Arc GPU, and CPU.
Guarantees automatic resilient fallback, verified execution device reporting,
concurrency protection, inference timing, and sanitized diagnostics.
"""

from __future__ import annotations
import os
import sys
import time
import threading
from enum import Enum
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, Optional, List, Union, Tuple

from .hardware_detector import HardwareDetector, HardwareInventory
from .openvino_backend import OpenVinoBackend, ModelMetadata
from .workload_assessor import WorkloadAssessor, WorkloadAssessment


class ExecutionDevice(str, Enum):
    NPU = "NPU"
    GPU = "GPU"
    CPU = "CPU"


class DevicePreference(str, Enum):
    AUTO = "auto"
    NPU = "npu"
    GPU = "gpu"
    CPU = "cpu"


@dataclass
class InferenceResult:
    model_id: str
    selected_device: str
    actual_device: str
    outputs: Dict[str, Any]
    inference_latency_ms: float
    compilation_time_ms: float
    total_duration_ms: float
    fallback_occurred: bool
    fallback_reason: Optional[str] = None
    memory_rss_mb: float = 0.0
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        # Convert numpy arrays to lists in output for clean JSON serialization
        clean_outputs = {}
        for k, v in self.outputs.items():
            if hasattr(v, "tolist"):
                clean_outputs[k] = v.tolist()
            else:
                clean_outputs[k] = v
        d["outputs"] = clean_outputs
        return d


@dataclass
class DiagnosticReport:
    timestamp: str
    detected_devices: Dict[str, Any]
    openvino_version: Optional[str]
    npu_driver_version: Optional[str]
    gpu_driver_version: Optional[str]
    active_preference: str
    recent_inferences: List[Dict[str, Any]]
    total_inferences: int
    npu_inference_count: int
    gpu_inference_count: int
    cpu_inference_count: int
    fallback_count: int
    system_memory_rss_mb: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class HardwareIntelligenceEngine:
    """
    Central hardware task router and execution coordinator.
    Enforces device preference, operator compatibility, and automated fallback.
    """

    _instance: Optional[HardwareIntelligenceEngine] = None
    _global_lock = threading.RLock()

    @classmethod
    def get_instance(cls) -> HardwareIntelligenceEngine:
        with cls._global_lock:
            if cls._instance is None:
                cls._instance = HardwareIntelligenceEngine()
            return cls._instance

    def __init__(self, default_preference: DevicePreference = DevicePreference.AUTO):
        self._lock = threading.RLock()
        self._detector = HardwareDetector()
        self._backend = OpenVinoBackend.get_instance()
        self._preference: DevicePreference = default_preference
        self._inference_history: List[InferenceResult] = []
        self._history_max = 50

        # Metrics counters
        self._total_inferences = 0
        self._npu_count = 0
        self._gpu_count = 0
        self._cpu_count = 0
        self._fallback_count = 0

    @property
    def preference(self) -> DevicePreference:
        return self._preference

    def set_preference(self, preference: Union[DevicePreference, str]) -> None:
        if isinstance(preference, str):
            preference = DevicePreference(preference.lower())
        with self._lock:
            self._preference = preference

    @property
    def inventory(self) -> HardwareInventory:
        return self._detector.inventory

    def get_hardware_status(self) -> Dict[str, Any]:
        inv = self.inventory
        mem = self._backend.get_memory_info()
        return {
            "status": "ready" if self._backend.is_available else "degraded",
            "openvino_available": inv.openvino_available,
            "openvino_version": inv.openvino_version,
            "available_devices": inv.available_execution_devices,
            "device_preference": self._preference.value,
            "cpu": inv.cpu.to_dict(),
            "gpu": inv.gpu.to_dict(),
            "npu": inv.npu.to_dict(),
            "metrics": {
                "total_inferences": self._total_inferences,
                "npu_inferences": self._npu_count,
                "gpu_inferences": self._gpu_count,
                "cpu_inferences": self._cpu_count,
                "fallbacks": self._fallback_count,
                "process_memory_rss_mb": mem.get("rss_mb", 0.0),
            },
        }

    def _determine_execution_ladder(self, target_preference: DevicePreference) -> List[str]:
        """
        Builds the fallback execution ladder based on user preference and hardware presence.
        """
        available = self._backend.available_devices

        if target_preference == DevicePreference.NPU:
            # Prefer NPU, fall back to GPU then CPU
            ladder = ["NPU", "GPU", "CPU"]
        elif target_preference == DevicePreference.GPU:
            ladder = ["GPU", "CPU"]
        elif target_preference == DevicePreference.CPU:
            ladder = ["CPU"]
        else:  # AUTO
            # In AUTO mode: use NPU if present, then GPU, then CPU
            ladder = ["NPU", "GPU", "CPU"]

        # Filter strictly by currently available devices (CPU is always assumed valid)
        filtered = [dev for dev in ladder if dev in available or dev == "CPU"]
        if "CPU" not in filtered:
            filtered.append("CPU")
        return filtered

    def execute_workload(
        self,
        model_or_path: Union[str, Any],
        model_id: str,
        inputs: Union[Dict[str, Any], List[Any], Any],
        override_preference: Optional[DevicePreference] = None,
    ) -> InferenceResult:
        """
        Main execution entry point:
        1. Evaluates device preference and compatibility.
        2. Compiles model on target device or falls back along the ladder.
        3. Executes inference safely with concurrency protection.
        4. Verifies actual execution device from runtime.
        5. Records diagnostics.
        """
        t_start = time.perf_counter()
        pref = override_preference or self._preference
        ladder = self._determine_execution_ladder(pref)

        selected_device = ladder[0]
        actual_device = ""
        compilation_time_ms = 0.0
        inference_latency_ms = 0.0
        fallback_occurred = False
        fallback_reasons: List[str] = []
        outputs: Dict[str, Any] = {}

        last_error: Optional[Exception] = None

        # Iterate through the fallback ladder
        for attempt_idx, candidate_dev in enumerate(ladder):
            try:
                # 1. Compatibility check for candidate device
                is_compat, compat_reason = self._backend.check_model_compatibility(model_or_path, candidate_dev)
                if not is_compat:
                    fallback_reasons.append(f"Device '{candidate_dev}' incompatible: {compat_reason}")
                    if attempt_idx == 0:
                        fallback_occurred = True
                    continue

                # 2. Compile model for candidate device
                t_comp_0 = time.perf_counter()
                compiled_model, metadata = self._backend.compile_model(
                    model_or_path=model_or_path,
                    model_id=f"{model_id}_{candidate_dev.lower()}",
                    target_device=candidate_dev,
                )
                compilation_time_ms = (time.perf_counter() - t_comp_0) * 1000.0

                # 3. Execute inference
                outputs, inference_latency_ms, actual_device = self._backend.infer(
                    model_id=f"{model_id}_{candidate_dev.lower()}",
                    inputs=inputs,
                )

                if candidate_dev != selected_device:
                    fallback_occurred = True

                break  # Inference succeeded!

            except Exception as e:
                last_error = e
                fallback_occurred = True
                fallback_reasons.append(f"Execution failed on '{candidate_dev}': {str(e)}")
                continue

        if not outputs and last_error:
            # Total ladder failure: raise structured error
            raise RuntimeError(
                f"Hardware execution failed across all candidate devices ({ladder}). "
                f"Reasons: {'; '.join(fallback_reasons)}"
            ) from last_error

        total_ms = (time.perf_counter() - t_start) * 1000.0
        mem = self._backend.get_memory_info()

        # Update statistics
        with self._lock:
            self._total_inferences += 1
            if "NPU" in actual_device.upper():
                self._npu_count += 1
            elif "GPU" in actual_device.upper():
                self._gpu_count += 1
            else:
                self._cpu_count += 1

            if fallback_occurred:
                self._fallback_count += 1

            res = InferenceResult(
                model_id=model_id,
                selected_device=selected_device,
                actual_device=actual_device,
                outputs=outputs,
                inference_latency_ms=round(inference_latency_ms, 2),
                compilation_time_ms=round(compilation_time_ms, 2),
                total_duration_ms=round(total_ms, 2),
                fallback_occurred=fallback_occurred,
                fallback_reason=" | ".join(fallback_reasons) if fallback_reasons else None,
                memory_rss_mb=mem.get("rss_mb", 0.0),
            )

            self._inference_history.append(res)
            if len(self._inference_history) > self._history_max:
                self._inference_history.pop(0)

            return res

    def generate_diagnostic_report(self) -> DiagnosticReport:
        """
        Generates a developer-facing hardware diagnostics report.
        Strictly sanitizes outputs — NEVER includes user messages, audio bytes, or API keys.
        """
        inv = self.inventory
        mem = self._backend.get_memory_info()

        # Sanitize recent inference records for telemetry
        sanitized_recent = []
        for inf in self._inference_history[-10:]:
            sanitized_recent.append({
                "model_id": inf.model_id,
                "selected_device": inf.selected_device,
                "actual_device": inf.actual_device,
                "inference_latency_ms": inf.inference_latency_ms,
                "compilation_time_ms": inf.compilation_time_ms,
                "total_duration_ms": inf.total_duration_ms,
                "fallback_occurred": inf.fallback_occurred,
                "fallback_reason": inf.fallback_reason,
            })

        return DiagnosticReport(
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            detected_devices={
                "cpu": inv.cpu.device_name,
                "gpu": inv.gpu.device_name,
                "npu": inv.npu.device_name,
                "available_devices": inv.available_execution_devices,
                "runtime_verified": inv.npu.runtime_verified,
            },
            openvino_version=inv.openvino_version,
            npu_driver_version=inv.npu.driver_version,
            gpu_driver_version=inv.gpu.driver_version,
            active_preference=self._preference.value,
            recent_inferences=sanitized_recent,
            total_inferences=self._total_inferences,
            npu_inference_count=self._npu_count,
            gpu_inference_count=self._gpu_count,
            cpu_inference_count=self._cpu_count,
            fallback_count=self._fallback_count,
            system_memory_rss_mb=mem.get("rss_mb", 0.0),
        )

    def shutdown(self) -> None:
        """
        Safely shuts down the hardware engine and releases compiled models.
        """
        self._backend.shutdown()
        self._inference_history.clear()


# Export alias for natural import
HardwareTaskRouter = HardwareIntelligenceEngine
