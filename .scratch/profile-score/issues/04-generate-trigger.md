# First-open behavior — auto-generate vs explicit CTA

Type: grilling
Status: open
Blocked by: 02

## Question

When a connected creator opens the Score tab with no cached report:

**A)** Auto-start generate + Analysis Theater immediately.  
**B)** Show empty state with **Generate my score** CTA; user taps to start.  
**C)** Auto-start only once ever (onboarding); later regenerates require explicit refresh.

## Context

Auto-start feels magical but burns an LLM call on accidental tab taps and surprises users who aren’t ready to wait 30s. Explicit CTA is clearer about cost/wait.

➡️ Recommended: **B** for v1 — predictable; theater still sells the wait after tap.
