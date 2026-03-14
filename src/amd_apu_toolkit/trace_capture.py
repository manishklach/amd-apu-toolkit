from __future__ import annotations

import json
import shutil
import subprocess
import threading
import ctypes
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path


DEFAULT_PROFILES = ["CPU", "GPU", "Video"]
AVAILABLE_PROFILES = [
    "GeneralProfile",
    "CPU",
    "GPU",
    "Video",
    "DiskIO",
    "FileIO",
    "Power",
    "Thermal",
    "DesktopComposition",
]


def _utc_now() -> datetime:
    return datetime.utcnow()


def _iso(dt: datetime | None) -> str | None:
    return None if dt is None else dt.replace(microsecond=0).isoformat() + "Z"


@dataclass
class TraceCaptureState:
    available: bool
    wpr_path: str | None
    tracerpt_path: str | None
    state: str = "idle"
    current_profiles: list[str] = field(default_factory=list)
    requested_duration_sec: int | None = None
    started_at: str | None = None
    output_path: str | None = None
    last_trace_path: str | None = None
    last_started_at: str | None = None
    last_stopped_at: str | None = None
    last_profiles: list[str] = field(default_factory=list)
    last_stop_reason: str | None = None
    last_error: str | None = None
    last_summary_path: str | None = None
    preflight: dict[str, object] = field(default_factory=dict)
    available_profiles: list[str] = field(default_factory=lambda: AVAILABLE_PROFILES.copy())
    analysis_hint: str | None = None


