---
name: golang-database
description: Kaplun Go persistence over Appwrite TablesDB. Use when writing, reviewing, or debugging Go store/repository code, queries, row CRUD, pagination, indexes, upserts, or database tests in api-go/. Use when the user mentions database/sql, sqlx, pgx, GORM, PostgreSQL, MySQL, SQLite, or migrations — those are forbidden here; redirect to TablesDB + appwrite-go. Does NOT generate SQL schemas or SQL migrations.
user-invocable: true
compatibility: Kaplun api-go. Always load appwrite-go first.
metadata:
  author: kaplun
  version: "2.0.0"
  supersedes: samber/cc-skills-golang@golang-database
allowed-tools: Read Edit Write Glob Grep Bash(go:*) Bash(golangci-lint:*) Bash(git:*) Agent AskUserQuestion
paths:
  - "api-go/**/*.go"
  - "api-go/internal/store/**"
  - "api-go/internal/platform/appwrite/**"
---

**Persona:** You are a Go backend engineer who treats **Appwrite TablesDB** as the only database. SQL is not a first-class language here. Rows, queries, permissions, and errors come from the Appwrite Go SDK skill.

**Required first step — always:**

1. Read [`.agents/skills/appwrite-go/SKILL.md`](../appwrite-go/SKILL.md) before writing or reviewing any persistence code.
2. Use **TablesDB** (`tablesdb` package / `/tablesdb/...` REST). Never the deprecated `Databases` SDK. Never `database/sql`, `sqlx`, `pgx`, GORM, or ent.

> This file supersedes `samber/cc-skills-golang@golang-database`. If a prompt asks for PostgreSQL/sqlx/pgx, refuse that stack and implement the same job on TablesDB.

**Modes:**

- **Write mode** — new store methods: grep `api-go/internal/store` and `api-go/internal/platform/appwrite` for existing `RowClient` + `Query*` patterns first; copy those. Pull method names, query helpers, permissions, and `apperr` from appwrite-go.
- **Review/debug mode** — scan for SQL drivers, unparameterized query JSON, missing `ctx`, unhandled 404, N+1 `GetRow` loops, and queries with no covering index.

# Go + Appwrite TablesDB

Kaplun persists through `api-go/internal/store` over a `RowClient`. The live client is `api-go/internal/platform/appwrite` (TablesDB REST that already encodes the same query JSON as the SDK). Do not add `github.com/appwrite/sdk-for-go` to `api-go` unless the user explicitly asks — extend the existing client instead. SDK-shaped snippets in this skill and in appwrite-go are the **contract**; the REST client is the **implementation**.

## Best Practices Summary

1. **Load appwrite-go first** — TablesDB CRUD, `query.*`, permissions, `apperr.AppwriteException` live there. This skill is the Kaplun store layer on top.
2. **TablesDB only** — `CreateRow` / `ListRows` / `GetRow` / `UpdateRow` / `DeleteRow`. Never `Databases`, never SQL.
3. **Context on every call** — `ListRows(ctx, ...)`, HTTP `do(ctx, ...)`. No context-free network I/O.
4. **Queries are SDK query objects**, not SQL strings. Use `query.Equal` (appwrite-go) or `appwrite.QueryEqual` (Kaplun REST helper). Never `fmt.Sprintf` user input into query JSON.
5. **Not-found is HTTP 404**, not `sql.ErrNoRows`. Translate with `apperr` / `APIError.NotFound()` to a domain miss (`nil, nil` or a typed error). Distinguish empty `ListRows` from `GetRow` 404.
6. **No SQL transactions.** TablesDB is a document store. Use idempotent upserts, unique indexes, and staged writes. See [Consistency](./references/transactions.md).
7. **Decode `map[string]any` → structs** with json tags. Optional columns are pointers. System key is `$id`. See [Scanning](./references/scanning.md).
8. **Allowlist** any user-controlled attribute used for sort/filter. Column names cannot be "parameterized" — only values can.
9. **Paginate.** Default 25, max 100 per `query.Limit`. Cursor (`CursorAfter` / `CursorBefore`) for feeds; offset only for small bounded lists. See [Performance](./references/performance.md).
10. **Index before query.** An Appwrite index must include **all** columns queried together. Create the index (MCP + `confirm_write`) before shipping the query.
11. **Cost = per row**, not per request. Filter server-side. Batch with `CreateRows` when the client supports it; never N+1 `GetRow` in a loop.
12. **Do not emit SQL migrations.** Schema changes are Appwrite tables/columns/indexes via MCP, then mirrored in Go structs + `src/lib/types.ts` + `src/lib/constants.ts` / `APPWRITE_*_TABLE_ID`. Column types come from appwrite-go (`varchar`/`text`/… — never legacy `string`).
13. **Set `created_at` / `updated_at` in Go** (`time.Now().UTC()`). No DB triggers, views, or stored procedures.
14. **Fake `RowClient` in tests.** No sqlmock, no Postgres testcontainers. See [Testing](./references/testing.md).

