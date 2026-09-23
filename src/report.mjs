import { mkdir, writeFile } from "node:fs/promises";

function percentile(values, percentileValue) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return Number(sorted[rank].toFixed(3));
}

function metricSummary(measurements, key) {
  const values = measurements.filter((measurement) => measurement.ok && Number.isFinite(measurement[key])).map((measurement) => measurement[key]);
  return {
    samples: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99)
  };
}

function groupKey(measurement) {
  return [measurement.client, measurement.variant, measurement.indexTarget || "configured-agent-index"].join("\u001f");
}

export function summarizeMeasurements(measurements) {
  const groups = new Map();
  for (const measurement of measurements.filter((item) => item.phase === "measurement")) {
    const key = groupKey(measurement);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(measurement);
  }
  return [...groups.entries()].map(([key, group]) => {
    const [client, variant, indexTarget] = key.split("\u001f");
    return {
      client,
      variant,
      indexTarget,
      requests: group.length,
      successes: group.filter((item) => item.ok).length,
      failures: group.filter((item) => !item.ok).length,
      routeTimeMs: metricSummary(group, "routeTimeMs"),
      timeToFirstTokenMs: metricSummary(group, "timeToFirstTokenMs"),
      totalResponseTimeMs: metricSummary(group, "totalResponseTimeMs"),
      errorMessages: [...new Set(group.map((item) => item.error).filter(Boolean))]
    };
  });
}

function display(value) {
  return value === null || value === undefined ? "n/a" : `${value} ms`;
}

function summarySentence(summary) {
  const successText = `${summary.successes} of ${summary.requests} measured requests succeeded`;
  const routeText = `route p50 ${display(summary.routeTimeMs.p50)}, p95 ${display(summary.routeTimeMs.p95)}, and p99 ${display(summary.routeTimeMs.p99)}`;
  const totalText = `total response p50 ${display(summary.totalResponseTimeMs.p50)}, p95 ${display(summary.totalResponseTimeMs.p95)}, and p99 ${display(summary.totalResponseTimeMs.p99)}`;
  const tokenText = summary.timeToFirstTokenMs.samples ? `time to first token p50 ${display(summary.timeToFirstTokenMs.p50)}` : "time to first token was not available";
  return `${successText}; ${routeText}; ${totalText}; ${tokenText}.`;
}

export function renderMarkdown({ run, summaries }) {
  const lines = [
    "# Agent Studio latency benchmark",
    "",
    `Run: ${run.runId}`,
    `Generated: ${run.generatedAt}`,
    `Data status: **${run.configuration.dataLabel}**`,
    "",
    "This is a controlled, low-concurrency benchmark. It compares the measured HTTP behavior of raw Algolia Search and direct Agent Studio requests for the supplied query set. It does not predict production capacity, real-user behavior, large-index performance, or exact hosted-runtime stage timings.",
    "",
    "## Configuration",
    "",
    "```json",
    JSON.stringify(run.configuration, null, 2),
    "```",
    "",
    "## Measured summaries",
    "",
    "Percentiles use successful measured requests only. Route time is time until response headers; total response time includes reading the response body. Agent Studio time to first token is reported as the first available streaming-chunk proxy when the response produces one.",
    "",
    "| Client | Variant | Index target | Requests | Successes | Route p50 / p95 / p99 | TTFT p50 / p95 / p99 | Total p50 / p95 / p99 |",
    "|---|---|---|---:|---:|---|---|---|",
  ];
  for (const summary of summaries) {
    lines.push(`| ${summary.client} | ${summary.variant} | ${summary.indexTarget} | ${summary.requests} | ${summary.successes} | ${display(summary.routeTimeMs.p50)} / ${display(summary.routeTimeMs.p95)} / ${display(summary.routeTimeMs.p99)} | ${display(summary.timeToFirstTokenMs.p50)} / ${display(summary.timeToFirstTokenMs.p95)} / ${display(summary.timeToFirstTokenMs.p99)} | ${display(summary.totalResponseTimeMs.p50)} / ${display(summary.totalResponseTimeMs.p95)} / ${display(summary.totalResponseTimeMs.p99)} |`);
  }
  if (!summaries.length) lines.push("| n/a | n/a | n/a | 0 | 0 | n/a | n/a | n/a |");
  lines.push("", "### Plain-language readout", "");
  for (const summary of summaries) {
    lines.push(`- **${summary.client} / ${summary.variant} / ${summary.indexTarget}:** ${summarySentence(summary)}`);
  }
  if (!run.configuration.approvedTargets.length) {
    lines.push("- Dynamic index comparison was not run because no set of at least two approved targets was supplied in `BENCHMARK_INDEX_TARGETS`.");
  }
  lines.push(
    "",
    "## Limitations",
    "",
    "- Results are synthetic or controlled test data as labeled above; the runner does not establish production capacity or end-user latency.",
    "- Warm-ups are retained in the raw measurements but excluded from percentile summaries.",
    "- Search and Agent Studio are separate requests. A Search request cannot prove an internal Agent Studio stage time, and the benchmark does not claim to isolate model, retrieval, or tool stages.",
    "- Dynamic comparisons vary only the request's approved index target. Change one environment or agent configuration variable at a time between runs."
  );
  return `${lines.join("\n")}\n`;
}

export async function writeRun({ outputDir, run, summaries }) {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = `${outputDir}/${run.runId}.json`;
  const markdownPath = `${outputDir}/${run.runId}.md`;
  const document = { ...run, summaries };
  await writeFile(jsonPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown({ run, summaries }), "utf8");
  return { jsonPath, markdownPath, document };
}
