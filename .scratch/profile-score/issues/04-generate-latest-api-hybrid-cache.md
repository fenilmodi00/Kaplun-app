# 04 — Generate / latest API + hybrid report cache

**What to build:** A connected creator can generate a Profile Score report via the API: Go ensures insights are fresh, computes `overall_score`, calls **one** OpenAI-compatible chat completion for English coach copy only (label, summary, strengths, weaknesses, exactly 3 actions), validates/clamps JSON, and caches the merged report in Appwrite. Warm clients load the latest report without spending again. Marketing may say “AI Profile Score”; the model never sets the number.

**Blocked by:** 03 — Metrics payload + deterministic score

**Type:** task  
**Status:** ready-for-agent

- [x] `POST /reports/profile/generate` (Appwrite JWT) returns `{ report, meta }` with Go-owned `overall_score` and LLM-owned narrative fields
- [x] Slim schema: `score_label`, `one_line_summary`, `strengths` (2–3), `weaknesses` (1–3), `action_plan` (exactly 3: priority / action / why / when_to_post); English only
- [x] LLM must not invent metrics for `available=false` sections; invalid/partial JSON is rejected or repaired by Go clamps — never trusted raw
- [x] `GET /reports/profile/latest` returns cached report or 404
- [x] Cache: serve if younger than **7 days** and not older than insights freshness rules; manual **Refresh** always regenerates (new LLM call)
- [x] LLM keys only on api-go (`LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` / `LLM_TIMEOUT_SECONDS`); handler tests fake the LLM client
