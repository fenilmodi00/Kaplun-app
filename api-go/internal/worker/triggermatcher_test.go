package worker_test

import (
	"context"
	"errors"
	"strconv"
	"testing"

	"kaplun/api-go/internal/services/ratelimit"
	"kaplun/api-go/internal/worker"
)

// matcherStub implements worker.CommentStore with only the methods TriggerMatcher
// uses; the rest panic to catch accidental use.
type matcherStub struct {
	active   []map[string]any
	creators map[string]map[string]any
	logs     map[string]map[string]any
	dmCount  int
	seq      int
}

func (s *matcherStub) ListActiveForIG(context.Context, string) ([]map[string]any, error) {
	out := make([]map[string]any, len(s.active))
	copy(out, s.active)
	return out, nil
}

func (s *matcherStub) FindLog(_ context.Context, automationID, commentID string) (map[string]any, error) {
	for _, l := range s.logs {
		if l["automation_id"] == automationID && l["comment_id"] == commentID {
			return l, nil
		}
	}
	return nil, nil
}

func (s *matcherStub) GetCreatorByClerkID(_ context.Context, clerkID string) (map[string]any, error) {
	return s.creators[clerkID], nil
}

func (s *matcherStub) CreateLog(_ context.Context, data map[string]any) (map[string]any, error) {
	s.seq++
	log := map[string]any{"$id": "log" + strconv.Itoa(s.seq)}
	for k, v := range data {
		log[k] = v
	}
	s.logs[log["$id"].(string)] = log
	return log, nil
}

func (s *matcherStub) UpdateLog(_ context.Context, logID string, data map[string]any) error {
	log := s.logs[logID]
	for k, v := range data {
		log[k] = v
	}
	return nil
}

func (s *matcherStub) CountRecentDMActions(context.Context, string, string) (int, error) {
	return s.dmCount, nil
}

// Remaining CommentStore methods — unused by TriggerMatcher.
func (s *matcherStub) FindLogByCommentID(context.Context, string) ([]map[string]any, error) {
	panic("unexpected FindLogByCommentID")
}
func (s *matcherStub) FindButtonDMForUser(context.Context, string, string) (map[string]any, error) {
	panic("unexpected FindButtonDMForUser")
}
func (s *matcherStub) UpdateAutomation(context.Context, string, map[string]any) error {
	panic("unexpected UpdateAutomation")
}
func (s *matcherStub) UpdateCreatorToken(context.Context, string, string, string) error {
	panic("unexpected UpdateCreatorToken")
}
func (s *matcherStub) GetAutomation(context.Context, string) (map[string]any, error) {
	panic("unexpected GetAutomation")
}
func (s *matcherStub) GetJob(context.Context, string) (map[string]any, error) {
	panic("unexpected GetJob")
}
func (s *matcherStub) UpdateJob(context.Context, string, map[string]any) error {
	panic("unexpected UpdateJob")
}
func (s *matcherStub) CreateJob(context.Context, string, map[string]any, string, string) (string, error) {
	panic("unexpected CreateJob")
}
func (s *matcherStub) HasPendingFollowUp(context.Context, string, string) (bool, error) {
	panic("unexpected HasPendingFollowUp")
}

func newMatcher(s *matcherStub) *worker.TriggerMatcher {
	return worker.NewTriggerMatcher(s)
}

func TestMatcherKeywordMatchReturnsTriggeredAutomation(t *testing.T) {
	t.Parallel()
	s := &matcherStub{
		active:   []map[string]any{makeAutomation(nil)},
		creators: map[string]map[string]any{"user1": testCreator},
		logs:     map[string]map[string]any{},
	}
	got, err := newMatcher(s).Match(context.Background(), testEvent)
	if err != nil {
		t.Fatalf("Match: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 triggered, got %d", len(got))
	}
	if got[0].Automation["$id"] != "a1" || got[0].MatchedKeyword != "link" {
		t.Fatalf("triggered: %#v", got[0])
	}
	if got[0].LogRow["action"] != "pending" || got[0].LogRow["comment_id"] != "c1" {
		t.Fatalf("log row: %#v", got[0].LogRow)
	}
}

