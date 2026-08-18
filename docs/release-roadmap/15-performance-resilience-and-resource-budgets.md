# Step 15 — Set Performance, Resilience, and Resource Budgets

## Outcome

Define and enforce customer-relevant budgets for startup, scanning, memory, model loading, command latency, API latency, webhook processing, database queries, package size, and failure recovery.

## Product view

Local intelligence must feel responsive and predictable on supported developer machines. Commercial services must degrade safely under provider, network, or database faults.

## Planned repository changes

### Core

- Benchmark profile composition, rule execution, license validation, queueing, and serialization with stable fixtures.
- Define cancellation, timeout, retry, concurrency, and resource ownership semantics in interfaces.
- Add leak and unbounded-growth tests for long-running processes.

### Vectalon

- Establish budgets by command and project size; profile cold/warm CLI, daemon, MCP, local-model, and benchmark paths.
- Reduce package/install footprint and verify optional heavy dependencies remain lazy.
- Add graceful cancellation, bounded caches/queues, and actionable progress for long operations.

### Admin

- Set API/query/webhook/reconciliation SLOs, backpressure, queue limits, retry policies, and circuit breakers.
- Load-test critical paths and test provider/database partial failure.
- Add capacity signals and cost budgets tied to customer and event volume.

## Deliverables

- Performance baseline, budget table, load model, resilience matrix, profiling playbook, and regression gates.

## Reviewer gate

- Budgets are measured in CI or scheduled qualification with controlled variance.
- Timeouts and retries cannot duplicate commercial effects.
- Resource exhaustion degrades service without corrupting customer state.

## Risks and dependencies

- Depends on Step 14 fixtures.
- Machine-dependent model benchmarks require normalized tiers and statistical thresholds.
