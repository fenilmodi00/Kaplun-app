# Insights sync upgrades required for Score quality

Type: grilling
Status: open
Blocked by: 01

## Question

As part of Profile Score, do we approve these insights pipeline changes?

1. Persist `profile_views_window` + `profile_link_taps_window` from existing account totals.  
2. Raise `InsightDayUpsertWindow` from **3 → 30**.  
3. Raise `MediaSyncLimit` from **10 → 25**.

## Context

Without (2)/(3), growth and top-posts sections starve (see research ticket 01). Cost of (3): up to +15 per-media insight calls per creator sync. (2) is persistence-only — Meta already returns the 30d series.

➡️ Recommended: **approve all three** — otherwise the coach invents “insufficient data” too often.