func TestMatcherNoKeywordMatchWritesSkippedLog(t *testing.T) {
	t.Parallel()
	s := &matcherStub{
		active:   []map[string]any{makeAutomation(map[string]any{"keywords": []string{"zzz"}})},
		creators: map[string]map[string]any{"user1": testCreator},
		logs:     map[string]map[string]any{},
	}
	got, err := newMatcher(s).Match(context.Background(), testEvent)
	if err != nil {
		t.Fatalf("Match: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 triggered, got %d", len(got))
	}
	if len(s.logs) != 1 {
		t.Fatalf("expected 1 log, got %d", len(s.logs))
	}
	for _, l := range s.logs {
		if l["action"] != "skipped" || l["reason"] != "skipped_no_match" {
			t.Fatalf("log: %#v", l)
		}
	}
}

func TestMatcherDedupsAlreadySentComment(t *testing.T) {
	t.Parallel()
	s := &matcherStub{
		active:   []map[string]any{makeAutomation(nil)},
		creators: map[string]map[string]any{"user1": testCreator},
		logs: map[string]map[string]any{
			"l1": {"automation_id": "a1", "comment_id": "c1", "action": "dm_sent"},
		},
	}
	got, err := newMatcher(s).Match(context.Background(), testEvent)
	if err != nil {
		t.Fatalf("Match: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 triggered, got %d", len(got))
	}
}

func TestMatcherSkipsCreatorWithoutToken(t *testing.T) {
	t.Parallel()
	s := &matcherStub{
		active:   []map[string]any{makeAutomation(nil)},
		creators: map[string]map[string]any{"user1": {"$id": "cr1", "clerk_user_id": "user1"}},
		logs:     map[string]map[string]any{},
	}
	got, err := newMatcher(s).Match(context.Background(), testEvent)
	if err != nil {
		t.Fatalf("Match: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 triggered, got %d", len(got))
	}
	for _, l := range s.logs {
		if l["reason"] != "no_access_token" {
			t.Fatalf("log: %#v", l)
		}
	}
}

func TestMatcherRateLimitReturnsErrRequeue(t *testing.T) {
	t.Parallel()
	s := &matcherStub{
		active:   []map[string]any{makeAutomation(nil)},
		creators: map[string]map[string]any{"user1": testCreator},
		logs:     map[string]map[string]any{},
		dmCount:  ratelimit.RateLimitMax,
	}
	_, err := newMatcher(s).Match(context.Background(), testEvent)
	if !errors.Is(err, worker.ErrRequeue) {
		t.Fatalf("expected ErrRequeue, got %v", err)
	}
}

func TestMatcherRateLimitSkipWritesSkippedLog(t *testing.T) {
	t.Parallel()
	s := &matcherStub{
		active:   []map[string]any{makeAutomation(nil)},
		creators: map[string]map[string]any{"user1": testCreator},
		logs:     map[string]map[string]any{},
		dmCount:  ratelimit.RateLimitMax,
	}
	event := map[string]any{}
	for k, v := range testEvent {
		event[k] = v
	}
	event["requeue_attempt"] = ratelimit.MaxRequeueAttempts
	got, err := newMatcher(s).Match(context.Background(), event)
	if err != nil {
		t.Fatalf("Match: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 triggered, got %d", len(got))
	}
	for _, l := range s.logs {
		if l["reason"] != "skipped_rate_limit" {
			t.Fatalf("log: %#v", l)
		}
	}
}

func TestMatcherMatchAnyWordBypassesKeywords(t *testing.T) {
	t.Parallel()
	s := &matcherStub{
		active:   []map[string]any{makeAutomation(map[string]any{"match_any_word": true, "keywords": []string{"zzz"}})},
		creators: map[string]map[string]any{"user1": testCreator},
		logs:     map[string]map[string]any{},
	}
	got, err := newMatcher(s).Match(context.Background(), testEvent)
	if err != nil {
		t.Fatalf("Match: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 triggered, got %d", len(got))
	}
	if got[0].MatchedKeyword != "" {
		t.Fatalf("expected empty keyword, got %q", got[0].MatchedKeyword)
	}
}
