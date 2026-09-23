import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, loadQueries, publicConfig } from "./config.mjs";
import { measureAgentRequest, measureSearchRequest } from "./clients.mjs";
import { summarizeMeasurements, writeRun } from "./report.mjs";
import { createDemoFetch, demoConfig } from "./demo.mjs";

function parseArgs(argv) {
  const args = { dryRun: false, demo: false, progress: false };
  const nextValue = (index, argument) => {
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${argument} requires a value.`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") args.dryRun = true;
    else if (argument === "--demo") args.demo = true;
    else if (argument === "--progress") args.progress = true;
    else if (argument === "--output-dir") args.outputDir = nextValue(index++, argument);
    else if (argument === "--iterations") args.iterations = Number(nextValue(index++, argument));
    else if (argument === "--warmups") args.warmups = Number(nextValue(index++, argument));
    else if (argument === "--concurrency") args.concurrency = Number(nextValue(index++, argument));
    else if (argument === "--timeout-ms") args.timeoutMs = Number(nextValue(index++, argument));
    else if (argument === "--help" || argument === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return args;
}

function helpText() {
  return `Usage: npm run benchmark -- [options]

Environment is configured through .env. Options override one run only:
  --dry-run                 Validate configuration and print redacted settings
  --demo                    Run with deterministic synthetic responses and no credentials
  --progress                Print one line for each request as it completes
  --output-dir DIR          Write results to DIR instead of results/
  --iterations N            Measured trials per query and variant
  --warmups N               Warm-up trials per query and variant
  --concurrency N           Maximum in-flight requests (1-8)
  --timeout-ms N            Request timeout in milliseconds
  --help                    Show this help
`;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function consume() {
    while (true) {
      const current = next;
      next += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, consume));
  return results;
}

function buildCases(config) {
  const searchTargets = [...new Set([config.baselineIndex, ...config.approvedTargets])];
  const cases = searchTargets.map((indexTarget) => ({ client: "search", variant: "raw-search", indexTarget }));
  cases.push({ client: "agent-studio", variant: "agent-static", indexTarget: "configured-agent-index", dynamic: false });
  for (const indexTarget of config.approvedTargets) {
    cases.push({ client: "agent-studio", variant: "agent-dynamic", indexTarget, dynamic: true });
  }
  return cases;
}

async function runPhase({ config, queries, cases, phase, count, fetchImpl, onMeasurement }) {
  const work = [];
  for (const caseDefinition of cases) {
    for (const query of queries) {
      for (let iteration = 1; iteration <= count; iteration += 1) {
        work.push({ caseDefinition, query, iteration });
      }
    }
  }
  const batches = await mapWithConcurrency(work, config.concurrency, async ({ caseDefinition, query, iteration }) => {
    const measurement = caseDefinition.client === "search"
      ? await measureSearchRequest({ config, query, indexTarget: caseDefinition.indexTarget, iteration, phase, fetchImpl })
      : await measureAgentRequest({ config, query, indexTarget: caseDefinition.dynamic ? caseDefinition.indexTarget : config.baselineIndex, dynamic: caseDefinition.dynamic, iteration, phase, fetchImpl });
    onMeasurement?.(measurement);
    return measurement;
  });
  return batches;
}

function utcRunId(date) {
  return `run-${date.toISOString().replace(/[-:]/gu, "").replace(".000", "")}`;
}

export async function runBenchmark({ config, queries, now = new Date(), fetchImpl = fetch, onMeasurement }) {
  const cases = buildCases(config);
  await mkdir(config.outputDir, { recursive: true });
  const warmups = config.warmups ? await runPhase({ config, queries, cases, phase: "warmup", count: config.warmups, fetchImpl, onMeasurement }) : [];
  const measurements = await runPhase({ config, queries, cases, phase: "measurement", count: config.iterations, fetchImpl, onMeasurement });
  const allMeasurements = [...warmups, ...measurements];
  const run = {
    runId: utcRunId(now),
    generatedAt: now.toISOString(),
    configuration: publicConfig(config),
    querySet: queries.map(({ id, query, tags }) => ({ id, query, tags })),
    rawMeasurements: allMeasurements,
    limitations: [
      "This is a controlled low-concurrency benchmark, not a production load test.",
      "It does not predict production capacity, real-user behavior, large-index performance, or exact hosted-runtime stage timings.",
      "Warm-ups are excluded from percentile summaries."
    ]
  };
  const summaries = summarizeMeasurements(allMeasurements);
  const files = await writeRun({ outputDir: config.outputDir, run, summaries });
  return { run, summaries, files };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(helpText());
    return 0;
  }
  const config = args.demo ? demoConfig() : await loadConfig({ overrides: args });
  const queries = await loadQueries(config.queryFile);
  if (args.dryRun) {
    console.log(JSON.stringify({ configuration: publicConfig(config), queryCount: queries.length }, null, 2));
    return 0;
  }
  const fetchImpl = args.demo ? createDemoFetch() : fetch;
  const onMeasurement = args.progress ? (measurement) => {
    const status = measurement.ok ? `${measurement.totalResponseTimeMs} ms` : `error: ${measurement.error}`;
    console.log(`[${measurement.phase}] ${measurement.variant} / ${measurement.indexTarget} / ${measurement.queryId} → ${status}`);
  } : undefined;
  const result = await runBenchmark({ config, queries, fetchImpl, onMeasurement });
  const successes = result.run.rawMeasurements.filter((measurement) => measurement.phase === "measurement" && measurement.ok).length;
  console.log(`Wrote ${result.files.jsonPath}`);
  console.log(`Wrote ${result.files.markdownPath}`);
  console.log(`Measured ${result.run.rawMeasurements.filter((measurement) => measurement.phase === "measurement").length} requests; ${successes} succeeded.`);
  if (!successes) return 1;
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`Benchmark failed: ${error.message}`);
    process.exitCode = 1;
  });
}
