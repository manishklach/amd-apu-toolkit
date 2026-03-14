# AMD APU Toolkit

Windows-first telemetry, tracing, and dashboards for AMD APU laptops and desktops.

This project targets the practical gap between Task Manager and heavyweight vendor tooling. It collects live CPU, GPU, memory, and OpenCL signals from a Windows AMD APU system and exposes them through:

- a terminal dashboard
- a native desktop GUI
- a browser dashboard
- CLI probes and CSV exporters

## Screenshots

### Browser dashboard

![Browser dashboard](docs/screenshots/browser-dashboard.png)

### Desktop GUI chart export

![Desktop GUI chart export](docs/screenshots/gui-chart.png)

### Terminal dashboard snapshot

![Terminal dashboard snapshot](docs/screenshots/terminal-dashboard.png)

## What V1 includes

- `inspect-uma`: rates shared CPU/GPU memory pressure on an AMD APU
- `correlate-power`: samples CPU, GPU, and memory counters into CSV traces
- `probe-opencl`: inspects the local OpenCL runtime and captures a quick baseline
- `dashboard`: live terminal dashboard with optional CSV recording
- `snapshot-dashboard`: exports a terminal dashboard PNG
- `gui`: desktop dashboard with live charts and export support
- `trace-gpu`: top GPU-consuming processes, sorted by descending utilization
- `serve-web`: local realtime browser dashboard with GPU Focus, CPU Focus, RAM, GPU/CPU, and Overview views

## Why this exists

Integrated AMD systems behave differently from discrete GPU workstations:

- CPU and GPU share memory bandwidth
- desktop compositing and browser GPU processes can distort "real" load
- stutter often comes from scheduling or memory pressure, not raw utilization
- Windows exposes useful counters, but not in one coherent view

This toolkit consolidates those signals into one place and keeps the collection path simple enough to run on a normal Windows machine.

## Install

Requirements:

- Windows 10 or Windows 11
- Python 3.11+
- PowerShell
- `clinfo` optional, but recommended for `probe-opencl`

```powershell
git clone https://github.com/manishklach/amd-apu-toolkit.git
cd amd-apu-toolkit
python -m pip install -e .
```

## Quick start

```powershell
amd-apu-toolkit inspect-uma
amd-apu-toolkit correlate-power --duration 10 --interval 1
amd-apu-toolkit probe-opencl --iterations 5
amd-apu-toolkit dashboard --refresh 2
amd-apu-toolkit dashboard --refresh 2 --record-path output/live_trace.csv
amd-apu-toolkit snapshot-dashboard --output output/dashboard_snapshot.png
amd-apu-toolkit gui --refresh 2
amd-apu-toolkit trace-gpu --limit 12
amd-apu-toolkit trace-gpu --watch --interval 1 --limit 12
amd-apu-toolkit serve-web --host 127.0.0.1 --port 8765 --refresh 2
```

Open the browser dashboard at [http://127.0.0.1:8765](http://127.0.0.1:8765).

## Browser dashboard

The browser dashboard is the main V1 experience. It includes:

- `GPU Focus`: engine activity, GPU process ranking, shared and dedicated memory, runtime deltas
- `CPU Focus`: queue length, context switches, page faults, interrupt and DPC activity, top CPU processes
- `GPU / CPU`: fixed-scale utilization trend view
- `RAM`: system RAM and GPU memory with separate axes
- `Overview`: UMA verdict, alerts, OpenCL runtime information, and top GPU activity

The browser UI uses Chart.js and a local FastAPI + WebSocket backend. No cloud service is involved.

## Desktop GUI

The native desktop GUI includes:

- compact and high-DPI-aware layout
- full-screen chart views
- GPU Focus, RAM, GPU/CPU, and Overview views
- live top GPU processes
- alert thresholds saved to `output/gui_settings.json`
- chart export to `output/gui_chart_snapshot.png`
- optional CSV recording from the app

## CLI tools

### `inspect-uma`

Scores current APU memory pressure and returns a quick verdict for mixed CPU/GPU workloads.

```powershell
amd-apu-toolkit inspect-uma
```

### `correlate-power`

Samples CPU, GPU, and memory counters over time and writes a CSV trace.

```powershell
amd-apu-toolkit correlate-power --duration 30 --interval 1
```

### `probe-opencl`

Reports OpenCL device details and times repeated `clinfo` invocations as a rough baseline.

```powershell
amd-apu-toolkit probe-opencl --iterations 5
```

### `trace-gpu`

Ranks GPU-consuming processes by total utilization and supports watch mode.

```powershell
amd-apu-toolkit trace-gpu --limit 10
amd-apu-toolkit trace-gpu --watch --interval 1 --limit 10
```

## Build a Windows EXE

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_windows_exe.ps1
```

The generated executable is written under `dist\amd-apu-monitor`.

## Data sources

This toolkit primarily uses:

- Windows performance counters
- PowerShell counter enumeration and sampling
- process metadata from Windows
- local OpenCL runtime information

It does not require ROCm.

## Current limitations

- GPU process attribution is process-level, not instruction-level or true per-thread GPU time
- some Windows counter sets vary across driver versions and hardware generations
- AMD clocks, power draw, thermals, and fan speeds are not exposed yet through a vendor-specific API
- browser charts depend on a locally running Python backend

## Roadmap

- ETW capture integration for CPU hotspot traces
- AMD-specific clocks and thermal telemetry if a stable API path is added
- richer export flows and time-range analysis
- optional packaged browser dashboard build for offline distribution

## License

MIT. See [LICENSE](LICENSE).
