import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

function elapsed(start) {
  return Number((performance.now() - start).toFixed(3));
}

function makeRequestId() {
  return `alg_cnv_${randomUUID().replaceAll("-", "")}`;
}

function metadataFromValue(value, metadata = { tokenUsage: {}, toolNames: [], toolEvents: 0 }) {
  if (!value || typeof value !== "object") return metadata;
  if (Array.isArray(value)) {
    for (const item of value) metadataFromValue(item, metadata);
    return metadata;
  }
  const type = typeof value.type === "string" ? value.type : "";
  for (const [key, raw] of Object.entries(value)) {
    if (["inputTokens", "outputTokens", "totalTokens", "promptTokens", "completionTokens"].includes(key) && Number.isFinite(Number(raw))) {
      metadata.tokenUsage[key] = Number(raw);
    }
    if ((key === "toolName" || key === "tool") && typeof raw === "string") {
      metadata.toolNames.push(raw);
    }
    if (key === "toolCall" || key === "toolCalls" || type.startsWith("tool-")) metadata.toolEvents += Array.isArray(raw) ? raw.length : 1;
    metadataFromValue(raw, metadata);
  }
  metadata.toolNames = [...new Set(metadata.toolNames)];
  return metadata;
}

function parseJsonValues(text) {
  const values = [];
  try {
    values.push(JSON.parse(text));
  } catch {
    for (const line of text.split(/\r?\n/u)) {
      const payload = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        values.push(JSON.parse(payload));
      } catch {
        // AI SDK streams can contain non-JSON protocol lines; they are not metadata.
      }
    }
  }
  return values;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function readBody(response, { stream = false, startedAt = performance.now() } = {}) {
  let firstByteAt = null;
  let bytes = 0;
  const chunks = [];
  if (!response.body) {
    const text = await response.text();
    bytes = new TextEncoder().encode(text).byteLength;
    return { text, bytes, timeToFirstTokenMs: null, totalResponseTimeMs: elapsed(startedAt), metadata: metadataFromValue(parseJsonValues(text)) };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    bytes += value.byteLength;
    if (firstByteAt === null) firstByteAt = performance.now();
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  const text = chunks.join("");
  const metadata = metadataFromValue(parseJsonValues(text));
  return {
    text,
    bytes,
    timeToFirstTokenMs: stream && firstByteAt !== null ? Number((firstByteAt - startedAt).toFixed(3)) : null,
    totalResponseTimeMs: elapsed(startedAt),
    metadata
  };
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function baseMeasurement({ client, variant, query, iteration, phase, indexTarget }) {
  return {
    requestId: makeRequestId(),
    client,
    variant,
    queryId: query.id,
    query: query.query,
    queryTags: query.tags,
    indexTarget,
    phase,
    iteration,
    startedAt: new Date().toISOString(),
    routeTimeMs: null,
    timeToFirstTokenMs: null,
    totalResponseTimeMs: null,
    status: null,
    ok: false,
    responseBytes: null,
    metadata: { tokenUsage: {}, toolNames: [], toolEvents: 0 },
    error: null
  };
}

export async function measureSearchRequest({ config, query, indexTarget, iteration, phase, fetchImpl = fetch }) {
  const measurement = baseMeasurement({ client: "search", variant: "raw-search", query, iteration, phase, indexTarget });
  const url = `https://${config.applicationId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexTarget)}/query`;
  const started = performance.now();
  try {
    const response = await fetchWithTimeout(fetchImpl, url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-algolia-application-id": config.applicationId,
        "x-algolia-api-key": config.searchApiKey,
        "user-agent": config.userAgent
      },
      body: JSON.stringify({ query: query.query })
    }, config.timeoutMs);
    measurement.routeTimeMs = elapsed(started);
    measurement.status = response.status;
    const body = await readBody(response);
    measurement.totalResponseTimeMs = Number((performance.now() - started).toFixed(3));
    measurement.responseBytes = body.bytes;
    measurement.ok = response.ok;
    if (!response.ok) measurement.error = `HTTP ${response.status}`;
  } catch (error) {
    measurement.totalResponseTimeMs = Number((performance.now() - started).toFixed(3));
    measurement.error = error?.name === "AbortError" ? `Timeout after ${config.timeoutMs} ms` : errorMessage(error);
  }
  return measurement;
}

export function agentRequestBody({ query, indexTarget, dynamic }) {
  const body = {
    id: makeRequestId(),
    messages: [{ id: `alg_msg_${randomUUID().replaceAll("-", "")}`, role: "user", parts: [{ type: "text", text: query.query }] }]
  };
  if (dynamic) {
    body.indices = [indexTarget];
    body.searchParameters = { [indexTarget]: {} };
  }
  return body;
}

export async function measureAgentRequest({ config, query, indexTarget, dynamic, iteration, phase, fetchImpl = fetch }) {
  const variant = dynamic ? "agent-dynamic" : "agent-static";
  const measurement = baseMeasurement({ client: "agent-studio", variant, query, iteration, phase, indexTarget });
  const queryParameters = new URLSearchParams({ stream: "true", compatibilityMode: "ai-sdk-5" });
  const url = `https://${config.applicationId}.algolia.net/agent-studio/1/agents/${encodeURIComponent(config.agentId)}/completions?${queryParameters}`;
  const started = performance.now();
  try {
    const response = await fetchWithTimeout(fetchImpl, url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-algolia-application-id": config.applicationId,
        "x-algolia-api-key": config.agentStudioApiKey,
        "user-agent": config.userAgent
      },
      body: JSON.stringify(agentRequestBody({ query, indexTarget, dynamic }))
    }, config.timeoutMs);
    measurement.routeTimeMs = elapsed(started);
    measurement.status = response.status;
    const body = await readBody(response, { stream: true, startedAt: started });
    measurement.timeToFirstTokenMs = body.timeToFirstTokenMs;
    measurement.totalResponseTimeMs = Number((performance.now() - started).toFixed(3));
    measurement.responseBytes = body.bytes;
    measurement.metadata = body.metadata;
    measurement.ok = response.ok;
    if (!response.ok) measurement.error = `HTTP ${response.status}`;
  } catch (error) {
    measurement.totalResponseTimeMs = Number((performance.now() - started).toFixed(3));
    measurement.error = error?.name === "AbortError" ? `Timeout after ${config.timeoutMs} ms` : errorMessage(error);
  }
  return measurement;
}
