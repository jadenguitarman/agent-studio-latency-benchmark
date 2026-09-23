const state = { config: null, running: false, live: false };
const el = {
  run: document.querySelector("#run-button"),
  terminal: document.querySelector("#terminal"),
  status: document.querySelector("#terminal-status"),
  modeChip: document.querySelector("#mode-chip"),
  modeNote: document.querySelector("#mode-note"),
  liveRow: document.querySelector("#live-toggle-row"),
  liveToggle: document.querySelector("#live-toggle"),
  results: document.querySelector("#results"),
  resultLabel: document.querySelector("#result-label"),
  summary: document.querySelector("#summary-grid"),
};

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function activeMode() { return state.live ? "live" : "demo"; }

function setModeCopy() {
  const live = activeMode() === "live";
  el.modeChip.textContent = live ? "Configured live run" : "Demo mode";
  el.modeChip.classList.toggle("live", live);
  el.modeNote.textContent = live
    ? "This uses the configured Algolia endpoints with a small controlled run. It still is not production telemetry."
    : "The browser will run the same CLI with deterministic synthetic responses. No credentials are needed.";
}

function resetTerminal(mode) {
  el.terminal.replaceChildren();
  const command = document.createElement("div");
  command.className = "terminal-line command";
  command.innerHTML = `<span class="prompt">$</span> npm run benchmark -- ${mode === "demo" ? "--demo " : ""}--progress --iterations 3 --warmups 1`;
  el.terminal.append(command);
}

function appendLine(text, index) {
  const line = document.createElement("div");
  line.className = `terminal-line ${text.startsWith("[") ? "measurement" : text.startsWith("Wrote") || text.startsWith("Measured") ? "success" : ""}`;
  line.style.setProperty("--line-index", index);
  line.textContent = text;
  el.terminal.append(line);
  el.terminal.scrollTop = el.terminal.scrollHeight;
}

function display(value) { return value === null || value === undefined ? "n/a" : `${value} ms`; }

function summaryCard(summary) {
  const card = document.createElement("article");
  card.className = "summary-card";
  const title = summary.client === "search" ? "Raw Search" : summary.variant === "agent-static" ? "Agent Studio · fixed" : "Agent Studio · selected";
  const color = summary.client === "search" ? "search-key" : summary.variant === "agent-static" ? "fixed-key" : "dynamic-key";
  card.innerHTML = `<div class="summary-title"><span class="path-key ${color}"></span><strong>${title}</strong></div><code>${summary.indexTarget}</code><div class="summary-metrics"><div><small>Route p50</small><b>${display(summary.routeTimeMs.p50)}</b></div><div><small>Total p50</small><b>${display(summary.totalResponseTimeMs.p50)}</b></div><div><small>Successes</small><b>${summary.successes}/${summary.requests}</b></div></div><p>p50 is the middle measured request. Compare the paths, then look at p95 for the slower tail.</p>`;
  return card;
}

function renderResults(data) {
  el.summary.replaceChildren(...data.summaries.map(summaryCard));
  el.resultLabel.textContent = data.mode === "live" ? "Configured controlled run" : "Synthetic controlled demo";
  el.results.hidden = false;
  el.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function run() {
  if (state.running) return;
  state.running = true;
  const mode = activeMode();
  el.run.disabled = true;
  el.run.innerHTML = `<span class="spinner"></span> Running benchmark`;
  el.status.textContent = "Running";
  el.status.className = "terminal-status running";
  resetTerminal(mode);
  try {
    const response = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The benchmark could not run.");
    for (const [index, line] of data.lines.entries()) {
      await delay(index === 0 ? 160 : 34);
      appendLine(line, index);
    }
    renderResults(data);
    el.status.textContent = data.ok ? "Complete" : "Failed";
    el.status.className = `terminal-status ${data.ok ? "complete" : "failed"}`;
  } catch (error) {
    appendLine(`ERROR: ${error.message}`, 0);
    el.status.textContent = "Needs attention";
    el.status.className = "terminal-status failed";
  } finally {
    state.running = false;
    el.run.disabled = false;
    el.run.innerHTML = `<span class="play-icon">▶</span> Run benchmark`;
  }
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    state.config = await response.json();
    state.live = state.config.defaultMode === "live";
    if (state.config.liveAvailable) {
      el.liveRow.hidden = false;
      el.liveToggle.checked = state.live;
      el.liveToggle.addEventListener("change", () => { state.live = el.liveToggle.checked; setModeCopy(); });
    }
    setModeCopy();
  } catch {
    setModeCopy();
  }
}

el.run.addEventListener("click", run);
loadConfig();
