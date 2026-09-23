import assert from "node:assert/strict";
import test from "node:test";
import { agentRequestBody, measureAgentRequest, measureSearchRequest } from "../src/clients.mjs";
import { createDemoFetch, demoConfig } from "../src/demo.mjs";
import { summarizeMeasurements } from "../src/report.mjs";

const config = {
  applicationId: "TESTAPP",
  searchApiKey: "search-key",
  agentStudioApiKey: "agent-key",
  agentId: "00000000-0000-0000-0000-000000000000",
  timeoutMs: 1000,
  userAgent: "test"
};
const query = { id: "q-001", query: "synthetic query", tags: ["synthetic"] };

test("search measurement captures status and separate route and total timings", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ hits: [], nbHits: 0 }), { status: 200, headers: { "content-type": "application/json" } });
  const result = await measureSearchRequest({ config, query, indexTarget: "products", iteration: 1, phase: "measurement", fetchImpl });
  assert.equal(result.client, "search");
  assert.equal(result.status, 200);
  assert.equal(result.ok, true);
  assert.equal(typeof result.routeTimeMs, "number");
  assert.equal(typeof result.totalResponseTimeMs, "number");
  assert.equal(result.error, null);
});

test("agent request body uses the documented message shape and isolates dynamic indices", () => {
  const body = agentRequestBody({ query, indexTarget: "products_v2", dynamic: true });
  assert.equal(body.messages[0].role, "user");
  assert.equal(body.messages[0].parts[0].text, query.query);
  assert.deepEqual(body.indices, ["products_v2"]);
  assert.deepEqual(body.searchParameters, { products_v2: {} });
});

test("agent streaming measurement records time to first token and metadata", async () => {
  const encoder = new TextEncoder();
  const fetchImpl = async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"text-delta","usage":{"inputTokens":4,"outputTokens":7}}\n\n'));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const result = await measureAgentRequest({ config, query, indexTarget: "products_v2", dynamic: true, iteration: 1, phase: "measurement", fetchImpl });
  assert.equal(result.client, "agent-studio");
  assert.equal(result.status, 200);
  assert.equal(result.ok, true);
  assert.equal(typeof result.timeToFirstTokenMs, "number");
  assert.equal(result.metadata.tokenUsage.inputTokens, 4);
  assert.equal(result.metadata.tokenUsage.outputTokens, 7);
});

test("summary calculates readable percentile fields from measured successes only", () => {
  const measurements = [10, 20, 30].map((value, index) => ({
    client: "search",
    variant: "raw-search",
    indexTarget: "products",
    phase: "measurement",
    ok: true,
    routeTimeMs: value,
    timeToFirstTokenMs: null,
    totalResponseTimeMs: value + 5,
    error: null,
    queryId: `q-${index}`
  }));
  measurements.push({ ...measurements[0], ok: false, routeTimeMs: null, totalResponseTimeMs: null, error: "HTTP 500" });
  const [summary] = summarizeMeasurements(measurements);
  assert.equal(summary.requests, 4);
  assert.equal(summary.successes, 3);
  assert.equal(summary.routeTimeMs.p50, 20);
  assert.equal(summary.routeTimeMs.p95, 30);
  assert.deepEqual(summary.errorMessages, ["HTTP 500"]);
});

test("demo transport provides synthetic Search and Agent Studio responses without credentials", async () => {
  const demo = demoConfig({ cwd: process.cwd(), outputDir: "results/test-demo" });
  const fetchImpl = createDemoFetch();
  const search = await measureSearchRequest({ config: demo, query, indexTarget: demo.baselineIndex, iteration: 1, phase: "measurement", fetchImpl });
  const agent = await measureAgentRequest({ config: demo, query, indexTarget: demo.approvedTargets[0], dynamic: true, iteration: 1, phase: "measurement", fetchImpl });
  assert.equal(search.ok, true);
  assert.equal(agent.ok, true);
  assert.equal(agent.metadata.tokenUsage.totalTokens, undefined);
  assert.equal(agent.metadata.tokenUsage.inputTokens, 42);
  assert.equal(agent.metadata.tokenUsage.outputTokens, 18);
});
