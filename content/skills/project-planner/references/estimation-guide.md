# Estimation Guide

## T-Shirt Sizing

| Size | Effort | Typical Duration | Complexity |
|------|--------|-----------------|------------|
| **S** | A few hours | < 1 day | Well-understood, minimal risk |
| **M** | 1–2 days | 1–3 days | Some unknowns, moderate scope |
| **L** | 3–5 days | 1 week | Significant complexity, dependencies |
| **XL** | 1–2 weeks | 1–2 weeks | High uncertainty, needs decomposition |

**Rule:** If it's XL, break it down further until all pieces are L or smaller.

## Common Estimation Mistakes

1. **Anchoring** — First estimate dominates. Use Planning Poker to avoid.
2. **Optimism bias** — "It should only take..." → multiply by 1.5–2x
3. **Forgetting overhead** — Code review, testing, deployment, documentation
4. **Ignoring dependencies** — Waiting for other teams, external APIs, approvals
5. **Confusing effort with duration** — 4 hours of work ≠ done today if context-switching

## Buffer Guidelines

| Confidence Level | Buffer Multiplier |
|-----------------|-------------------|
| High (done this before) | 1.2x |
| Medium (similar experience) | 1.5x |
| Low (new territory) | 2.0x |
| Unknown (research spike needed) | Do a timeboxed spike first |

## When to Re-estimate

- Scope changes (even "small" ones compound)
- New information about complexity or dependencies
- After a spike reveals more than expected
- When 30% of the timeline has passed with < 20% progress
