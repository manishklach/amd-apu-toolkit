from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from .cpu_tracer import compute_risk_score, sample_cpu_latency_metrics, sample_cpu_processes, sample_power_battery_metrics
from .gpu_tracer import sample_gpu_engine_running_times, sample_gpu_engines, trace_gpu_processes
from .opencl_probe import probe_opencl
from .power import build_counter_paths, collect_power_sample
from .sensors import sample_sensor_snapshot
from .uma import inspect_uma


class SnapshotCollector:
    def __init__(self) -> None:
        self.counter_paths = build_counter_paths()
        self.opencl_result = probe_opencl(iterations=1)
        self.last_engine_running_times: dict[str, float] = {}

    def collect(self) -> dict[str, object]:
        uma_snapshot = inspect_uma()
        power_sample = collect_power_sample(self.counter_paths)
        engine_sample = sample_gpu_engines(include_idle=False)
        running_times = sample_gpu_engine_running_times()
        runtime_deltas: dict[str, float] = {}
        if self.last_engine_running_times:
            for key, value in running_times.items():
                previous = self.last_engine_running_times.get(key, value)
                delta_ms = max(0.0, (value - previous) / 10000.0)
                if delta_ms > 0:
                    runtime_deltas[key] = round(delta_ms, 2)
        self.last_engine_running_times = running_times

        processes = trace_gpu_processes(limit=12, include_idle=False)
        cpu_processes = sample_cpu_processes(limit=15)
        cpu_latency = sample_cpu_latency_metrics()
        power_state = sample_power_battery_metrics()
        sensors = sample_sensor_snapshot()
        top_engine = next(iter(engine_sample.engines.items()), ("idle", 0.0))
        risk = compute_risk_score(cpu_latency, power_sample, uma_snapshot.pressure_score, float(top_engine[1]))

        return {
            "timestamp": power_sample["timestamp"],
            "uma": asdict(uma_snapshot),
            "power": power_sample,
            "cpu": {
                "latency": cpu_latency,
                "processes": [asdict(item) for item in cpu_processes],
            },
            "system": {
                "power": power_state,
                "risk": risk,
                "sensors": sensors,
            },
            "gpu": {
                "top_engine": {"name": top_engine[0], "util_percent": top_engine[1]},
                "engines": engine_sample.engines,
                "running_time_deltas_ms": runtime_deltas,
                "processes": [
                    {
                        "pid": item.pid,
                        "name": item.name,
                        "command_line": item.command_line,
                        "total_util_percent": item.total_util_percent,
                        "engines": item.engines,
                        "dedicated_mb": item.dedicated_mb,
                        "shared_mb": item.shared_mb,
                        "local_mb": item.local_mb,
                        "non_local_mb": item.non_local_mb,
                        "is_system": item.is_system,
                    }
                    for item in processes
                ],
            },
            "opencl": asdict(self.opencl_result),
        }


def frontend_root() -> Path:
    return Path(__file__).with_name("web")
