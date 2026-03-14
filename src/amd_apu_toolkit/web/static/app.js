const views = document.querySelectorAll(".view");
const navButtons = document.querySelectorAll(".nav");

const history = {
  labels: [],
  cpu: [],
  gpu: [],
  ram: [],
  shared: [],
  dedicated: [],
  engine3d: [],
  engineCompute: [],
  engineCopy: [],
  engineVideoDecode: [],
  engineVideoEncode: [],
  engineVideoProc: [],
  cpuQueue: [],
  cpuRunnable: [],
  cpuContextK: [],
  cpuFaultsK: [],
  cpuHardFaultsK: [],
  cpuInterrupt: [],
  cpuDpc: [],
  cpuPagesIn: [],
  diskQueue: [],
  pagefile: [],
  commitPct: [],
  risk: [],
  battery: [],
  remainingMin: [],
  cpuClockMhz: [],
  cpuPerf: [],
  gpuCoreMhz: [],
  gpuTempC: [],
  gpuPowerW: [],
};

const MAX_POINTS = 40;

function pushPoint(array, value, max = MAX_POINTS) {
  array.push(value ?? 0);
  while (array.length > max) array.shift();
}

function pushLabel(value, max = MAX_POINTS) {
  history.labels.push(value);
  while (history.labels.length > max) history.labels.shift();
}

