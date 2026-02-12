# Performance Improvements Roadmap

Scales:
- Complexity: `1` (low) to `5` (high)
- Expected Gain: `1` (small) to `5` (large)

## Ranked Ideas (Complexity First, Then Gain)

| Rank | Idea | Complexity | Gain | Notes |
|---|---|---:|---:|---|
| 1 | Add frame-time budgets and profiling checkpoints by subsystem | 1 | 5 | Baseline required to validate all other optimizations |
| 2 | Render culling by viewport for non-critical visuals | 1 | 4 | Render only in-view visuals while keeping gameplay simulation global |
| 3 | Throttle UI/DOM writes and update only when values change | 1 | 3 | Reduces layout/reflow and DOM churn |
| 4 | Gate expensive text rendering to "needed" cases only | 1 | 3 | Example: status labels only near cursor/selection |
| 5 | Cap particles/lights/bursts per frame with priority | 2 | 5 | Stabilizes frame-time under heavy combat |
| 6 | Object pooling for particles/projectiles/lights | 2 | 4 | Reduces garbage-collection spikes |
| 7 | Dynamic quality governor based on frame-time | 2 | 4 | Auto scales visuals under load |
| 8 | Stagger low-priority visual updates across frames | 2 | 3 | Smooths frame spikes |
| 9 | Replace repeated scans with cached sets/lists | 2 | 3 | Reduces repeated O(n) filtering work |
| 10 | Spatial hash/grid broad-phase for targeting and chain lookups | 3 | 5 | Large CPU win in high-entity scenarios |
| 11 | Cache static geometry/path drawing primitives | 3 | 3 | Reduces draw setup overhead |
| 12 | Batch render operations by style/material | 3 | 3 | Fewer canvas state changes |
| 13 | Move path/rift generation and wave precompute to Web Worker | 4 | 4 | Offloads intermittent heavy computations |
| 14 | Move save/telemetry post-processing off main thread | 4 | 2 | Reduces UI hitches during saves/reports |
| 15 | OffscreenCanvas rendering pipeline in worker | 5 | 4 | High potential, medium/high integration cost |
| 16 | Data-oriented entity architecture (ECS/typed arrays) | 5 | 5 | Maximum long-term scalability, biggest refactor |

## Complexity 1 Scope

- [x] C1-1 Profiling checkpoints + subsystem frame budgets
- [x] C1-2 Viewport culling for non-critical visuals
- [x] C1-3 UI throttling + update-on-change writes
- [x] C1-4 Expensive text gating to needed context

## Complexity 2 Scope

- [x] C2-5 Cap particles/lights/bursts per frame with priority
- [x] C2-6 Object pooling for particles/projectiles/lights
- [x] C2-7 Dynamic quality governor based on frame-time
- [x] C2-8 Stagger low-priority visual updates across frames
- [x] C2-9 Replace repeated scans with cached sets/lists

## Suggested Implementation Phases

1. Phase A: Complexity 1 (`1-4`)
2. Phase B: Complexity 2 (`5-9`)
3. Phase C: Complexity 3 (`10-12`)
4. Phase D: Complexity 4-5 (`13-16`)

## Validation Targets

- Median frame-time <= `16.7ms` at target wave density
- 99th percentile frame-time improved by >= `30%` from pre-optimization baseline
- Gameplay parity preserved (no simulation drift from render culling/throttling)


## EXTRA CONCERNS
after shoot the game gets junk framkes
