import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const workspaceRoot = path.resolve(rootDir, "..");
export const sharedEnvPath = path.join(workspaceRoot, ".env");

export async function loadDotEnv(file = path.join(rootDir, ".env")) {
  const files = file === path.join(rootDir, ".env") ? [sharedEnvPath, file] : [file];
  for (const candidate of files) {
    try {
      const text = await fs.readFile(candidate, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || match[1] in process.env) continue;
        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        process.env[match[1]] = value;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment value: ${name}`);
  return value;
}

export function optional(name, fallback = "") { return process.env[name]?.trim() || fallback; }
export function flag(name, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  return value ? ["1", "true", "yes", "on"].includes(value) : fallback;
}
export function args() {
  return { dryRun: process.argv.includes("--dry-run"), skipCopy: process.argv.includes("--skip-copy"), skipAgent: process.argv.includes("--skip-agent"), publish: process.argv.includes("--publish"), syncVercel: process.argv.includes("--sync-vercel") };
}
export function algoliaBase(applicationId) { return `https://${applicationId}.algolia.net`; }

class ApiError extends Error {
  constructor(message, status) { super(message); this.name = "ApiError"; this.status = status; }
}

export async function requestJson({ base, path, apiKey, applicationId, method = "GET", body }) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), "x-algolia-application-id": applicationId, "x-algolia-api-key": apiKey },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) throw new ApiError(`${method} ${path} failed with HTTP ${response.status}: ${JSON.stringify(data)}`, response.status);
  return data;
}

export async function indexExists({ base, applicationId, apiKey, index }) {
  try {
    await requestJson({ base, applicationId, apiKey, path: `/1/indexes/${encodeURIComponent(index)}/settings` });
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

export async function waitForTask({ base, applicationId, apiKey, index, taskID }) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const result = await requestJson({ base, applicationId, apiKey, path: `/1/indexes/${encodeURIComponent(index)}/task/${taskID}` });
    if (result.status === "published") return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for Algolia task ${taskID} on ${index}`);
}

export async function copyIndex({ base, applicationId, apiKey, source, destination, allowOverwrite, dryRun }) {
  if (dryRun) {
    console.log(`Would copy ${source} to ${destination}. Existing destinations require ALLOW_INDEX_OVERWRITE=true.`);
    return;
  }
  if (await indexExists({ base, applicationId, apiKey, index: destination }) && !allowOverwrite) {
    throw new Error(`Destination index already exists: ${destination}. Set ALLOW_INDEX_OVERWRITE=true only if replacing it is intentional.`);
  }
  const result = await requestJson({ base, applicationId, apiKey, method: "POST", path: `/1/indexes/${encodeURIComponent(source)}/operation`, body: { operation: "copy", destination } });
  await waitForTask({ base, applicationId, apiKey, index: source, taskID: result.taskID });
  console.log(`Copied ${source} to ${destination}.`);
}

export async function provisionAgent({ base, applicationId, apiKey, agentId, spec, publish, dryRun }) {
  if (dryRun) {
    console.log(`${agentId ? "Would update" : "Would create"} Agent Studio agent "${spec.name}".`);
    if (publish) console.log("Would publish the agent after the write.");
    return { id: agentId || "<created-agent-id>" };
  }
  let current = null;
  if (agentId) current = await requestJson({ base: `${base}/agent-studio`, applicationId, apiKey, path: `/1/agents/${encodeURIComponent(agentId)}` });
  const payload = { ...(current?.config ? { config: current.config } : {}), ...(current?.systemPrompt ? { systemPrompt: current.systemPrompt } : {}), ...(current?.templateType ? { templateType: current.templateType } : {}), ...spec, ...(spec.providerId || current?.providerId ? { providerId: spec.providerId || current.providerId } : {}), ...(spec.model || current?.model ? { model: spec.model || current.model } : {}) };
  if (!payload.providerId || !payload.model) throw new Error("AGENT_STUDIO_PROVIDER_ID and AGENT_STUDIO_MODEL are required when creating an agent.");
  const response = await requestJson({ base: `${base}/agent-studio`, applicationId, apiKey, method: agentId ? "PATCH" : "POST", path: agentId ? `/1/agents/${encodeURIComponent(agentId)}` : "/1/agents", body: payload });
  const id = response.id || agentId;
  if (publish && response.status !== "published") await requestJson({ base: `${base}/agent-studio`, applicationId, apiKey, method: "POST", path: `/1/agents/${encodeURIComponent(id)}/publish` });
  console.log(`${agentId ? "Updated" : "Created"} agent ${id}${publish ? " and published it" : " as a draft"}.`);
  return { ...response, id };
}

export function agentSpec({ name, description, instructions, providerId, model, productIndex, comparisonIndex }) {
  return { name, description, ...(providerId ? { providerId } : {}), ...(model ? { model } : {}), instructions, tools: [{ type: "algolia_search_index", name: "benchmark_search", mode: "dynamic", allowUnlistedIndices: true, indices: [{ index: productIndex, description: "Product catalog used for the baseline and dynamic tests." }, { index: comparisonIndex, description: "Shadow copy of the product catalog used as a second controlled target." }] }] };
}

export async function writeProvisionedEnv(values) {
  await writeEnvValues(values);
  const output = Object.entries(values).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join("\n");
  await fs.writeFile(path.join(rootDir, "provisioned.env"), `# Generated by npm run provision. Contains no secrets.\n${output}\n`, "utf8");
}

export async function writeEnvValues(values, file = sharedEnvPath) {
  const existing = await fs.readFile(file, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const entries = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .map(([key, value]) => [key, String(value)]);
  const replacements = new Map(entries);
  const seen = new Set();
  const lines = existing ? existing.split(/\r?\n/) : [];
  const updated = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=.*/);
    if (!match || !replacements.has(match[1])) return line;
    seen.add(match[1]);
    return `${match[1]}=${replacements.get(match[1])}`;
  });
  for (const [key, value] of entries) {
    if (!seen.has(key)) updated.push(`${key}=${value}`);
  }
  let output = updated.join("\n");
  if (!output.endsWith("\n")) output += "\n";
  await fs.writeFile(file, output, "utf8");
}

