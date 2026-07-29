from api.rate_limiter import check_dm_rate, RATE_LIMIT_MAX


class FakeStore:
    def __init__(self, n):
        self.n = n

    def count_recent_dm_actions(self, ig, since):
        return self.n


def test_allowed_under_cap():
    d = check_dm_rate(FakeStore(10), "ig1", requeue_attempt=0)
    assert d.allowed and d.current_count == 10


def test_at_cap_requeues_first_times():
    d = check_dm_rate(FakeStore(RATE_LIMIT_MAX), "ig1", requeue_attempt=1)
    assert not d.allowed and d.should_requeue and d.requeue_delay_minutes == 30 and not d.should_skip


def test_at_cap_skips_after_max_attempts():
    d = check_dm_rate(FakeStore(RATE_LIMIT_MAX), "ig1", requeue_attempt=3)
    assert not d.allowed and d.should_skip and not d.should_requeue
