# AGENTS.md

Read `README.md` first. It is the user contract. Read `SPEC.md` before changing behavior.

## Behavior

- Keep the benchmark focused on direct Agent Studio and raw Algolia Search comparisons. Do not add DocSearch.
- Keep credentials out of source, output, and committed files; never require an Admin API key.
- Use repeatable query cases, warm-ups, low-concurrency runs, and clearly labeled synthetic data.
- Report p50, p95, and p99 in plain English and preserve raw measurements for review.
- Do not infer production capacity or exact hosted-runtime stage timings from this benchmark.
- Keep the browser demo understandable to non-technical viewers. Preserve the terminal metaphor, plain-English metric explanations, and explicit synthetic/live labels.
- Make the smallest change that satisfies the request and update `SPEC.md` when behavior changes.

Before handing off work, run the documented checks and confirm the benchmark output identifies its configuration and limitations.
