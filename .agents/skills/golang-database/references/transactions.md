# Consistency without SQL transactions

TablesDB is a document store. There is no `BeginTxx`, no isolation levels, no `SELECT FOR UPDATE`. Do not invent a SQL transaction wrapper around Appwrite.

## Default: idempotent single-row writes

Every write must be safe to retry (webhooks, sweeper, reconcile poller are at-least-once).

```go
// Upsert by known id — Create 409 → Update, or Get then Update.
_, err := s.client.CreateRow(ctx, table, rowID, data, nil)
if err != nil {
    if apiErr, ok := err.(*appwrite.APIError); ok && apiErr.Status == 409 {
        _, err = s.client.UpdateRow(ctx, table, rowID, data, nil)
    }
}
```

Prefer a **deterministic row id** (hash of natural key) over `unique()` when the row must exist once. Pair with a unique index on that natural key.

## Unique indexes are the lock

Use a unique index for "one automation per creator+media", "one job per comment", etc. Treat HTTP 409 as the conflict signal (`apperr` type / status 409). Do not retry 409 as if it were transient.

## Multi-row work

When one user action touches several tables (create automation + seed a job + write a log):

1. Write the source-of-truth row first (automation).
2. Derived rows (job, log) key off that id so a retry can skip/create-if-missing.
3. If a later write fails, leave enough state for the sweeper/reconcile loop to finish — do not manually "rollback" by deleting the first row unless the domain requires it (and then the delete must also be idempotent).

Kaplun already uses this shape: jobs are retried by the sweeper; webhook handlers return 200 and persist progress.

## Staged `transaction_id` (rare)

Only when two writes must not be observed half-applied **and** a unique index is not enough: write a staging row with a `transaction_id` + `status=pending`, then flip to `committed`. Readers ignore non-committed rows. Upgrade path if this becomes hot: Appwrite's documented row-transaction APIs — do not simulate SQL isolation in app code.

## Lost-update (read, modify, write)

Two workers can `GetRow`, mutate, `UpdateRow` and clobber each other. Mitigations, cheapest first:

1. Make the write **absolute**, not relative (set `status=done`, do not `attempts++` from a stale read if you can send the new value from a unique event).
2. Include a `updated_at` / version you just read; if you add a compare in the worker, treat mismatch as "someone else won — reread".
3. Unique constraint on the business key so the second create 409s.

Do not reach for distributed locks.

## Timestamps and side effects

Set `created_at` / `updated_at` in Go (`time.Now().UTC()`). Do not use DB triggers, views, or stored procedures — they are invisible and undebuggable. Same rule as the old "no hidden SQL features" guidance, applied to Appwrite.
