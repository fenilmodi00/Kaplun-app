package worker_test

import (
	"context"
	"encoding/json"
	"strconv"
	"testing"
	"time"

	"kaplun/api-go/internal/platform/meta"
	"kaplun/api-go/internal/services/ratelimit"
	"kaplun/api-go/internal/worker"
)

var testEvent = map[string]any{
	"instagram_account_id": "ig1",
	"media_id":             "m1",
	"comment_id":           "c1",
	"comment_text":         "Please send the link!",
	"commenter_name":       "alice",
}

var testCreator = map[string]any{
	"$id":           "cr1",
	"clerk_user_id": "user1",
	"access_token":  "plain-token",
}

func makeAutomation(overrides map[string]any) map[string]any {
	auto := map[string]any{
		"$id":                  "a1",
		"clerk_user_id":        "user1",
		"ig_user_id":           "ig1",
		"target_type":          "all_posts",
		"keywords":             []string{"link"},
		"match_mode":           "whole_word",
		"dm_message":           "Hi {username}, here is your link",
		"public_reply_enabled": true,
		"public_reply_message": "On it, {username}!",
		"status":               "active",
	}
	for k, v := range overrides {
		auto[k] = v
	}
	return auto
}

type fakeStore struct {
	automations      []map[string]any
	creators         map[string]map[string]any
	logs             map[string]map[string]any
	jobs             map[string]map[string]any
	dmCount          int
	raise409OnCreate bool
	seq              int
}

func newFakeStore(automations []map[string]any, creators map[string]map[string]any, dmCount int) *fakeStore {
	return &fakeStore{
		automations: automations,
		creators:    creators,
		logs:        map[string]map[string]any{},
		jobs:        map[string]map[string]any{},
		dmCount:     dmCount,
	}
}

func (f *fakeStore) ListActiveForIG(context.Context, string) ([]map[string]any, error) {
	out := make([]map[string]any, len(f.automations))
	copy(out, f.automations)
	return out, nil
}

func (f *fakeStore) UpdateAutomation(_ context.Context, autoID string, data map[string]any) error {
	for _, a := range f.automations {
		if a["$id"] == autoID {
			for k, v := range data {
				a[k] = v
			}
			return nil
		}
	}
	return nil
}

func (f *fakeStore) FindLog(_ context.Context, automationID, commentID string) (map[string]any, error) {
	for _, log := range f.logs {
		if log["automation_id"] == automationID && log["comment_id"] == commentID {
			return log, nil
		}
	}
	return nil, nil
}

func (f *fakeStore) FindLogByCommentID(_ context.Context, commentID string) ([]map[string]any, error) {
	var out []map[string]any
	for _, log := range f.logs {
		if log["comment_id"] == commentID {
			action, _ := log["action"].(string)
			if action == "dm_sent" || action == "button_dm_sent" || action == "reveal_sent" {
				out = append(out, log)
			}
		}
	}
	return out, nil
}

func (f *fakeStore) CreateLog(_ context.Context, data map[string]any) (map[string]any, error) {
	if f.raise409OnCreate {
		return nil, worker.ErrDuplicateKey
	}
	f.seq++
	log := map[string]any{"$id": "log" + strconv.Itoa(f.seq)}
	for k, v := range data {
		log[k] = v
	}
	f.logs[log["$id"].(string)] = log
	return log, nil
}

func (f *fakeStore) UpdateLog(_ context.Context, logID string, data map[string]any) error {
	log := f.logs[logID]
	for k, v := range data {
		log[k] = v
	}
	return nil
}

func (f *fakeStore) CountRecentDMActions(string, string) int { return f.dmCount }

func (f *fakeStore) GetCreatorByClerkID(_ context.Context, clerkID string) (map[string]any, error) {
	return f.creators[clerkID], nil
}

func (f *fakeStore) GetTrackedLinkForAutomation(context.Context, string) (map[string]any, error) {
	return nil, nil
}

func (f *fakeStore) GetAutomation(_ context.Context, automationID string) (map[string]any, error) {
	for _, a := range f.automations {
		if a["$id"] == automationID {
			return a, nil
		}
	}
	return nil, nil
}

