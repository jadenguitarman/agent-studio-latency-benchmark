import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const INTEGER_LIMITS = {
  BENCHMARK_ITERATIONS: [1, 1000],
  BENCHMARK_WARMUPS: [0, 20],
  BENCHMARK_CONCURRENCY: [1, 8],
  BENCHMARK_TIMEOUT_MS: [1000, 300000]
};

function parseDotEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function loadEnvironment(cwd, env) {
  const merged = { ...env };
  const dotenvPath = resolve(cwd, ".env");
  try {
    const fileValues = parseDotEnv(await readFile(dotenvPath, "utf8"));
    for (const [key, value] of Object.entries(fileValues)) {
      if (!(key in merged)) merged[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return merged;
}

function requiredString(env, name, missing) {
  const value = env[name]?.trim();
  if (!value) missing.push(name);
  return value;
}

function validateInteger(value, name) {
  const limits = INTEGER_LIMITS[name];
  if (!Number.isInteger(value) || value < limits[0] || value > limits[1]) {
    throw new Error(`${name} must be an integer from ${limits[0]} to ${limits[1]}.`);
  }
  return value;
}

function integerEnv(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  return validateInteger(Number(raw), name);
}

function parseTargets(raw, baseline) {
  if (!raw?.trim()) return [];
  const targets = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const unique = [...new Set(targets)];
  if (unique.length !== targets.length) throw new Error("BENCHMARK_INDEX_TARGETS must not contain duplicate index names.");
  if (unique.length < 2) {
    throw new Error("BENCHMARK_INDEX_TARGETS needs at least two approved targets before dynamic index comparisons can run.");
  }
  return unique;
}

export async function loadQueries(filePath) {
  const text = await readFile(filePath, "utf8");
  const queries = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    let value;
    try {
      value = JSON.parse(trimmed);
    } catch {
      value = trimmed;
    }
    const query = typeof value === "string" ? value.trim() : value?.query?.trim();
    if (!query) throw new Error(`Query file line ${index + 1} must be text or JSON with a non-empty query.`);
    const id = typeof value === "object" && value?.id ? String(value.id) : `q-${String(queries.length + 1).padStart(3, "0")}`;
    queries.push({
      id,
      query,
      tags: Array.isArray(value?.tags) ? value.tags.map(String) : []
    });
  }
  if (queries.length === 0) throw new Error(`Query file ${filePath} does not contain any queries.`);
  const ids = new Set();
  for (const query of queries) {
    if (ids.has(query.id)) throw new Error(`Query file contains duplicate query id: ${query.id}.`);
    ids.add(query.id);
  }
  return queries;
}

export async function loadConfig({ cwd = process.cwd(), env = process.env, overrides = {} } = {}) {
  const merged = await loadEnvironment(cwd, env);
  const missing = [];
  const applicationId = requiredString(merged, "ALGOLIA_APPLICATION_ID", missing);
  const searchApiKey = requiredString(merged, "ALGOLIA_SEARCH_API_KEY", missing);
  const agentStudioApiKey = requiredString(merged, "ALGOLIA_AGENT_STUDIO_API_KEY", missing);
  const agentId = requiredString(merged, "AGENT_STUDIO_AGENT_ID", missing);
  const baselineIndex = requiredString(merged, "ALGOLIA_INDEX_NAME", missing);
  const queryFileValue = requiredString(merged, "BENCHMARK_QUERY_FILE", missing);
  if (missing.length) {
    throw new Error(`Missing required environment values: ${missing.join(", ")}. Copy .env.example to .env and fill in the values.`);
  }

  const queryFile = resolve(cwd, queryFileValue);
  await access(queryFile);
  const iterations = overrides.iterations === undefined ? integerEnv(merged, "BENCHMARK_ITERATIONS", 10) : validateInteger(overrides.iterations, "BENCHMARK_ITERATIONS");
  const warmups = overrides.warmups === undefined ? integerEnv(merged, "BENCHMARK_WARMUPS", 2) : validateInteger(overrides.warmups, "BENCHMARK_WARMUPS");
  const concurrency = overrides.concurrency === undefined ? integerEnv(merged, "BENCHMARK_CONCURRENCY", 1) : validateInteger(overrides.concurrency, "BENCHMARK_CONCURRENCY");
  const timeoutMs = overrides.timeoutMs === undefined ? integerEnv(merged, "BENCHMARK_TIMEOUT_MS", 60000) : validateInteger(overrides.timeoutMs, "BENCHMARK_TIMEOUT_MS");
  const approvedTargets = parseTargets(merged.BENCHMARK_INDEX_TARGETS, baselineIndex);
  const dataLabel = (merged.BENCHMARK_DATA_LABEL || "synthetic-controlled").trim();
  const outputDir = resolve(cwd, overrides.outputDir || merged.BENCHMARK_OUTPUT_DIR || "results");

  return {
    applicationId,
    searchApiKey,
    agentStudioApiKey,
    agentId,
    baselineIndex,
    approvedTargets,
    queryFile,
    iterations,
    warmups,
    concurrency,
    timeoutMs,
    dataLabel,
    outputDir,
    userAgent: "agent-studio-latency-benchmark/1.0"
  };
}

export function publicConfig(config) {
  return {
    applicationId: config.applicationId,
    agentId: config.agentId,
    baselineIndex: config.baselineIndex,
    approvedTargets: config.approvedTargets,
    queryFile: config.queryFile,
    iterations: config.iterations,
    warmups: config.warmups,
    concurrency: config.concurrency,
    timeoutMs: config.timeoutMs,
    dataLabel: config.dataLabel,
    outputDir: config.outputDir,
    credentials: "redacted; Search-capable keys only; Admin API keys are not required"
  };
}
