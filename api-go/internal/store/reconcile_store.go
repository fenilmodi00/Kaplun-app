package store

import (
	"context"
	"encoding/json"
	"time"

	"kaplun/api-go/internal/platform/appwrite"
	"kaplun/api-go/internal/services/reconcile"
)

// ReconcileStore adapts AutomationsStore to reconcile.Store (the polling
// safety net's persistence surface). Lives here so the reconcile service
// stays free of Appwrite specifics.
type ReconcileStore struct {
	store *AutomationsStore
}

// AsReconcile returns the store typed for the comment reconciler.
func (s *AutomationsStore) AsReconcile() ReconcileStore {
	return ReconcileStore{store: s}
}

func (r ReconcileStore) ListAllActiveAutomations(ctx context.Context) ([]reconcile.Automation, error) {
	result, err := r.store.client.ListRows(ctx, r.store.tables.Automations, []string{
		appwrite.QueryEqual("status", "active"),
		appwrite.QueryLimit(100),
	})
	if err != nil {
		return nil, err
	}
	out := make([]reconcile.Automation, 0, len(result.Rows))
	for _, row := range result.Rows {
		out = append(out, reconcile.Automation{
			ID:            stringField(row, "$id"),
			ClerkUserID:   stringField(row, "clerk_user_id"),
			IgUserID:      stringField(row, "ig_user_id"),
			TargetType:    stringField(row, "target_type"),
			Keywords:      stringSliceField(row, "keywords"),
			MatchMode:     stringField(row, "match_mode"),
			MatchAnyWord:  boolField(row, "match_any_word"),
			MediaIDs:      stringSliceField(row, "media_ids"),
			BoundMediaIDs: stringSliceField(row, "bound_media_ids"),
			OpeningDMMode: stringField(row, "opening_dm_mode"),
			ButtonText:    stringField(row, "button_text"),
			RequireFollow: boolField(row, "require_follow"),
		})
	}
	return out, nil
}

func (r ReconcileStore) GetCreatorByClerkID(ctx context.Context, clerkID string) (reconcile.Creator, bool, error) {
	row, err := r.store.GetCreatorByClerkID(ctx, clerkID)
	if err != nil || row == nil {
		return reconcile.Creator{}, false, err
	}
	return reconcile.Creator{ID: clerkID, AccessToken: row.AccessToken}, true, nil
}

func (r ReconcileStore) FindLog(ctx context.Context, automationID, commentID string) (bool, error) {
	existing, err := r.store.FindLog(ctx, automationID, commentID)
	if err != nil {
		return false, err
	}
	return existing != nil, nil
}

func (r ReconcileStore) FindButtonDMForUser(ctx context.Context, automationID, userID string) (bool, time.Time, error) {
	row, err := r.store.FindButtonDMForUser(ctx, automationID, userID)
	if err != nil {
		return false, time.Time{}, err
	}
	if row == nil {
		return false, time.Time{}, nil
	}
	createdAt := parseFlexibleTime(stringField(row, "created_at"))
	if createdAt.IsZero() {
		createdAt = parseFlexibleTime(stringField(row, "$createdAt"))
	}
	return true, createdAt, nil
}

func (r ReconcileStore) GetPostbackLog(ctx context.Context, automationID, userID string) (string, time.Time, bool, error) {
	existing, err := r.store.FindLog(ctx, automationID, "postback:"+userID)
	if err != nil {
		return "", time.Time{}, false, err
	}
	if existing == nil {
		return "", time.Time{}, false, nil
	}
	createdAt := parseFlexibleTime(stringField(existing, "created_at"))
	if createdAt.IsZero() {
		createdAt = parseFlexibleTime(stringField(existing, "$createdAt"))
	}
	return stringField(existing, "action"), createdAt, true, nil
}

func (r ReconcileStore) HasPendingSendReveal(ctx context.Context, automationID, userID string) (bool, error) {
	result, err := r.store.client.ListRows(ctx, r.store.tables.Jobs, []string{
		appwrite.QueryEqual("type", "send_reveal"),
		appwrite.QueryEqual("status", "pending", "processing"),
		appwrite.QueryLimit(100),
	})
	if err != nil {
		return false, err
	}
	for _, row := range result.Rows {
		var payload map[string]any
		if err := json.Unmarshal([]byte(stringField(row, "payload")), &payload); err != nil {
			continue
		}
		if payload["automation_id"] == automationID && payload["user_id"] == userID {
			return true, nil
		}
	}
	return false, nil
}

func (r ReconcileStore) CreateJob(ctx context.Context, jobType string, payload map[string]any, runAt string) (string, error) {
	return r.store.CreateJob(ctx, jobType, payload, runAt)
}

func (r ReconcileStore) UpdateAutomation(ctx context.Context, automationID string, data map[string]any) error {
	_, err := r.store.UpdateAutomation(ctx, automationID, data)
	return err
}

func parseFlexibleTime(raw string) time.Time {
	if raw == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return t
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t
	}
	return time.Time{}
}

func stringSliceField(row map[string]any, key string) []string {
	raw, ok := row[key].([]any)
	if !ok {
		if typed, ok := row[key].([]string); ok {
			return typed
		}
		return []string{}
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func boolField(row map[string]any, key string) bool {
	v, _ := row[key].(bool)
	return v
}
