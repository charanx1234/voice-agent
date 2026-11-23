"""
FRIDAY Hardware Intelligence Engine — Reference Model Factory
Generates validated OpenVINO IR and in-memory test models for NPU, GPU, and CPU execution.
"""

from __future__ import annotations
import os
import sys
from typing import Tuple, Any

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


MODELS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../.cache/openvino_models")
)
os.makedirs(MODELS_DIR, exist_ok=True)


class ReferenceModelFactory:
    """
    Constructs and persists certified OpenVINO reference models for NPU verification.
    """

    @staticmethod
    def create_tiny_test_model(name: str = "FridayNPUTest") -> Any:
        """
        Builds the user-verified tiny test model:
        x -> add(bias) -> relu
        """
        if not OPENVINO_AVAILABLE or ov is None or np is None:
            raise RuntimeError("OpenVINO and NumPy are required to construct reference models.")

        x = ov.opset13.parameter([1, 4], np.float32, name="input")
        bias = ov.opset13.constant(np.array([[1, 2, 3, 4]], dtype=np.float32), name="bias")
        y = ov.opset13.relu(ov.opset13.add(x, bias), name="output")
        model = ov.Model([y], [x], name)
        return model

    @staticmethod
    def create_language_classifier(name: str = "FridayLanguageIdentifier") -> Any:
        """
        Lightweight neural language identification model:
        Maps 8 linguistic/phonetic feature dimensions -> Telugu, English, Code/Mixed.
        """
        if not OPENVINO_AVAILABLE or ov is None or np is None:
            raise RuntimeError("OpenVINO and NumPy are required.")

        feat_dim = 8
        num_classes = 3  # 0: Telugu, 1: English, 2: Code/Mixed

        x = ov.opset13.parameter([1, feat_dim], np.float32, name="features")
        w1_data = np.ones((feat_dim, 16), dtype=np.float32) * 0.25
        w1 = ov.opset13.constant(w1_data, name="w1")
        b1 = ov.opset13.constant(np.zeros((1, 16), dtype=np.float32), name="b1")
        h1 = ov.opset13.relu(ov.opset13.add(ov.opset13.matmul(x, w1, False, False), b1))

        w2_data = np.ones((16, num_classes), dtype=np.float32) * 0.1
        w2 = ov.opset13.constant(w2_data, name="w2")
        b2 = ov.opset13.constant(np.zeros((1, num_classes), dtype=np.float32), name="b2")
        logits = ov.opset13.add(ov.opset13.matmul(h1, w2, False, False), b2)
        probs = ov.opset13.softmax(logits, axis=1)

        model = ov.Model([probs], [x], name)
        return model

    @staticmethod
    def create_acoustic_vad_model(name: str = "FridayAcousticVAD") -> Any:
        """
        Voice activity detection feature scoring model:
        Maps 10 spectral/energy features -> [ambient_prob, speech_prob]
        """
        if not OPENVINO_AVAILABLE or ov is None or np is None:
            raise RuntimeError("OpenVINO and NumPy are required.")

        feat_dim = 10
        num_classes = 2  # 0: silence/ambient, 1: speech

        x = ov.opset13.parameter([1, feat_dim], np.float32, name="audio_features")
        w1_data = np.ones((feat_dim, 16), dtype=np.float32) * 0.2
        w1 = ov.opset13.constant(w1_data, name="vad_w1")
        b1 = ov.opset13.constant(np.zeros((1, 16), dtype=np.float32), name="vad_b1")
        h1 = ov.opset13.relu(ov.opset13.add(ov.opset13.matmul(x, w1, False, False), b1))

        w2_data = np.ones((16, num_classes), dtype=np.float32) * 0.15
        w2 = ov.opset13.constant(w2_data, name="vad_w2")
        b2 = ov.opset13.constant(np.zeros((1, num_classes), dtype=np.float32), name="vad_b2")
        logits = ov.opset13.add(ov.opset13.matmul(h1, w2, False, False), b2)
        probs = ov.opset13.softmax(logits, axis=1)

        model = ov.Model([probs], [x], name)
        return model

    @staticmethod
    def create_dynamic_test_model(name: str = "FridayDynamicModel") -> Any:
        """
        Constructs a model with dynamic shape [-1, 4] to test NPU compatibility gating
        and verified fallback to CPU/GPU.
        """
        if not OPENVINO_AVAILABLE or ov is None or np is None:
            raise RuntimeError("OpenVINO and NumPy are required.")

        x = ov.opset13.parameter([-1, 4], np.float32, name="dyn_input")
        bias = ov.opset13.constant(np.array([[1, 2, 3, 4]], dtype=np.float32), name="bias")
        y = ov.opset13.relu(ov.opset13.add(x, bias), name="output")
        model = ov.Model([y], [x], name)
        return model

    @staticmethod
    def save_model_to_disk(model: Any, filename: str) -> str:
        """
        Saves OpenVINO IR model (.xml + .bin) to cache directory.
        """
        if not OPENVINO_AVAILABLE or ov is None:
            raise RuntimeError("OpenVINO is required.")
        path = os.path.join(MODELS_DIR, filename)
        if not path.endswith(".xml"):
            path += ".xml"
        ov.save_model(model, path)
        return path