function fmt(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${Number(value).toFixed(2)}${suffix}`;
}

function textOr(value, fallback = "n/a") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    elements: { point: { radius: 0, hoverRadius: 4 } },
    plugins: {
      legend: { labels: { color: "#ebf2f8" } },
      tooltip: {
        backgroundColor: "#121d2a",
        titleColor: "#ebf2f8",
        bodyColor: "#ebf2f8",
        borderColor: "#263547",
        borderWidth: 1,
      },
    },
  };
}

function buildSingleAxisChart(canvasId, datasets, yTitle, max = null) {
  return new Chart(document.getElementById(canvasId), {
    type: "line",
    data: { labels: [], datasets },
    options: {
      ...chartDefaults(),
      scales: {
        x: {
          ticks: { color: "#93a8ba", maxTicksLimit: 8 },
          grid: { color: "#263547" },
        },
        y: {
          beginAtZero: true,
          ...(max !== null ? { max } : { grace: "10%" }),
          ticks: { color: "#93a8ba" },
          title: { display: true, text: yTitle, color: "#ebf2f8" },
          grid: { color: "#263547" },
        },
      },
    },
  });
}

function sumEngineValues(engines, matcher) {
  return Object.entries(engines || {})
    .filter(([name]) => matcher(name.toLowerCase()))
    .reduce((sum, [, value]) => sum + Number(value || 0), 0);
}

const gpuFocusChart = buildSingleAxisChart(
  "gpuFocusChart",
  [
    { label: "3D", data: [], borderColor: "#ff7b72", borderWidth: 2.3, tension: 0.25 },
    { label: "Compute", data: [], borderColor: "#58a6ff", borderWidth: 2.3, tension: 0.25 },
    { label: "Copy", data: [], borderColor: "#d29922", borderWidth: 2.3, tension: 0.25 },
    { label: "Decode", data: [], borderColor: "#3fb950", borderWidth: 2.3, tension: 0.25 },
    { label: "Encode", data: [], borderColor: "#c678dd", borderWidth: 2.3, tension: 0.25 },
    { label: "Video Proc", data: [], borderColor: "#56b6c2", borderWidth: 2.3, tension: 0.25 },
  ],
  "Percent",
  100,
);

const gpuCpuChart = buildSingleAxisChart(
  "gpuCpuChart",
  [
    { label: "CPU", data: [], borderColor: "#58a6ff", borderWidth: 2.6, tension: 0.25 },
    { label: "GPU", data: [], borderColor: "#ff7b72", borderWidth: 2.6, tension: 0.25 },
    { label: "Risk", data: [], borderColor: "#d29922", borderWidth: 2.0, borderDash: [6, 4], tension: 0.25 },
  ],
  "Percent",
  100,
);

const cpuLatencyChart = new Chart(document.getElementById("cpuLatencyChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      { label: "Queue", data: [], borderColor: "#ff7b72", borderWidth: 2.3, tension: 0.25, yAxisID: "yQueue" },
      { label: "Runnable/Core", data: [], borderColor: "#d29922", borderWidth: 2.0, tension: 0.25, yAxisID: "yQueue" },
      { label: "Interrupt %", data: [], borderColor: "#3fb950", borderWidth: 2.3, tension: 0.25, yAxisID: "yPercent" },
      { label: "DPC %", data: [], borderColor: "#58a6ff", borderWidth: 2.0, borderDash: [6, 4], tension: 0.25, yAxisID: "yPercent" },
    ],
  },
  options: {
    ...chartDefaults(),
    scales: {
      x: {
        ticks: { color: "#93a8ba", maxTicksLimit: 6 },
        grid: { color: "#263547" },
      },
      yQueue: {
        type: "linear",
        position: "left",
        beginAtZero: true,
        grace: "15%",
        ticks: { color: "#93a8ba" },
        title: { display: true, text: "Queue / Runnable", color: "#ebf2f8" },
        grid: { color: "#263547" },
      },
      yPercent: {
        type: "linear",
        position: "right",
        beginAtZero: true,
        max: 100,
        ticks: { color: "#93a8ba" },
        title: { display: true, text: "Percent", color: "#ebf2f8" },
        grid: { drawOnChartArea: false, color: "#263547" },
      },
    },
  },
});

const cpuActivityChart = new Chart(document.getElementById("cpuActivityChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      { label: "Ctx K/s", data: [], borderColor: "#58a6ff", borderWidth: 2.3, tension: 0.25, yAxisID: "yLeft" },
      { label: "Faults K/s", data: [], borderColor: "#d29922", borderWidth: 2.3, tension: 0.25, yAxisID: "yLeft" },
      { label: "Hard Faults K/s", data: [], borderColor: "#ff7b72", borderWidth: 2.3, tension: 0.25, yAxisID: "yLeft" },
      { label: "Pages In/s", data: [], borderColor: "#ff9b85", borderWidth: 2.0, borderDash: [6, 4], tension: 0.25, yAxisID: "yRight" },
    ],
  },
  options: {
    ...chartDefaults(),
    scales: {
      x: {
        ticks: { color: "#93a8ba", maxTicksLimit: 6 },
        grid: { color: "#263547" },
      },
      yLeft: {
        type: "linear",
        position: "left",
        beginAtZero: true,
        grace: "15%",
        ticks: { color: "#93a8ba" },
        title: { display: true, text: "Fault / Ctx (K/s)", color: "#ebf2f8" },
        grid: { color: "#263547" },
      },
      yRight: {
        type: "linear",
        position: "right",
        beginAtZero: true,
        grace: "15%",
        ticks: { color: "#93a8ba" },
        title: { display: true, text: "Pages In/s", color: "#ebf2f8" },
        grid: { drawOnChartArea: false, color: "#263547" },
      },
    },
  },
});

const ramChart = new Chart(document.getElementById("ramChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      { label: "Free RAM GB", data: [], borderColor: "#3fb950", borderWidth: 2.6, tension: 0.25, yAxisID: "yRam" },
      { label: "GPU Shared MB", data: [], borderColor: "#d29922", borderWidth: 2.4, tension: 0.25, yAxisID: "yGpu" },
      { label: "GPU Dedicated MB", data: [], borderColor: "#58a6ff", borderWidth: 2.0, borderDash: [6, 4], tension: 0.25, yAxisID: "yGpu" },
      { label: "Commit %", data: [], borderColor: "#ff7b72", borderWidth: 2.0, borderDash: [3, 3], tension: 0.25, yAxisID: "yCommit" },
    ],
  },
  options: {
    ...chartDefaults(),
    scales: {
      x: {
        ticks: { color: "#93a8ba", maxTicksLimit: 8 },
        grid: { color: "#263547" },
      },
      yRam: {
        type: "linear",
        position: "left",
        beginAtZero: true,
        grace: "10%",
        ticks: { color: "#93a8ba" },
        title: { display: true, text: "System RAM (GB)", color: "#ebf2f8" },
        grid: { color: "#263547" },
      },
      yGpu: {
        type: "linear",
        position: "right",
        beginAtZero: true,
        grace: "10%",
        ticks: { color: "#93a8ba" },
        title: { display: true, text: "GPU Memory (MB)", color: "#ebf2f8" },
        grid: { drawOnChartArea: false, color: "#263547" },
      },
      yCommit: {
        type: "linear",
        position: "right",
        beginAtZero: true,
        max: 100,
        display: false,
      },
    },
  },
});

const powerChart = new Chart(document.getElementById("powerChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      { label: "Battery %", data: [], borderColor: "#3fb950", borderWidth: 2.4, tension: 0.25, yAxisID: "yBattery" },
      { label: "Remaining min", data: [], borderColor: "#58a6ff", borderWidth: 2.0, borderDash: [6, 4], tension: 0.25, yAxisID: "yRemain" },
      { label: "Risk", data: [], borderColor: "#ff7b72", borderWidth: 2.0, tension: 0.25, yAxisID: "yBattery" },
      { label: "CPU MHz", data: [], borderColor: "#d29922", borderWidth: 2.0, borderDash: [3, 3], tension: 0.25, yAxisID: "yRemain" },
    ],
  },
  options: {
    ...chartDefaults(),
    scales: {
      x: {
        ticks: { color: "#93a8ba", maxTicksLimit: 6 },
        grid: { color: "#263547" },
      },
      yBattery: {
        type: "linear",
        position: "left",
        beginAtZero: true,
        max: 100,
        ticks: { color: "#93a8ba" },
        title: { display: true, text: "Battery / Risk", color: "#ebf2f8" },
        grid: { color: "#263547" },
      },
      yRemain: {
        type: "linear",
        position: "right",
        beginAtZero: true,
        grace: "10%",
        ticks: { color: "#93a8ba" },
        title: { display: true, text: "Minutes", color: "#ebf2f8" },
        grid: { drawOnChartArea: false, color: "#263547" },
      },
    },
  },
});

const sensorChart = new Chart(document.getElementById("sensorChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      { label: "CPU MHz", data: [], borderColor: "#58a6ff", borderWidth: 2.4, tension: 0.25, yAxisID: "yClock" },
      { label: "CPU Perf %", data: [], borderColor: "#3fb950", borderWidth: 2.0, tension: 0.25, yAxisID: "yPercent" },
      { label: "GPU Core MHz", data: [], borderColor: "#d29922", borderWidth: 2.0, borderDash: [6, 4], tension: 0.25, yAxisID: "yClock" },
      { label: "GPU Temp C", data: [], borderColor: "#ff7b72", borderWidth: 2.0, tension: 0.25, yAxisID: "yPercent" },
      { label: "GPU Power W", data: [], borderColor: "#c678dd", borderWidth: 2.0, borderDash: [3, 3], tension: 0.25, yAxisID: "yPercent" },
    ],
  },
  options: {
    ...chartDefaults(),
    scales: {
      x: {
        ticks: { color: "#93a8ba", maxTicksLimit: 6 },
        grid: { color: "#263547" },
      },
      yClock: {
        type: "linear",
        position: "left",
        beginAtZero: true,
        grace: "10%",
        ticks: { color: "#93a8ba" },
        title: { display: true, text: "MHz", color: "#ebf2f8" },
        grid: { color: "#263547" },
      },
      yPercent: {
        type: "linear",
        position: "right",
        beginAtZero: true,
        grace: "10%",
        ticks: { color: "#93a8ba" },
        title: { display: true, text: "Perf / Temp / Power", color: "#ebf2f8" },
        grid: { drawOnChartArea: false, color: "#263547" },
      },
    },
  },
});

function refreshCharts() {
  gpuFocusChart.data.labels = [...history.labels];
  gpuFocusChart.data.datasets[0].data = [...history.engine3d];
  gpuFocusChart.data.datasets[1].data = [...history.engineCompute];
  gpuFocusChart.data.datasets[2].data = [...history.engineCopy];
  gpuFocusChart.data.datasets[3].data = [...history.engineVideoDecode];
  gpuFocusChart.data.datasets[4].data = [...history.engineVideoEncode];
  gpuFocusChart.data.datasets[5].data = [...history.engineVideoProc];
  gpuFocusChart.update("none");

  gpuCpuChart.data.labels = [...history.labels];
  gpuCpuChart.data.datasets[0].data = [...history.cpu];
  gpuCpuChart.data.datasets[1].data = [...history.gpu];
  gpuCpuChart.data.datasets[2].data = [...history.risk];
  gpuCpuChart.update("none");

  cpuLatencyChart.data.labels = [...history.labels];
  cpuLatencyChart.data.datasets[0].data = [...history.cpuQueue];
  cpuLatencyChart.data.datasets[1].data = [...history.cpuRunnable];
  cpuLatencyChart.data.datasets[2].data = [...history.cpuInterrupt];
  cpuLatencyChart.data.datasets[3].data = [...history.cpuDpc];
  cpuLatencyChart.update("none");

  cpuActivityChart.data.labels = [...history.labels];
  cpuActivityChart.data.datasets[0].data = [...history.cpuContextK];
  cpuActivityChart.data.datasets[1].data = [...history.cpuFaultsK];
  cpuActivityChart.data.datasets[2].data = [...history.cpuHardFaultsK];
  cpuActivityChart.data.datasets[3].data = [...history.cpuPagesIn];
  cpuActivityChart.update("none");

  ramChart.data.labels = [...history.labels];
  ramChart.data.datasets[0].data = [...history.ram];
  ramChart.data.datasets[1].data = [...history.shared];
  ramChart.data.datasets[2].data = [...history.dedicated];
  ramChart.data.datasets[3].data = [...history.commitPct];
  ramChart.update("none");

  powerChart.data.labels = [...history.labels];
  powerChart.data.datasets[0].data = [...history.battery];
  powerChart.data.datasets[1].data = [...history.remainingMin];
  powerChart.data.datasets[2].data = [...history.risk];
  powerChart.data.datasets[3].data = [...history.cpuClockMhz];
  powerChart.update("none");

  sensorChart.data.labels = [...history.labels];
  sensorChart.data.datasets[0].data = [...history.cpuClockMhz];
  sensorChart.data.datasets[1].data = [...history.cpuPerf];
  sensorChart.data.datasets[2].data = [...history.gpuCoreMhz];
  sensorChart.data.datasets[3].data = [...history.gpuTempC];
  sensorChart.data.datasets[4].data = [...history.gpuPowerW];
  sensorChart.update("none");
}

function renderGpuTable(targetId, processes) {
  const target = document.getElementById(targetId);
  target.innerHTML = "";
  processes.forEach((proc) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${fmt(proc.total_util_percent)}</td><td>${proc.pid}</td><td>${proc.name}</td><td>${fmt(proc.dedicated_mb, " MB")}</td><td>${fmt(proc.shared_mb, " MB")}</td>`;
    target.appendChild(row);
  });
}

