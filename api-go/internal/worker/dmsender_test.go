package worker_test

import (
	"context"
	"testing"

	"kaplun/api-go/internal/platform/meta"
	"kaplun/api-go/internal/worker"
)

// dmStore is a minimal CommentStore stub for DMSender tests.
type dmStore struct {
	logs      map[string]map[string]any
	otherLogs []map[string]any
	followUps  []map[string]any
}

func newDMStore() *dmStore {
	return &dmStore{logs: map[string]map[string]any{}}
}

func (s *dmStore) ListActiveForIG(context.Context, string) ([]map[string]any, error) { return nil, nil }
func (s *dmStore) FindLog(context.Context, string, string) (map[string]any, error)  { return nil, nil }
func (s *dmStore) FindLogByCommentID(context.Context, string) ([]map[string]any, error) {
	return s.otherLogs, nil
}
func (s *dmStore) FindButtonDMForUser(context.Context, string, string) (map[string]any, error) {
	return nil, nil
}
func (s *dmStore) CreateLog(_ context.Context, data map[string]any) (map[string]any, error) {
	log := map[string]any{"$id": "log1"}
	for k, v := range data {
		log[k] = v
	}
	s.logs["log1"] = log
	return log, nil
}
func (s *dmStore) UpdateLog(_ context.Context, logID string, data map[string]any) error {
	if log := s.logs[logID]; log != nil {
		for k, v := range data {
			log[k] = v
		}
	}
	return nil
}
func (s *dmStore) UpdateAutomation(context.Context, string, map[string]any) error { return nil }
func (s *dmStore) GetCreatorByClerkID(context.Context, string) (map[string]any, error) {
	return nil, nil
}
func (s *dmStore) UpdateCreatorToken(context.Context, string, string, string) error { return nil }
func (s *dmStore) GetAutomation(context.Context, string) (map[string]any, error)  { return nil, nil }
func (s *dmStore) GetJob(context.Context, string) (map[string]any, error)        { return nil, nil }
func (s *dmStore) UpdateJob(context.Context, string, map[string]any) error        { return nil }
func (s *dmStore) CountRecentDMActions(context.Context, string, string) (int, error) {
	return 0, nil
}
func (s *dmStore) CreateJob(_ context.Context, _ string, payload map[string]any, _, _ string) (string, error) {
	s.followUps = append(s.followUps, payload)
	return "job1", nil
}
func (s *dmStore) HasPendingFollowUp(context.Context, string, string) (bool, error) { return false, nil }

// dmGraph is a minimal GraphSender stub for DMSender tests.
type dmGraph struct {
	calls     []string
	dmErr     error
	following *bool
	// btnErr is returned only by SendPrivateReplyWithButton (template rejection).
	btnErr error
}

func (g *dmGraph) SendCommentReply(context.Context, string, string, string) error { return nil }
func (g *dmGraph) SendPrivateReply(context.Context, string, string, string, string) error {
	g.calls = append(g.calls, "dm")
	return g.dmErr
}
func (g *dmGraph) SendPrivateReplyWithButton(context.Context, string, string, string, string, string, string) error {
	g.calls = append(g.calls, "button_dm")
	if g.btnErr != nil {
		return g.btnErr
	}
	return g.dmErr
}
func (g *dmGraph) SendPrivateReplyWithLinkButton(context.Context, string, string, string, string, string, string) error {
	g.calls = append(g.calls, "link_button_dm")
	return g.dmErr
}
func (g *dmGraph) SendDirectMessage(context.Context, string, string, string, string) error {
	g.calls = append(g.calls, "direct_dm")
	return g.dmErr
}
func (g *dmGraph) SendDirectMessageWithButton(context.Context, string, string, string, string, string, string) error {
	g.calls = append(g.calls, "direct_button_dm")
	return g.dmErr
}
func (g *dmGraph) SendDirectMessageWithLinkButton(context.Context, string, string, string, string, string, string) error {
	g.calls = append(g.calls, "direct_link_button_dm")
	return g.dmErr
}
func (g *dmGraph) GetUserFollowStatus(context.Context, string, string) (*bool, error) {
	g.calls = append(g.calls, "follow_check")
	return g.following, nil
}
func (g *dmGraph) RefreshLongLivedToken(context.Context, string) (string, int, error) {
	return "", 0, nil
}

func newSender(store *dmStore, graph *dmGraph) *worker.DMSender {
	return worker.NewDMSender(store, graph)
}

func TestDMSenderDirectModeSendsPrivateReplyAndSchedulesFollowUp(t *testing.T) {
	t.Parallel()
	store := newDMStore()
	graph := &dmGraph{}
	auto := map[string]any{
		"$id":              "a1",
		"ig_user_id":        "ig1",
		"dm_message":        "Hi {username}",
		"follow_up_enabled": true,
	}
	logRow := map[string]any{"$id": "log1"}
	store.logs["log1"] = logRow
	event := map[string]any{
		"comment_id":           "c1",
		"instagram_account_id": "ig1",
		"commenter_id":         "u1",
	}

	err := newSender(store, graph).Send(context.Background(), auto, event, logRow, "tok", "alice")
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if len(graph.calls) != 1 || graph.calls[0] != "dm" {
		t.Fatalf("calls: %v", graph.calls)
	}
	if store.logs["log1"]["action"] != "dm_sent" {
		t.Fatalf("log action: %#v", store.logs["log1"])
	}
	if len(store.followUps) != 1 {
		t.Fatalf("follow-ups: %d", len(store.followUps))
	}
}

