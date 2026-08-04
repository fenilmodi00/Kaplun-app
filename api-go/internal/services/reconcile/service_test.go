package reconcile_test

import (
	"context"
	"testing"
	"time"

	"kaplun/api-go/internal/services/reconcile"
)

type fakeStore struct {
	autos           []reconcile.Automation
	creator         reconcile.Creator
	hasCreator      bool
	logs            map[string]bool
	buttonDMs       map[string]time.Time
	postbacks       map[string]postbackRow
	pending         map[string]bool
	jobs            []map[string]any
	updates         []map[string]any
	findButtonDMErr map[string]bool
	updateErr       map[string]bool
}

type postbackRow struct {
	action    string
	createdAt time.Time
}

func (f *fakeStore) ListAllActiveAutomations(context.Context) ([]reconcile.Automation, error) {
	return f.autos, nil
}

func (f *fakeStore) GetCreatorByClerkID(context.Context, string) (reconcile.Creator, bool, error) {
	return f.creator, f.hasCreator, nil
}

func (f *fakeStore) FindLog(_ context.Context, automationID, commentID string) (bool, error) {
	return f.logs[automationID+":"+commentID], nil
}

func (f *fakeStore) FindButtonDMForUser(_ context.Context, automationID, userID string) (bool, time.Time, error) {
	if f.findButtonDMErr != nil && f.findButtonDMErr[automationID+":"+userID] {
		return false, time.Time{}, context.Canceled
	}
	t, ok := f.buttonDMs[automationID+":"+userID]
	return ok, t, nil
}

func (f *fakeStore) GetPostbackLog(_ context.Context, automationID, userID string) (string, time.Time, bool, error) {
	p, ok := f.postbacks[automationID+":"+userID]
	if !ok {
		return "", time.Time{}, false, nil
	}
	return p.action, p.createdAt, true, nil
}

func (f *fakeStore) HasPendingSendReveal(_ context.Context, automationID, userID string) (bool, error) {
	return f.pending[automationID+":"+userID], nil
}

func (f *fakeStore) CreateJob(_ context.Context, jobType string, payload map[string]any, _ string) (string, error) {
	payload = cloneMap(payload)
	payload["_type"] = jobType
	f.jobs = append(f.jobs, payload)
	return "j1", nil
}

func (f *fakeStore) UpdateAutomation(_ context.Context, automationID string, data map[string]any) error {
	if f.updateErr != nil && f.updateErr[automationID] {
		return context.Canceled
	}
	f.updates = append(f.updates, data)
	return nil
}

type fakeGraph struct {
	media         []reconcile.Media
	comments      []reconcile.Comment
	conversations []reconcile.Conversation
	messages      map[string][]reconcile.ConversationMessage
}

func (f *fakeGraph) GetUserMedia(context.Context, int, string) ([]reconcile.Media, error) {
	return f.media, nil
}

func (f *fakeGraph) GetRecentMediaComments(context.Context, string, int64, string) ([]reconcile.Comment, error) {
	return f.comments, nil
}

func (f *fakeGraph) ListConversations(context.Context, int, string) ([]reconcile.Conversation, error) {
	return f.conversations, nil
}

func (f *fakeGraph) ListConversationMessages(_ context.Context, conversationID string, _ int, _ string) ([]reconcile.ConversationMessage, error) {
	return f.messages[conversationID], nil
}

type plainCrypto struct{}

func (plainCrypto) DecryptOrPlaintext(stored string) string { return stored }

type alwaysMatch struct{}

func (alwaysMatch) Matched(string, []string, bool) bool { return true }

type neverMatch struct{}

func (neverMatch) Matched(string, []string, bool) bool { return false }

func TestReconcileOnceEnqueues(t *testing.T) {
	t.Parallel()

	store := &fakeStore{
		autos: []reconcile.Automation{{
			ID: "a1", ClerkUserID: "u1", IgUserID: "ig1", TargetType: "specific_posts",
			MediaIDs: []string{"m1"}, Keywords: []string{"link"}, MatchMode: "whole_word",
		}},
		creator:    reconcile.Creator{AccessToken: "tok"},
		hasCreator: true,
		logs:       map[string]bool{},
	}
	graph := &fakeGraph{
		comments: []reconcile.Comment{{
			ID: "c1", Text: "link please", From: map[string]string{"id": "u2", "username": "bob"},
		}},
	}
	svc := reconcile.NewService(store, graph, plainCrypto{}, alwaysMatch{})
	svc.Now = func() time.Time { return time.Date(2026, 7, 30, 0, 0, 0, 0, time.UTC) }

	res, err := svc.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if res.Enqueued != 1 {
		t.Fatalf("enqueued=%d jobs=%v", res.Enqueued, store.jobs)
	}
	if store.jobs[0]["comment_id"] != "c1" {
		t.Fatalf("job: %#v", store.jobs[0])
	}
}

