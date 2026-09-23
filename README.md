# Agent Studio latency benchmark

Controlled pre-production benchmark for identifying the main contributors to latency in a direct Agent Studio integration.

## Planned demo

- Fixed representative query set against the available Algolia product index.
- Raw Algolia Search baseline compared with direct Agent Studio completions.
- Measurements for route time, time to first token, total response time, status, errors, and available tool or token metadata.
- Warm-up runs, repeated low-concurrency trials, and p50/p95/p99 reporting.
- Optional one-variable comparisons for result limits, returned attributes, prompts, tool instructions, streaming, cache settings, or multiple approved index targets.

Results will be labeled as controlled or synthetic test data. They are not production-capacity or large-index benchmarks.
