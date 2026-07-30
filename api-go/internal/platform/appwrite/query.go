package appwrite

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Query helpers produce Appwrite REST query strings matching the SDK Query class.

func QueryEqual(attribute string, values ...any) string {
	return queryMethod(attribute, "equal", values)
}

func QueryGreaterThan(attribute string, value any) string {
	return queryMethodSingle(attribute, "greaterThan", value)
}

func QueryLessThan(attribute string, value any) string {
	return queryMethodSingle(attribute, "lessThan", value)
}

func QueryLessThanEqual(attribute string, value any) string {
	return queryMethodSingle(attribute, "lessThanEqual", value)
}

func QueryOrderAsc(attribute string) string {
	return fmt.Sprintf(`orderAsc("%s")`, attribute)
}

func QueryOrderDesc(attribute string) string {
	return fmt.Sprintf(`orderDesc("%s")`, attribute)
}

func QueryLimit(n int) string {
	return fmt.Sprintf("limit(%d)", n)
}

func QueryOffset(n int) string {
	return fmt.Sprintf("offset(%d)", n)
}

func queryMethod(attribute, method string, values []any) string {
	if len(values) == 0 {
		return fmt.Sprintf(`%s("%s", [])`, method, attribute)
	}
	encoded := make([]string, 0, len(values))
	for _, v := range values {
		b, err := json.Marshal(v)
		if err != nil {
			encoded = append(encoded, `""`)
			continue
		}
		encoded = append(encoded, string(b))
	}
	return fmt.Sprintf(`%s("%s", [%s])`, method, attribute, strings.Join(encoded, ","))
}

func queryMethodSingle(attribute, method string, value any) string {
	b, err := json.Marshal(value)
	if err != nil {
		b = []byte(`""`)
	}
	return fmt.Sprintf(`%s("%s", %s)`, method, attribute, string(b))
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
