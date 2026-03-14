from __future__ import annotations

import csv
import io
from dataclasses import asdict, dataclass

from .windows import run_powershell, sample_counters


CPU_SENSOR_COUNTERS = [
    r"\Processor Information(_Total)\Actual Frequency",
    r"\Processor Information(_Total)\% Processor Performance",
    r"\Processor Information(_Total)\% Performance Limit",
    r"\Processor Information(_Total)\Performance Limit Flags",
    r"\Processor Information(_Total)\% of Maximum Frequency",
]


@dataclass
class SensorSnapshot:
    provider: str
    cpu_actual_mhz: float | None
    cpu_max_percent: float | None
    cpu_perf_percent: float | None
    cpu_perf_limit_percent: float | None
    cpu_perf_limit_flags: int | None
    cpu_limit_reason: str | None
    gpu_core_mhz: float | None
    gpu_mem_mhz: float | None
    gpu_temp_c: float | None
    gpu_power_w: float | None
    throttle_hint: str | None


def sample_sensor_snapshot() -> dict[str, object]:
    snapshot = SensorSnapshot(
        provider="windows-only",
        cpu_actual_mhz=None,
        cpu_max_percent=None,
        cpu_perf_percent=None,
        cpu_perf_limit_percent=None,
        cpu_perf_limit_flags=None,
        cpu_limit_reason=None,
        gpu_core_mhz=None,
        gpu_mem_mhz=None,
        gpu_temp_c=None,
        gpu_power_w=None,
        throttle_hint=None,
    )

    cpu_counters = sample_counters(CPU_SENSOR_COUNTERS)
    for path, value in cpu_counters.items():
        if value is None:
            continue
        lowered = path.lower()
        if lowered.endswith(r"\actual frequency"):
            snapshot.cpu_actual_mhz = round(value, 2)
        elif lowered.endswith(r"\% of maximum frequency"):
            snapshot.cpu_max_percent = round(value, 2)
        elif lowered.endswith(r"\% processor performance"):
            snapshot.cpu_perf_percent = round(value, 2)
        elif lowered.endswith(r"\% performance limit"):
            snapshot.cpu_perf_limit_percent = round(value, 2)
        elif lowered.endswith(r"\performance limit flags"):
            snapshot.cpu_perf_limit_flags = int(value)
            snapshot.cpu_limit_reason = decode_perf_limit_flags(int(value))

    hardware_snapshot = sample_hardware_monitor_snapshot()
    if hardware_snapshot is not None:
        snapshot.provider = hardware_snapshot["provider"]
        snapshot.gpu_core_mhz = hardware_snapshot.get("gpu_core_mhz")
        snapshot.gpu_mem_mhz = hardware_snapshot.get("gpu_mem_mhz")
        snapshot.gpu_temp_c = hardware_snapshot.get("gpu_temp_c")
        snapshot.gpu_power_w = hardware_snapshot.get("gpu_power_w")

    snapshot.throttle_hint = derive_throttle_hint(asdict(snapshot))
    return asdict(snapshot)


def decode_perf_limit_flags(flags: int) -> str:
    if flags == 0:
        return "none"
    reasons: list[str] = []
    bit_map = {
        0: "power",
        1: "thermal",
        2: "reliability",
        3: "duty-cycle",
        4: "frequency-cap",
    }
    for bit, label in bit_map.items():
        if flags & (1 << bit):
            reasons.append(label)
    return ", ".join(reasons) if reasons else f"flags={flags}"


def derive_throttle_hint(snapshot: dict[str, object]) -> str | None:
    flags = snapshot.get("cpu_perf_limit_flags")
    cpu_perf = snapshot.get("cpu_perf_percent")
    cpu_limit = snapshot.get("cpu_perf_limit_percent")
    if isinstance(flags, int) and flags != 0:
        return f"cpu limited: {snapshot.get('cpu_limit_reason')}"
    if isinstance(cpu_perf, (int, float)) and isinstance(cpu_limit, (int, float)) and cpu_perf < 80 and cpu_limit < 100:
        return "cpu performance below limit"
    if snapshot.get("gpu_temp_c") is not None and snapshot.get("gpu_power_w") is not None:
        return "monitor gpu clocks/power"
    return None


def sample_hardware_monitor_snapshot() -> dict[str, object] | None:
    for namespace, provider in [
        (r"root\LibreHardwareMonitor", "LibreHardwareMonitor"),
        (r"root\OpenHardwareMonitor", "OpenHardwareMonitor"),
    ]:
        rows = _query_hardware_monitor(namespace)
        if rows:
            parsed = _parse_hardware_monitor_rows(rows)
            parsed["provider"] = provider
            return parsed
    return None


def _query_hardware_monitor(namespace: str) -> list[dict[str, str]]:
    script = (
        f"Get-CimInstance -Namespace {namespace} -ClassName Sensor -ErrorAction SilentlyContinue | "
        "Select-Object Name,SensorType,Value,Identifier | ConvertTo-Csv -NoTypeInformation"
    )
    try:
        output = run_powershell(script)
    except Exception:
        return []
    if not output:
        return []
    return list(csv.DictReader(io.StringIO(output)))


def _parse_hardware_monitor_rows(rows: list[dict[str, str]]) -> dict[str, object]:
    parsed = {
        "gpu_core_mhz": None,
        "gpu_mem_mhz": None,
        "gpu_temp_c": None,
        "gpu_power_w": None,
    }
    for row in rows:
        name = (row.get("Name") or "").lower()
        sensor_type = (row.get("SensorType") or "").lower()
        identifier = (row.get("Identifier") or "").lower()
        try:
            value = float(row.get("Value") or 0.0)
        except ValueError:
            continue

        is_gpu = "gpu" in name or "/gpu/" in identifier
        if not is_gpu:
            continue
        if sensor_type == "clock":
            if "memory" in name or "memory" in identifier:
                parsed["gpu_mem_mhz"] = round(value, 2)
            elif "core" in name or "gpu" in name:
                parsed["gpu_core_mhz"] = round(value, 2)
        elif sensor_type == "temperature":
            if parsed["gpu_temp_c"] is None or value > parsed["gpu_temp_c"]:
                parsed["gpu_temp_c"] = round(value, 2)
        elif sensor_type == "power":
            parsed["gpu_power_w"] = round(value, 2)
    return parsed