class TraceCaptureManager:
    def __init__(self, output_dir: Path | None = None) -> None:
        self.output_dir = (output_dir or Path("output") / "traces").resolve()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.wpr_path = shutil.which("wpr")
        self.tracerpt_path = shutil.which("tracerpt")
        self._lock = threading.Lock()
        self._timer: threading.Timer | None = None
        self._state = TraceCaptureState(
            available=self.wpr_path is not None,
            wpr_path=self.wpr_path,
            tracerpt_path=self.tracerpt_path,
        )
        self._state.preflight = self._build_preflight()

    def status(self) -> dict[str, object]:
        with self._lock:
            self._state.preflight = self._build_preflight()
            return dict(self._state.__dict__)

    def start_capture(self, profiles: list[str] | None = None, duration_sec: int = 15) -> dict[str, object]:
        chosen_profiles = [profile for profile in (profiles or DEFAULT_PROFILES) if profile in AVAILABLE_PROFILES]
        if not chosen_profiles:
            chosen_profiles = DEFAULT_PROFILES.copy()
        with self._lock:
            if not self._state.available:
                self._state.last_error = "wpr.exe not found on this machine."
                return dict(self._state.__dict__)
            if self._state.state == "running":
                self._state.last_error = "Trace capture is already running."
                return dict(self._state.__dict__)

            timestamp = _utc_now().strftime("%Y%m%d_%H%M%S")
            output_path = self.output_dir / f"wpr_trace_{timestamp}.etl"
            started_at = _utc_now()
            command = [self.wpr_path or "wpr", "-start"]
            if chosen_profiles:
                command.append(chosen_profiles[0])
                for profile in chosen_profiles[1:]:
                    command.extend(["-start", profile])
            command.append("-filemode")

            try:
                completed = subprocess.run(command, check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError as exc:
                error_text = self._decorate_error((exc.stderr or exc.stdout or str(exc)).strip())
                self._state.last_error = error_text or "Failed to start WPR capture."
                self._state.state = "error"
                return dict(self._state.__dict__)

            self._state.state = "running"
            self._state.current_profiles = chosen_profiles
            self._state.requested_duration_sec = max(1, int(duration_sec))
            self._state.started_at = _iso(started_at)
            self._state.output_path = str(output_path)
            self._state.last_error = None
            self._state.analysis_hint = (
                f"Open {output_path.name} in Windows Performance Analyzer and inspect GPU, CPU Usage, "
                "Video Glitches, and Present/Composition activity."
            )
            self._write_metadata(
                output_path.with_suffix(".json"),
                {
                    "state": "running",
                    "started_at": self._state.started_at,
                    "profiles": chosen_profiles,
                    "duration_sec": self._state.requested_duration_sec,
                    "wpr_stdout": (completed.stdout or "").strip(),
                },
            )
            if self._timer is not None:
                self._timer.cancel()
            self._timer = threading.Timer(self._state.requested_duration_sec, self.stop_capture, kwargs={"reason": "timer"})
            self._timer.daemon = True
            self._timer.start()
            return dict(self._state.__dict__)

    def stop_capture(self, reason: str = "manual") -> dict[str, object]:
        with self._lock:
            if self._state.state != "running" or not self._state.output_path:
                return dict(self._state.__dict__)
            output_path = Path(self._state.output_path)
            started_at = self._state.started_at
            profiles = self._state.current_profiles.copy()
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None

            try:
                completed = subprocess.run(
                    [self.wpr_path or "wpr", "-stop", str(output_path)],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                self._state.state = "idle"
                self._state.last_trace_path = str(output_path)
                self._state.last_started_at = started_at
                self._state.last_stopped_at = _iso(_utc_now())
                self._state.last_profiles = profiles
                self._state.last_stop_reason = reason
                self._state.last_error = None
                self._state.last_summary_path = self._generate_summary(output_path)
                self._state.current_profiles = []
                self._state.requested_duration_sec = None
                self._state.started_at = None
                self._state.output_path = None
                self._write_metadata(
                    output_path.with_suffix(".json"),
                    {
                        "state": "completed",
                        "started_at": started_at,
                        "stopped_at": self._state.last_stopped_at,
                        "profiles": profiles,
                        "stop_reason": reason,
                        "trace_path": str(output_path),
                        "summary_path": self._state.last_summary_path,
                        "wpr_stdout": (completed.stdout or "").strip(),
                        "analysis_hint": self._state.analysis_hint,
                    },
                )
            except subprocess.CalledProcessError as exc:
                error_text = self._decorate_error((exc.stderr or exc.stdout or str(exc)).strip())
                self._state.state = "error"
                self._state.last_error = error_text or "Failed to stop WPR capture."
            return dict(self._state.__dict__)

    def capture_for_duration(self, profiles: list[str] | None = None, duration_sec: int = 15) -> dict[str, object]:
        started = self.start_capture(profiles=profiles, duration_sec=duration_sec)
        if started.get("state") != "running":
            return started
        completed = self._wait_for_completion(max(2, duration_sec + 10))
        return completed

    def _wait_for_completion(self, timeout_sec: int) -> dict[str, object]:
        end = _utc_now().timestamp() + timeout_sec
        while _utc_now().timestamp() < end:
            with self._lock:
                if self._state.state != "running":
                    return dict(self._state.__dict__)
            threading.Event().wait(0.25)
        return self.stop_capture(reason="timeout")

    @staticmethod
    def _write_metadata(path: Path, payload: dict[str, object]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _generate_summary(self, trace_path: Path) -> str | None:
        if not self.tracerpt_path or not trace_path.exists():
            return None
        summary_path = trace_path.with_name(trace_path.stem + "_summary.txt")
        report_path = trace_path.with_name(trace_path.stem + "_report.xml")
        try:
            subprocess.run(
                [
                    self.tracerpt_path,
                    str(trace_path),
                    "-summary",
                    str(summary_path),
                    "-report",
                    str(report_path),
                    "-y",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            return str(summary_path)
        except subprocess.CalledProcessError:
            return None

    @staticmethod
    def _is_admin() -> bool:
        try:
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            return False

    def _build_preflight(self) -> dict[str, object]:
        is_admin = self._is_admin()
        ready = self.wpr_path is not None and is_admin
        reason = "ready"
        if self.wpr_path is None:
            reason = "wpr.exe not found"
        elif not is_admin:
            reason = "WPR capture likely requires an elevated shell on this machine"
        return {
            "ready": ready,
            "is_admin": is_admin,
            "wpr_available": self.wpr_path is not None,
            "tracerpt_available": self.tracerpt_path is not None,
            "reason": reason,
        }

    @staticmethod
    def _decorate_error(error_text: str) -> str:
        if "0xc5585011" in error_text:
            return (
                f"{error_text}\nHint: WPR start was blocked. Run the dashboard or CLI from an elevated shell "
                "or loosen local performance tracing policy."
            )
        if "access is denied" in error_text.lower():
            return f"{error_text}\nHint: tracing requires elevated privileges on this machine."
        return error_text
