/**
 * FRIDAY Hardware Intelligence Engine — TypeScript Type Definitions
 */

export type HardwareDeviceType = 'CPU' | 'GPU' | 'NPU';

export type HardwarePreference = 'auto' | 'npu' | 'gpu' | 'cpu';

export interface HardwareDeviceInfo {
  device_type: HardwareDeviceType;
  device_name: string;
  driver_version?: string | null;
  driver_date?: string | null;
  available: boolean;
  runtime_verified: boolean;
  details?: Record<string, any>;
}

export interface HardwareInventoryInfo {
  cpu: HardwareDeviceInfo;
  gpu: HardwareDeviceInfo;
  npu: HardwareDeviceInfo;
  openvino_version: string | null;
  openvino_available: boolean;
  available_execution_devices: string[];
  system_memory_gb: number;
  os_version: string;
  python_version: string;
}

export interface HardwareStatusInfo {
  status: 'ready' | 'degraded' | 'unavailable';
  openvino_available: boolean;
  openvino_version: string | null;
  available_devices: string[];
  device_preference: HardwarePreference;
  cpu: HardwareDeviceInfo;
  gpu: HardwareDeviceInfo;
  npu: HardwareDeviceInfo;
  metrics: {
    total_inferences: number;
    npu_inferences: number;
    gpu_inferences: number;
    cpu_inferences: number;
    fallbacks: number;
    process_memory_rss_mb: number;
  };
}

export interface HardwareInferenceResult {
  model_id: string;
  selected_device: string;
  actual_device: string;
  outputs: Record<string, any>;
  inference_latency_ms: number;
  compilation_time_ms: number;
  total_duration_ms: number;
  fallback_occurred: boolean;
  fallback_reason?: string | null;
  memory_rss_mb: number;
  timestamp: number;
}

export interface HardwareDiagnosticReport {
  timestamp: string;
  detected_devices: {
    cpu: string;
    gpu: string;
    npu: string;
    available_devices: string[];
    runtime_verified: boolean;
  };
  openvino_version: string | null;
  npu_driver_version: string | null;
  gpu_driver_version: string | null;
  active_preference: string;
  recent_inferences: Array<{
    model_id: string;
    selected_device: string;
    actual_device: string;
    inference_latency_ms: number;
    compilation_time_ms: number;
    total_duration_ms: number;
    fallback_occurred: boolean;
    fallback_reason?: string | null;
  }>;
  total_inferences: number;
  npu_inference_count: number;
  gpu_inference_count: number;
  cpu_inference_count: number;
  fallback_count: number;
  system_memory_rss_mb: number;
}

export interface WorkloadAssessmentItem {
  workload_id: string;
  workload_name: string;
  current_runtime: string;
  recommended_device: string;
  npu_compatible: boolean;
  model_format: string;
  operator_support: string;
  latency_profile: string;
  migration_decision: string;
  rationale: string;
}

export interface WorkloadAssessmentReport {
  workload_count: number;
  cloud_preservation_policy: string;
  workloads: WorkloadAssessmentItem[];
}