func TestDMSenderButtonModeSendsButtonDM(t *testing.T) {
	t.Parallel()
	store := newDMStore()
	graph := &dmGraph{}
	auto := map[string]any{
		"$id":             "a1",
		"ig_user_id":       "ig1",
		"dm_message":      "Hi {username}",
		"opening_dm_mode": "button",
		"button_text":      "Get link",
		"reveal_message":   "https://kaplun.tech",
	}
	logRow := map[string]any{"$id": "log1"}
	store.logs["log1"] = logRow
	event := map[string]any{
		"comment_id":           "c1",
		"instagram_account_id": "ig1",
		"commenter_id":         "u1",
	}

	err := newSender(store, graph).Send(context.Background(), auto, event, logRow, "tok", "alice")
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if len(graph.calls) != 1 || graph.calls[0] != "button_dm" {
		t.Fatalf("calls: %v", graph.calls)
	}
	if store.logs["log1"]["action"] != "button_dm_sent" {
		t.Fatalf("log action: %#v", store.logs["log1"])
	}
}

func TestDMSenderTemplateRejectionFallsBackToDirectMessage(t *testing.T) {
	t.Parallel()
	store := newDMStore()
	graph := &dmGraph{btnErr: &meta.MetaAPIError{Code: 100, Message: "template rejected"}}
	auto := map[string]any{
		"$id":             "a1",
		"ig_user_id":       "ig1",
		"dm_message":      "Hi {username}",
		"opening_dm_mode": "button",
		"button_text":      "Get link",
		"reveal_message":   "https://kaplun.tech",
	}
	logRow := map[string]any{"$id": "log1"}
	store.logs["log1"] = logRow
	event := map[string]any{
		"comment_id":           "c1",
		"instagram_account_id": "ig1",
		"commenter_id":         "u1",
	}

	err := newSender(store, graph).Send(context.Background(), auto, event, logRow, "tok", "alice")
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if len(graph.calls) != 2 || graph.calls[0] != "button_dm" || graph.calls[1] != "direct_dm" {
		t.Fatalf("calls: %v", graph.calls)
	}
	if store.logs["log1"]["action"] != "dm_sent" {
		t.Fatalf("log action: %#v", store.logs["log1"])
	}
}

func TestDMSenderDMSentAtDedupSkipsSend(t *testing.T) {
	t.Parallel()
	store := newDMStore()
	graph := &dmGraph{}
	auto := map[string]any{"$id": "a1", "dm_message": "hi"}
	logRow := map[string]any{"$id": "log1", "dm_sent_at": "2026-01-01T00:00:00Z"}
	event := map[string]any{"comment_id": "c1", "instagram_account_id": "ig1", "commenter_id": "u1"}

	err := newSender(store, graph).Send(context.Background(), auto, event, logRow, "tok", "alice")
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if len(graph.calls) != 0 {
		t.Fatalf("calls: %v", graph.calls)
	}
}

func TestDMSenderCrossCampaignDedupSkipsDM(t *testing.T) {
	t.Parallel()
	store := newDMStore()
	store.otherLogs = []map[string]any{
		{"$id": "other", "automation_id": "a2", "action": "dm_sent"},
	}
	graph := &dmGraph{}
	auto := map[string]any{"$id": "a1", "dm_message": "hi"}
	logRow := map[string]any{"$id": "log1"}
	store.logs["log1"] = logRow
	event := map[string]any{"comment_id": "c1", "instagram_account_id": "ig1", "commenter_id": "u1"}

	err := newSender(store, graph).Send(context.Background(), auto, event, logRow, "tok", "alice")
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if len(graph.calls) != 0 {
		t.Fatalf("calls: %v", graph.calls)
	}
	if store.logs["log1"]["action"] != "skipped" || store.logs["log1"]["reason"] != "skipped_dedup" {
		t.Fatalf("log: %#v", store.logs["log1"])
	}
}

func TestDMSenderFollowGateSendsFollowPromptButton(t *testing.T) {
	t.Parallel()
	store := newDMStore()
	graph := &dmGraph{}
	following := false
	graph.following = &following
	auto := map[string]any{
		"$id":           "a1",
		"dm_message":    "hi",
		"require_follow": true,
	}
	logRow := map[string]any{"$id": "log1"}
	store.logs["log1"] = logRow
	event := map[string]any{
		"comment_id":           "c1",
		"instagram_account_id": "ig1",
		"commenter_id":         "u1",
	}

	err := newSender(store, graph).Send(context.Background(), auto, event, logRow, "tok", "alice")
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if len(graph.calls) != 2 || graph.calls[0] != "follow_check" || graph.calls[1] != "button_dm" {
		t.Fatalf("calls: %v", graph.calls)
	}
	if store.logs["log1"]["reason"] != "follow_prompt_sent" {
		t.Fatalf("log: %#v", store.logs["log1"])
	}
}
