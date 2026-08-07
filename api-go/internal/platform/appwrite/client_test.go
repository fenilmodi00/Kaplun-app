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

func TestStoreCreatorProfileRejectsForeignIGOwner(t *testing.T) {
	t.Parallel()

	patched := false
	deleted := false
	created := false

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet:
			joined := strings.Join(r.URL.Query()["queries[]"], " ")
			if strings.Contains(joined, `"ig_user_id"`) {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"total": 1,
					"rows": []map[string]any{{
						"$id":           "ig1",
						"ig_user_id":    "1784",
						"clerk_user_id": "user_old",
						"username":      "whosfenil",
					}},
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"total": 0, "rows": []any{}})
		case r.Method == http.MethodPatch:
			patched = true
			_ = json.NewEncoder(w).Encode(map[string]any{"$id": "ig1"})
		case r.Method == http.MethodDelete:
			deleted = true
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodPost:
			created = true
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{"$id": "new"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
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

	_, ok, err := client.StoreCreatorProfile(context.Background(), "user_new", map[string]any{
		"ig_user_id": "1784",
		"username":   "whosfenil",
	})
	if ok {
		t.Fatal("expected ok=false on conflict")
	}
	var conflict *appwrite.ErrInstagramAlreadyConnected
	if !errors.As(err, &conflict) {
		t.Fatalf("expected ErrInstagramAlreadyConnected, got %v", err)
	}
	if conflict.OwnerUserID != "user_old" || conflict.Username != "whosfenil" {
		t.Fatalf("conflict=%#v", conflict)
	}
	if patched || deleted || created {
		t.Fatalf("foreign row must not be mutated: patched=%v deleted=%v created=%v", patched, deleted, created)
	}
}

func TestStoreCreatorProfileUpdatesSameUserIGRow(t *testing.T) {
	t.Parallel()

	var patchedID string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			joined := strings.Join(r.URL.Query()["queries[]"], " ")
			if strings.Contains(joined, `"ig_user_id"`) {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"total": 1,
					"rows": []map[string]any{{
						"$id":           "ig1",
						"ig_user_id":    "1784",
						"clerk_user_id": "user_new",
					}},
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"total": 0, "rows": []any{}})
		case http.MethodPatch:
			patchedID = r.URL.Path
			_ = json.NewEncoder(w).Encode(map[string]any{"$id": "ig1"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
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

	rowID, ok, err := client.StoreCreatorProfile(context.Background(), "user_new", map[string]any{
		"ig_user_id": "1784",
		"username":   "whosfenil",
	})
	if err != nil || !ok || rowID != "ig1" {
		t.Fatalf("rowID=%q ok=%v err=%v", rowID, ok, err)
	}
	if !strings.HasSuffix(patchedID, "/rows/ig1") {
		t.Fatalf("patched path=%q", patchedID)
	}
}

func TestStoreCreatorProfileUpdatesStubWhenNoIGConflict(t *testing.T) {
	t.Parallel()

	var patchedID string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			q := strings.Join(r.URL.Query()["queries[]"], " ")
			if strings.Contains(q, `"clerk_user_id"`) {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"total": 1,
					"rows":  []map[string]any{{"$id": "stub1"}},
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"total": 0, "rows": []any{}})
		case http.MethodPatch:
			patchedID = r.URL.Path
			_ = json.NewEncoder(w).Encode(map[string]any{"$id": "stub1"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
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

	rowID, ok, err := client.StoreCreatorProfile(context.Background(), "user_new", map[string]any{
		"ig_user_id": "brand_new_ig",
		"username":   "brand_new_user",
	})
	if err != nil || !ok || rowID != "stub1" {
		t.Fatalf("rowID=%q ok=%v err=%v", rowID, ok, err)
	}
	if !strings.HasSuffix(patchedID, "/rows/stub1") {
		t.Fatalf("patched path=%q", patchedID)
	}
}

func TestGetUserEmail(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/users/user_1" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"$id": "user_1", "email": "a@b.com"})
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
	email, err := client.GetUserEmail(context.Background(), "user_1")
	if err != nil || email != "a@b.com" {
		t.Fatalf("email=%q err=%v", email, err)
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
