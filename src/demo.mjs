import { resolve } from "node:path";

const encoder = new TextEncoder();

function wait(ms, signal) {
  return new Promise((resolveWait, reject) => {
    const timer = setTimeout(resolveWait, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      const error = new Error("The demo request was cancelled.");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
}

function stableOffset(text) {
  return [...text].reduce((total, character) => total + character.charCodeAt(0), 0) % 18;
}

export function demoConfig({ cwd = process.cwd(), outputDir = "results/web-demo" } = {}) {
  return {
    applicationId: "DEMOAPP",
    searchApiKey: "demo-search-key",
    agentStudioApiKey: "demo-agent-key",
    agentId: "demo-agent",
    baselineIndex: "products_demo",
    approvedTargets: ["products_demo_copy"],
    queryFile: resolve(cwd, "queries.example.ndjson"),
    iterations: 3,
    warmups: 1,
    concurrency: 1,
    timeoutMs: 10_000,
    dataLabel: "synthetic-controlled-demo",
    outputDir: resolve(cwd, outputDir),
    userAgent: "agent-studio-latency-benchmark/demo",
  };
}

export function createDemoFetch() {
  return async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    const query = body.messages?.[0]?.parts?.[0]?.text || body.query || "demo query";
    const dynamic = Array.isArray(body.indices);
    const isSearch = url.includes("-dsn.algolia.net");
    const indexTarget = body.indices?.[0] || url.match(/indexes\/([^/]+)\//)?.[1] || "products_demo";
    const baseDelay = isSearch ? 28 : dynamic ? 126 : 108;
    const delay = baseDelay + stableOffset(`${query}:${indexTarget}`);
    await wait(delay, options.signal);

    if (isSearch) {
      return new Response(JSON.stringify({ hits: [{ objectID: "demo-1", title: "Synthetic result" }], nbHits: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-delta", text: "Synthetic Agent Studio response.", usage: { inputTokens: 42, outputTokens: 18 } })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
}