func TestReconcileOnceSkipsExistingLogAndSelfComments(t *testing.T) {
	t.Parallel()

	store := &fakeStore{
		autos: []reconcile.Automation{{
			ID: "a1", ClerkUserID: "u1", IgUserID: "ig1", TargetType: "specific_posts",
			MediaIDs: []string{"m1"},
		}},
		creator:    reconcile.Creator{AccessToken: "tok"},
		hasCreator: true,
		logs:       map[string]bool{"a1:c_existing": true},
	}
	graph := &fakeGraph{
		comments: []reconcile.Comment{
			{ID: "c_self", Text: "x", From: map[string]string{"id": "ig1"}},
			{ID: "c_existing", Text: "x", From: map[string]string{"id": "u2"}},
			{ID: "c_nomatch", Text: "x", From: map[string]string{"id": "u2"}},
		},
	}
	svc := reconcile.NewService(store, graph, plainCrypto{}, neverMatch{})
	res, err := svc.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if res.Enqueued != 0 {
		t.Fatalf("expected 0, got %d", res.Enqueued)
	}
}

func TestAttachNextReels(t *testing.T) {
	t.Parallel()

	store := &fakeStore{
		autos: []reconcile.Automation{
			{ID: "a1", ClerkUserID: "u1", TargetType: "next_reel", BoundMediaIDs: []string{"old"}},
			{ID: "a2", ClerkUserID: "u1", TargetType: "all_posts"},
		},
		creator:    reconcile.Creator{AccessToken: "tok"},
		hasCreator: true,
	}
	graph := &fakeGraph{media: []reconcile.Media{{ID: "newest"}}}
	svc := reconcile.NewService(store, graph, plainCrypto{}, alwaysMatch{})

	n, err := svc.AttachNextReels(context.Background())
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if n != 1 {
		t.Fatalf("attached=%d", n)
	}
	bound := store.updates[0]["bound_media_ids"].([]string)
	if len(bound) != 2 || bound[1] != "newest" {
		t.Fatalf("bound: %v", bound)
	}
}

func TestReconcileOnceMatchAnyWordBypassesMatcher(t *testing.T) {
	t.Parallel()

	store := &fakeStore{
		autos: []reconcile.Automation{{
			ID: "a1", ClerkUserID: "u1", IgUserID: "ig1", TargetType: "specific_posts",
			MediaIDs: []string{"m1"}, Keywords: []string{}, MatchAnyWord: true,
		}},
		creator:    reconcile.Creator{AccessToken: "tok"},
		hasCreator: true,
		logs:       map[string]bool{},
	}
	graph := &fakeGraph{
		comments: []reconcile.Comment{{
			ID: "c1", Text: "anything at all", From: map[string]string{"id": "u2", "username": "bob"},
		}},
	}
	svc := reconcile.NewService(store, graph, plainCrypto{}, neverMatch{})

	res, err := svc.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if res.Enqueued != 1 {
		t.Fatalf("enqueued=%d jobs=%v", res.Enqueued, store.jobs)
	}
}

func TestReconcilePostbacksOnceEnqueuesReveal(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{
		autos: []reconcile.Automation{{
			ID: "a1", ClerkUserID: "u1", IgUserID: "ig1",
			OpeningDMMode: "button", ButtonText: "Boom 💥",
		}},
		creator:    reconcile.Creator{AccessToken: "tok"},
		hasCreator: true,
		buttonDMs:  map[string]time.Time{"a1:fan1": now.Add(-time.Minute)},
		postbacks:  map[string]postbackRow{},
		pending:    map[string]bool{},
	}
	graph := &fakeGraph{
		conversations: []reconcile.Conversation{{ID: "conv1", UpdatedTime: now}},
		messages: map[string][]reconcile.ConversationMessage{
			"conv1": {{
				ID: "m1", FromID: "fan1", Text: "Boom 💥", CreatedTime: now.Add(-time.Minute),
			}},
		},
	}
	svc := reconcile.NewService(store, graph, plainCrypto{}, alwaysMatch{})
	svc.Now = func() time.Time { return now }

	res, err := svc.ReconcilePostbacksOnce(context.Background())
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if res.Enqueued != 1 {
		t.Fatalf("enqueued=%d jobs=%v", res.Enqueued, store.jobs)
	}
	if store.jobs[0]["_type"] != "send_reveal" || store.jobs[0]["user_id"] != "fan1" {
		t.Fatalf("job: %#v", store.jobs[0])
	}
}

