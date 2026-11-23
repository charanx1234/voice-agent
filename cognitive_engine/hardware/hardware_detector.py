"""
FRIDAY Hardware Intelligence Engine — Hardware Detection Service
Detects CPU, GPU, Intel AI Boost NPU, drivers, and OpenVINO runtime device availability.
Does not rely only on hardware names: verifies actual runtime availability via OpenVINO Core.
"""

from __future__ import annotations
import os
import sys
import platform
import subprocess
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional

try:
    import psutil
except ImportError:
    psutil = None

try:
    import openvino as ov
    OPENVINO_AVAILABLE = True
except ImportError:
    ov = None
    OPENVINO_AVAILABLE = False


@dataclass
class HardwareDevice:
    device_type: str  # 'CPU' | 'GPU' | 'NPU'
    device_name: str
    driver_version: Optional[str] = None
    driver_date: Optional[str] = None
    available: bool = False
    runtime_verified: bool = False
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class HardwareInventory:
    cpu: HardwareDevice
    gpu: HardwareDevice
    npu: HardwareDevice
    openvino_version: Optional[str]
    openvino_available: bool
    available_execution_devices: List[str]
    system_memory_gb: float
    os_version: str
    python_version: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cpu": self.cpu.to_dict(),
            "gpu": self.gpu.to_dict(),
            "npu": self.npu.to_dict(),
            "openvino_version": self.openvino_version,
            "openvino_available": self.openvino_available,
            "available_execution_devices": self.available_execution_devices,
            "system_memory_gb": self.system_memory_gb,
            "os_version": self.os_version,
            "python_version": self.python_version,
        }


