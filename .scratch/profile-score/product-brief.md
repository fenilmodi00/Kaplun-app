# Profile Score — Product Brief

Synthesized from brainstorming (2026-08-08 → 2026-08-11). This is the standing brief for the Wayfinder map; open tickets still lock remaining decisions.

---

## 1. Why this exists

**Two jobs, one surface:**

1. **Retention** — keep existing creators opening Kaplun for a weekly “how am I doing?” moment.
2. **Acquisition gimmick** — market “Get your AI Profile Score” (ads, share cards, App Store copy). The feature itself is **OAuth-only** — no public username teaser, no scrape.

Connecting Instagram is the price of admission. That also feeds verified audience demographics into the creator database (brand-side value).

---

## 2. What the user gets (v1)

Not a long report. A **premium score moment**:

| Piece | Content |
|-------|---------|
| **Hero score** | 0–100 + short label (“Rising”, “Needs focus”) + one-line summary |
| **Do this next** | Exactly **3** prioritized actions (what / why / when–where to post) |
| **What’s working** | 2–3 strengths (number-backed) |
| **What to fix** | 1–3 weaknesses (number-backed) |
| **Share** | Stories-shaped PNG of the score card |

**Language:** English only for v1 (no Gujarati / Hinglish toggle yet).

**Surface:** New in-app bottom tab `(score)` — not buried under Insights.

---

## 3. Premium UX (so LLM spend doesn’t feel wasted)

Plain text after a spinner kills perceived value. Modern pattern (Credit Karma dial, Cred wait theater, Duolingo milestone gating, quiz “analyzing” stages):

### Phase A — Analysis Theater (first generate / refresh only)

While sync + LLM run (~15–45s), staged checklist — not a lone spinner:

1. Reading your last posts…
2. Checking engagement & saves…
3. Finding your best posting window…
4. Writing your action plan…

### Phase B — Score Reveal (rare delight)

~1.2–1.8s once per new report: circular ring fills 0→N, spring count-up, label + summary. **Skip on cached reopen** (Duolingo rule: don’t celebrate every tab open).

### Phase C — Staggered actions

Action cards cascade in first; strengths/weaknesses follow; sticky Share.

**Out of ceremony v1:** perpetual glow, Lottie every visit, language toggle, brand-readiness essay, content-ideas wall.

---

## 4. Data we collect (and how)

### Gate

- Creator must be signed in and have completed **Instagram OAuth** (existing Kaplun flow).
- No new Meta scopes / App Review for v1 — reuse insights permissions already on the professional account connection.
- Insights sync must have usable data (inline sync on generate if stale).

### Already in the insights pipeline (reader)

| Layer | What | Notes |
|-------|------|-------|
| **Creator profile** | username, followers, following, post count, bio | From Graph profile |
| **Derived creator stats** | engagement_rate, avg/median reel views, reels_count_7/30d, last_post_days, content_frequency_days, avg likes/comments | `computeDerived` |
| **Demo summaries** | top_cities, top_age_groups, top_gender_age_pairs | Only if followers ≥ ~100 |
| **Day series** | reach, follower_count, views per day | Meta fetches 30d; **today only upserts last 3 complete days** |
| **Media (last 10)** | caption, type, likes, comments + views/reach/saved/shares/… | Need more posts for richer top-posts |
| **Demographics rows** | age/gender/city/country breakdowns | ≥100 followers |
| **Online followers** | hour buckets 0–23 | Best posting window source |

### Fetched but not persisted today (gap)

| Metric | Status |
|--------|--------|
| `profile_views` | In account totals request — **not stored** |
| `profile_links_taps` | In account totals — **not stored** (funnel CTR) |
| Account-window saves/shares | Fetched in totals — **not stored** |

### New derived fields for Score

| Field | How |
|-------|-----|
| `content_language` | Unicode script detect on captions (Gujarati / Devanagari / English) — stored for later Indic reports; **UI English only in v1** |
| `profile_views_window` / `profile_link_taps_window` | Persist from existing totals during sync |
| Save/share rates | Σsaved/Σreach, Σshares/Σreach over media with reach > 0 |
| Best posting window | Top 3-hour slide over `online_followers` → e.g. `"19:00-22:00"` |
| Growth | last−first `follower_count` over persisted day series (`available=false` if &lt;2 points) |
| Top posts | Top 3 by views with ≤80-char caption preview |

