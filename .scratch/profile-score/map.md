# Profile Score — Wayfinder Map

## Destination

Ship **Profile Score** as an OAuth-gated acquisition + retention gimmick: hybrid scorecard (Go owns 0–100, one LLM owns English coach copy), fifth **Score** tab, premium ceremony, share card — implementable via the ready-for-agent tickets below.

## Notes

- **Domain:** Instagram creator growth inside Kaplun (Expo + api-go + Appwrite). Glossary: root `CONTEXT.md`.
- **Standing brief:** [product-brief.md](./product-brief.md)
- **Tracker:** local markdown under `.scratch/profile-score/` (see `docs/agents/issue-tracker.md`).
- **Approach:** Hybrid scorecard (Approach 1) — market as “AI Profile Score”; model is coach, not judge.

## Decisions so far

- [Insights data inventory](./issues/01-insights-data-inventory.md) — resolved research (gaps + sync upgrades needed).
- **Marketing:** ads/App Store may say “AI Profile Score”; internals are hybrid rules + one LLM narrative call.
- **Score composition:** Go deterministic `overall_score`; LLM writes label/summary/strengths/weaknesses/3 actions only.
- **UX:** full Analysis Theater → Score Ring → staggered cards → Share; Generate via explicit CTA (no auto-start); skip ring on cache reopen.
- **Surface:** fifth bottom tab **Score** after Insights; English only v1.
- **Cache:** 7-day report cache; manual Refresh always regenerates.
- **Sync upgrades:** persist funnel windows; day upsert 3→30; media limit 10→25.
- **Schema:** slim scorecard JSON; score field owned by Go at merge time.
- **Non-goals:** public username teaser, fake-follower ML, paywall, Indic languages in v1, agent loops, LLM keys in app.

## Frontier

Work tickets whose blockers are done, in number order:

1. [02 — Insights sync upgrades](./issues/02-insights-sync-upgrades.md)
2. [03 — Metrics payload + deterministic score](./issues/03-metrics-payload-and-score.md)
3. [04 — Generate / latest API + hybrid cache](./issues/04-generate-latest-api-hybrid-cache.md)
4. [05 — Score tab shell + Generate CTA](./issues/05-score-tab-shell-generate-cta.md)
5. [06 — Premium ceremony](./issues/06-premium-ceremony.md)
6. [07 — Share score card](./issues/07-share-score-card.md)

## Out of scope

- Public username teaser / Business Discovery / Facebook Login path.
- Fake-follower / AQS ML models (HypeAuditor-class).
- Paywall / subscription gating for Score.
- Replacing the Insights charts tab.
- Gujarati/Hinglish report generation in this effort.
- Multi-agent LLM tool loops.
- Pure-LLM scoring (drift risk) or rules-only v1 (deferred; hybrid is locked).
