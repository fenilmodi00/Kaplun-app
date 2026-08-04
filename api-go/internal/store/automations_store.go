package store

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/platform/appwrite"
	"kaplun/api-go/internal/worker"
)

// Tables holds Appwrite TablesDB table IDs used by the automation engine.
type Tables struct {
	Creators    string
	Automations string
	Logs        string
	Jobs        string
}

// RowClient is the subset of Appwrite TablesDB operations the store needs.
type RowClient interface {
	ListRows(ctx context.Context, tableID string, queries []string) (appwrite.RowsResult, error)
	GetRow(ctx context.Context, tableID, rowID string) (map[string]any, error)
	CreateRow(ctx context.Context, tableID, rowID string, data map[string]any, permissions []string) (map[string]any, error)
	UpdateRow(ctx context.Context, tableID, rowID string, data map[string]any, permissions []string) (map[string]any, error)
	DeleteRow(ctx context.Context, tableID, rowID string) error
}

// AutomationsStore implements automations.Service persistence over Appwrite TablesDB.
type AutomationsStore struct {
	client RowClient
	tables Tables
	now    func() time.Time
}

func NewAutomationsStore(client RowClient, tables Tables) *AutomationsStore {
	return &AutomationsStore{
		client: client,
		tables: tables,
		now:    func() time.Time { return time.Now().UTC() },
	}
}

