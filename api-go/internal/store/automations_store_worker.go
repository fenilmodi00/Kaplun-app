package store

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/platform/appwrite"
	"kaplun/api-go/internal/worker"
)

// WorkerFacade adapts AutomationsStore to worker.CommentStore and handlers.WebhookStore
// without changing typed method signatures used by automations.Service.
type WorkerFacade struct {
	*AutomationsStore
}

// Ensure interface compliance at compile time.
var (
	_ worker.CommentStore   = WorkerFacade{}
	_ handlers.WebhookStore = WorkerFacade{}
	_ handlers.CronStore    = (*AutomationsStore)(nil)
)

func (s *AutomationsStore) AsWorker() WorkerFacade {
	return WorkerFacade{AutomationsStore: s}
}

// --- worker.CommentStore map-based methods ---

func (s *AutomationsStore) ListActiveForIG(ctx context.Context, igUserID string) ([]map[string]any, error) {
	result, err := s.client.ListRows(ctx, s.tables.Automations, []string{
		appwrite.QueryEqual("ig_user_id", igUserID),
		appwrite.QueryEqual("status", "active"),
	})
	if err != nil {
		return nil, err
	}
	return result.Rows, nil
}

func (s *AutomationsStore) FindLog(ctx context.Context, automationID, commentID string) (map[string]any, error) {
	result, err := s.client.ListRows(ctx, s.tables.Logs, []string{
		appwrite.QueryEqual("automation_id", automationID),
		appwrite.QueryEqual("comment_id", commentID),
		appwrite.QueryLimit(1),
	})
	if err != nil {
		return nil, err
	}
	if len(result.Rows) == 0 {
		return nil, nil
	}
	return result.Rows[0], nil
}

func (s *AutomationsStore) CreateLog(ctx context.Context, data map[string]any) (map[string]any, error) {
	row, err := s.client.CreateRow(ctx, s.tables.Logs, appwrite.UniqueID, data, nil)
	if err != nil {
		if apiErr, ok := err.(*appwrite.APIError); ok && apiErr.Status == http.StatusConflict {
			return nil, worker.ErrDuplicateKey
		}
		return nil, err
	}
	return row, nil
}

func (s *AutomationsStore) UpdateLog(ctx context.Context, logID string, data map[string]any) error {
	_, err := s.client.UpdateRow(ctx, s.tables.Logs, logID, data, nil)
	return err
}

func (s *AutomationsStore) GetJob(ctx context.Context, jobID string) (map[string]any, error) {
	row, err := s.client.GetRow(ctx, s.tables.Jobs, jobID)
	if err != nil {
		if apiErr, ok := err.(*appwrite.APIError); ok && apiErr.NotFound() {
			return nil, nil
		}
		return nil, err
	}
	return row, nil
}

func (s *AutomationsStore) CountRecentDMActions(igUserID, since string) int {
	result, err := s.client.ListRows(context.Background(), s.tables.Logs, []string{
		appwrite.QueryEqual("ig_user_id", igUserID),
		appwrite.QueryGreaterThan("created_at", since),
		appwrite.QueryEqual("action", "pending", "dm_sent", "button_dm_sent"),
		appwrite.QueryLimit(1),
	})
	if err != nil {
		return 0
	}
	return result.Total
}

func (s *AutomationsStore) CreateJob(ctx context.Context, jobType string, payload map[string]any) (string, error) {
	now := s.now().Format(time.RFC3339Nano)
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	row, err := s.client.CreateRow(ctx, s.tables.Jobs, appwrite.UniqueID, map[string]any{
		"type":       jobType,
		"payload":    string(encoded),
		"status":     "pending",
		"attempts":   0,
		"run_at":     now,
		"created_at": now,
		"updated_at": now,
	}, nil)
	if err != nil {
		return "", err
	}
	id, _ := row["$id"].(string)
	return id, nil
}

func (s *AutomationsStore) RecordWebhookEvent(ctx context.Context, payload string) error {
	if len(payload) > 16000 {
		payload = payload[:16000]
	}
	_, err := s.client.CreateRow(ctx, s.tables.WebhookEvents, appwrite.UniqueID, map[string]any{
		"payload":     payload,
		"received_at": s.now().Format(time.RFC3339Nano),
	}, nil)
	return err
}

// GetAutomationMap returns a raw automation row (for worker adapter).
func (s *AutomationsStore) GetAutomationMap(ctx context.Context, automationID string) (map[string]any, error) {
	row, err := s.client.GetRow(ctx, s.tables.Automations, automationID)
	if err != nil {
		if apiErr, ok := err.(*appwrite.APIError); ok && apiErr.NotFound() {
			return nil, nil
		}
		return nil, err
	}
	return row, nil
}

// GetCreatorMapByClerkID returns a raw creator row (for worker adapter).
func (s *AutomationsStore) GetCreatorMapByClerkID(ctx context.Context, clerkUserID string) (map[string]any, error) {
	result, err := s.client.ListRows(ctx, s.tables.Creators, []string{
		appwrite.QueryEqual("clerk_user_id", clerkUserID),
		appwrite.QueryLimit(1),
	})
	if err != nil {
		return nil, err
	}
	if len(result.Rows) == 0 {
		return nil, nil
	}
	return result.Rows[0], nil
}