func (f *fakeStore) addJob(jobID string, payload map[string]any, status string, attempts int, typ string) {
	if status == "" {
		status = "pending"
	}
	if typ == "" {
		typ = "comment"
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	body, _ := json.Marshal(payload)
	f.jobs[jobID] = map[string]any{
		"$id":        jobID,
		"type":       typ,
		"payload":    string(body),
		"status":     status,
		"attempts":   attempts,
		"run_at":     now,
		"created_at": now,
		"updated_at": now,
	}
}

func (f *fakeStore) GetJob(_ context.Context, jobID string) (map[string]any, error) {
	return f.jobs[jobID], nil
}

func (f *fakeStore) CreateJob(_ context.Context, jobType string, payload map[string]any, runAt string) (string, error) {
	f.seq++
	jobID := "job" + strconv.Itoa(f.seq)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if runAt == "" {
		runAt = now
	}
	body, _ := json.Marshal(payload)
	f.jobs[jobID] = map[string]any{
		"$id":        jobID,
		"type":       jobType,
		"payload":    string(body),
		"status":     "pending",
		"attempts":   0,
		"run_at":     runAt,
		"created_at": now,
		"updated_at": now,
	}
	return jobID, nil
}

func (f *fakeStore) UpdateJob(_ context.Context, jobID string, data map[string]any) error {
	job := f.jobs[jobID]
	for k, v := range data {
		job[k] = v
	}
	return nil
}

type graphCall struct {
	Kind string
	Args []any
}

type fakeGraph struct {
	calls []graphCall
	dmErr error
}

func (g *fakeGraph) SendCommentReply(_ context.Context, commentID, message, accessToken string) error {
	g.calls = append(g.calls, graphCall{Kind: "reply", Args: []any{commentID, message, accessToken}})
	return nil
}

func (g *fakeGraph) SendPrivateReply(_ context.Context, ig, commentID, text, accessToken string) error {
	g.calls = append(g.calls, graphCall{Kind: "dm", Args: []any{ig, commentID, text, accessToken}})
	return g.dmErr
}

func (g *fakeGraph) SendPrivateReplyWithButton(_ context.Context, ig, commentID, text, buttonTitle, payload, accessToken string) error {
	g.calls = append(g.calls, graphCall{Kind: "button_dm", Args: []any{ig, commentID, text, buttonTitle, payload, accessToken}})
	return g.dmErr
}

func (g *fakeGraph) SendDirectMessage(_ context.Context, ig, userID, text, accessToken string) error {
	g.calls = append(g.calls, graphCall{Kind: "direct_dm", Args: []any{ig, userID, text, accessToken}})
	return g.dmErr
}

func (g *fakeGraph) SendDirectMessageWithButton(_ context.Context, ig, userID, text, buttonTitle, payload, accessToken string) error {
	g.calls = append(g.calls, graphCall{Kind: "direct_button_dm", Args: []any{ig, userID, text, buttonTitle, payload, accessToken}})
	return g.dmErr
}

func (g *fakeGraph) GetUserFollowStatus(_ context.Context, accessToken, recipientID string) (*bool, error) {
	g.calls = append(g.calls, graphCall{Kind: "follow_check", Args: []any{accessToken, recipientID}})
	following := true
	return &following, nil
}

type plainCrypto struct{}

func (plainCrypto) DecryptOrPlaintext(stored string) string { return stored }

func newRunner(store *fakeStore, graph *fakeGraph) *worker.CommentRunner {
	r := worker.NewCommentRunner(store, graph, plainCrypto{})
	r.Now = func() time.Time { return time.Now().UTC() }
	return r
}

func kinds(calls []graphCall) []string {
	out := make([]string, len(calls))
	for i, c := range calls {
		out[i] = c.Kind
	}
	return out
}

func minutesUntil(iso string) float64 {
	t, err := time.Parse(time.RFC3339Nano, iso)
	if err != nil {
		t, _ = time.Parse(time.RFC3339, iso)
	}
	return time.Until(t).Minutes()
}

func TestPersonalizeUsernameFallback(t *testing.T) {
	t.Parallel()
	if got := worker.Personalize("Hi {username}!", "alice"); got != "Hi alice!" {
		t.Fatalf("got %q", got)
	}
	if got := worker.Personalize("Hi {USERNAME}!", ""); got != "Hi there!" {
		t.Fatalf("got %q", got)
	}
	if got := worker.Personalize("", "alice"); got != "" {
		t.Fatalf("got %q", got)
	}
}

func TestNoKeywordMatchCreatesNoLogsAndSendsNothing(t *testing.T) {
	t.Parallel()
	store := newFakeStore([]map[string]any{makeAutomation(map[string]any{"keywords": []string{"zzz"}})}, map[string]map[string]any{"user1": testCreator}, 0)
	graph := &fakeGraph{}
	result, err := newRunner(store, graph).ProcessCommentEvent(context.Background(), testEvent, 0)
	if err != nil || result != "done" {
		t.Fatalf("result=%s err=%v", result, err)
	}
	if len(graph.calls) != 0 {
		t.Fatalf("expected no graph calls, got %d", len(graph.calls))
	}
	if len(store.logs) != 1 {
		t.Fatalf("expected 1 log entry, got %d", len(store.logs))
	}
	var logEntry map[string]any
	for _, l := range store.logs {
		logEntry = l
	}
	if logEntry["action"] != "skipped" || logEntry["reason"] != "skipped_no_match" {
		t.Fatalf("expected action=skipped reason=skipped_no_match, got action=%v reason=%v", logEntry["action"], logEntry["reason"])
	}
}

func TestMatchSendsPublicReplyThenDMAndMarksDMSent(t *testing.T) {
	t.Parallel()
	store := newFakeStore([]map[string]any{makeAutomation(nil)}, map[string]map[string]any{"user1": testCreator}, 0)
	graph := &fakeGraph{}
	result, err := newRunner(store, graph).ProcessCommentEvent(context.Background(), testEvent, 0)
	if err != nil || result != "done" {
		t.Fatalf("result=%s err=%v", result, err)
	}
	if got := kinds(graph.calls); len(got) != 2 || got[0] != "reply" || got[1] != "dm" {
		t.Fatalf("call order: %v", got)
	}
	reply := graph.calls[0]
	if reply.Args[0] != "c1" || reply.Args[1] != "On it, alice!" || reply.Args[2] != "plain-token" {
		t.Fatalf("reply args: %#v", reply.Args)
	}
	dm := graph.calls[1]
	if dm.Args[0] != "ig1" || dm.Args[1] != "c1" || dm.Args[2] != "Hi alice, here is your link" || dm.Args[3] != "plain-token" {
		t.Fatalf("dm args: %#v", dm.Args)
	}
	if len(store.logs) != 1 {
		t.Fatalf("logs: %d", len(store.logs))
	}
	var log map[string]any
	for _, l := range store.logs {
		log = l
	}
	if log["action"] != "dm_sent" || log["reason"] != nil || log["matched_keyword"] != "link" {
		t.Fatalf("log: %#v", log)
	}
	if log["automation_id"] != "a1" || log["comment_id"] != "c1" {
		t.Fatalf("log ids: %#v", log)
	}
}

func TestExistingDMSentLogDedupsAllSends(t *testing.T) {
	t.Parallel()
	store := newFakeStore([]map[string]any{makeAutomation(nil)}, map[string]map[string]any{"user1": testCreator}, 0)
	_, _ = store.CreateLog(context.Background(), map[string]any{
		"automation_id": "a1",
		"comment_id":    "c1",
		"action":        "dm_sent",
		"created_at":    time.Now().UTC().Format(time.RFC3339Nano),
	})
	graph := &fakeGraph{}
	result, err := newRunner(store, graph).ProcessCommentEvent(context.Background(), testEvent, 0)
	if err != nil || result != "done" {
		t.Fatalf("result=%s err=%v", result, err)
	}
	if len(graph.calls) != 0 || len(store.logs) != 1 {
		t.Fatalf("expected dedup, calls=%d logs=%d", len(graph.calls), len(store.logs))
	}
}

func TestCrossCampaignDedupSkipsDMWhenAnotherCampaignAlreadySent(t *testing.T) {
	t.Parallel()
	auto1 := makeAutomation(map[string]any{"$id": "a1"})
	auto2 := makeAutomation(map[string]any{"$id": "a2"})
	store := newFakeStore([]map[string]any{auto1, auto2}, map[string]map[string]any{"user1": testCreator}, 0)
	// a1 already sent a DM for this comment
	_, _ = store.CreateLog(context.Background(), map[string]any{
		"automation_id": "a1",
		"comment_id":    "c1",
		"action":        "dm_sent",
		"created_at":    time.Now().UTC().Format(time.RFC3339Nano),
	})
	graph := &fakeGraph{}
	result, err := newRunner(store, graph).ProcessCommentEvent(context.Background(), testEvent, 0)
	if err != nil || result != "done" {
		t.Fatalf("result=%s err=%v", result, err)
	}
	// a1: existing dm_sent log → skipped (no calls)
	// a2: public reply sent, DM skipped due to cross-campaign dedup
	if got := kinds(graph.calls); len(got) != 1 || got[0] != "reply" {
		t.Fatalf("expected 1 reply call (from a2), got %v", got)
	}
	var a2Log map[string]any
	for _, l := range store.logs {
		if l["automation_id"] == "a2" {
			a2Log = l
		}
	}
	if a2Log == nil {
		t.Fatal("expected a log for a2")
	}
	if a2Log["action"] != "skipped" || a2Log["reason"] != "skipped_dedup" {
		t.Fatalf("expected a2 log action=skipped reason=skipped_dedup, got action=%v reason=%v", a2Log["action"], a2Log["reason"])
	}
}

func TestRateLimitedEventReturnsRequeueAndRunJobReschedules(t *testing.T) {
	t.Parallel()
	store := newFakeStore([]map[string]any{makeAutomation(nil)}, map[string]map[string]any{"user1": testCreator}, ratelimit.RateLimitMax)
	graph := &fakeGraph{}
	runner := newRunner(store, graph)

	result, err := runner.ProcessCommentEvent(context.Background(), testEvent, 0)
	if err != nil || result != "requeue" {
		t.Fatalf("result=%s err=%v", result, err)
	}
	if len(graph.calls) != 0 || len(store.logs) != 0 {
		t.Fatalf("expected no sends/logs before reservation")
	}

	payload := map[string]any{}
	for k, v := range testEvent {
		payload[k] = v
	}
	payload["requeue_attempt"] = 0
	store.addJob("j1", payload, "pending", 0, "comment")
	if err := runner.RunJob(context.Background(), "j1"); err != nil {
		t.Fatalf("RunJob: %v", err)
	}
	job := store.jobs["j1"]
	if job["status"] != "pending" || job["attempts"] != 0 {
		t.Fatalf("job: %#v", job)
	}
	var decoded map[string]any
	_ = json.Unmarshal([]byte(job["payload"].(string)), &decoded)
	if int(decoded["requeue_attempt"].(float64)) != 1 {
		t.Fatalf("requeue_attempt: %#v", decoded["requeue_attempt"])
	}
	mins := minutesUntil(job["run_at"].(string))
	if mins < 28 || mins > 32 {
		t.Fatalf("run_at minutes: %v", mins)
	}
}

func TestTokenExpiredMarksAutomationErrorAndFailsLog(t *testing.T) {
	t.Parallel()
	store := newFakeStore([]map[string]any{makeAutomation(nil)}, map[string]map[string]any{"user1": testCreator}, 0)
	graph := &fakeGraph{dmErr: &meta.TokenExpiredError{MetaAPIError: &meta.MetaAPIError{Code: 190, Message: "Session expired"}}}
	result, err := newRunner(store, graph).ProcessCommentEvent(context.Background(), testEvent, 0)
	if err != nil || result != "done" {
		t.Fatalf("result=%s err=%v", result, err)
	}
	if store.automations[0]["status"] != "error" {
		t.Fatalf("automation status: %#v", store.automations[0]["status"])
	}
	var log map[string]any
	for _, l := range store.logs {
		log = l
	}
	if log["action"] != "failed" || log["reason"] != "token_expired" {
		t.Fatalf("log: %#v", log)
	}
}

func TestMetaAPIErrorRetriesWithBackoffThenDeadLetters(t *testing.T) {
	t.Parallel()
	store := newFakeStore([]map[string]any{makeAutomation(nil)}, map[string]map[string]any{"user1": testCreator}, 0)
	graph := &fakeGraph{dmErr: &meta.MetaAPIError{Code: 1, Message: "boom"}}
	runner := newRunner(store, graph)
	store.addJob("j1", testEvent, "pending", 0, "comment")

	if err := runner.RunJob(context.Background(), "j1"); err != nil {
		t.Fatalf("attempt1: %v", err)
	}
	job := store.jobs["j1"]
	if job["status"] != "pending" || job["attempts"] != 1 {
		t.Fatalf("after1: %#v", job)
	}
	if mins := minutesUntil(job["run_at"].(string)); mins < 4 || mins > 6 {
		t.Fatalf("backoff1: %v", mins)
	}

	if err := runner.RunJob(context.Background(), "j1"); err != nil {
		t.Fatalf("attempt2: %v", err)
	}
	job = store.jobs["j1"]
	if job["status"] != "pending" || job["attempts"] != 2 {
		t.Fatalf("after2: %#v", job)
	}
	if mins := minutesUntil(job["run_at"].(string)); mins < 14 || mins > 16 {
		t.Fatalf("backoff2: %v", mins)
	}

	if err := runner.RunJob(context.Background(), "j1"); err != nil {
		t.Fatalf("attempt3: %v", err)
	}
	job = store.jobs["j1"]
	if job["status"] != "failed" || job["attempts"] != 3 {
		t.Fatalf("after3: %#v", job)
	}
}

func TestDuplicateLogCreateRaceIsSkipped(t *testing.T) {
	t.Parallel()
	store := newFakeStore([]map[string]any{makeAutomation(nil)}, map[string]map[string]any{"user1": testCreator}, 0)
	store.raise409OnCreate = true
	graph := &fakeGraph{}
	result, err := newRunner(store, graph).ProcessCommentEvent(context.Background(), testEvent, 0)
	if err != nil || result != "done" {
		t.Fatalf("result=%s err=%v", result, err)
	}
	if len(graph.calls) != 0 || len(store.logs) != 0 {
		t.Fatalf("expected skip on 409, calls=%d logs=%d", len(graph.calls), len(store.logs))
	}
}

func TestButtonModeCallsSendPrivateReplyWithButton(t *testing.T) {
	t.Parallel()
	store := newFakeStore([]map[string]any{makeAutomation(map[string]any{
		"opening_dm_mode": "button",
		"button_text":     "Get link",
		"reveal_message":  "Here's the secret link!",
	})}, map[string]map[string]any{"user1": testCreator}, 0)
	graph := &fakeGraph{}
	result, err := newRunner(store, graph).ProcessCommentEvent(context.Background(), testEvent, 0)
	if err != nil || result != "done" {
		t.Fatalf("result=%s err=%v", result, err)
	}
	if got := kinds(graph.calls); len(got) != 2 || got[0] != "reply" || got[1] != "button_dm" {
		t.Fatalf("calls: %v", got)
	}
	dm := graph.calls[1]
	if dm.Args[0] != "ig1" || dm.Args[1] != "c1" || dm.Args[2] != "Hi alice, here is your link" {
		t.Fatalf("dm: %#v", dm.Args)
	}
	if dm.Args[3] != "Get link" || dm.Args[4] != "reveal:a1" || dm.Args[5] != "plain-token" {
		t.Fatalf("button: %#v", dm.Args)
	}
	var log map[string]any
	for _, l := range store.logs {
		log = l
	}
	if log["action"] != "button_dm_sent" || log["reason"] != nil {
		t.Fatalf("log: %#v", log)
	}
}

func TestSendRevealJobSendsDirectMessage(t *testing.T) {
	t.Parallel()
	store := newFakeStore([]map[string]any{makeAutomation(map[string]any{
		"reveal_message": "Secret link: example.com",
	})}, map[string]map[string]any{"user1": testCreator}, 0)
	graph := &fakeGraph{}
	store.addJob("j_reveal", map[string]any{
		"instagram_account_id": "ig1",
		"user_id":              "u42",
		"automation_id":        "a1",
	}, "pending", 0, worker.JobTypeSendReveal)

	if err := newRunner(store, graph).RunJob(context.Background(), "j_reveal"); err != nil {
		t.Fatalf("RunJob: %v", err)
	}
	if got := kinds(graph.calls); len(got) != 1 || got[0] != "direct_dm" {
		t.Fatalf("calls: %v", got)
	}
	dm := graph.calls[0]
	if dm.Args[0] != "ig1" || dm.Args[1] != "u42" || dm.Args[2] != "Secret link: example.com" || dm.Args[3] != "plain-token" {
		t.Fatalf("direct_dm: %#v", dm.Args)
	}
	var revealLogs int
	for _, l := range store.logs {
		if l["action"] == "reveal_sent" {
			revealLogs++
			if l["comment_id"] != "postback:u42" || l["automation_id"] != "a1" {
				t.Fatalf("reveal log: %#v", l)
			}
		}
	}
	if revealLogs != 1 {
		t.Fatalf("reveal logs: %d", revealLogs)
	}
	if store.jobs["j_reveal"]["status"] != "done" {
		t.Fatalf("job status: %#v", store.jobs["j_reveal"]["status"])
	}
}

func TestGraphRateLimitReturnsRequeue(t *testing.T) {
	t.Parallel()
	store := newFakeStore([]map[string]any{makeAutomation(nil)}, map[string]map[string]any{"user1": testCreator}, 0)
	graph := &fakeGraph{dmErr: &meta.GraphRateLimitError{MetaAPIError: &meta.MetaAPIError{Code: 613, Message: "rate"}}}
	result, err := newRunner(store, graph).ProcessCommentEvent(context.Background(), testEvent, 0)
	if err != nil || result != "requeue" {
		t.Fatalf("result=%s err=%v", result, err)
	}
}
