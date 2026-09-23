# Agent Studio latency benchmark

Controlled pre-production benchmark for identifying the main contributors to latency in a direct Agent Studio integration.

## User contract

- The benchmark compares a fixed query set under controlled conditions.
- It reports raw Search and Agent Studio timings separately where possible.
- Results are labeled as controlled or synthetic test data.
- It does not claim to predict production capacity, real-user behavior, or large-index performance.
- A single index supports a baseline; dynamic index comparisons require multiple approved targets.

## Local use

1. Use Node.js 20.9 or newer and copy `.env.example` to `.env`.
2. Fill in the application ID, product index, runtime, management, and indexing keys, and the Agent Studio provider/model if the script will create an agent. Do not use or commit an Admin API key.
3. Run `npm run provision`. It verifies the product index, copies it to the controlled comparison index, and creates or updates the direct Agent Studio benchmark agent. It refuses to replace an existing comparison index unless `ALLOW_INDEX_OVERWRITE=true`.
4. Copy the printed values into `.env`; `provisioned.env` contains the same non-secret names and IDs and is ignored by Git.
5. Keep `queries.example.ndjson` or point `BENCHMARK_QUERY_FILE` at a local, non-sensitive newline-delimited query file. Each line can be plain text or `{ "id": "...", "query": "...", "tags": [] }`.
6. Run `npm run benchmark` and review the generated `results/run-*.md` summary and matching `results/run-*.json` raw measurements.
7. For a dynamic-index comparison, use the two targets printed by provisioning. The runner sends one target per Agent Studio request and also runs raw Search controls for those targets.

## Browser demo

Run `npm run dev` and open `http://localhost:3000`. The Next.js page is a readable terminal-style presentation of the same CLI benchmark. Its server-side Route Handler runs the benchmark implementation in-process, and the same app can run on Vercel. It runs three comparisons—raw Search, Agent Studio with a fixed index, and Agent Studio with a request-selected index—and explains p50, p95, route time, time to first token, and total response time in plain English.

The browser defaults to deterministic synthetic demo mode, so a blog reader can run it without credentials. If the server has a complete `.env`, it shows an optional live toggle. Live mode is still a small controlled run, not production telemetry. Set `BENCHMARK_WEB_MODE=demo` for a public deployment unless live runs are deliberately enabled.

`npm run provision -- --dry-run` prints the planned copy and agent write without contacting Algolia. Use `--skip-copy` or `--skip-agent` to leave one side unchanged. The provisioning script uses the direct Agent Studio API and Algolia Search indexing endpoints; it does not use DocSearch.

Use `npm run benchmark -- --dry-run` to validate the environment and query file without making network requests. `--iterations`, `--warmups`, `--concurrency`, `--timeout-ms`, and `--output-dir` override one run without editing `.env`.

The runner records response-header route time, total body-read time, Agent Studio time to first streaming chunk (the available TTFT proxy) when available, status/errors, response size, and metadata exposed by the response such as token usage or tool events. Warm-ups remain in raw JSON but are excluded from percentile summaries. It deliberately does not store response bodies or credentials.

The results are labeled with `BENCHMARK_DATA_LABEL` (default `synthetic-controlled`). They are controlled observations, not claims about production capacity, real-user behavior, large-index performance, or exact hosted-runtime stage timings.

The app uses the Next.js App Router. Keep credentials in server-only environment variables when deploying to Vercel; do not prefix them with `NEXT_PUBLIC_`.

## Checks

Run `npm test` for the mocked client, demo transport, and summary tests. The test suite does not contact Algolia. `npm run benchmark -- --dry-run` validates required configuration and the query file without making network requests. `npm run benchmark -- --demo --progress` runs the same CLI path used by the browser without credentials.

See [SPEC.md](SPEC.md) for the implementation contract.
