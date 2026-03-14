from __future__ import annotations

import argparse
import time
from dataclasses import asdict
from pathlib import Path

from .dashboard import export_dashboard_snapshot, run_dashboard
from .gpu_tracer import format_trace_report, trace_gpu_processes, watch_gpu_processes
from .gui import launch_gui
from .opencl_probe import probe_opencl
from .power import correlate_power
from .trace_capture import DEFAULT_PROFILES, TraceCaptureManager
from .uma import inspect_uma
from .web_server import run_web_server


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="amd-apu-toolkit")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("inspect-uma", help="Inspect AMD APU shared-memory pressure.")

    power_parser = subparsers.add_parser("correlate-power", help="Sample CPU/GPU/memory counters.")
    power_parser.add_argument("--duration", type=int, default=10, help="Sampling duration in seconds.")
    power_parser.add_argument("--interval", type=float, default=1.0, help="Sampling interval in seconds.")
    power_parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output"),
        help="Directory for CSV traces.",
    )

    opencl_parser = subparsers.add_parser("probe-opencl", help="Inspect AMD OpenCL runtime.")
    opencl_parser.add_argument("--iterations", type=int, default=5, help="How many clinfo timing runs to average.")

    dashboard_parser = subparsers.add_parser("dashboard", help="Open a live terminal dashboard.")
    dashboard_parser.add_argument("--refresh", type=float, default=2.0, help="Refresh interval in seconds.")
    dashboard_parser.add_argument(
        "--record-path",
        type=Path,
        default=None,
        help="Optional CSV path for recording live dashboard samples.",
    )

    snapshot_parser = subparsers.add_parser("snapshot-dashboard", help="Export a PNG snapshot of the dashboard.")
    snapshot_parser.add_argument(
        "--output",
        type=Path,
        default=Path("output/dashboard_snapshot.png"),
        help="PNG output path.",
    )

    trace_parser = subparsers.add_parser("trace-gpu", help="Show top GPU-consuming processes.")
    trace_parser.add_argument("--limit", type=int, default=10, help="How many processes to display.")
    trace_parser.add_argument("--include-idle", action="store_true", help="Include zero-utilization processes.")
    trace_parser.add_argument("--watch", action="store_true", help="Refresh continuously.")
    trace_parser.add_argument("--interval", type=float, default=1.5, help="Refresh interval for watch mode.")

    gui_parser = subparsers.add_parser("gui", help="Open the desktop GUI with live charts.")
    gui_parser.add_argument("--refresh", type=float, default=2.0, help="Refresh interval in seconds.")
    gui_parser.add_argument(
        "--record-path",
        type=Path,
        default=Path("output/gui_live_trace.csv"),
        help="CSV path used when recording is enabled from the GUI.",
    )

    web_parser = subparsers.add_parser("serve-web", help="Serve the browser dashboard locally.")
    web_parser.add_argument("--host", default="127.0.0.1", help="Bind host.")
    web_parser.add_argument("--port", type=int, default=8765, help="Bind port.")
    web_parser.add_argument("--refresh", type=float, default=2.0, help="WebSocket refresh interval in seconds.")

    trace_capture_parser = subparsers.add_parser("capture-trace", help="Capture a short WPR ETW trace.")
    trace_capture_parser.add_argument(
        "--duration",
        type=int,
        default=15,
        help="Capture duration in seconds.",
    )
    trace_capture_parser.add_argument(
        "--profiles",
        nargs="+",
        default=DEFAULT_PROFILES,
        help="WPR profiles to include, e.g. CPU GPU Video.",
    )

    subparsers.add_parser("trace-preflight", help="Check whether ETW trace capture is ready on this machine.")

    return parser


def _print_mapping(title: str, mapping: dict[str, object]) -> None:
    print(title)
    for key, value in mapping.items():
        print(f"  {key}: {value}")


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "inspect-uma":
        result = inspect_uma()
        _print_mapping("UMA Inspector", asdict(result))
    elif args.command == "correlate-power":
        result = correlate_power(args.duration, args.interval, args.output_dir)
        _print_mapping("Power Correlator", asdict(result))
    elif args.command == "probe-opencl":
        result = probe_opencl(args.iterations)
        _print_mapping("OpenCL Probe", asdict(result))
    elif args.command == "dashboard":
        run_dashboard(args.refresh, args.record_path)
    elif args.command == "snapshot-dashboard":
        path = export_dashboard_snapshot(args.output)
        print(path)
    elif args.command == "gui":
        launch_gui(args.refresh, args.record_path)
    elif args.command == "trace-gpu":
        if args.watch:
            try:
                watch_gpu_processes(limit=args.limit, interval=args.interval, include_idle=args.include_idle)
            except KeyboardInterrupt:
                print(f"\nStopped at {time.strftime('%Y-%m-%d %H:%M:%S')}")
        else:
            results = trace_gpu_processes(limit=args.limit, include_idle=args.include_idle)
            print(format_trace_report(results))
    elif args.command == "serve-web":
        run_web_server(args.host, args.port, args.refresh)
    elif args.command == "capture-trace":
        manager = TraceCaptureManager()
        result = manager.capture_for_duration(profiles=args.profiles, duration_sec=args.duration)
        _print_mapping("Trace Capture", result)
    elif args.command == "trace-preflight":
        manager = TraceCaptureManager()
        _print_mapping("Trace Preflight", manager.status())


if __name__ == "__main__":
    main()
