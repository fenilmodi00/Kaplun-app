package appwrite_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kaplun/api-go/internal/platform/appwrite"
)

func TestQueryBuilders(t *testing.T) {
	t.Parallel()

	if got := appwrite.QueryEqual("clerk_user_id", "u1"); got != `{"method":"equal","attribute":"clerk_user_id","values":["u1"]}` {
		t.Fatalf("QueryEqual: %q", got)
	}
	if got := appwrite.QueryEqual("action", "pending", "dm_sent"); got != `{"method":"equal","attribute":"action","values":["pending","dm_sent"]}` {
		t.Fatalf("QueryEqual multi: %q", got)
	}
	if got := appwrite.QueryGreaterThan("created_at", "2024-01-01"); got != `{"method":"greaterThan","attribute":"created_at","values":["2024-01-01"]}` {
		t.Fatalf("QueryGreaterThan: %q", got)
	}
	if got := appwrite.QueryLessThanEqual("run_at", "now"); got != `{"method":"lessThanEqual","attribute":"run_at","values":["now"]}` {
		t.Fatalf("QueryLessThanEqual: %q", got)
	}
	if got := appwrite.QueryOrderDesc("created_at"); got != `{"method":"orderDesc","attribute":"created_at"}` {
		t.Fatalf("QueryOrderDesc: %q", got)
	}
	if got := appwrite.QueryLimit(25); got != `{"method":"limit","values":[25]}` {
		t.Fatalf("QueryLimit: %q", got)
	}
}

func TestUserPermissions(t *testing.T) {
	t.Parallel()

	got := appwrite.UserPermissions("user_1")
	want := []string{`read("user:user_1")`, `update("user:user_1")`, `delete("user:user_1")`}
	if len(got) != len(want) {
		t.Fatalf("len=%d", len(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("perm[%d]=%q want %q", i, got[i], want[i])
		}
	}
}

func TestListRowsShapesAuthenticatedRequest(t *testing.T) {
	t.Parallel()

	var gotMethod, gotPath, gotProject, gotKey string
	var gotQueries []string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotProject = r.Header.Get("X-Appwrite-Project")
		gotKey = r.Header.Get("X-Appwrite-Key")
		gotQueries = r.URL.Query()["queries[]"]
		_ = json.NewEncoder(w).Encode(map[string]any{
			"total": 1,
			"rows":  []map[string]any{{"$id": "row1", "clerk_user_id": "c1"}},
		})
	}))
	t.Cleanup(srv.Close)

	client, err := appwrite.New(appwrite.Config{
		Endpoint:        srv.URL,
		ProjectID:       "proj",
		APIKey:          "key",
		DatabaseID:      "db",
		CreatorsTableID: "creators",
		HTTPClient:      srv.Client(),
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	result, err := client.ListRows(context.Background(), "automations", []string{
		appwrite.QueryEqual("clerk_user_id", "c1"),
		appwrite.QueryLimit(10),
	})
	if err != nil {
		t.Fatalf("ListRows: %v", err)
	}
	if gotMethod != http.MethodGet {
		t.Fatalf("method=%q", gotMethod)
	}
	if gotPath != "/tablesdb/db/tables/automations/rows" {
		t.Fatalf("path=%q", gotPath)
	}
	if gotProject != "proj" || gotKey != "key" {
		t.Fatalf("auth headers project=%q key=%q", gotProject, gotKey)
	}
	if len(gotQueries) != 2 {
		t.Fatalf("queries=%#v", gotQueries)
	}
	if result.Total != 1 || len(result.Rows) != 1 || result.Rows[0]["$id"] != "row1" {
		t.Fatalf("result=%#v", result)
	}
}

func TestCreateRowSendsJSONBody(t *testing.T) {
	t.Parallel()

	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{"$id": "new1", "name": "A"})
	}))
	t.Cleanup(srv.Close)

	client, err := appwrite.New(appwrite.Config{
		Endpoint:        srv.URL,
		ProjectID:       "proj",
		APIKey:          "key",
		DatabaseID:      "db",
		CreatorsTableID: "creators",
		HTTPClient:      srv.Client(),
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	row, err := client.CreateRow(context.Background(), "automations", appwrite.UniqueID, map[string]any{"name": "A"}, nil)
	if err != nil {
		t.Fatalf("CreateRow: %v", err)
	}
	if gotBody["rowId"] != appwrite.UniqueID {
		t.Fatalf("rowId=%v", gotBody["rowId"])
	}
	data, _ := gotBody["data"].(map[string]any)
	if data["name"] != "A" {
		t.Fatalf("data=%#v", data)
	}
	if row["$id"] != "new1" {
		t.Fatalf("row=%#v", row)
	}
}

func TestCreateUserSessionCreatesMissingUserAndToken(t *testing.T) {
	t.Parallel()

	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.Path)
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/users":
			_ = json.NewEncoder(w).Encode(map[string]any{"users": []any{}, "total": 0})
		case r.Method == http.MethodPost && r.URL.Path == "/users":
			_ = json.NewEncoder(w).Encode(map[string]any{"$id": "clerk_1"})
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/users/") && strings.HasSuffix(r.URL.Path, "/tokens"):
			_ = json.NewEncoder(w).Encode(map[string]any{"secret": "tok_secret"})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)

	client, err := appwrite.New(appwrite.Config{
		Endpoint:        srv.URL,
		ProjectID:       "proj",
		APIKey:          "key",
		DatabaseID:      "db",
		CreatorsTableID: "creators",
		HTTPClient:      srv.Client(),
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	session, err := client.CreateUserSession(context.Background(), "clerk_1")
	if err != nil {
		t.Fatalf("CreateUserSession: %v", err)
	}
	if session.UserID != "clerk_1" || session.Secret != "tok_secret" {
		t.Fatalf("session=%#v", session)
	}
	if len(paths) != 3 {
		t.Fatalf("paths=%v", paths)
	}
}

func TestEnsureCreatorProfileSkipsWhenExists(t *testing.T) {
	t.Parallel()

	created := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"total": 1,
				"rows":  []map[string]any{{"$id": "c1"}},
			})
			return
		}
		created = true
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{"$id": "new"})
	}))
	t.Cleanup(srv.Close)

	client, err := appwrite.New(appwrite.Config{
		Endpoint:        srv.URL,
		ProjectID:       "proj",
		APIKey:          "key",
		DatabaseID:      "db",
		CreatorsTableID: "creators",
		HTTPClient:      srv.Client(),
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := client.EnsureCreatorProfile(context.Background(), "clerk_1"); err != nil {
		t.Fatalf("EnsureCreatorProfile: %v", err)
	}
	if created {
		t.Fatal("expected no create when profile exists")
	}
}

func TestGetRowNotFound(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"not found"}`))
	}))
	t.Cleanup(srv.Close)

	client, err := appwrite.New(appwrite.Config{
		Endpoint:        srv.URL,
		ProjectID:       "proj",
		APIKey:          "key",
		DatabaseID:      "db",
		CreatorsTableID: "creators",
		HTTPClient:      srv.Client(),
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	_, err = client.GetRow(context.Background(), "automations", "missing")
	var apiErr *appwrite.APIError
	if !errors.As(err, &apiErr) || !apiErr.NotFound() {
		t.Fatalf("expected not found APIError, got %v", err)
	}
}