func TestReconcilePostbacksOnceSkipsRevealSent(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{
		autos: []reconcile.Automation{{
			ID: "a1", ClerkUserID: "u1", IgUserID: "ig1",
			OpeningDMMode: "button", ButtonText: "Boom 💥",
		}},
		creator:    reconcile.Creator{AccessToken: "tok"},
		hasCreator: true,
		// Button DM older than the reveal — same opening cycle, already done.
		buttonDMs: map[string]time.Time{"a1:fan1": now.Add(-2 * time.Hour)},
		postbacks: map[string]postbackRow{
			"a1:fan1": {action: "reveal_sent", createdAt: now.Add(-time.Hour)},
		},
	}
	graph := &fakeGraph{
		conversations: []reconcile.Conversation{{ID: "conv1", UpdatedTime: now}},
		messages: map[string][]reconcile.ConversationMessage{
			"conv1": {{ID: "m1", FromID: "fan1", Text: "Boom 💥", CreatedTime: now}},
		},
	}
	svc := reconcile.NewService(store, graph, plainCrypto{}, alwaysMatch{})
	svc.Now = func() time.Time { return now }

	res, err := svc.ReconcilePostbacksOnce(context.Background())
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if res.Enqueued != 0 {
		t.Fatalf("expected 0, got %d", res.Enqueued)
	}
}

func TestReconcilePostbacksOnceEnqueuesAfterNewerButtonDM(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{
		autos: []reconcile.Automation{{
			ID: "a1", ClerkUserID: "u1", IgUserID: "ig1",
			OpeningDMMode: "button", ButtonText: "Boom 💥",
		}},
		creator:    reconcile.Creator{AccessToken: "tok"},
		hasCreator: true,
		buttonDMs:  map[string]time.Time{"a1:fan1": now.Add(-5 * time.Minute)},
		postbacks: map[string]postbackRow{
			"a1:fan1": {action: "reveal_sent", createdAt: now.Add(-time.Hour)},
		},
	}
	graph := &fakeGraph{
		conversations: []reconcile.Conversation{{ID: "conv1", UpdatedTime: now}},
		messages: map[string][]reconcile.ConversationMessage{
			"conv1": {{ID: "m1", FromID: "fan1", Text: "Boom 💥", CreatedTime: now.Add(-time.Minute)}},
		},
	}
	svc := reconcile.NewService(store, graph, plainCrypto{}, alwaysMatch{})
	svc.Now = func() time.Time { return now }

	res, err := svc.ReconcilePostbacksOnce(context.Background())
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if res.Enqueued != 1 {
		t.Fatalf("enqueued=%d jobs=%v", res.Enqueued, store.jobs)
	}
}

func TestReconcilePostbacksOnceContinuesOnStoreErrors(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{
		autos: []reconcile.Automation{
			{
				ID: "a1", ClerkUserID: "u1", IgUserID: "ig1",
				OpeningDMMode: "button", ButtonText: "Boom 💥",
			},
			{
				ID: "a2", ClerkUserID: "u2", IgUserID: "ig2",
				OpeningDMMode: "button", ButtonText: "Tap",
			},
		},
		creator:    reconcile.Creator{AccessToken: "tok"},
		hasCreator: true,
		buttonDMs: map[string]time.Time{
			"a1:fan1": now.Add(-time.Minute),
			"a2:fan2": now.Add(-time.Minute),
		},
		postbacks:       map[string]postbackRow{},
		pending:         map[string]bool{},
		findButtonDMErr: map[string]bool{"a1:fan1": true},
	}
	graph := &fakeGraph{
		conversations: []reconcile.Conversation{{ID: "conv1", UpdatedTime: now}},
		messages: map[string][]reconcile.ConversationMessage{
			"conv1": {
				{ID: "m1", FromID: "fan1", Text: "Boom 💥", CreatedTime: now.Add(-time.Minute)},
				{ID: "m2", FromID: "fan2", Text: "Tap", CreatedTime: now.Add(-time.Minute)},
			},
		},
	}
	svc := reconcile.NewService(store, graph, plainCrypto{}, alwaysMatch{})
	svc.Now = func() time.Time { return now }

	res, err := svc.ReconcilePostbacksOnce(context.Background())
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if res.Enqueued != 1 {
		t.Fatalf("enqueued=%d jobs=%v", res.Enqueued, store.jobs)
	}
	if len(res.Errors) == 0 {
		t.Fatal("expected errors for a1 failure")
	}
}

func TestAttachNextReelsContinuesOnErrors(t *testing.T) {
	t.Parallel()

	store := &fakeStore{
		autos: []reconcile.Automation{
			{ID: "a1", ClerkUserID: "u1", TargetType: "next_reel", BoundMediaIDs: []string{"old"}},
			{ID: "a2", ClerkUserID: "u2", TargetType: "next_reel", BoundMediaIDs: []string{"old2"}},
		},
		creator:    reconcile.Creator{AccessToken: "tok"},
		hasCreator: true,
		updateErr:  map[string]bool{"a1": true},
	}
	graph := &fakeGraph{media: []reconcile.Media{{ID: "newest"}}}
	svc := reconcile.NewService(store, graph, plainCrypto{}, alwaysMatch{})

	n, err := svc.AttachNextReels(context.Background())
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if n != 1 {
		t.Fatalf("attached=%d", n)
	}
}

func cloneMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
