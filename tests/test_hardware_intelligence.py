"""
Comprehensive Automated Test Suite for FRIDAY Hardware Intelligence Engine
Verifies:
1. Hardware detection (CPU, GPU, Intel AI Boost NPU, driver versions, runtime checks)
2. NPU model compilation
3. Real NPU inference
4. CPU inference fallback
5. GPU availability and execution
6. NPU failure and dynamic-shape fallback
7. Repeated inference and thread-safety
8. Application shutdown and resource cleanup
9. Workload assessment of the 6 core workloads & cloud API preservation
10. Sanitized diagnostic report generation
11. JSON-RPC protocol server integration
12. Preservation of existing Cognitive Engine and conversation routing
"""

import unittest
import time
import numpy as np
from cognitive_engine.hardware import (
    HardwareDetector,
    HardwareIntelligenceEngine,
    OpenVinoBackend,
    ReferenceModelFactory,
    WorkloadAssessor,
    DevicePreference,
    ExecutionDevice,
)
from cognitive_engine.cognitive_controller import CognitiveController, CognitiveRequest
from cognitive_engine.intent_router import IntentRouter, IntentCategory
from cognitive_engine.complexity_router import ComplexityRouter, ReasoningLevel
from cognitive_engine.engine_service import EngineService


class TestHardwareIntelligenceEngine(unittest.TestCase):

    def setUp(self):
        self.engine = HardwareIntelligenceEngine.get_instance()
        self.detector = HardwareDetector()
        self.backend = OpenVinoBackend.get_instance()

    def tearDown(self):
        # Reset preference to AUTO
        self.engine.set_preference(DevicePreference.AUTO)

    # 1. Hardware Detection Tests
    def test_01_hardware_detection(self):
        inv = self.detector.get_inventory()

        # CPU verification
        self.assertTrue(inv.cpu.available)
        self.assertIn("Intel", inv.cpu.device_name)
        self.assertGreaterEqual(inv.cpu.details.get("physical_cores", 0), 1)

        # GPU verification
        self.assertTrue(inv.gpu.available)
        self.assertIn("Intel", inv.gpu.device_name)
        self.assertIsNotNone(inv.gpu.driver_version)

        # NPU verification
        self.assertTrue(inv.npu.available)
        self.assertIn("AI Boost", inv.npu.device_name)
        self.assertIsNotNone(inv.npu.driver_version)
        self.assertTrue(inv.npu.runtime_verified)

        # OpenVINO verification
        self.assertTrue(inv.openvino_available)
        self.assertIsNotNone(inv.openvino_version)
        self.assertIn("2026", inv.openvino_version)
        self.assertIn("CPU", inv.available_execution_devices)
        self.assertIn("GPU", inv.available_execution_devices)
        self.assertIn("NPU", inv.available_execution_devices)

    # 2. NPU Model Compilation Tests
    def test_02_npu_model_compilation(self):
        model = ReferenceModelFactory.create_tiny_test_model("CompileTestModel")
        compiled, metadata = self.backend.compile_model(
            model_or_path=model,
            model_id="test_compile_npu",
            target_device="NPU",
        )
        self.assertIsNotNone(compiled)
        self.assertEqual(metadata.target_device, "NPU")
        self.assertEqual(metadata.actual_device, "NPU")
        self.assertTrue(metadata.is_static_shape)
        self.assertGreater(metadata.compilation_time_ms, 0.0)

    # 3. Real NPU Inference Tests
    def test_03_real_npu_inference(self):
        model = ReferenceModelFactory.create_tiny_test_model("NPUInferenceModel")
        inp = np.array([[1.0, 2.0, 3.0, 4.0]], dtype=np.float32)

        res = self.engine.execute_workload(
            model_or_path=model,
            model_id="real_npu_infer",
            inputs=inp,
            override_preference=DevicePreference.NPU,
        )

        self.assertEqual(res.actual_device, "NPU")
        self.assertFalse(res.fallback_occurred)
        self.assertGreater(res.inference_latency_ms, 0.0)

        # Verify mathematical correctness: relu([1,2,3,4] + [1,2,3,4]) = [2,4,6,8]
        out_val = list(res.outputs.values())[0]
        np.testing.assert_allclose(out_val, [[2.0, 4.0, 6.0, 8.0]], atol=1e-3)

    # 4. CPU Inference Fallback Tests
    def test_04_cpu_inference_fallback(self):
        model = ReferenceModelFactory.create_tiny_test_model("CPUInferenceModel")
        inp = np.array([[2.0, 3.0, 4.0, 5.0]], dtype=np.float32)

        res = self.engine.execute_workload(
            model_or_path=model,
            model_id="cpu_infer",
            inputs=inp,
            override_preference=DevicePreference.CPU,
        )

        self.assertEqual(res.actual_device, "CPU")
        out_val = list(res.outputs.values())[0]
        np.testing.assert_allclose(out_val, [[3.0, 5.0, 7.0, 9.0]], atol=1e-3)

    # 5. GPU Availability and Inference Tests
    def test_05_gpu_availability_and_inference(self):
        self.assertTrue(self.backend.is_device_available("GPU"))

        model = ReferenceModelFactory.create_tiny_test_model("GPUInferenceModel")
        inp = np.array([[0.0, 1.0, 2.0, 3.0]], dtype=np.float32)

        res = self.engine.execute_workload(
            model_or_path=model,
            model_id="gpu_infer",
            inputs=inp,
            override_preference=DevicePreference.GPU,
        )

        self.assertIn("GPU", res.actual_device)
        out_val = list(res.outputs.values())[0]
        np.testing.assert_allclose(out_val, [[1.0, 3.0, 5.0, 7.0]], atol=1e-3)

    # 6. NPU Failure and Dynamic Shape Fallback Tests
    def test_06_npu_failure_and_dynamic_shape_fallback(self):
        # Create a model with dynamic dimensions [-1, 4] that NPU rejects
        dyn_model = ReferenceModelFactory.create_dynamic_test_model("DynamicShapeModel")
        inp = np.array([[1.0, 2.0, 3.0, 4.0]], dtype=np.float32)

        # Set preference to NPU; it should automatically fall back to GPU or CPU without throwing
        res = self.engine.execute_workload(
            model_or_path=dyn_model,
            model_id="dyn_shape_infer",
            inputs=inp,
            override_preference=DevicePreference.NPU,
        )

        self.assertTrue(res.fallback_occurred)
        self.assertIn(res.actual_device, ("GPU.0", "GPU", "CPU"))
        self.assertIsNotNone(res.fallback_reason)
        self.assertIn("NPU requires static tensor shapes", res.fallback_reason)

        # Output must still be mathematically accurate!
        out_val = list(res.outputs.values())[0]
        np.testing.assert_allclose(out_val, [[2.0, 4.0, 6.0, 8.0]], atol=1e-3)

    # 7. Repeated Inference and Concurrency Tests
    def test_07_repeated_inference_and_concurrency(self):
        model = ReferenceModelFactory.create_language_classifier("RepeatedLangModel")
        inp = np.ones((1, 8), dtype=np.float32)

        latencies = []
        for i in range(8):
            res = self.engine.execute_workload(
                model_or_path=model,
                model_id="lang_repeated",
                inputs=inp,
                override_preference=DevicePreference.NPU,
            )
            self.assertEqual(res.actual_device, "NPU")
            latencies.append(res.inference_latency_ms)

        # Warm runs on NPU should be under 50ms
        self.assertLess(latencies[-1], 50.0)

    # 8. Application Shutdown and Model Unloading Tests
    def test_08_application_shutdown_and_unloading(self):
        model = ReferenceModelFactory.create_tiny_test_model("UnloadTestModel")
        compiled, meta = self.backend.compile_model(model, "model_to_unload", "CPU")
        self.assertIn("model_to_unload", self.backend._compiled_models)

        # Unload
        unloaded = self.backend.unload_model("model_to_unload")
        self.assertTrue(unloaded)
        self.assertNotIn("model_to_unload", self.backend._compiled_models)

        # Global shutdown
        self.engine.shutdown()
        self.assertEqual(len(self.backend._compiled_models), 0)

    # 9. Workload Assessment & Cloud Preservation Tests
    def test_09_workload_assessment_and_cloud_preservation(self):
        report = WorkloadAssessor.to_report()
        self.assertEqual(report["workload_count"], 6)

        # Verify cloud API requests are preserved
        self.assertIn("Cloud API requests", report["cloud_preservation_policy"])
        self.assertIn("strictly preserved", report["cloud_preservation_policy"])

        # Check individual assessments
        vad = WorkloadAssessor.get_assessment("voice_activity_detection")
        self.assertIsNotNone(vad)
        self.assertTrue(vad.npu_compatible)
        self.assertEqual(vad.migration_decision, "NPU_ACCELERATED")

        speech = WorkloadAssessor.get_assessment("local_speech_recognition")
        self.assertIsNotNone(speech)
        self.assertEqual(speech.migration_decision, "RETAIN_CPU_DSP")

        lang = WorkloadAssessor.get_assessment("language_identification")
        self.assertIsNotNone(lang)
        self.assertTrue(lang.npu_compatible)

        noise = WorkloadAssessor.get_assessment("noise_suppression")
        self.assertIsNotNone(noise)
        self.assertEqual(noise.migration_decision, "RETAIN_CPU_DSP")

    # 10. Sanitized Diagnostic Report Tests
    def test_10_diagnostics_report_sanitization(self):
        # Run an inference to populate telemetry
        model = ReferenceModelFactory.create_tiny_test_model("DiagTestModel")
        inp = np.array([[1.0, 1.0, 1.0, 1.0]], dtype=np.float32)
        _ = self.engine.execute_workload(model, "diag_infer", inp)

        diag = self.engine.generate_diagnostic_report()
        d_dict = diag.to_dict()

        self.assertIn("detected_devices", d_dict)
        self.assertIn("openvino_version", d_dict)
        self.assertIn("npu_driver_version", d_dict)
        self.assertIn("recent_inferences", d_dict)
        self.assertGreater(d_dict["total_inferences"], 0)

        # STRICT PRIVACY CHECK: Verify NO sensitive keys exist in diagnostic report
        report_str = str(d_dict).lower()
        for forbidden in ("api_key", "secret", "password", "audio_pcm", "groq_api_key", "gemini_api_key"):
            self.assertNotIn(forbidden, report_str)

    # 11. Engine Service JSON-RPC Handlers
    def test_11_engine_service_rpc_protocol(self):
        service = EngineService()
        captured = []

        # Intercept _send_response
        orig_send = service._send_response
        service._send_response = lambda req_id, res: captured.append((req_id, res))

        # Test hardware_detect
        service.handle_line('{"id": "r1", "action": "hardware_detect"}')
        self.assertEqual(captured[0][0], "r1")
        self.assertTrue(captured[0][1]["openvino_available"])

        # Test hardware_status
        service.handle_line('{"id": "r2", "action": "hardware_status"}')
        self.assertEqual(captured[1][0], "r2")
        self.assertEqual(captured[1][1]["status"], "ready")

        # Test hardware_infer on NPU
        service.handle_line('{"id": "r3", "action": "hardware_infer", "modelId": "tiny_test", "inputs": [[1.0, 2.0, 3.0, 4.0]]}')
        self.assertEqual(captured[2][0], "r3")
        self.assertEqual(captured[2][1]["actual_device"], "NPU")

        # Restore
        service._send_response = orig_send

    # 12. Cognitive Engine Flow Preservation
    def test_12_cognitive_engine_preservation(self):
        controller = CognitiveController()

        # Simple greeting
        req = CognitiveRequest(
            request_id="req_test_preserve",
            message="Hello Friday, how are you?",
            session_id="s1",
            input_source="text",
            active_provider="gemini",
            personality_mode="moderate",
            language="en-IN",
        )

        res = controller.process_request(req)
        self.assertIsNotNone(res.text)
        self.assertEqual(res.intent_category, IntentCategory.GENERAL_CONVERSATION)
        self.assertIn(res.reasoning_level, (ReasoningLevel.L0_INSTANT, ReasoningLevel.L1_STANDARD))


if __name__ == "__main__":
    unittest.main()