## Forbidden

| Do not | Use instead |
| --- | --- |
| `database/sql`, `sqlx`, `pgx`, GORM, ent | `tablesdb` (appwrite-go) + Kaplun `RowClient` |
| SQL `Databases` SDK | `tablesdb` / `/tablesdb/{db}/tables/{table}/rows` |
| `$1` / `?` SQL placeholders | `query.Equal("field", value)` / `QueryEqual` |
| `sql.ErrNoRows` | `apperr` code 404 / `APIError.NotFound()` / empty list |
| `BeginTxx` / `SELECT FOR UPDATE` | idempotent upsert + unique index |
| golang-migrate / Flyway / `CREATE TABLE` | Appwrite MCP + appwrite-go table/column APIs |
| `SetMaxOpenConns` pool tuning | `http.Client{Timeout: 15 * time.Second}` (already on the REST client) |

## Kaplun store shape

Copy this. New tables get a store next to `automations_store.go` / `insights_store.go`, same `RowClient`.

```go
type RowClient interface {
    ListRows(ctx context.Context, tableID string, queries []string) (appwrite.RowsResult, error)
    GetRow(ctx context.Context, tableID, rowID string) (map[string]any, error)
    CreateRow(ctx context.Context, tableID, rowID string, data map[string]any, permissions []string) (map[string]any, error)
    UpdateRow(ctx context.Context, tableID, rowID string, data map[string]any, permissions []string) (map[string]any, error)
    DeleteRow(ctx context.Context, tableID, rowID string) error
}

func (s *AutomationsStore) GetAutomation(ctx context.Context, automationID string) (*models.Automation, error) {
    row, err := s.client.GetRow(ctx, s.tables.Automations, automationID)
    if err != nil {
        if apiErr, ok := err.(*appwrite.APIError); ok && apiErr.NotFound() {
            return nil, nil
        }
        return nil, err
    }
    a, err := decodeAutomation(row)
    if err != nil {
        return nil, err
    }
    return &a, nil
}
```

Table IDs come from env (`APPWRITE_*_TABLE_ID`), stored on a `Tables` struct — never hardcoded IDs in store methods.

Row IDs: `appwrite.UniqueID` (`"unique()"`) for server-generated IDs, matching appwrite-go `id.Unique()`.

Permissions: backend API key is god-mode. Server-owned rows (jobs, logs, insights) pass `nil` permissions. User-owned rows use appwrite-go `permission`/`role` helpers — or `appwrite.UserPermissions(userID)` in the REST client. Do not `role.Any()` on writes.

## Queries

From appwrite-go (`query` package). Kaplun REST equivalents live in `internal/platform/appwrite/query.go` and emit the same JSON (`{"method":"equal","attribute":"status","values":["pending"]}`).

```go
result, err := s.client.ListRows(ctx, s.tables.Jobs, []string{
    appwrite.QueryEqual("status", "pending"),
    appwrite.QueryLessThanEqual("run_at", nowISO),
    appwrite.QueryOrderAsc("run_at"),
    appwrite.QueryLimit(25),
})
```

