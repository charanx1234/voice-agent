"""
FRIDAY Hardware Intelligence Engine — OpenVINO NPU Execution Backend
Manages OpenVINO Core, model compilation, NPU blob caching, infer request lifecycle,
actual execution device tracking, memory monitoring, and safe shutdown.
"""

from __future__ import annotations
import os
import sys
import time
import threading
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, Tuple, Union

try:
    import numpy as np
except ImportError:
    np = None

try:
    import openvino as ov
    OPENVINO_AVAILABLE = True
except ImportError:
    ov = None
    OPENVINO_AVAILABLE = False

try:
    import psutil
except ImportError:
    psutil = None


CACHE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../.cache/openvino_cache")
)
os.makedirs(CACHE_DIR, exist_ok=True)


@dataclass
class ModelMetadata:
    model_id: str
    target_device: str
    actual_device: str
    input_names: List[str]
    input_shapes: Dict[str, List[int]]
    output_names: List[str]
    output_shapes: Dict[str, List[int]]
    is_static_shape: bool
    compilation_time_ms: float
    cached: bool = False


@dataclass
class InferenceRequestHandle:
    model_id: str
    execution_device: str
    infer_request: Any


class OpenVinoBackend:
    """
    OpenVINO NPU, GPU, and CPU execution engine.
    Ensures safe compilation, request lifecycle, model unloading, and robust error handling.
    """

    _instance: Optional[OpenVinoBackend] = None
    _lock = threading.RLock()

    @classmethod
    def get_instance(cls) -> OpenVinoBackend:
        with cls._lock:
            if cls._instance is None:
                cls._instance = OpenVinoBackend()
            return cls._instance

    def __init__(self):
        self._lock = threading.RLock()
        self._core: Optional[ov.Core] = None
        self._compiled_models: Dict[str, Any] = {}
        self._model_metadata: Dict[str, ModelMetadata] = {}
        self._infer_requests: Dict[str, Any] = {}
        self._infer_locks: Dict[str, threading.Lock] = {}
        self._available_devices: List[str] = []
        self._is_initialized = False

        self._init_core()

    def _init_core(self) -> None:
        if not OPENVINO_AVAILABLE or ov is None:
            sys.stderr.write("[OpenVinoBackend] OpenVINO library is not available in current Python environment.\n")
            return

        try:
            self._core = ov.Core()
            self._available_devices = list(self._core.available_devices)

            # Configure model cache directory for NPU and GPU where safe
            if "NPU" in self._available_devices:
                try:
                    self._core.set_property("NPU", {"CACHE_DIR": CACHE_DIR})
                except Exception as e:
                    sys.stderr.write(f"[OpenVinoBackend] NPU cache setup warning: {e}\n")

            if "GPU" in self._available_devices:
                try:
                    self._core.set_property("GPU", {"CACHE_DIR": CACHE_DIR})
                except Exception as e:
                    sys.stderr.write(f"[OpenVinoBackend] GPU cache setup warning: {e}\n")

            self._is_initialized = True
        except Exception as e:
            sys.stderr.write(f"[OpenVinoBackend] Core initialization failed: {e}\n")
            self._is_initialized = False

    @property
    def is_available(self) -> bool:
        return self._is_initialized and self._core is not None

    @property
    def available_devices(self) -> List[str]:
        if not self._is_initialized or self._core is None:
            return []
        try:
            return list(self._core.available_devices)
        except Exception:
            return self._available_devices

    def is_device_available(self, device: str) -> bool:
        dev_upper = device.upper()
        return dev_upper in self.available_devices

    def check_model_compatibility(self, model: Any, target_device: str) -> Tuple[bool, Optional[str]]:
        """
        Validates model compatibility with the target execution device.
        Intel NPU specifically requires static input shapes and supported ops.
        """
        if not self.is_available:
            return False, "OpenVINO runtime is not initialized."

        target_dev = target_device.upper()
        if target_dev not in self.available_devices:
            return False, f"Target device '{target_dev}' is not present among available devices: {self.available_devices}"

        if not hasattr(model, "inputs"):
            # If path, read the model to inspect
            if isinstance(model, str) and os.path.exists(model):
                try:
                    model = self._core.read_model(model)
                except Exception as e:
                    return False, f"Failed to read model file: {e}"
            else:
                return False, "Invalid model object or path."

        # Verify static shapes for NPU
        if target_dev == "NPU":
            for inp in model.inputs:
                partial_shape = inp.get_partial_shape()
                if partial_shape.is_dynamic:
                    return (
                        False,
                        f"NPU requires static tensor shapes, but input '{inp.get_any_name()}' has dynamic shape {partial_shape}.",
                    )

        return True, None

    def compile_model(
        self,
        model_or_path: Union[str, Any],
        model_id: str,
        target_device: str = "NPU",
        config: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Any, ModelMetadata]:
        """
        Compiles an OpenVINO model for the designated execution device.
        Tracks compilation time, actual execution device, and saves metadata.
        """
        if not self.is_available:
            raise RuntimeError("OpenVINO runtime is not available.")

        target_dev = target_device.upper()

        # Check compatibility first
        is_compat, reason = self.check_model_compatibility(model_or_path, target_dev)
        if not is_compat:
            raise ValueError(f"Model '{model_id}' is incompatible with device '{target_dev}': {reason}")

        # Read model if path provided
        model = model_or_path
        if isinstance(model_or_path, str):
            if not os.path.exists(model_or_path):
                raise FileNotFoundError(f"Model file not found: {model_or_path}")
            model = self._core.read_model(model_or_path)

        with self._lock:
            # Check if already compiled
            if model_id in self._compiled_models and self._model_metadata.get(model_id, {}).target_device == target_dev:
                return self._compiled_models[model_id], self._model_metadata[model_id]

            t0 = time.perf_counter()
            comp_config = config or {}

            try:
                compiled = self._core.compile_model(model, target_dev, comp_config)
            except Exception as e:
                raise RuntimeError(f"OpenVINO compilation failed on '{target_dev}': {str(e)}") from e

            compile_time_ms = (time.perf_counter() - t0) * 1000.0

            # Retrieve actual execution device confirmed by runtime
            actual_device = target_dev
            try:
                exec_devs = compiled.get_property("EXECUTION_DEVICES")
                if isinstance(exec_devs, list) and exec_devs:
                    actual_device = str(exec_devs[0])
                elif exec_devs:
                    actual_device = str(exec_devs)
            except Exception:
                actual_device = target_dev

            # Extract input / output metadata
            input_names = [inp.get_any_name() for inp in compiled.inputs]
            input_shapes = {
                inp.get_any_name(): list(inp.shape) for inp in compiled.inputs if not inp.get_partial_shape().is_dynamic
            }
            output_names = [out.get_any_name() for out in compiled.outputs]
            output_shapes = {
                out.get_any_name(): list(out.shape) for out in compiled.outputs if not out.get_partial_shape().is_dynamic
            }

            metadata = ModelMetadata(
                model_id=model_id,
                target_device=target_dev,
                actual_device=actual_device,
                input_names=input_names,
                input_shapes=input_shapes,
                output_names=output_names,
                output_shapes=output_shapes,
                is_static_shape=True,
                compilation_time_ms=round(compile_time_ms, 2),
                cached=True,
            )

            # Store compiled model and create its dedicated infer request
            self._compiled_models[model_id] = compiled
            self._model_metadata[model_id] = metadata
            self._infer_requests[model_id] = compiled.create_infer_request()
            self._infer_locks[model_id] = threading.Lock()

            return compiled, metadata

    def infer(
        self,
        model_id: str,
        inputs: Union[Dict[str, Any], List[Any], Any],
    ) -> Tuple[Dict[str, Any], float, str]:
        """
        Executes inference on the compiled model.
        Guarantees thread-safe single-request execution via model-specific lock.
        Returns: (output_dict, inference_latency_ms, actual_execution_device)
        """
        if model_id not in self._compiled_models:
            raise KeyError(f"Model '{model_id}' is not compiled. Call compile_model() first.")

        compiled = self._compiled_models[model_id]
        infer_req = self._infer_requests[model_id]
        meta = self._model_metadata[model_id]
        model_lock = self._infer_locks[model_id]

        # Acquire per-model lock to prevent race conditions or duplicate execution
        with model_lock:
            def _normalize_tensor(val: Any) -> Any:
                if np is not None:
                    if isinstance(val, (list, tuple)):
                        val = np.array(val, dtype=np.float32)
                    elif isinstance(val, np.ndarray) and val.dtype == np.float64:
                        val = val.astype(np.float32)
                return val

            # Format inputs correctly
            feed_dict = {}
            if isinstance(inputs, dict):
                for k, v in inputs.items():
                    norm_v = _normalize_tensor(v)
                    # Match by name or input object
                    matched = False
                    for inp in compiled.inputs:
                        if inp.get_any_name() == k or k == inp:
                            feed_dict[inp] = norm_v
                            matched = True
                            break
                    if not matched:
                        # Fallback: feed to first input
                        feed_dict[compiled.input(0)] = norm_v
            elif isinstance(inputs, (list, tuple)) and len(compiled.inputs) > 0 and not isinstance(inputs[0], (int, float, list, tuple)):
                for idx, val in enumerate(inputs):
                    if idx < len(compiled.inputs):
                        feed_dict[compiled.input(idx)] = _normalize_tensor(val)
            else:
                # Single tensor/array/list of floats
                feed_dict[compiled.input(0)] = _normalize_tensor(inputs)

            t0 = time.perf_counter()
            try:
                raw_outputs = infer_req.infer(feed_dict)
            except Exception as e:
                raise RuntimeError(f"Inference execution failed on '{meta.actual_device}': {str(e)}") from e

            infer_ms = (time.perf_counter() - t0) * 1000.0

            # Convert outputs to serializable dictionary
            results: Dict[str, Any] = {}
            for out in compiled.outputs:
                name = out.get_any_name()
                val = raw_outputs.get(out)
                if val is None:
                    val = raw_outputs.get(name)
                results[name] = val

            return results, round(infer_ms, 2), meta.actual_device

    def unload_model(self, model_id: str) -> bool:
        """
        Unloads a compiled model and its inference requests to release RAM and NPU memory.
        """
        with self._lock:
            if model_id not in self._compiled_models:
                return False

            lock = self._infer_locks.get(model_id)
            if lock:
                with lock:
                    self._infer_requests.pop(model_id, None)
                    self._compiled_models.pop(model_id, None)
                    self._model_metadata.pop(model_id, None)
            else:
                self._infer_requests.pop(model_id, None)
                self._compiled_models.pop(model_id, None)
                self._model_metadata.pop(model_id, None)

            self._infer_locks.pop(model_id, None)
            import gc
            gc.collect()
            return True

    def get_memory_info(self) -> Dict[str, Any]:
        """
        Returns host process memory utilization.
        """
        if psutil:
            try:
                proc = psutil.Process()
                mem = proc.memory_info()
                return {
                    "rss_mb": round(mem.rss / (1024 * 1024), 2),
                    "vms_mb": round(mem.vms / (1024 * 1024), 2),
                }
            except Exception:
                pass
        return {"rss_mb": 0.0, "vms_mb": 0.0}

    def shutdown(self) -> None:
        """
        Safely releases all compiled models and resets engine state.
        """
        with self._lock:
            for model_id in list(self._compiled_models.keys()):
                self.unload_model(model_id)
            self._compiled_models.clear()
            self._model_metadata.clear()
            self._infer_requests.clear()
            self._infer_locks.clear()
            import gc
            gc.collect()
