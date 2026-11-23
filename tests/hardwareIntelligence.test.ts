/**
 * FRIDAY Hardware Intelligence Engine — TypeScript Integration Tests (Vitest)
 * Verifies HardwareService, OpenVINO NPU detection, device preferences,
 * workload assessments, and developer diagnostics.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hardwareService } from '../src/services/hardware/hardwareService';
import { HardwarePreference } from '../src/services/hardware/types';

describe('FRIDAY Hardware Intelligence Engine Suite', () => {
  beforeAll(async () => {
    await hardwareService.initialize();
  }, 15000);

  afterAll(async () => {
    await hardwareService.shutdown();
  });

  it('1. detects CPU, GPU, Intel AI Boost NPU and OpenVINO runtime', async () => {
    const inv = await hardwareService.getInventory(false);

    expect(inv).toBeDefined();
    expect(inv.cpu).toBeDefined();
    expect(inv.cpu.device_type).toBe('CPU');
    expect(inv.cpu.available).toBe(true);

    expect(inv.gpu).toBeDefined();
    expect(inv.gpu.device_type).toBe('GPU');
    expect(inv.gpu.available).toBe(true);

    expect(inv.npu).toBeDefined();
    expect(inv.npu.device_type).toBe('NPU');
    expect(inv.npu.available).toBe(true);
    expect(inv.npu.device_name).toContain('AI Boost');

    expect(inv.openvino_available).toBe(true);
    expect(inv.openvino_version).toContain('2026');
    expect(inv.available_execution_devices).toContain('NPU');
    expect(inv.available_execution_devices).toContain('CPU');
    expect(inv.available_execution_devices).toContain('GPU');
  });

  it('2. returns complete hardware status and preference configuration', async () => {
    const status = await hardwareService.getHardwareStatus();

    expect(status).toBeDefined();
    expect(status.status).toBe('ready');
    expect(status.openvino_available).toBe(true);
    expect(status.available_devices).toContain('NPU');
    expect(status.device_preference).toBeDefined();
    expect(status.metrics).toBeDefined();
    expect(typeof status.metrics.total_inferences).toBe('number');
  });

  it('3. allows setting device preferences (auto, npu, gpu, cpu)', async () => {
    const resNpu = await hardwareService.setPreference('npu');
    expect(resNpu.preference).toBe('npu');

    const resCpu = await hardwareService.setPreference('cpu');
    expect(resCpu.preference).toBe('cpu');

    const resAuto = await hardwareService.setPreference('auto');
    expect(resAuto.preference).toBe('auto');
  });

  it('4. executes real NPU inference with verified execution device', async () => {
    await hardwareService.setPreference('npu');
    const inferRes = await hardwareService.runInference('tiny_test', [[1.0, 2.0, 3.0, 4.0]], 'npu');

    expect(inferRes).toBeDefined();
    expect(inferRes.actual_device).toBe('NPU');
    expect(inferRes.fallback_occurred).toBe(false);
    expect(inferRes.inference_latency_ms).toBeGreaterThan(0);
    expect(inferRes.outputs).toBeDefined();

    // Verify mathematical result: relu([1,2,3,4] + [1,2,3,4]) = [2,4,6,8]
    const outKeys = Object.keys(inferRes.outputs);
    expect(outKeys.length).toBeGreaterThan(0);
    const outData = inferRes.outputs[outKeys[0]];
    expect(outData[0][0]).toBeCloseTo(2.0, 1);
    expect(outData[0][1]).toBeCloseTo(4.0, 1);
    expect(outData[0][2]).toBeCloseTo(6.0, 1);
    expect(outData[0][3]).toBeCloseTo(8.0, 1);
  });

  it('5. executes CPU inference when CPU preference is selected', async () => {
    const inferRes = await hardwareService.runInference('tiny_test', [[2.0, 3.0, 4.0, 5.0]], 'cpu');

    expect(inferRes).toBeDefined();
    expect(inferRes.actual_device).toBe('CPU');
    expect(inferRes.inference_latency_ms).toBeGreaterThan(0);

    const outKeys = Object.keys(inferRes.outputs);
    const outData = inferRes.outputs[outKeys[0]];
    expect(outData[0][0]).toBeCloseTo(3.0, 1);
    expect(outData[0][1]).toBeCloseTo(5.0, 1);
    expect(outData[0][2]).toBeCloseTo(7.0, 1);
    expect(outData[0][3]).toBeCloseTo(9.0, 1);
  });

  it('6. generates sanitized developer diagnostic report without sensitive data', async () => {
    const report = await hardwareService.getDiagnosticReport();

    expect(report).toBeDefined();
    expect(report.timestamp).toBeDefined();
    expect(report.detected_devices).toBeDefined();
    expect(report.detected_devices.npu).toContain('AI Boost');
    expect(report.openvino_version).toContain('2026');
    expect(report.total_inferences).toBeGreaterThan(0);

    // Verify zero leakage of credentials or sensitive tokens
    const reportJson = JSON.stringify(report).toLowerCase();
    expect(reportJson).not.toContain('api_key');
    expect(reportJson).not.toContain('password');
    expect(reportJson).not.toContain('gemini_api_key');
    expect(reportJson).not.toContain('groq_api_key');
  });

  it('7. evaluates the 6 core workloads and verifies cloud API preservation', async () => {
    const report = await hardwareService.getWorkloadAssessments();

    expect(report).toBeDefined();
    expect(report.workload_count).toBe(6);
    expect(report.cloud_preservation_policy).toContain('Cloud API requests');
    expect(report.cloud_preservation_policy).toContain('strictly preserved');

    const workloads = report.workloads;
    const vad = workloads.find((w: any) => w.workload_id === 'voice_activity_detection');
    expect(vad).toBeDefined();
    expect(vad.npu_compatible).toBe(true);

    const speech = workloads.find((w: any) => w.workload_id === 'local_speech_recognition');
    expect(speech).toBeDefined();
    expect(speech.migration_decision).toBe('RETAIN_CPU_DSP');

    const noise = workloads.find((w: any) => w.workload_id === 'noise_suppression');
    expect(noise).toBeDefined();
    expect(noise.migration_decision).toBe('RETAIN_CPU_DSP');
  });
});
