# Score composition — LLM judgment vs hybrid rules

Type: grilling
Status: open
Blocked by: 02

## Question

How is `overall_score` (0–100) produced?

**A)** Pure LLM judgment from the Metrics Payload (prompt asks for score; Go only clamps 0–100).  
**B)** Hybrid: Go computes a deterministic base score from engagement/growth/cadence/funnel bands; LLM may nudge ±N and writes label/summary/actions.  
**C)** Go-only numeric score; LLM writes narrative + actions only (never the number).

## Context

Competitors sell a proprietary hero number (HypeAuditor AQS). Creators will compare scores week to week — pure LLM can drift. Hybrid/Go-only is more stable for retention.

➡️ Recommended: **B (hybrid)** — stable retention loop + LLM still owns the coaching voice.
