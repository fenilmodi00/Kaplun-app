package store_test

import (
	"context"
	"testing"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/platform/appwrite"
	"kaplun/api-go/internal/store"
)

func TestListAutomationsQueries(t *testing.T) {
	t.Parallel()

	got := listAutomationsQueries("clerk_1")
	want := []string{
		`{"method":"equal","attribute":"clerk_user_id","values":["clerk_1"]}`,
		`{"method":"orderDesc","attribute":"created_at"}`,
	}
	if len(got) != len(want) {
		t.Fatalf("len=%d want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("[%d]=%q want %q", i, got[i], want[i])
		}
	}
}

func listAutomationsQueries(clerkUserID string) []string {
	return []string{
		appwrite.QueryEqual("clerk_user_id", clerkUserID),
		appwrite.QueryOrderDesc("created_at"),
	}
}

type fakeRows struct {
	listCalls []listCall
	rows      map[string]appwrite.RowsResult
	get       map[string]map[string]any
	created   []createCall
}

type listCall struct {
	table   string
	queries []string
}

type createCall struct {
	table string
	id    string
	data  map[string]any
}

func (f *fakeRows) ListRows(_ context.Context, tableID string, queries []string) (appwrite.RowsResult, error) {
	f.listCalls = append(f.listCalls, listCall{table: tableID, queries: append([]string(nil), queries...)})
	if r, ok := f.rows[tableID]; ok {
		return r, nil
	}
	return appwrite.RowsResult{Rows: []map[string]any{}}, nil
}

func (f *fakeRows) GetRow(_ context.Context, tableID, rowID string) (map[string]any, error) {
	key := tableID + "/" + rowID
	if row, ok := f.get[key]; ok {
		return row, nil
	}
	return nil, &appwrite.APIError{Status: 404, Message: "not found"}
}

func (f *fakeRows) CreateRow(_ context.Context, tableID, rowID string, data map[string]any, _ []string) (map[string]any, error) {
	f.created = append(f.created, createCall{table: tableID, id: rowID, data: data})
	out := map[string]any{"$id": rowID}
	for k, v := range data {
		out[k] = v
	}
	if rowID == appwrite.UniqueID {
		out["$id"] = "generated"
	}
	return out, nil
}

func (f *fakeRows) UpdateRow(_ context.Context, tableID, rowID string, data map[string]any, _ []string) (map[string]any, error) {
	out := map[string]any{"$id": rowID}
	for k, v := range data {
		out[k] = v
	}
	return out, nil
}

func (f *fakeRows) DeleteRow(context.Context, string, string) error { return nil }

func TestAutomationsStoreListAndCreateShapes(t *testing.T) {
	t.Parallel()

	fake := &fakeRows{
		rows: map[string]appwrite.RowsResult{
			"automations": {
				Total: 1,
				Rows: []map[string]any{{
					"$id":           "a1",
					"clerk_user_id": "c1",
					"ig_user_id":    "ig1",
					"name":          "N",
					"target_type":   "all_posts",
					"media_ids":     []any{},
					"keywords":      []any{"LINK"},
					"match_mode":    "whole_word",
					"dm_message":    "hi",
					"status":        "active",
					"created_at":    "t1",
					"updated_at":    "t1",
				}},
			},
		},
	}
	s := store.NewAutomationsStore(fake, store.Tables{
		Creators:    "creators",
		Automations: "automations",
		Logs:        "logs",
		Jobs:        "jobs",
	})

	list, err := s.ListAutomations(context.Background(), "c1")
	if err != nil {
		t.Fatalf("ListAutomations: %v", err)
	}
	if len(list) != 1 || list[0].ID != "a1" || list[0].Name != "N" {
		t.Fatalf("list=%#v", list)
	}
	if len(fake.listCalls) != 1 || fake.listCalls[0].queries[0] != `{"method":"equal","attribute":"clerk_user_id","values":["c1"]}` {
		t.Fatalf("listCalls=%#v", fake.listCalls)
	}

	created, err := s.CreateAutomation(context.Background(), models.Automation{
		ClerkUserID: "c1",
		Name:        "New",
		TargetType:  "all_posts",
		Keywords:    []string{"X"},
		DMMessage:   "msg",
		Status:      "active",
	})
	if err != nil {
		t.Fatalf("CreateAutomation: %v", err)
	}
	if created.ID != "generated" || created.Name != "New" {
		t.Fatalf("created=%#v", created)
	}
	if len(fake.created) != 1 || fake.created[0].id != appwrite.UniqueID {
		t.Fatalf("created calls=%#v", fake.created)
	}
}

func TestFindLogQueriesNewestRowFirst(t *testing.T) {
	t.Parallel()

	fake := &fakeRows{
		rows: map[string]appwrite.RowsResult{
			"logs": {Rows: []map[string]any{{"$id": "l1"}}},
		},
	}
	s := store.NewAutomationsStore(fake, store.Tables{Logs: "logs"})

	row, err := s.FindLog(context.Background(), "a1", "postback:u1")
	if err != nil {
		t.Fatalf("FindLog: %v", err)
	}
	if row == nil || row["$id"] != "l1" {
		t.Fatalf("row=%#v", row)
	}
	if len(fake.listCalls) != 1 {
		t.Fatalf("listCalls=%#v", fake.listCalls)
	}
	got := fake.listCalls[0].queries
	want := []string{
		`{"method":"equal","attribute":"automation_id","values":["a1"]}`,
		`{"method":"equal","attribute":"comment_id","values":["postback:u1"]}`,
		`{"method":"orderDesc","attribute":"created_at"}`,
		`{"method":"limit","values":[1]}`,
	}
	if len(got) != len(want) {
		t.Fatalf("queries=%#v want=%#v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("queries[%d]=%q want %q", i, got[i], want[i])
		}
	}
}