export async function syncVercelEnv(values, { dryRun = false } = {}) {
  const projectFile = path.join(rootDir, ".vercel", "project.json");
  const project = await fs.readFile(projectFile, "utf8").then(JSON.parse).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return {};
  });
  const projectId = process.env.VERCEL_PROJECT_ID?.trim() || project.projectId;
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || project.orgId;
  if (!projectId) throw new Error("--sync-vercel needs a linked .vercel/project.json or VERCEL_PROJECT_ID.");
  const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== null && String(value).length > 0);
  if (dryRun) {
    console.log(`Would sync ${entries.length} runtime environment variables to Vercel project ${project.projectName || projectId} for production, preview, and development.`);
    return;
  }
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) throw new Error("--sync-vercel requires VERCEL_TOKEN in the shell environment. The token is never written to .env.");
  const query = teamId ? `?upsert=true&teamId=${encodeURIComponent(teamId)}` : "?upsert=true";
  const secretKeys = new Set(["ALGOLIA_SEARCH_API_KEY", "ALGOLIA_AGENT_STUDIO_API_KEY"]);
  const targets = ["production", "preview", "development"];
  for (const [key, value] of entries) {
    const response = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env${query}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: String(value), type: secretKeys.has(key) ? "encrypted" : "plain", target: targets }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.failed?.length) {
      const detail = body?.failed?.[0]?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Vercel environment update failed for ${key}: ${detail}`);
    }
  }
  console.log(`Synced ${entries.length} runtime environment variables to Vercel project ${project.projectName || projectId}.`);
}
