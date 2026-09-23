import { agentSpec, algoliaBase, args, copyIndex, flag, indexExists, loadDotEnv, optional, provisionAgent, required, syncVercelEnv, writeProvisionedEnv } from "./provision-lib.mjs";

await loadDotEnv();
const options = args();
const applicationId = required("ALGOLIA_APPLICATION_ID");
const productIndex = optional("ALGOLIA_PRODUCT_INDEX") || required("ALGOLIA_INDEX_NAME");
const comparisonIndex = "agent_studio_latency_copy";
const agentEnvName = "LATENCY_BENCHMARK_AGENT_STUDIO_AGENT_ID";
if (productIndex === comparisonIndex) throw new Error(`ALGOLIA_PRODUCT_INDEX must not be the generated comparison index: ${comparisonIndex}`);
const publish = options.publish || flag("PUBLISH_AGENTS");
const base = algoliaBase(applicationId);

if (options.dryRun) console.log("Dry run: no Algolia requests will be made.");
else {
  const indexingKey = required("ALGOLIA_INDEXING_API_KEY");
  if (!(await indexExists({ base, applicationId, apiKey: indexingKey, index: productIndex }))) throw new Error(`Product index does not exist: ${productIndex}`);
  if (!options.skipCopy) await copyIndex({ base, applicationId, apiKey: indexingKey, source: productIndex, destination: comparisonIndex, allowOverwrite: flag("ALLOW_INDEX_OVERWRITE"), dryRun: false });
}

const agentKey = options.dryRun ? optional("ALGOLIA_AGENT_STUDIO_MANAGEMENT_API_KEY", "<set in .env>") : required("ALGOLIA_AGENT_STUDIO_MANAGEMENT_API_KEY");
const spec = agentSpec({
  name: optional("AGENT_STUDIO_AGENT_NAME", "Agent Studio latency benchmark"),
  description: "Controlled benchmark agent for comparing raw Search and direct Agent Studio requests.",
  instructions: "Answer product questions using the benchmark search tool. Keep answers concise and ground product facts in search results. Do not claim that this controlled benchmark represents production traffic or capacity.",
  providerId: optional("AGENT_STUDIO_PROVIDER_ID"),
  model: optional("AGENT_STUDIO_MODEL"),
  productIndex,
  comparisonIndex,
});
const agent = options.skipAgent ? { id: optional(agentEnvName) } : await provisionAgent({ base, applicationId, apiKey: agentKey, agentId: optional(agentEnvName), spec, publish, dryRun: options.dryRun });

const runtimeValues = { ALGOLIA_INDEX_NAME: productIndex, ALGOLIA_BENCHMARK_COPY_INDEX: comparisonIndex, BENCHMARK_INDEX_TARGETS: `${productIndex},${comparisonIndex}`, [agentEnvName]: agent.id || optional(agentEnvName) };
if (!options.dryRun) {
  if (options.syncVercel && !runtimeValues[agentEnvName]) throw new Error(`Cannot sync Vercel until an Agent Studio agent ID exists. Remove --skip-agent or provide ${agentEnvName}.`);
  await writeProvisionedEnv(runtimeValues);
}
if (options.syncVercel) await syncVercelEnv({
  ALGOLIA_APPLICATION_ID: applicationId,
  ALGOLIA_SEARCH_API_KEY: options.dryRun ? "<search-key>" : required("ALGOLIA_SEARCH_API_KEY"),
  ALGOLIA_AGENT_STUDIO_API_KEY: options.dryRun ? "<runtime-key>" : required("ALGOLIA_AGENT_STUDIO_API_KEY"),
  ...runtimeValues,
  [agentEnvName]: options.dryRun ? "<created-agent-id>" : runtimeValues[agentEnvName],
  BENCHMARK_QUERY_FILE: "queries.example.ndjson",
  BENCHMARK_WEB_MODE: "demo",
}, { dryRun: options.dryRun });
console.log(`\nNext benchmark values ${options.dryRun ? "would be written to" : "were written to"} .env and provisioned.env:\nALGOLIA_INDEX_NAME=${productIndex}\nALGOLIA_BENCHMARK_COPY_INDEX=${comparisonIndex}\nBENCHMARK_INDEX_TARGETS=${productIndex},${comparisonIndex}\n${agentEnvName}=${agent.id || optional(agentEnvName, "<created-agent-id>")}`);
