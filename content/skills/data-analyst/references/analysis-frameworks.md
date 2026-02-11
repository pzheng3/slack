# Analysis Frameworks Reference

## Statistical Significance Quick Guide

| Sample Size | Minimum Detectable Effect |
|-------------|--------------------------|
| 100 | ~20% relative change |
| 1,000 | ~6% relative change |
| 10,000 | ~2% relative change |
| 100,000 | ~0.6% relative change |

Rule of thumb: If `p < 0.05` and the effect size is meaningful for the business, it's worth acting on.

## Cohort Analysis Pattern

1. Define cohorts by time period or attribute (signup month, plan type, region)
2. Track the same metric across cohorts over time
3. Look for: improving/degrading cohort curves, retention patterns, seasonal effects
4. Report: "Users who joined in Q1 retain 15% better than Q4 cohort at 90 days"

## Funnel Analysis Pattern

1. Define the conversion steps (visit → signup → activate → purchase)
2. Calculate conversion rate at each step
3. Identify the biggest drop-off point
4. Segment by user attributes to find "who converts better"
5. Estimate revenue impact of improving each step by X%

## Root Cause Analysis (5 Whys)

1. State the observed problem clearly
2. Ask "why did this happen?" — get to the immediate cause
3. Repeat "why?" for each answer (up to 5 levels)
4. Look for systemic causes (process, tooling, incentives) vs. one-off incidents
5. Recommend fixes at the deepest actionable level

## A/B Test Evaluation Checklist

- [ ] Was the sample size sufficient for the expected effect size?
- [ ] Was the test run long enough to capture weekly patterns?
- [ ] Were there any external events during the test period?
- [ ] Is the metric sensitive enough to detect the change?
- [ ] Did you check for novelty effects vs. sustained impact?
- [ ] Are there segments where the effect differs significantly?

## Time Series Decomposition

When analyzing trends over time:
1. **Trend** — Long-term direction (growing, shrinking, stable)
2. **Seasonality** — Recurring patterns (day-of-week, monthly, quarterly)
3. **Cyclical** — Business cycles or product cycles
4. **Irregular** — One-off events, anomalies, data quality issues

Always separate these components before drawing conclusions.
