# Specification

## Contract

Honor the user contract in `README.md`: controlled comparisons, separate Search and Agent Studio timings, synthetic-data labeling, no production-capacity claims, and multiple targets for dynamic-index tests.

## Scope

Build a local benchmark runner around a fixed query set, the available Algolia index, and one direct Agent Studio agent.

## Required behavior

- Run raw Algolia Search and direct Agent Studio variants.
- Capture route time, time to first token where available, total response time, status, errors, and available tool/token metadata.
- Support warm-ups, repeated low-concurrency trials, and p50/p95/p99 summaries.
- Change one configuration variable at a time.
- Mark all results with the test configuration and synthetic/controlled status.
- Require at least two approved targets before comparing static and dynamic index selection.

## Non-goals

No production load test, large-index claim, real-user analytics, or guaranteed per-stage Agent Studio trace.

## Acceptance

The runner produces repeatable raw measurements and a readable summary that states what the test can and cannot prove.
