# Kaplun

Mobile app and backend for Instagram creators: automations, insights, messaging, and growth coaching.

## Language

**Creator**:
A signed-up Kaplun user with an Instagram professional account connected via OAuth.
_Avoid_: Influencer (unless brand-facing copy), account owner

**Profile Score**:
The OAuth-gated 0–100 hero number and short coaching package shown on the Score tab.
_Avoid_: AI Profile Report, audit, AQS (competitor term)

**Metrics Payload**:
The compact, pre-aggregated JSON of insights numbers sent to the LLM — not raw Graph dumps.
_Avoid_: Insights dump, prompt context dump

**Action Plan**:
Exactly three prioritized next steps (what, why, when to post) derived for the Creator.
_Avoid_: Recommendations list, tips dump

**Analysis Theater**:
The staged “analyzing…” checklist shown while sync and LLM run on generate — not a bare spinner.
_Avoid_: Loading spinner (alone)

**Score Reveal**:
The rare animated ring count-up when a new Profile Score is ready; skipped on cache hits.
_Avoid_: Celebration (unless milestone language is intentional)

**Insights Sync**:
The api-go job that pulls Meta insights into Appwrite for a Creator.
_Avoid_: Scrape, crawl
