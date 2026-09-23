import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadConfig, loadQueries } from "./config.mjs";
import { runBenchmark } from "./benchmark.mjs";
import { createDemoFetch, demoConfig } from "./demo.mjs";

export const projectRoot = process.cwd();

async function liveConfigurationAvailable() {
  try {
    await loadConfig({ cwd: projectRoot });
    return true;
  } catch {
    return false;
  }
}

export async function webConfig() {
  const liveAvailable = await liveConfigurationAvailable();
  const requestedMode = process.env.BENCHMARK_WEB_MODE?.trim().toLowerCase();
  const defaultMode = requestedMode === "live" && liveAvailable ? "live" : "demo";
  return {
    defaultMode,
    liveAvailable,
    demoLabel: "Synthetic controlled demo",
    liveLabel: "Configured controlled run",
    iterations: 3,
    warmups: 1,
    note: "The browser runs the same benchmark CLI. Demo mode uses deterministic synthetic responses; live mode uses the configured Algolia endpoints.",
  };
}

function collectLines(stream, lines) {
  return new Promise((resolveLines) => {
    let pending = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      pending += chunk;
      const pieces = pending.split(/\r?\n/u);
      pending = pieces.pop() || "";
      for (const line of pieces) if (line.trim()) lines.push(line);
    });
    stream.on("end", () => {
      if (pending.trim()) lines.push(pending);
      resolveLines();
    });
  });
}

async function readSummaries(lines) {
  const jsonLine = [...lines].reverse().find((line) => line.startsWith("Wrote ") && line.endsWith(".json"));
  if (!jsonLine) return [];
  try {
    const filePath = resolve(projectRoot, jsonLine.slice("Wrote ".length));
    const document = JSON.parse(await readFile(filePath, "utf8"));
    return document.summaries || [];
  } catch {
    return [];
  }
}

function progressLine(measurement) {
  const status = measurement.ok ? `${measurement.totalResponseTimeMs} ms` : `error: ${measurement.error}`;
  return `[${measurement.phase}] ${measurement.variant} / ${measurement.indexTarget} / ${measurement.queryId} → ${status}`;
}

async function runInProcess(mode) {
  const outputDir = resolve(process.env.TMPDIR || "/tmp", `agent-studio-latency-${Date.now()}`);
  const config = mode === "demo"
    ? demoConfig({ cwd: projectRoot, outputDir })
    : await loadConfig({ cwd: projectRoot, overrides: { iterations: 3, warmups: 1, concurrency: 1, outputDir } });
  const queries = await loadQueries(config.queryFile);
  const lines = [];
  const result = await runBenchmark({
    config,
    queries,
    fetchImpl: mode === "demo" ? createDemoFetch() : fetch,
    onMeasurement: (measurement) => lines.push(progressLine(measurement)),
  });
  const measured = result.run.rawMeasurements.filter((measurement) => measurement.phase === "measurement");
  const successes = measured.filter((measurement) => measurement.ok).length;
  lines.push(`Wrote ${result.files.jsonPath}`, `Wrote ${result.files.markdownPath}`, `Measured ${measured.length} requests; ${successes} succeeded.`);
  return { ok: successes > 0, mode, lines, summaries: result.summaries, exitCode: successes > 0 ? 0 : 1, durationMs: 0 };
}

export async function runWebBenchmark({ mode = "demo", onLine, inProcess = false } = {}) {
  if (!new Set(["demo", "live"]).has(mode)) throw new Error("Mode must be demo or live.");
  if (mode === "live" && !(await liveConfigurationAvailable())) {
    const error = new Error("Live mode is not configured. Use demo mode or fill in .env first.");
    error.statusCode = 400;
    throw error;
  }
  if (inProcess) {
    const result = await runInProcess(mode);
    for (const line of result.lines) onLine?.(line);
    return result;
  }

  const lines = [];
  const args = ["src/benchmark.mjs", "--progress", "--iterations", "3", "--warmups", "1", "--concurrency", "1", "--output-dir", mode === "demo" ? "results/web-demo" : "results/web-live"];
  if (mode === "demo") args.splice(1, 0, "--demo");
  const startedAt = Date.now();
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: { ...process.env, BENCHMARK_DATA_LABEL: mode === "demo" ? "synthetic-controlled-demo" : process.env.BENCHMARK_DATA_LABEL || "controlled-live-run" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutPromise = collectLines(child.stdout, lines);
  const stderrPromise = collectLines(child.stderr, lines);
  const exitCode = await new Promise((resolveExit) => child.once("close", resolveExit));
  await Promise.all([stdoutPromise, stderrPromise]);
  for (const line of lines) onLine?.(line);
  const summaries = await readSummaries(lines);
  return {
    ok: exitCode === 0,
    mode,
    lines,
    summaries,
    exitCode,
    durationMs: Date.now() - startedAt,
  };
}
