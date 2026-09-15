# TablesDB performance

Appwrite bills **per row read/written**, not per HTTP request. The cheapest call is the one you skip. There is no `database/sql` pool to tune — the REST client uses `http.Client{Timeout: 15 * time.Second}`.

## Filter server-side

Every `ListRows` must include equality/range queries that match an index. Pulling 10k rows to count in Go is a last resort (`CountLogsByAction` already does this — do not copy that shape for new features; add a narrower query or an aggregate column).

`query.Limit` default 25, **max 100**. Loop with cursor/offset if you need more. Never `Limit(10000)` on a new path.

## Pagination

**Cursor** for feeds and anything that can grow:

```go
queries := []string{
    appwrite.QueryEqual("clerk_user_id", userID),
    appwrite.QueryOrderDesc("$id"),
    appwrite.QueryLimit(25),
}
if cursor != "" {
    queries = append(queries, query.CursorAfter(cursor)) // add REST helper if missing
}
```

Return the last row's `$id` as the next cursor.

**Offset** only for small bounded lists (insights pages of 100 over a known-small creator set). Offset re-walks skipped rows and drifts under concurrent inserts.

## Indexes

An Appwrite index must include **all** attributes used together in one list call (filters + sorts that the query engine requires). Create the index via MCP **before** shipping the query.

- Unique index → natural dedup + 409 on conflict
- Key index → `equal` / order on that set
- Full-text → only if you use `query.Search`

Do not add indexes "just in case". Each index costs write amplification.

When reviewing a new `ListRows`, grep existing indexes (MCP / console) for that table. If the query attributes are not a prefix of an index, the query will not scale.

## Batching

| Bad | Good |
| --- | --- |
| `GetRow` per id in a loop | `QueryEqual("id", id1, id2, ...)` in chunks ≤ 100, or one list by parent id |
| `CreateRow` 50k times | `CreateRows` (SDK) / batched POSTs in chunks of 100 |
| Full-table scan then filter in Go | `query.Equal` / range on indexed columns |

Chunk size: **100** (API page cap), not 1000. Handle errors per chunk (`fmt.Errorf("create rows batch %d: %w", i, err)`).

If `RowClient` lacks `CreateRows`, add it to `internal/platform/appwrite` (TablesDB REST) rather than looping `CreateRow` — and rather than importing the SDK solely for that.

## N+1

Reconcile and insights sync are the hot spots. Fetch children with `QueryEqual("parent_id", parentID)` (or IN of parent ids), not one request per parent.

## HTTP client

Do not add `SetMaxOpenConns`. The existing client timeout is 15s. Pass `ctx` so Gin cancellation aborts in-flight Appwrite calls. For a bursty worker, cap concurrency with the existing worker pool — not a SQL connection pool.
