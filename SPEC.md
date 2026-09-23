# Specification

## Contract

Honor the user contract in `README.md`: controlled comparisons, separate Search and Agent Studio timings, synthetic-data labeling, no production-capacity claims, and multiple targets for dynamic-index tests.

## Scope

Build a local benchmark runner around a fixed query set, the available Algolia index, and one direct Agent Studio agent.

The repository also exposes a browser demo. The Next.js page presents the CLI-style output, and a Node.js Route Handler uses the same benchmark implementation in-process. Demo mode uses deterministic synthetic responses and live mode uses the configured endpoints when all required credentials are present. The app is compatible with Vercel.

## Required behavior

- Run raw Algolia Search and direct Agent Studio variants.
- Capture route time, time to first token where available, total response time, status, errors, and available tool/token metadata.
- Support warm-ups, repeated low-concurrency trials, and p50/p95/p99 summaries.
- Change one configuration variable at a time.
- Mark all results with the test configuration and synthetic/controlled status.
- Require at least two approved targets before comparing static and dynamic index selection.
- Preserve every warm-up and measured request as a raw JSON measurement without storing credentials or response bodies.
- Write a readable Markdown report beside the raw JSON output, including plain-language percentile statements and explicit limitations.
- Use the published Agent Studio completions endpoint with a Search-capable key; the runner must not require an Admin API key.

## Non-goals

No production load test, large-index claim, real-user analytics, or guaranteed per-stage Agent Studio trace.

The browser is not a production monitoring dashboard and does not expose credentials or response bodies.

## Provisioning

`npm run provision` verifies the supplied product index, copies it to a second controlled target, and creates or updates a direct Agent Studio benchmark agent configured with the native `algolia_search_index` tool in dynamic mode. The copy is useful for comparing two index targets with the same records; it does not create production traffic or analytics. `ALGOLIA_INDEXING_API_KEY` is used for verification/copy operations, `ALGOLIA_AGENT_STUDIO_MANAGEMENT_API_KEY` is used only for agent create/update/publish, and `ALGOLIA_AGENT_STUDIO_API_KEY` remains the runtime completion key. The script never needs an Admin API key.

## Acceptance

The runner produces repeatable raw measurements and a readable summary that states what the test can and cannot prove. The browser makes the same distinction visible to non-technical viewers, including the meaning of p50/p95 and the difference between route time, time to first token, and total response time.