// GetTrackedLinkMapForAutomation returns a raw tracked-link row (for worker adapter).
func (s *AutomationsStore) GetTrackedLinkMapForAutomation(ctx context.Context, automationID string) (map[string]any, error) {
	result, err := s.client.ListRows(ctx, s.tables.TrackedLinks, []string{
		appwrite.QueryEqual("automation_id", automationID),
		appwrite.QueryLimit(1),
	})
	if err != nil {
		return nil, err
	}
	if len(result.Rows) == 0 {
		return nil, nil
	}
	return result.Rows[0], nil
}

// --- WorkerFacade: signature adapters for conflicting typed methods ---

func (f WorkerFacade) GetAutomation(ctx context.Context, automationID string) (map[string]any, error) {
	return f.GetAutomationMap(ctx, automationID)
}

func (f WorkerFacade) GetCreatorByClerkID(ctx context.Context, clerkUserID string) (map[string]any, error) {
	return f.GetCreatorMapByClerkID(ctx, clerkUserID)
}

func (f WorkerFacade) GetTrackedLinkForAutomation(ctx context.Context, automationID string) (map[string]any, error) {
	return f.GetTrackedLinkMapForAutomation(ctx, automationID)
}

func (f WorkerFacade) UpdateAutomation(ctx context.Context, automationID string, data map[string]any) error {
	_, err := f.AutomationsStore.UpdateAutomation(ctx, automationID, data)
	return err
}

// --- handlers.CronStore ---

func (s *AutomationsStore) ListCreatorsWithTokenExpiringBefore(ctx context.Context, thresholdISO string) ([]handlers.CronCreator, error) {
	result, err := s.client.ListRows(ctx, s.tables.Creators, []string{
		appwrite.QueryLessThanEqual("token_expires_at", thresholdISO),
		appwrite.QueryOrderAsc("token_expires_at"),
	})
	if err != nil {
		return nil, err
	}
	out := make([]handlers.CronCreator, 0, len(result.Rows))
	for _, row := range result.Rows {
		out = append(out, handlers.CronCreator{
			ID:             stringField(row, "$id"),
			AccessToken:    stringField(row, "access_token"),
			TokenExpiresAt: stringField(row, "token_expires_at"),
		})
	}
	return out, nil
}

func (s *AutomationsStore) UpdateCreatorToken(ctx context.Context, creatorID, encryptedToken, expiresAtISO string) error {
	_, err := s.client.UpdateRow(ctx, s.tables.Creators, creatorID, map[string]any{
		"access_token":     encryptedToken,
		"token_expires_at": expiresAtISO,
	}, nil)
	return err
}

func (s *AutomationsStore) DeleteLogsOlderThan(ctx context.Context, cutoffISO string) (int, error) {
	return s.deleteOlderThan(ctx, s.tables.Logs, "created_at", cutoffISO)
}

func (s *AutomationsStore) DeleteWebhookEventsOlderThan(ctx context.Context, cutoffISO string) (int, error) {
	return s.deleteOlderThan(ctx, s.tables.WebhookEvents, "received_at", cutoffISO)
}

func (s *AutomationsStore) deleteOlderThan(ctx context.Context, tableID, field, cutoffISO string) (int, error) {
	totalDeleted := 0
	const batchSize = 100
	for {
		result, err := s.client.ListRows(ctx, tableID, []string{
			appwrite.QueryLessThan(field, cutoffISO),
			appwrite.QueryLimit(batchSize),
		})
		if err != nil {
			return totalDeleted, err
		}
		if len(result.Rows) == 0 {
			break
		}
		for _, row := range result.Rows {
			id := stringField(row, "$id")
			if id == "" {
				continue
			}
			if err := s.client.DeleteRow(ctx, tableID, id); err != nil {
				return totalDeleted, err
			}
			totalDeleted++
		}
		if len(result.Rows) < batchSize {
			break
		}
	}
	return totalDeleted, nil
}

func (s *AutomationsStore) CountJobsByStatus(ctx context.Context) (map[string]int, error) {
	counts := map[string]int{
		"pending":    0,
		"processing": 0,
		"failed":     0,
		"done":       0,
	}
	result, err := s.client.ListRows(ctx, s.tables.Jobs, []string{
		appwrite.QueryLimit(10000),
	})
	if err != nil {
		return nil, err
	}
	for _, row := range result.Rows {
		status := stringField(row, "status")
		if _, ok := counts[status]; ok {
			counts[status]++
		}
	}
	return counts, nil
}

func (s *AutomationsStore) GetLastWebhookEventTime(ctx context.Context) (*string, error) {
	result, err := s.client.ListRows(ctx, s.tables.WebhookEvents, []string{
		appwrite.QueryOrderDesc("received_at"),
		appwrite.QueryLimit(1),
	})
	if err != nil {
		return nil, err
	}
	if len(result.Rows) == 0 {
		return nil, nil
	}
	ts := stringField(result.Rows[0], "received_at")
	if ts == "" {
		return nil, nil
	}
	return &ts, nil
}
