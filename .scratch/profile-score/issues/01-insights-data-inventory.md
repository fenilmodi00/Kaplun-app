# What insights data already exists vs Profile Score gaps

Type: research
Status: resolved

## Question

What Instagram insights data does Kaplun already collect and persist today, and what gaps must Profile Score close (funnel persistence, day window, media limit, content language, posting window derivation)?

## Answer

Inventory from `api-go/internal/services/insights` + `insights_store.go` (2026-08-11):

**Have:** creator derived columns (engagement_rate, reel view stats, cadence, demo string tops); media last **10** with views/reach/saved/shares; demographics + online_followers hour buckets when followers ≥ 100; Meta day series fetched for 30d but only **3** complete days upserted per sync.

**Fetched not persisted:** `profile_views`, `profile_links_taps` (and other account totals beyond what feeds engagement_rate).

**Gaps for Score:** persist funnel window counters; raise day upsert 3→30 for growth; raise media 10→25 for top posts/format; derive best posting window from online_followers; detect `content_language` from captions.

Full write-up lives in [product-brief.md §4](../product-brief.md).

## Comments

- Research completed during map charting via codebase explore.
