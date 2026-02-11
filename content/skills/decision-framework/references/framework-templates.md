# Decision Framework Templates

## Weighted Decision Matrix Template

```
| Criteria (weight) | Option A | Option B | Option C |
|--------------------|----------|----------|----------|
| Cost (5)           | 3 → 15  | 4 → 20  | 2 → 10  |
| Speed (4)          | 4 → 16  | 2 → 8   | 5 → 20  |
| Quality (3)        | 5 → 15  | 4 → 12  | 3 → 9   |
| Risk (4)           | 3 → 12  | 5 → 20  | 2 → 8   |
| **Total**          | **58**   | **60**   | **47**   |
```

### Sensitivity Analysis
After scoring, test robustness:
- What if the top criterion weight changes by ±1?
- Does the winner change? If yes, the decision is sensitive to that assumption.

## Pre-mortem Worksheet

```
Decision: [What we're deciding]
Date: [When we decided]
Decision maker: [Who owns this]

Imagined failure scenario:
"It's [date + 6 months] and this decision has failed."

Failure reasons (ranked):
1. [Most likely failure] — Likelihood: H/M/L — Preventable: Y/N
2. [Second failure mode] — Likelihood: H/M/L — Preventable: Y/N
3. ...

Mitigations:
- For #1: [What we'll do now to prevent it]
- For #2: [What we'll do now to prevent it]

Revisit triggers:
- [ ] If [condition], reconsider this decision
- [ ] Check back on [date] regardless
```

## RACI Matrix Template

```
| Task / Decision    | Responsible | Accountable | Consulted | Informed |
|--------------------|-------------|-------------|-----------|----------|
| Final decision     | [Name]      | [Name]      | [Names]   | [Names]  |
| Research options    | [Name]      | [Name]      | [Names]   | [Names]  |
| Implementation      | [Name]      | [Name]      | [Names]   | [Names]  |
```

Rules:
- Exactly **one** Accountable per row
- Responsible does the work; Accountable owns the outcome
- Consulted = two-way conversation before decision
- Informed = one-way notification after decision

## Decision Record Template

```
# Decision: [Title]

## Status: [Proposed | Accepted | Deprecated | Superseded]

## Context
[Why this decision was needed. What constraints exist.]

## Options Considered
1. **Option A** — [Brief description + pros/cons]
2. **Option B** — [Brief description + pros/cons]

## Decision
We chose **Option X** because [reasoning].

## Consequences
- [Positive consequence]
- [Negative consequence / trade-off]
- [What we'll need to monitor]

## Revisit If
- [Condition that would make us reconsider]
```
