# Struct scanning (TablesDB rows)

Appwrite returns JSON objects. Kaplun stores them as `map[string]any`. Decode once at the store boundary — services should see typed structs, not maps.

## `mapDecode` (Kaplun pattern)

```go
func mapDecode(row map[string]any, dest any) error {
    b, err := json.Marshal(row)
    if err != nil {
        return err
    }
    return json.Unmarshal(b, dest)
}
```

Tag fields with `json:"column_key"`. The document id is `$id`:

```go
type Automation struct {
    ID        string     `json:"$id"`
    Name      string     `json:"name"`
    Status    string     `json:"status"`
    Bio       *string    `json:"bio,omitempty"`
    DeletedAt *time.Time `json:"deleted_at"`
    MediaIDs  []string   `json:"media_ids"`
}
```

After decode, nil slices that the API omitted become empty slices at the store boundary (`if a.MediaIDs == nil { a.MediaIDs = []string{} }`) so JSON responses stay `[]` not `null`.

## Optional columns

Use pointers (`*string`, `*time.Time`). Do not use `sql.NullString` / `sql.NullTime` — there is no `database/sql` here.

- omit from JSON when empty → `json:"bio,omitempty"`
- serialize JSON null when unset → `json:"deleted_at"` (no omitempty)

Missing keys unmarshal as the field zero value. Distinguish "key absent" vs "key: null" only when the domain cares; otherwise pointers are enough.

## Numbers

JSON numbers decode as `float64` in `map[string]any`. When reading a map without `mapDecode`, type-switch:

```go
func intField(row map[string]any, key string) int {
    switch v := row[key].(type) {
    case float64:
        return int(v)
    case int:
        return v
    default:
        return 0
    }
}
```

`stringField` already exists in `automations_store.go` — reuse it.

## Writes

Build `map[string]any` with table column keys (snake_case, matching Appwrite). Do not send `$id` inside `data` — id is the `rowID` argument (`appwrite.UniqueID` or a known id).

Partial `UpdateRow` payloads include **only** columns being changed. Never send a full struct dump that zeroes fields the reader did not fetch (insights media upserts).

## System keys

Appwrite may return `$id`, `$permissions`, `$createdAt`, `$updatedAt`. Map `$id` onto the domain ID field. Ignore the rest unless a feature needs them. Do not persist `$`-prefixed keys back in `data`.
