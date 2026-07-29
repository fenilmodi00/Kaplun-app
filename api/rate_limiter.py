# api/rate_limiter.py
"""750 DMs/hour/account (Meta Private Replies cap) — logic port of openreply's
lib/utils/rate-limiter.ts (MIT License, Copyright (c) 2026 Anish Raj, Diwen Huang).

Their atomic Redis Lua counter becomes: count of automation_logs rows with
action in (pending, dm_sent, button_dm_sent) in the rolling hour. The worker's
'pending' log row IS the reservation (created before send)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

RATE_LIMIT_MAX = 750
REQUEUE_DELAY_MINUTES = 30
MAX_REQUEUE_ATTEMPTS = 3


@dataclass(frozen=True)
class RateDecision:
    allowed: bool
    current_count: int
    should_requeue: bool
    should_skip: bool
    requeue_delay_minutes: int


def check_dm_rate(store, ig_user_id: str, requeue_attempt: int = 0) -> RateDecision:
    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    count = store.count_recent_dm_actions(ig_user_id, since)
    if count < RATE_LIMIT_MAX:
        return RateDecision(True, count, False, False, 0)
    if requeue_attempt >= MAX_REQUEUE_ATTEMPTS:
        return RateDecision(False, count, False, True, 0)
    return RateDecision(False, count, True, False, REQUEUE_DELAY_MINUTES)
