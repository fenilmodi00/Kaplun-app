# Testing TablesDB store code

No live Appwrite in unit tests. No sqlmock. No Postgres testcontainers. Pattern: `api-go/internal/store/automations_store_test.go`.

## Fake `RowClient`

Implement the same interface the store uses:

```go
type fakeRows struct {
    listCalls []listCall
    rows      map[string]appwrite.RowsResult
    get       map[string]map[string]any
    created   []createCall
}

func (f *fakeRows) ListRows(_ context.Context, tableID string, queries []string) (appwrite.RowsResult, error) {
    f.listCalls = append(f.listCalls, listCall{table: tableID, queries: append([]string(nil), queries...)})
    if r, ok := f.rows[tableID]; ok {
        return r, nil
    }
    return appwrite.RowsResult{Rows: []map[string]any{}}, nil
}

func (f *fakeRows) GetRow(_ context.Context, tableID, rowID string) (map[string]any, error) {
    if row, ok := f.get[tableID+"/"+rowID]; ok {
        return row, nil
    }
    return nil, &appwrite.APIError{Status: 404, Message: "not found"}
}
```

Stub `CreateRow` / `UpdateRow` / `DeleteRow` the same way. 404 via `APIError{Status: 404}`; conflict via `409`.

## Assert query JSON

Helpers must emit SDK-shaped JSON (appwrite-go encoding):

```go
want := []string{
    `{"method":"equal","attribute":"clerk_user_id","values":["clerk_1"]}`,
    `{"method":"orderDesc","attribute":"created_at"}`,
}
```

If you add a `Query*` helper, add a one-function test that checks the exact string. Wrong JSON is a silent full-table scan.

## What to test

| Layer | How |
| --- | --- |
| Query builders | exact JSON strings |
| Store decode | feed a `map[string]any` row, assert struct fields (`$id`, slices defaulted) |
| Store not-found | fake 404 → `nil, nil` or domain error (not a panic) |
| Store create | captured `data` map + `rowID` (`unique()` vs known id) |
| Services | fake the store interface (not RowClient) |
| Handlers | `httptest` + fake service — see `internal/handlers/automations_test.go` |

Do not hit Appwrite Cloud from `go test ./...`. Integration against a real project is manual / MCP, not CI.

## Clock

Inject `now func() time.Time` (stores already do). Tests pin UTC.

## What not to add

- `//go:build integration` + transaction rollback — there are no SQL transactions
- testify/mock unless a package already uses it — a handwritten fake is enough
- Spinning Docker Postgres "because that's how Go DB tests work"
