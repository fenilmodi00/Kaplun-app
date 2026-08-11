# 03 — Metrics payload + deterministic score

**What to build:** From synced insights, Go builds a compact Metrics Payload and a stable **0–100** Profile Score using logical bands (engagement, cadence, growth, funnel, posting window when available). No LLM in this ticket — the number is fully deterministic and unit-tested so week-to-week comparisons don’t drift.

**Blocked by:** 02 — Insights sync upgrades for Score

**Type:** task  
**Status:** ready-for-agent

- [x] Payload includes the fields Score/coach need (derived stats, growth when ≥2 day points, best posting window from online_followers, save/share rates, top posts preview, content_language detect) with clear `available=false` when data is missing
- [x] `overall_score` is computed only in Go from documented bands/weights; same inputs → same score
- [x] Table-driven Go tests lock score bands and "insufficient data" behavior
- [x] Payload stays small enough for a later single LLM call (~hundreds of tokens of numbers)