function renderCpuTable(processes) {
  const target = document.getElementById("cpuProcesses");
  target.innerHTML = "";
  processes.forEach((proc) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${fmt(proc.cpu_util_percent)}</td><td>${proc.pid}</td><td>${proc.name}</td><td>${proc.thread_count}</td><td>${fmt(proc.working_set_private_mb)}</td>`;
    target.appendChild(row);
  });
}

function formatBattery(powerState) {
  if (!powerState?.has_battery) return "No battery";
  return `${fmt(powerState.battery_percent, "%")} ${textOr(powerState.battery_status)}`;
}

function formatRemainingMinutes(minutes) {
  if (minutes === null || minutes === undefined || Number(minutes) < 0) return "n/a";
  const total = Number(minutes);
  const hours = Math.floor(total / 60);
  const mins = Math.round(total % 60);
  if (hours <= 0) return `${mins} min`;
  return `${hours}h ${mins}m`;
}

function renderAlerts(snapshot) {
  const alerts = [];
  const topEngine = snapshot.gpu.top_engine;
  const cpuLatency = snapshot.cpu.latency;
  const risk = snapshot.system.risk;
  const powerState = snapshot.system.power;

  if (snapshot.uma.pressure_score >= 4) alerts.push("High shared-memory pressure");
  else if (snapshot.uma.pressure_score >= 2) alerts.push("Moderate shared-memory pressure");
  if (topEngine && topEngine.util_percent >= 40) alerts.push(`${topEngine.name} spike ${fmt(topEngine.util_percent, "%")}`);
  if (cpuLatency.hard_faults_per_sec >= 20) alerts.push(`Hard faults ${fmt(cpuLatency.hard_faults_per_sec, "/s")}`);
  if (cpuLatency.disk_queue_depth >= 2) alerts.push(`Disk queue ${fmt(cpuLatency.disk_queue_depth)}`);
  if (powerState?.has_battery && Number(powerState.battery_percent ?? 100) <= 20 && powerState.ac_online === false) {
    alerts.push("Battery low on DC");
  }
  if (risk.score >= 60) alerts.push(`High stutter risk ${risk.score}`);

  const runtimeEntries = Object.entries(snapshot.gpu.running_time_deltas_ms || {});
  if (runtimeEntries.length) {
    const [name, value] = runtimeEntries.sort((a, b) => b[1] - a[1])[0];
    if (value >= 100) alerts.push(`${name} runtime +${fmt(value, " ms")}`);
    document.getElementById("runtimeDelta").textContent = `${name} +${fmt(value, " ms")}`;
  } else {
    document.getElementById("runtimeDelta").textContent = "n/a";
  }
  const text = alerts.length ? alerts.join(" | ") : "No active alerts.";
  document.getElementById("gpuAlerts").textContent = text;
  document.getElementById("overviewAlerts").textContent = `${text}${risk.reasons?.length ? ` | causes: ${risk.reasons.join(", ")}` : ""}`;
}

function renderTraceState(trace) {
  const state = textOr(trace?.state, "n/a");
  const profiles = Array.isArray(trace?.current_profiles) && trace.current_profiles.length
    ? trace.current_profiles.join(", ")
    : (Array.isArray(trace?.last_profiles) && trace.last_profiles.length ? trace.last_profiles.join(", ") : "n/a");
  const preflight = trace?.preflight || {};
  const preflightText = preflight.ready
    ? "ready"
    : `${preflight.reason || "not ready"}${preflight.is_admin === false ? " | not elevated" : ""}`;
  document.getElementById("traceState").textContent = state;
  document.getElementById("traceProfiles").textContent = profiles;
  document.getElementById("traceOutput").textContent = textOr(trace?.output_path);
  document.getElementById("traceLastPath").textContent = textOr(trace?.last_trace_path);
  document.getElementById("traceSummaryPath").textContent = textOr(trace?.last_summary_path);
  document.getElementById("tracePreflight").textContent = preflightText;
  document.getElementById("traceHint").textContent = trace?.last_error
    ? trace.last_error
    : textOr(trace?.analysis_hint, "Capture CPU/GPU/Video ETW traces for WPA analysis.");
  document.getElementById("traceStartBtn").disabled = !trace?.available || state === "running" || preflight.ready === false;
  document.getElementById("traceStopBtn").disabled = state !== "running";
}

async function postTraceAction(endpoint, payload = undefined) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json();
  renderTraceState(data);
}

function updateSnapshot(snapshot) {
  const power = snapshot.power;
  const gpu = snapshot.gpu;
  const cpu = snapshot.cpu;
  const opencl = snapshot.opencl;
  const powerState = snapshot.system.power;
  const risk = snapshot.system.risk;
  const sensors = snapshot.system.sensors;
  const trace = snapshot.system.trace;
  const topEngine = gpu.top_engine || { name: "idle", util_percent: 0 };
  const decodeUtil = sumEngineValues(gpu.engines, (name) => name.includes("decode"));
  const encodeUtil = sumEngineValues(gpu.engines, (name) => name.includes("encode") || name.includes("codec"));
  const videoProcUtil = sumEngineValues(gpu.engines, (name) => name.includes("video") && !name.includes("decode") && !name.includes("encode") && !name.includes("codec"));
  const topMemoryProc = [...gpu.processes].sort((a, b) => (Number(b.dedicated_mb || 0) + Number(b.shared_mb || 0)) - (Number(a.dedicated_mb || 0) + Number(a.shared_mb || 0)))[0];
  const provider = textOr(sensors.provider, "n/a");
  const providerBadge = document.getElementById("providerBadge");

  document.getElementById("status").textContent = `Last sample: ${snapshot.timestamp}`;
  providerBadge.textContent = `Sensor provider: ${provider}`;
  providerBadge.classList.toggle("is-live", provider !== "windows-only" && provider !== "n/a");
  providerBadge.classList.toggle("is-limited", provider === "windows-only" || provider === "n/a");
  document.getElementById("gpuUtil").textContent = fmt(power.gpu_util_percent, "%");
  document.getElementById("topEngine").textContent = `${topEngine.name} ${fmt(topEngine.util_percent, "%")}`;
  document.getElementById("gpuDecode").textContent = fmt(decodeUtil, "%");
  document.getElementById("gpuEncodeCard").textContent = fmt(encodeUtil, "%");
  document.getElementById("gpuVideoProc").textContent = fmt(videoProcUtil, "%");
  document.getElementById("gpuEncode").textContent = fmt(encodeUtil, "%");
  document.getElementById("gpuVideoProcDetail").textContent = fmt(videoProcUtil, "%");
  document.getElementById("gpuTopMemory").textContent = topMemoryProc ? `${topMemoryProc.name} ${fmt(Number(topMemoryProc.dedicated_mb || 0) + Number(topMemoryProc.shared_mb || 0), " MB")}` : "n/a";
  document.getElementById("gpuProcCount").textContent = String(gpu.processes.length);
  document.getElementById("gpuSharedDetail").textContent = fmt(power.gpu_shared_mb, " MB");
  document.getElementById("gpuDedicatedDetail").textContent = fmt(power.gpu_dedicated_mb, " MB");
  document.getElementById("gpuCommittedDetail").textContent = fmt(power.gpu_total_committed_mb, " MB");

  document.getElementById("umaVerdict").textContent = snapshot.uma.verdict;
  document.getElementById("umaPressure").textContent = String(snapshot.uma.pressure_score);
  document.getElementById("cpuUtil").textContent = fmt(power.cpu_util_percent, "%");
  document.getElementById("freeRam").textContent = fmt(power.free_memory_gb, " GB");
  document.getElementById("overviewRisk").textContent = `${risk.score} (${risk.level})`;
  document.getElementById("overviewBattery").textContent = formatBattery(powerState);
  document.getElementById("sensorCpuClock").textContent = fmt(sensors.cpu_actual_mhz, " MHz");
  document.getElementById("sensorGpuClock").textContent = fmt(sensors.gpu_core_mhz, " MHz");
  document.getElementById("overviewPowerPlan").textContent = textOr(powerState.power_plan);
  document.getElementById("overviewRemaining").textContent = formatRemainingMinutes(powerState.battery_remaining_min);
  document.getElementById("overviewCommit").textContent = `${fmt(cpu.latency.committed_gb, " GB")} / ${fmt(cpu.latency.commit_limit_gb, " GB")}`;
  document.getElementById("overviewDiskQueue").textContent = fmt(cpu.latency.disk_queue_depth);
  document.getElementById("sensorProvider").textContent = textOr(sensors.provider);
  document.getElementById("sensorProviderCard").textContent = provider;
  document.getElementById("sensorCpuClockCard").textContent = fmt(sensors.cpu_actual_mhz, " MHz");
  document.getElementById("sensorCpuPerfCard").textContent = fmt(sensors.cpu_perf_percent, "%");
  document.getElementById("sensorGpuCoreCard").textContent = fmt(sensors.gpu_core_mhz, " MHz");
  document.getElementById("sensorGpuTempCard").textContent = fmt(sensors.gpu_temp_c, " C");
  document.getElementById("sensorThrottleCard").textContent = textOr(sensors.throttle_hint);
  document.getElementById("sensorCpuPerf").textContent = `${fmt(sensors.cpu_perf_percent, "%")} @ ${fmt(sensors.cpu_max_percent, "% max")}`;
  document.getElementById("sensorCpuLimit").textContent = `${fmt(sensors.cpu_perf_limit_percent, "%")} ${textOr(sensors.cpu_limit_reason)}`;
  document.getElementById("sensorGpuCore").textContent = fmt(sensors.gpu_core_mhz, " MHz");
  document.getElementById("sensorGpuMem").textContent = fmt(sensors.gpu_mem_mhz, " MHz");
  document.getElementById("sensorGpuTemp").textContent = fmt(sensors.gpu_temp_c, " C");
  document.getElementById("sensorGpuPower").textContent = fmt(sensors.gpu_power_w, " W");
  document.getElementById("sensorThrottle").textContent = textOr(sensors.throttle_hint);
  document.getElementById("sensorHint").textContent =
    provider === "windows-only" || provider === "n/a"
      ? "Install LibreHardwareMonitor or OpenHardwareMonitor and enable WMI for GPU sensors."
      : `Using ${provider} for extended GPU sensors.`;

  document.getElementById("cpuFocusUtil").textContent = fmt(power.cpu_util_percent, "%");
  document.getElementById("cpuRunnable").textContent = fmt(cpu.latency.runnable_threads_per_core);
  document.getElementById("cpuHardFaults").textContent = fmt(cpu.latency.hard_faults_per_sec);
  document.getElementById("cpuDiskQueue").textContent = fmt(cpu.latency.disk_queue_depth);
  document.getElementById("cpuCommitGb").textContent = `${fmt(cpu.latency.committed_gb, " GB")} / ${fmt(cpu.latency.commit_limit_gb, " GB")}`;
  document.getElementById("cpuCommitPct").textContent = fmt(cpu.latency.commit_in_use_percent, "%");
  document.getElementById("cpuCompression").textContent = fmt(cpu.latency.memory_compression_mb, " MB");
  document.getElementById("cpuPagefile").textContent = fmt(cpu.latency.pagefile_usage_percent, "%");
  document.getElementById("powerBattery").textContent = formatBattery(powerState);
  document.getElementById("powerPlan").textContent = textOr(powerState.power_plan);
  document.getElementById("powerRemaining").textContent = formatRemainingMinutes(powerState.battery_remaining_min);
  document.getElementById("riskScore").textContent = `${risk.score} (${risk.level})`;
  document.getElementById("riskReasons").textContent = risk.reasons?.length ? risk.reasons.join(" | ") : "No active risk drivers.";

  document.getElementById("ramCommitGb").textContent = fmt(cpu.latency.committed_gb, " GB");
  document.getElementById("ramCommitPct").textContent = fmt(cpu.latency.commit_in_use_percent, "%");
  document.getElementById("ramCompression").textContent = fmt(cpu.latency.memory_compression_mb, " MB");
  document.getElementById("ramPagefile").textContent = fmt(cpu.latency.pagefile_usage_percent, "%");

  document.getElementById("oclDevice").textContent = opencl.device_name ?? "n/a";
  document.getElementById("oclPlatform").textContent = opencl.platform_version ?? "n/a";
  document.getElementById("oclUnits").textContent = opencl.max_compute_units ?? "n/a";
  document.getElementById("oclUnified").textContent = String(opencl.unified_memory);
  document.getElementById("oclClinfo").textContent = fmt(opencl.average_clinfo_ms, " ms");
  renderTraceState(trace);

  pushLabel(snapshot.timestamp.split(" ").pop());
  pushPoint(history.cpu, Number(power.cpu_util_percent ?? 0));
  pushPoint(history.gpu, Number(power.gpu_util_percent ?? 0));
  pushPoint(history.ram, Number(power.free_memory_gb ?? 0));
  pushPoint(history.shared, Number(power.gpu_shared_mb ?? 0));
  pushPoint(history.dedicated, Number(power.gpu_dedicated_mb ?? 0));
  pushPoint(history.engine3d, Number(gpu.engines["3d"] ?? 0));
  pushPoint(history.engineCompute, sumEngineValues(gpu.engines, (k) => k.includes("compute")));
  pushPoint(history.engineCopy, sumEngineValues(gpu.engines, (k) => k.includes("copy")));
  pushPoint(history.engineVideoDecode, decodeUtil);
  pushPoint(history.engineVideoEncode, encodeUtil);
  pushPoint(history.engineVideoProc, videoProcUtil);
  pushPoint(history.cpuQueue, Number(cpu.latency.processor_queue_length ?? 0));
  pushPoint(history.cpuRunnable, Number(cpu.latency.runnable_threads_per_core ?? 0));
  pushPoint(history.cpuContextK, Number(cpu.latency.context_switches_per_sec ?? 0) / 1000);
  pushPoint(history.cpuFaultsK, Number(cpu.latency.page_faults_per_sec ?? 0) / 1000);
  pushPoint(history.cpuHardFaultsK, Number(cpu.latency.hard_faults_per_sec ?? 0) / 1000);
  pushPoint(history.cpuInterrupt, Number(cpu.latency.interrupt_time_percent ?? 0));
  pushPoint(history.cpuDpc, Number(cpu.latency.dpc_time_percent ?? 0));
  pushPoint(history.cpuPagesIn, Number(cpu.latency.pages_input_per_sec ?? 0));
  pushPoint(history.diskQueue, Number(cpu.latency.disk_queue_depth ?? 0));
  pushPoint(history.pagefile, Number(cpu.latency.pagefile_usage_percent ?? 0));
  pushPoint(history.commitPct, Number(cpu.latency.commit_in_use_percent ?? 0));
  pushPoint(history.risk, Number(risk.score ?? 0));
  pushPoint(history.battery, Number(powerState.battery_percent ?? 0));
  pushPoint(history.remainingMin, Number(powerState.battery_remaining_min ?? 0));
  pushPoint(history.cpuClockMhz, Number(sensors.cpu_actual_mhz ?? 0));
  pushPoint(history.cpuPerf, Number(sensors.cpu_perf_percent ?? 0));
  pushPoint(history.gpuCoreMhz, Number(sensors.gpu_core_mhz ?? 0));
  pushPoint(history.gpuTempC, Number(sensors.gpu_temp_c ?? 0));
  pushPoint(history.gpuPowerW, Number(sensors.gpu_power_w ?? 0));

  refreshCharts();
  renderGpuTable("gpuFocusProcesses", gpu.processes);
  renderGpuTable("overviewProcesses", gpu.processes);
  renderCpuTable(cpu.processes);
  renderAlerts(snapshot);
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    navButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    views.forEach((view) => view.classList.toggle("is-active", view.id === button.dataset.view));
  });
});

document.getElementById("traceStartBtn").addEventListener("click", () => {
  postTraceAction("/api/trace/start", { profiles: ["CPU", "GPU", "Video"], duration_sec: 15 });
});

document.getElementById("traceStopBtn").addEventListener("click", () => {
  postTraceAction("/api/trace/stop");
});

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws/live`);
  socket.addEventListener("message", (event) => updateSnapshot(JSON.parse(event.data)));
  socket.addEventListener("close", () => {
    document.getElementById("status").textContent = "Disconnected. Retrying";
    setTimeout(connect, 1500);
  });
}

connect();