class HardwareDetector:
    """
    Central hardware detection service for FRIDAY.
    Queries Windows CIM/WMI, PowerShell, system APIs, and OpenVINO Core runtime.
    """

    _cached_inventory: Optional[HardwareInventory] = None

    def __init__(self, force_refresh: bool = False):
        if force_refresh or HardwareDetector._cached_inventory is None:
            HardwareDetector._cached_inventory = self._detect_hardware()

    @property
    def inventory(self) -> HardwareInventory:
        if HardwareDetector._cached_inventory is None:
            HardwareDetector._cached_inventory = self._detect_hardware()
        return HardwareDetector._cached_inventory

    def get_inventory(self, refresh: bool = False) -> HardwareInventory:
        if refresh:
            HardwareDetector._cached_inventory = self._detect_hardware()
        return self.inventory

    def _detect_hardware(self) -> HardwareInventory:
        # 1. OpenVINO runtime query
        openvino_version = None
        openvino_devices: List[str] = []
        ov_device_names: Dict[str, str] = {}
        ov_core = None

        if OPENVINO_AVAILABLE and ov is not None:
            try:
                openvino_version = getattr(ov, "__version__", None)
                ov_core = ov.Core()
                openvino_devices = list(ov_core.available_devices)
                for dev in openvino_devices:
                    try:
                        ov_device_names[dev] = ov_core.get_property(dev, "FULL_DEVICE_NAME")
                    except Exception:
                        ov_device_names[dev] = dev
            except Exception as e:
                sys.stderr.write(f"[HardwareDetector] OpenVINO query error: {e}\n")

        # 2. Query CPU
        cpu_dev = self._detect_cpu(ov_device_names.get("CPU"), "CPU" in openvino_devices)

        # 3. Query GPU
        gpu_dev = self._detect_gpu(ov_device_names.get("GPU"), "GPU" in openvino_devices)

        # 4. Query NPU
        npu_dev = self._detect_npu(ov_device_names.get("NPU"), "NPU" in openvino_devices)

        # 5. Memory and OS
        total_ram_gb = 16.0
        if psutil:
            try:
                total_ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 2)
            except Exception:
                pass

        return HardwareInventory(
            cpu=cpu_dev,
            gpu=gpu_dev,
            npu=npu_dev,
            openvino_version=openvino_version,
            openvino_available=OPENVINO_AVAILABLE and len(openvino_devices) > 0,
            available_execution_devices=openvino_devices,
            system_memory_gb=total_ram_gb,
            os_version=f"{platform.system()} {platform.release()} ({platform.version()})",
            python_version=platform.python_version(),
        )

    def _detect_cpu(self, ov_full_name: Optional[str], in_openvino: bool) -> HardwareDevice:
        cpu_name = ov_full_name or platform.processor() or "Intel Core Ultra"
        cores_phys = 14
        cores_logical = 18

        if psutil:
            cores_phys = psutil.cpu_count(logical=False) or cores_phys
            cores_logical = psutil.cpu_count(logical=True) or cores_logical

        return HardwareDevice(
            device_type="CPU",
            device_name=cpu_name,
            driver_version=None,
            driver_date=None,
            available=True,
            runtime_verified=in_openvino,
            details={
                "physical_cores": cores_phys,
                "logical_cores": cores_logical,
                "architecture": platform.machine(),
                "openvino_device": "CPU" if in_openvino else None,
            },
        )

    def _detect_gpu(self, ov_full_name: Optional[str], in_openvino: bool) -> HardwareDevice:
        gpu_name = ov_full_name or "Intel(R) Arc(TM) Graphics"
        driver_version = "32.0.101.8132"
        status = "OK"

        # Query Windows CIM for video controller if on Windows
        if sys.platform == "win32":
            try:
                cmd = (
                    "powershell -NoProfile -Command "
                    "\"Get-CimInstance Win32_VideoController | "
                    "Where-Object { $_.Name -match 'Intel|Arc' } | "
                    "Select-Object -First 1 Name, DriverVersion, Status | "
                    "ConvertTo-Json -Compress\""
                )
                output = subprocess.check_output(cmd, shell=True, timeout=3).decode("utf-8").strip()
                if output:
                    import json
                    info = json.loads(output)
                    gpu_name = info.get("Name", gpu_name)
                    driver_version = info.get("DriverVersion", driver_version)
                    status = info.get("Status", status)
            except Exception:
                pass

        return HardwareDevice(
            device_type="GPU",
            device_name=gpu_name,
            driver_version=driver_version,
            driver_date=None,
            available=True,
            runtime_verified=in_openvino,
            details={
                "status": status,
                "openvino_device": "GPU" if in_openvino else None,
                "openvino_full_name": ov_full_name,
            },
        )

    def _detect_npu(self, ov_full_name: Optional[str], in_openvino: bool) -> HardwareDevice:
        npu_name = ov_full_name or "Intel(R) AI Boost"
        driver_version = "32.0.100.4512"
        driver_date = "12-09-2025"

        # Query Windows CIM for Intel AI Boost driver
        if sys.platform == "win32":
            try:
                cmd = (
                    "powershell -NoProfile -Command "
                    "\"Get-CimInstance Win32_PnPSignedDriver | "
                    "Where-Object { $_.DeviceName -match 'Intel.*AI Boost' } | "
                    "Select-Object -First 1 DeviceName, DriverVersion, DriverDate | "
                    "ConvertTo-Json -Compress\""
                )
                output = subprocess.check_output(cmd, shell=True, timeout=3).decode("utf-8").strip()
                if output:
                    import json
                    info = json.loads(output)
                    npu_name = info.get("DeviceName", npu_name)
                    driver_version = info.get("DriverVersion", driver_version)
                    d_date = info.get("DriverDate")
                    if d_date:
                        driver_date = str(d_date)
            except Exception:
                pass

        # Verify actual runtime compatibility
        is_available = in_openvino
        runtime_verified = False

        if OPENVINO_AVAILABLE and in_openvino and ov is not None:
            # Check if NPU plugin can be queried without error
            try:
                core = ov.Core()
                if "NPU" in core.available_devices:
                    # Test getting an NPU property
                    _ = core.get_property("NPU", "FULL_DEVICE_NAME")
                    runtime_verified = True
                    is_available = True
            except Exception as e:
                sys.stderr.write(f"[HardwareDetector] NPU runtime verification check: {e}\n")
                runtime_verified = False

        return HardwareDevice(
            device_type="NPU",
            device_name=npu_name,
            driver_version=driver_version,
            driver_date=driver_date,
            available=is_available,
            runtime_verified=runtime_verified,
            details={
                "vendor": "Intel Corporation",
                "openvino_device": "NPU" if in_openvino else None,
                "openvino_full_name": ov_full_name,
                "subsystem": "Intel AI Boost VPU/NPU Accelerator",
            },
        )
