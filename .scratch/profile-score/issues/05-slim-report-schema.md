# Lock slim English report JSON schema

Type: grilling
Status: open
Blocked by: 03

## Question

Confirm the LLM output schema for v1 English scorecard.

Proposed in [product-brief.md §7](../product-brief.md):

- `overall_score`, `score_label`, `one_line_summary`
- `strengths` (2–3), `weaknesses` (1–3)
- `action_plan` (exactly 3): `priority`, `action`, `why`, `when_to_post`

**Drop from original long report:** `content_ideas`, `brand_readiness`, `growth_tip_30d`, standalone `posting_time_advice`.

Approve as-is, or list required adds/removes/renames?

➡️ Recommended: **approve proposed slim schema** — keeps UI and tokens tight.
