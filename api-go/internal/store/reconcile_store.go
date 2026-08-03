package store

import (
	"context"

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

func (r ReconcileStore) CreateJob(ctx context.Context, jobType string, payload map[string]any) (string, error) {
	return r.store.CreateJob(ctx, jobType, payload)
}

func (r ReconcileStore) UpdateAutomation(ctx context.Context, automationID string, data map[string]any) error {
	_, err := r.store.UpdateAutomation(ctx, automationID, data)
	return err
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
