import { runWebBenchmark, webConfig } from "./web-runner.mjs";

export async function handleWebApi({ method, pathname, body }) {
  if (method === "GET" && pathname === "/api/config") return { status: 200, body: await webConfig() };
  if (method === "POST" && pathname === "/api/run") {
    const mode = body?.mode || "demo";
    const result = await runWebBenchmark({ mode });
    return { status: result.ok ? 200 : 502, body: result };
  }
  return null;
}