### Likely sync upgrades (ticket pending)

To make growth + format sections non-starved:

- Raise `InsightDayUpsertWindow` 3 → **30** (no extra Meta calls — data already fetched)
- Raise `MediaSyncLimit` 10 → **25** (+15 per-media insight calls per sync)

---

## 5. How AI is used

### Rule: one LLM call, server-side only

```
OAuth creator
  → ensure insights fresh (inline sync if needed)
  → Go builds compact Metrics Payload (~400 tokens of numbers)
  → ONE OpenAI-compatible chat completion (JSON object)
  → Validate + cache in Appwrite profile_reports
  → App renders score ceremony
```

| Layer | Responsibility |
|-------|----------------|
| **Go (free)** | Aggregate metrics, language detect, cache, schema validation, clamp strings |
| **LLM (paid)** | Score + label + summary + strengths/weaknesses + 3 actions in plain English |
| **App** | Ceremony UI, share image — **never** holds LLM keys |

### What the LLM must NOT do

- Call tools / agent loops
- Invent numbers for `available=false` sections
- Cite metrics not present in the payload
- Generate Gujarati/Hinglish in v1 (English only)

### Prompt posture

“Instagram growth coach for Indian micro-influencers. Return ONLY JSON. Be specific and encouraging. Tailor when-to-post to the payload window. Every number you cite must appear in the payload.”

### Config

`LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` / `LLM_TIMEOUT_SECONDS` on api-go only.

### Cost shape (order of magnitude)

- ~400 in + ~800–1200 out tokens per generate
- **7-day cache** keyed by creator (+ language later) → most tab opens = ₹0 LLM
- Warm view = instant from Appwrite; cold = sync + LLM (~30–60s)

---

## 6. How it performs for Kaplun

| Outcome | Mechanism |
|---------|-----------|
| **Retention** | Weekly score check-in + “3 things to do” habit loop |
| **Acquisition** | Share card on Stories/WhatsApp; ads promise the score; install → OAuth → unlock |
| **Supply-side DB** | OAuth demographics (`audience_city`, age, gender) become **verified** brand filters |
| **Differentiation later** | Indic languages (Gujarati/Hinglish) — deferred; English score first |
| **Cost control** | Cache + single call + compact payload; no agent loops |

**Not the play in v1:** public HypeAuditor-style “enter any username” teaser (needs scrape or Business Discovery / Facebook Login).

---

## 7. Slim report schema (proposed — ticket to lock)

```json
{
  "overall_score": 0,
  "score_label": "string ≤40",
  "one_line_summary": "string ≤200",
  "strengths": ["2–3 strings"],
  "weaknesses": ["1–3 strings"],
  "action_plan": [
    {
      "priority": "high|medium|low",
      "action": "string",
      "why": "string",
      "when_to_post": "string"
    }
  ]
}
```

Exactly 3 `action_plan` items preferred. Dropped vs original long report: `content_ideas`, `brand_readiness`, `growth_tip_30d`, `posting_time_advice` as separate essay (fold into `when_to_post` on actions).

---

## 8. API sketch (proposed)

- `POST /reports/profile/generate` — body optional `{}`; English implied
- `GET /reports/profile/latest` — 404 if none
- Auth: Appwrite JWT Bearer (same as automations)
- Response: `{ report, meta: { model, tokens, created_at, cached } }`

---

## 9. Competitors (context)

| Player | Free hook | Lesson for us |
|--------|-----------|---------------|
| HypeAuditor | AQS 1–100 + fake followers | One hero number |
| Not Just Analytics | Tips + Stories share | Share = growth loop |
| Influencer Hero | Fake % + demos | Brand-vetting framing |
| AI wave (InstaIncognito, Keepface) | Narrative + 30-day plan | Actions &gt; dashboards |

Our edge: **real OAuth insights** + later Indic; v1 edge is **ceremony + actionable score**, not fake-follower ML.

---

## 10. Explicit non-goals (this effort)

- Public web teaser / Business Discovery
- New Meta App Review scopes
- Python / SQLite / Postgres
- LLM keys in the Expo app
- Multi-call agent chains
- en/hi/gu toggle (v1 English only)
- Monetization / paywall
- New cron loops (lazy regenerate on view)
- Replacing Insights tab charts
