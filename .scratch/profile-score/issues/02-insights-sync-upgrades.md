# 02 — Insights sync upgrades for Score

**What to build:** When insights sync runs for a connected creator, Kaplun persists the funnel counters Score needs (`profile_views_window`, `profile_link_taps_window`), keeps up to **30** complete insight days (not 3), and syncs up to **25** media items — so growth, top posts, and funnel sections have real numbers instead of starving.

**Blocked by:** 01 — Insights data inventory

**Type:** task  
**Status:** ready-for-agent

- [x] Account totals already fetched from Meta persist `profile_views_window` and `profile_link_taps_window` on the creator/insights path Score will read
- [x] Day-series upsert window is **30** complete days (no extra Meta range calls beyond what sync already fetches)
- [x] Media sync limit is **25** with per-media insights as today
- [x] Existing insights sync tests cover the new persistence/window/limit behavior (or a small colocated test does)
