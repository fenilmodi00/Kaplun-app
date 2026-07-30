package appwrite

import (
	"encoding/json"
	"fmt"
)

// queryPayload matches the Appwrite SDK JSON query encoding
// (e.g. {"method":"equal","attribute":"status","values":["pending"]}).
type queryPayload struct {
	Method    string `json:"method"`
	Attribute string `json:"attribute,omitempty"`
	Values    []any  `json:"values,omitempty"`
}

// Query helpers produce Appwrite REST query strings matching the current SDK.

func QueryEqual(attribute string, values ...any) string {
	vals := make([]any, 0, len(values))
	vals = append(vals, values...)
	return encodeQuery(queryPayload{Method: "equal", Attribute: attribute, Values: vals})
}

func QueryGreaterThan(attribute string, value any) string {
	return encodeQuery(queryPayload{Method: "greaterThan", Attribute: attribute, Values: []any{value}})
}

func QueryLessThan(attribute string, value any) string {
	return encodeQuery(queryPayload{Method: "lessThan", Attribute: attribute, Values: []any{value}})
}

func QueryLessThanEqual(attribute string, value any) string {
	return encodeQuery(queryPayload{Method: "lessThanEqual", Attribute: attribute, Values: []any{value}})
}

func QueryOrderAsc(attribute string) string {
	return encodeQuery(queryPayload{Method: "orderAsc", Attribute: attribute})
}

func QueryOrderDesc(attribute string) string {
	return encodeQuery(queryPayload{Method: "orderDesc", Attribute: attribute})
}

func QueryLimit(n int) string {
	return encodeQuery(queryPayload{Method: "limit", Values: []any{n}})
}

func QueryOffset(n int) string {
	return encodeQuery(queryPayload{Method: "offset", Values: []any{n}})
}

func encodeQuery(q queryPayload) string {
	b, err := json.Marshal(q)
	if err != nil {
		return fmt.Sprintf(`{"method":%q}`, q.Method)
	}
	return string(b)
}

// UserPermission returns Appwrite permission strings for a single user (read/update/delete).
func UserPermissions(userID string) []string {
	return []string{
		fmt.Sprintf(`read("user:%s")`, userID),
		fmt.Sprintf(`update("user:%s")`, userID),
		fmt.Sprintf(`delete("user:%s")`, userID),
	}
}

// UniqueID is the Appwrite sentinel for server-generated document/row IDs.
const UniqueID = "unique()"