| Need | appwrite-go | Kaplun REST helper |
| --- | --- | --- |
| `==` / IN | `query.Equal("f", v)` or slice | `QueryEqual("f", v)` |
| `<` `<=` `>` | `query.LessThan` / `GreaterThan` | `QueryLessThan` / `QueryGreaterThan` |
| Sort | `query.OrderAsc` / `OrderDesc` | `QueryOrderAsc` / `QueryOrderDesc` |
| Page size | `query.Limit(n)` (max 100) | `QueryLimit(n)` |
| Offset | `query.Offset(n)` | `QueryOffset(n)` |
| Cursor | `query.CursorAfter(rowID)` | add a helper next to `query.go` if missing — do not invent SQL `WHERE id > $1` |

`QueryEqual("id", id1, id2)` is the IN clause. Do not concatenate IDs into JSON.

User-controlled sort field:

```go
allowed := map[string]bool{"created_at": true, "updated_at": true, "name": true}
if !allowed[sortCol] {
    return fmt.Errorf("invalid sort column: %s", sortCol)
}
queries = append(queries, appwrite.QueryOrderDesc(sortCol))
```

## Error handling

```go
row, err := service.GetRow(databaseID, tableID, rowID)
if err != nil {
    var appErr *apperr.AppwriteException
    if errors.As(err, &appErr) {
        switch appErr.Code {
        case 404:
            return nil, ErrNotFound
        case 409:
            return nil, ErrConflict
        case 429:
            return nil, fmt.Errorf("appwrite rate limited: %w", err)
        }
    }
    return nil, fmt.Errorf("get row %s: %w", rowID, err)
}
```

Kaplun REST: `*appwrite.APIError` with `.NotFound()` for 404. Wrap other errors with `%w`. Context cancel (`errors.Is(err, context.Canceled)`) stops work — do not retry.

| Condition | Detect | Action |
| --- | --- | --- |
| Row missing | 404 / `NotFound()` | domain miss |
| Empty list | `len(result.Rows) == 0` | not an error |
| Unique / duplicate | 409 | conflict error |
| Auth | 401 / 403 | fail fast; do not retry |
| Rate limit | 429 | backoff (caller) |
| Transient 5xx / network | status ≥ 500 or net err | retry with backoff; never retry 4xx |

## Writes

```go
data := map[string]any{
    "clerk_user_id": a.ClerkUserID,
    "status":        a.Status,
    "created_at":    now,
    "updated_at":    now,
}
row, err := s.client.CreateRow(ctx, s.tables.Automations, appwrite.UniqueID, data, nil)
```

Partial update: only keys being changed. Insights upserts must not zero metrics the refetch omitted — copy the `insights_store.go` pattern.

Timestamps: always UTC ISO strings written by Go.

## Schema (not SQL)

This skill does **not** generate SQL. Table/column/index changes:

1. Inspect existing tables (Appwrite MCP / `src/lib/constants.ts` / env).
2. Apply via MCP (`confirm_write=true`) using appwrite-go column types (`varchar`, `text`, `mediumtext`, `longtext`, integer, boolean, datetime, enum, relationship).
3. Mirror in Go structs, `src/lib/types.ts`, and IDs in `constants.ts` + `APPWRITE_*_TABLE_ID`.

Prefer enum columns for finite states. Unique index for natural dedup keys. Index must list every attribute used together in one `ListRows` call.

## Deep Dives

- **[Consistency](./references/transactions.md)** — no SQL tx; idempotent upserts, unique keys, staged writes
- **[Testing](./references/testing.md)** — fake `RowClient`, query-JSON assertions, no live Appwrite in unit tests
- **[Performance](./references/performance.md)** — per-row billing, covering indexes, cursor pagination, batching
- **[Scanning](./references/scanning.md)** — `map[string]any` → struct, `$id`, optional pointers

## Cross-References

- → `.agents/skills/appwrite-go` — SDK, TablesDB CRUD, query helpers, permissions, errors (**read first**)
- → `.cursor/skills/senior-backend-engineer` — Kaplun backend judgment, MCP schema workflow, frozen HTTP contract
- → `api-go/AGENTS.md` — store layout, env table IDs, gotchas
