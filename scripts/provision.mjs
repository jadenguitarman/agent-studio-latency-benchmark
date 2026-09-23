import { agentSpec, algoliaBase, args, copyIndex, flag, indexExists, loadDotEnv, optional, provisionAgent, required, writeProvisionedEnv } from "./provision-lib.mjs";

await loadDotEnv();
const options = args();
const applicationId = required("ALGOLIA_APPLICATION_ID");
const productIndex = required("ALGOLIA_INDEX_NAME");
const comparisonIndex = optional("ALGOLIA_BENCHMARK_COPY_INDEX", "agent_studio_latency_copy");
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
const agent = options.skipAgent ? { id: optional("AGENT_STUDIO_AGENT_ID") } : await provisionAgent({ base, applicationId, apiKey: agentKey, agentId: optional("AGENT_STUDIO_AGENT_ID"), spec, publish, dryRun: options.dryRun });

if (!options.dryRun) await writeProvisionedEnv({ ALGOLIA_INDEX_NAME: productIndex, ALGOLIA_BENCHMARK_COPY_INDEX: comparisonIndex, BENCHMARK_INDEX_TARGETS: `${productIndex},${comparisonIndex}`, AGENT_STUDIO_AGENT_ID: agent.id });
console.log(`\nNext benchmark values:\nALGOLIA_INDEX_NAME=${productIndex}\nALGOLIA_BENCHMARK_COPY_INDEX=${comparisonIndex}\nBENCHMARK_INDEX_TARGETS=${productIndex},${comparisonIndex}\nAGENT_STUDIO_AGENT_ID=${agent.id || "<created-agent-id>"}`);
