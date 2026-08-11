# Cache TTL and force refresh rules

Type: grilling
Status: open
Blocked by: 05

## Question

Confirm caching policy:

**A)** Serve cached report if `created_at` is after `last_api_sync_at` AND younger than **7 days**; else regenerate. Manual **Refresh** always regenerates (and re-runs theater).  
**B)** 7-day cache with **no** manual refresh in v1.  
**C)** Shorter TTL (e.g. 3 days) because creators post often.

➡️ Recommended: **A** — cheap by default, escape hatch when they just posted a viral Reel.
