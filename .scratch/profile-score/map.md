# Profile Score — Wayfinder Map

## Destination

A locked, implementable design for **Profile Score**: OAuth-gated in-app scorecard (data contracts, AI role, premium ceremony UX, performance/cost) ready to hand to an implementation plan — not the build itself.

## Notes

- **Domain:** Instagram creator growth inside Kaplun (Expo + api-go + Appwrite). Glossary: root `CONTEXT.md`.
- **Standing brief:** [product-brief.md](./product-brief.md) — data inventory, AI usage, UX ceremony, business performance.
- **Skills:** `/grilling`, `/domain-modeling`, `/research`; after the map clears → `/to-spec` then writing-plans / implement.
- **Tracker:** local markdown under `.scratch/profile-score/` (see `docs/agents/issue-tracker.md`).
- **Locked preferences from grilling (2026-08-08…11):**
  - Dual job: retention + acquisition gimmick; **OAuth-only** unlock (no username teaser).
  - Approach **1 — Scorecard** (not long report): score + 3 actions + strengths/weaknesses.
  - Surface: **new bottom tab**, English only for v1.
  - Premium reveal preferred: Analysis Theater → Score Ring → staggered actions → share card.
  - Stack: reuse insights pipeline + one server-side OpenAI-compatible LLM call + 7-day Appwrite cache.
  - No Python, no LLM keys in app, no agent loops, no new Meta scopes.

## Decisions so far

- [What insights data already exists vs Profile Score gaps](./issues/01-insights-data-inventory.md) — Pipeline has derived stats, last-10 media insights, demos/online_followers (≥100); funnel totals fetched but not persisted; day upsert only 3 days; need sync window/media limit bumps + language/funnel persistence.

## Not yet specified

- Exact share-card visual layout (Stories 9:16 vs square) once UX + schema lock.
- Whether score **improves** trigger a second celebration (Duolingo milestone style) vs only first generate.
- Post-v1 Indic language wave and marketing landing page (out of this destination until redrawn).
- How Home/onboarding copy mentions Score without a public analyzer.

## Out of scope

- Public username teaser / Business Discovery / Facebook Login path.
- Fake-follower / AQS ML models (HypeAuditor-class).
- Paywall / subscription gating for Score.
- Replacing the Insights charts tab.
- Gujarati/Hinglish report generation in this effort.
- Multi-agent LLM tool loops.