func (s *AutomationsStore) ListAutomations(ctx context.Context, clerkUserID string) ([]models.Automation, error) {
	result, err := s.client.ListRows(ctx, s.tables.Automations, []string{
		appwrite.QueryEqual("clerk_user_id", clerkUserID),
		appwrite.QueryOrderDesc("created_at"),
	})
	if err != nil {
		return nil, err
	}
	out := make([]models.Automation, 0, len(result.Rows))
	for _, row := range result.Rows {
		a, err := decodeAutomation(row)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func (s *AutomationsStore) GetAutomation(ctx context.Context, automationID string) (*models.Automation, error) {
	row, err := s.client.GetRow(ctx, s.tables.Automations, automationID)
	if err != nil {
		if apiErr, ok := err.(*appwrite.APIError); ok && apiErr.NotFound() {
			return nil, nil
		}
		return nil, err
	}
	a, err := decodeAutomation(row)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *AutomationsStore) CreateAutomation(ctx context.Context, data models.Automation) (models.Automation, error) {
	row, err := s.client.CreateRow(ctx, s.tables.Automations, appwrite.UniqueID, automationToData(data), nil)
	if err != nil {
		return models.Automation{}, err
	}
	return decodeAutomation(row)
}

func (s *AutomationsStore) UpdateAutomation(ctx context.Context, automationID string, data map[string]any) (models.Automation, error) {
	row, err := s.client.UpdateRow(ctx, s.tables.Automations, automationID, data, nil)
	if err != nil {
		return models.Automation{}, err
	}
	return decodeAutomation(row)
}

func (s *AutomationsStore) DeleteAutomation(ctx context.Context, automationID string) error {
	return s.client.DeleteRow(ctx, s.tables.Automations, automationID)
}

func (s *AutomationsStore) ListLogs(ctx context.Context, automationID string, limit int) ([]models.AutomationLog, error) {
	if limit <= 0 {
		limit = 100
	}
	result, err := s.client.ListRows(ctx, s.tables.Logs, []string{
		appwrite.QueryEqual("automation_id", automationID),
		appwrite.QueryOrderDesc("created_at"),
		appwrite.QueryLimit(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]models.AutomationLog, 0, len(result.Rows))
	for _, row := range result.Rows {
		log, err := decodeLog(row)
		if err != nil {
			return nil, err
		}
		out = append(out, log)
	}
	return out, nil
}

func (s *AutomationsStore) CountLogsByAction(ctx context.Context, automationID string) (map[string]int, error) {
	logs, err := s.ListLogs(ctx, automationID, 10000)
	if err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for _, log := range logs {
		action := log.Action
		if action == "" {
			action = "unknown"
		}
		counts[action]++
	}
	return counts, nil
}

func (s *AutomationsStore) CountLogsByActionSince(ctx context.Context, clerkUserID, sinceISO string) (map[string]int, error) {
	result, err := s.client.ListRows(ctx, s.tables.Logs, []string{
		appwrite.QueryEqual("clerk_user_id", clerkUserID),
		appwrite.QueryGreaterThan("created_at", sinceISO),
		appwrite.QueryLimit(10000),
	})
	if err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for _, row := range result.Rows {
		action, _ := row["action"].(string)
		if action == "" {
			action = "unknown"
		}
		counts[action]++
	}
	return counts, nil
}

func (s *AutomationsStore) TopKeywords(ctx context.Context, clerkUserID, sinceISO string, limit int) ([][]any, error) {
	if limit <= 0 {
		limit = 5
	}
	result, err := s.client.ListRows(ctx, s.tables.Logs, []string{
		appwrite.QueryEqual("clerk_user_id", clerkUserID),
		appwrite.QueryGreaterThan("created_at", sinceISO),
		appwrite.QueryLimit(10000),
	})
	if err != nil {
		return nil, err
	}
	kwCounts := map[string]int{}
	for _, row := range result.Rows {
		kw, _ := row["matched_keyword"].(string)
		if kw == "" {
			continue
		}
		kwCounts[kw]++
	}
	type pair struct {
		kw    string
		count int
	}
	pairs := make([]pair, 0, len(kwCounts))
	for kw, count := range kwCounts {
		pairs = append(pairs, pair{kw: kw, count: count})
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].count == pairs[j].count {
			return pairs[i].kw < pairs[j].kw
		}
		return pairs[i].count > pairs[j].count
	})
	if len(pairs) > limit {
		pairs = pairs[:limit]
	}
	out := make([][]any, 0, len(pairs))
	for _, p := range pairs {
		out = append(out, []any{p.kw, p.count})
	}
	return out, nil
}

func (s *AutomationsStore) GetCreatorByClerkID(ctx context.Context, clerkUserID string) (*models.CreatorRow, error) {
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
	row := result.Rows[0]
	return &models.CreatorRow{
		ClerkUserID: stringField(row, "clerk_user_id"),
		IGUserID:    stringField(row, "ig_user_id"),
		AccessToken: stringField(row, "access_token"),
	}, nil
}

// --- worker.SweeperStore ---

func (s *AutomationsStore) ListDueJobs(ctx context.Context, nowISO string) ([]worker.JobRecord, error) {
	result, err := s.client.ListRows(ctx, s.tables.Jobs, []string{
		appwrite.QueryEqual("status", "pending"),
		appwrite.QueryLessThanEqual("run_at", nowISO),
		appwrite.QueryOrderAsc("run_at"),
		appwrite.QueryLimit(25),
	})
	if err != nil {
		return nil, err
	}
	return decodeJobs(result.Rows), nil
}

func (s *AutomationsStore) ListStaleProcessingJobs(ctx context.Context, staleBeforeISO string) ([]worker.JobRecord, error) {
	result, err := s.client.ListRows(ctx, s.tables.Jobs, []string{
		appwrite.QueryEqual("status", "processing"),
		appwrite.QueryLessThan("updated_at", staleBeforeISO),
		appwrite.QueryLimit(100),
	})
	if err != nil {
		return nil, err
	}
	return decodeJobs(result.Rows), nil
}

func (s *AutomationsStore) UpdateJob(ctx context.Context, jobID string, data map[string]any) error {
	_, err := s.client.UpdateRow(ctx, s.tables.Jobs, jobID, data, nil)
	return err
}

// ListAutomationsQueries returns the Appwrite queries used by ListAutomations (test helper).
func ListAutomationsQueries(clerkUserID string) []string {
	return []string{
		appwrite.QueryEqual("clerk_user_id", clerkUserID),
		appwrite.QueryOrderDesc("created_at"),
	}
}

func automationToData(a models.Automation) map[string]any {
	publicReplyMessages := a.PublicReplyMessages
	if publicReplyMessages == nil {
		publicReplyMessages = []string{}
	}
	return map[string]any{
		"clerk_user_id":               a.ClerkUserID,
		"ig_user_id":                  a.IGUserID,
		"name":                        a.Name,
		"target_type":                 a.TargetType,
		"media_ids":                   a.MediaIDs,
		"bound_media_ids":             a.BoundMediaIDs,
		"keywords":                    a.Keywords,
		"match_mode":                  a.MatchMode,
		"match_any_word":              a.MatchAnyWord,
		"opening_dm_mode":             a.OpeningDMMode,
		"dm_message":                  a.DMMessage,
		"button_text":                 a.ButtonText,
		"reveal_message":              a.RevealMessage,
		"public_reply_enabled":        a.PublicReplyEnabled,
		"public_reply_message":        a.PublicReplyMessage,
		"public_reply_messages":       publicReplyMessages,
		"require_follow":              a.RequireFollow,
		"follow_prompt_message":       a.FollowPromptMessage,
		"follow_prompt_button_label":  a.FollowPromptButtonLabel,
		"follow_up_enabled":           a.FollowUpEnabled,
		"follow_up_message":           a.FollowUpMessage,
		"follow_up_delay_minutes":     a.FollowUpDelayMinutes,
		"dm_trigger_enabled":          a.DMTriggerEnabled,
		"status":                      a.Status,
		"created_at":                  a.CreatedAt,
		"updated_at":                  a.UpdatedAt,
	}
}

func decodeAutomation(row map[string]any) (models.Automation, error) {
	var a models.Automation
	if err := mapDecode(row, &a); err != nil {
		return models.Automation{}, fmt.Errorf("decode automation: %w", err)
	}
	if a.MediaIDs == nil {
		a.MediaIDs = []string{}
	}
	if a.BoundMediaIDs == nil {
		a.BoundMediaIDs = []string{}
	}
	if a.Keywords == nil {
		a.Keywords = []string{}
	}
	if a.PublicReplyMessages == nil {
		a.PublicReplyMessages = []string{}
	}
	return a, nil
}

func decodeLog(row map[string]any) (models.AutomationLog, error) {
	var log models.AutomationLog
	if err := mapDecode(row, &log); err != nil {
		return models.AutomationLog{}, fmt.Errorf("decode log: %w", err)
	}
	return log, nil
}

func decodeJobs(rows []map[string]any) []worker.JobRecord {
	out := make([]worker.JobRecord, 0, len(rows))
	for _, row := range rows {
		attempts := 0
		switch v := row["attempts"].(type) {
		case float64:
			attempts = int(v)
		case int:
			attempts = v
		}
		out = append(out, worker.JobRecord{
			ID:       stringField(row, "$id"),
			Status:   stringField(row, "status"),
			Attempts: attempts,
		})
	}
	return out
}

func mapDecode(row map[string]any, dest any) error {
	b, err := json.Marshal(row)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, dest)
}

func stringField(row map[string]any, key string) string {
	if v, ok := row[key].(string); ok {
		return v
	}
	return ""
}
