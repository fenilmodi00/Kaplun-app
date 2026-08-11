# 05 — Score tab shell + Generate CTA

**What to build:** The app has a fifth bottom tab **Score** (after Insights). OAuth-connected creators see an empty state with **Generate my score** when there is no cache; after generate (or on reopen with cache) they see the scorecard content without requiring ceremony yet. Unconnected creators are steered to the existing Instagram connect flow.

**Blocked by:** 04 — Generate / latest API + hybrid report cache

**Type:** task  
**Status:** ready-for-agent

- [x] Tab bar: Home / Automate / Messages / Insights / **Score**
- [x] No cached report → empty state + explicit Generate CTA (no auto-start)
- [x] Generate calls the generate API; success shows hero score + label + summary + strengths/weaknesses + 3 actions (static Clay layout OK)
- [x] Reopen with cache → `GET latest` paints immediately; no accidental second generate
- [x] Auth/OAuth gates match the rest of the app (signed in + Instagram connected)
