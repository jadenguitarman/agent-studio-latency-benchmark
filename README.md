# Agent Studio latency benchmark

Controlled pre-production benchmark for identifying the main contributors to latency in a direct Agent Studio integration.

## User contract

- The benchmark compares a fixed query set under controlled conditions.
- It reports raw Search and Agent Studio timings separately where possible.
- Results are labeled as controlled or synthetic test data.
- It does not claim to predict production capacity, real-user behavior, or large-index performance.
- A single index supports a baseline; dynamic index comparisons require multiple approved targets.

## Planned local use

1. Copy `.env.example` to `.env` and fill in the required values.
2. Install the project dependencies.
3. Run the benchmark with `npm run benchmark`.
4. Review the generated p50, p95, and p99 results and the per-request measurements.
5. Change one variable at a time when comparing configurations.

See [SPEC.md](SPEC.md) for the implementation contract.
