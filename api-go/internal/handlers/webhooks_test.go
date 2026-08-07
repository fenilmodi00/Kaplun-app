package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/platform/webhooks"
	"kaplun/api-go/internal/services/insights"
)

type fakeWebhookStore struct {
	mu      sync.Mutex
	created []createdJob
	failFor map[string]bool
}

type createdJob struct {
	Type     string
	Payload  map[string]any
	ID       string
	RunAt    string
	DedupKey string
}

func (f *fakeWebhookStore) CreateJob(_ context.Context, jobType string, payload map[string]any, runAt, dedupKey string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failFor != nil && f.failFor[jobType] {
		return "", context.Canceled
	}
	id := "j" + string(rune('1'+len(f.created)))
	f.created = append(f.created, createdJob{Type: jobType, Payload: payload, ID: id, RunAt: runAt, DedupKey: dedupKey})
	return id, nil
}

type fakeEnqueuer struct {
	mu  sync.Mutex
	ids []string
}

func (f *fakeEnqueuer) Enqueue(jobID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ids = append(f.ids, jobID)
	return nil
}


func TestWebhookVerifyOK(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	h := handlers.NewWebhooksHandler("test-verify-token", nil, nil, nil)
	engine := gin.New()
	engine.GET("/webhooks/instagram", h.Verify)

	req := httptest.NewRequest(http.MethodGet, "/webhooks/instagram?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=42", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK || rec.Body.String() != "42" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
}

func TestWebhookVerifyWrongToken(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	h := handlers.NewWebhooksHandler("test-verify-token", nil, nil, nil)
	engine := gin.New()
	engine.GET("/webhooks/instagram", h.Verify)

	req := httptest.NewRequest(http.MethodGet, "/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestWebhookBadSignature(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	h := handlers.NewWebhooksHandler("", []string{"test-ig-secret"}, &fakeWebhookStore{}, &fakeEnqueuer{})
	engine := gin.New()
	engine.POST("/webhooks/instagram", h.Events)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/instagram", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("X-Hub-Signature-256", "sha256=bad")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestWebhookCreatesProcessCommentJob(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeWebhookStore{}
	enq := &fakeEnqueuer{}
	h := handlers.NewWebhooksHandler("", []string{"test-ig-secret"}, store, enq)
	engine := gin.New()
	engine.POST("/webhooks/instagram", h.Events)

	body := []byte(`{"object":"instagram","entry":[{"id":"ig1","changes":[{"field":"comments","value":{"id":"c1","text":"LINK","from":{"id":"u2"},"media":{"id":"m1"}}}]}]}`)
	sig := webhooks.ComputeTestSignature("test-ig-secret", body)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/instagram", bytes.NewReader(body))
	req.Header.Set("X-Hub-Signature-256", sig)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil || resp["status"] != "ok" {
		t.Fatalf("body: %s", rec.Body.String())
	}
	if len(store.created) != 1 || store.created[0].Type != "process_comment" {
		t.Fatalf("created jobs: %#v", store.created)
	}
	if store.created[0].Payload["comment_id"] != "c1" {
		t.Fatalf("payload: %#v", store.created[0].Payload)
	}
	if len(enq.ids) != 1 {
		t.Fatalf("expected enqueue, got %v", enq.ids)
	}
}

func TestWebhookPostbackCreatesSendReveal(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeWebhookStore{}
	h := handlers.NewWebhooksHandler("", []string{"test-ig-secret"}, store, &fakeEnqueuer{})
	engine := gin.New()
	engine.POST("/webhooks/instagram", h.Events)

	body := []byte(`{"object":"instagram","entry":[{"id":"ig1","messaging":[{"sender":{"id":"u42"},"recipient":{"id":"ig1"},"postback":{"payload":"reveal:a1","mid":"mid.123"}}]}]}`)
	sig := webhooks.ComputeTestSignature("test-ig-secret", body)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/instagram", bytes.NewReader(body))
	req.Header.Set("X-Hub-Signature-256", sig)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if len(store.created) != 1 || store.created[0].Type != "send_reveal" {
		t.Fatalf("created: %#v", store.created)
	}
	p := store.created[0].Payload
	if p["instagram_account_id"] != "ig1" || p["user_id"] != "u42" || p["automation_id"] != "a1" {
		t.Fatalf("payload: %#v", p)
	}
}

func TestWebhookValidSignatureAlways200EvenOnBadJSON(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeWebhookStore{}
	h := handlers.NewWebhooksHandler("", []string{"secret"}, store, &fakeEnqueuer{})
	engine := gin.New()
	engine.POST("/webhooks/instagram", h.Events)

	body := []byte(`{not-json`)
	sig := webhooks.ComputeTestSignature("secret", body)
	req := httptest.NewRequest(http.MethodPost, "/webhooks/instagram", bytes.NewReader(body))
	req.Header.Set("X-Hub-Signature-256", sig)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestWebhookMessageEnqueuesCreatedJobID(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeWebhookStore{}
	enq := &fakeEnqueuer{}
	h := handlers.NewWebhooksHandler("", []string{"test-ig-secret"}, store, enq)
	engine := gin.New()
	engine.POST("/webhooks/instagram", h.Events)

	body := []byte(`{"object":"instagram","entry":[{"id":"ig1","messaging":[{"sender":{"id":"u42"},"recipient":{"id":"ig1"},"message":{"mid":"m.abc","text":"link please"}}]}]}`)
	sig := webhooks.ComputeTestSignature("test-ig-secret", body)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/instagram", bytes.NewReader(body))
	req.Header.Set("X-Hub-Signature-256", sig)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if len(store.created) != 1 || store.created[0].Type != "process_message" {
		t.Fatalf("created: %#v", store.created)
	}
	p := store.created[0].Payload
	if p["message_id"] != "m.abc" || p["sender_id"] != "u42" || p["instagram_account_id"] != "ig1" {
		t.Fatalf("payload: %#v", p)
	}
	// The enqueued ID must be the one returned by CreateJob, not a
	// deterministically reconstructed (nonexistent) ID.
	if len(enq.ids) != 1 || enq.ids[0] != store.created[0].ID {
		t.Fatalf("enqueued %v, created job id %q", enq.ids, store.created[0].ID)
	}
}

func TestWebhookReadFallbackCreatesDelayedJobWithoutEnqueue(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeWebhookStore{}
	enq := &fakeEnqueuer{}
	h := handlers.NewWebhooksHandler("", []string{"test-ig-secret"}, store, enq)
	engine := gin.New()
	engine.POST("/webhooks/instagram", h.Events)

	body := []byte(`{"object":"instagram","entry":[{"id":"ig1","messaging":[{"sender":{"id":"u42"},"recipient":{"id":"ig1"},"read":{"watermark":1730000000}}]}]}`)
	sig := webhooks.ComputeTestSignature("test-ig-secret", body)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/instagram", bytes.NewReader(body))
	req.Header.Set("X-Hub-Signature-256", sig)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if len(store.created) != 1 || store.created[0].Type != "send_reveal" {
		t.Fatalf("created: %#v", store.created)
	}
	p := store.created[0].Payload
	if p["fallback"] != true || p["user_id"] != "u42" || p["instagram_account_id"] != "ig1" {
		t.Fatalf("payload: %#v", p)
	}
	// Delayed jobs must rely on the sweeper (run_at), not immediate enqueue.
	runAt, err := time.Parse(time.RFC3339Nano, store.created[0].RunAt)
	if err != nil {
		t.Fatalf("run_at %q: %v", store.created[0].RunAt, err)
	}
	delay := time.Until(runAt)
	if delay < 250*time.Second || delay > 350*time.Second {
		t.Fatalf("expected ~300s delay, got %v", delay)
	}
	if len(enq.ids) != 0 {
		t.Fatalf("read fallback must not be enqueued immediately, got %v", enq.ids)
	}
}

func TestWebhookReturns500OnPartialFailure(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeWebhookStore{failFor: map[string]bool{"process_comment": true}}
	enq := &fakeEnqueuer{}
	h := handlers.NewWebhooksHandler("", []string{"test-ig-secret"}, store, enq)
	engine := gin.New()
	engine.POST("/webhooks/instagram", h.Events)

	body := []byte(`{"object":"instagram","entry":[{"id":"ig1","changes":[{"field":"comments","value":{"id":"c1","text":"LINK","from":{"id":"u2"},"media":{"id":"m1"}}}]}]}`)
	sig := webhooks.ComputeTestSignature("test-ig-secret", body)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/instagram", bytes.NewReader(body))
	req.Header.Set("X-Hub-Signature-256", sig)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil || resp["status"] != "error" {
		t.Fatalf("body: %s", rec.Body.String())
	}
	if len(enq.ids) != 0 {
		t.Fatalf("expected no enqueue on failure, got %v", enq.ids)
	}
	found := false
	for _, job := range store.created {
		if job.Type == "webhook_envelope" {
			found = true
			if errs, ok := job.Payload["enqueue_errors"].([]string); !ok || len(errs) == 0 {
				t.Fatalf("expected envelope errors, got %#v", job.Payload)
			}
		}
	}
	if !found {
		t.Fatalf("expected webhook_envelope job, got %#v", store.created)
	}
}

func TestWebhookDedupKeys(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeWebhookStore{}
	h := handlers.NewWebhooksHandler("", []string{"test-ig-secret"}, store, &fakeEnqueuer{})
	engine := gin.New()
	engine.POST("/webhooks/instagram", h.Events)

	body := []byte(`{"object":"instagram","entry":[{"id":"ig1","changes":[{"field":"comments","value":{"id":"c1","text":"LINK","from":{"id":"u2"},"media":{"id":"m1"}}}],"messaging":[{"sender":{"id":"u3"},"recipient":{"id":"ig1"},"postback":{"payload":"reveal:a1","mid":"mid.123"}},{"sender":{"id":"u4"},"recipient":{"id":"ig1"},"message":{"mid":"m.abc","text":"hi"}}]}]}`)
	sig := webhooks.ComputeTestSignature("test-ig-secret", body)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/instagram", bytes.NewReader(body))
	req.Header.Set("X-Hub-Signature-256", sig)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	want := map[string]string{
		"process_comment": "process_comment:ig1:c1",
		"send_reveal":     "postback:ig1:u3:mid.123",
		"process_message": "process_message:ig1:u4:m.abc",
	}
	for _, job := range store.created {
		if wantKey, ok := want[job.Type]; ok && job.DedupKey != wantKey {
			t.Fatalf("%s dedup key: got %q want %q", job.Type, job.DedupKey, wantKey)
		}
	}
}

func TestWebhookMentions(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeWebhookStore{}
	syncer := &fakeMentionSyncer{}
	istore := &fakeMentionStore{}
	h := handlers.NewWebhooksHandler("", []string{"test-ig-secret"}, store, &fakeEnqueuer{})
	h.MentionedMediaSyncer = insights.NewService(syncer, istore, nil)
	h.AllowUnsigned = false
	engine := gin.New()
	engine.POST("/webhooks/instagram", h.Events)

	body := []byte(`{"object":"instagram","entry":[{"id":"ig1","changes":[{"field":"mentions","value":{"media_id":"m-mentioned"}}]}]}`)
	sig := webhooks.ComputeTestSignature("test-ig-secret", body)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/instagram", bytes.NewReader(body))
	req.Header.Set("X-Hub-Signature-256", sig)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil || resp["status"] != "ok" {
		t.Fatalf("body: %s", rec.Body.String())
	}
	syncer.mu.Lock()
	defer syncer.mu.Unlock()
	if len(syncer.calls) != 1 {
		t.Fatalf("expected 1 mention sync call, got %d", len(syncer.calls))
	}
	if syncer.calls[0].MediaID != "m-mentioned" {
		t.Errorf("syncer call media = %q, want m-mentioned", syncer.calls[0].MediaID)
	}
	istore.mu.Lock()
	defer istore.mu.Unlock()
	if istore.lastIGUID != "ig1" {
		t.Errorf("creator lookup ig_user_id = %q, want ig1", istore.lastIGUID)
	}
}

// fakeMentionSyncer is a minimal insights.GraphClient that records
// SyncMentionedMedia calls.
type fakeMentionSyncer struct {
	mu      sync.Mutex
	calls   []mentionCall
	failFor map[string]error
}

type mentionCall struct {
	IGUserID string
	MediaID  string
}

func (f *fakeMentionSyncer) GetUserProfile(context.Context, string) (*insights.CreatorProfile, error) {
	return nil, errors.New("unimplemented")
}
func (f *fakeMentionSyncer) GetUserMedia(context.Context, string, int) ([]insights.MediaItem, error) {
	return nil, errors.New("unimplemented")
}
func (f *fakeMentionSyncer) GetMediaInsights(context.Context, string, string, bool, ...string) (*insights.MediaInsights, error) {
	return nil, errors.New("unimplemented")
}
func (f *fakeMentionSyncer) GetAccountInsightsDay(context.Context, string, string, string) ([]insights.InsightDay, error) {
	return nil, errors.New("unimplemented")
}
func (f *fakeMentionSyncer) GetAccountInsightsTotals(context.Context, string, string, string) (map[string]int64, error) {
	return nil, errors.New("unimplemented")
}
func (f *fakeMentionSyncer) GetDemographics(context.Context, string, string, string) ([]insights.DemographicBreakdown, error) {
	return nil, errors.New("unimplemented")
}
func (f *fakeMentionSyncer) GetOnlineFollowers(context.Context, string) ([]insights.OnlineFollowers, error) {
	return nil, errors.New("unimplemented")
}
func (f *fakeMentionSyncer) GetMentionedMedia(_ context.Context, _, _, mediaID string) (*insights.MentionedMedia, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failFor != nil {
		if err, ok := f.failFor[mediaID]; ok {
			return nil, err
		}
	}
	f.calls = append(f.calls, mentionCall{MediaID: mediaID})
	return &insights.MentionedMedia{MediaID: mediaID}, nil
}

// fakeMentionStore is a minimal insights.Store that records the IG user ID
// looked up during SyncMentionedMedia.
type fakeMentionStore struct {
	mu        sync.Mutex
	lastIGUID string
}

func (f *fakeMentionStore) ListCreatorsWithToken(context.Context) ([]insights.CreatorRow, error) {
	return nil, nil
}
func (f *fakeMentionStore) GetCreatorByIGUserID(_ context.Context, igUserID string) (*insights.CreatorRow, error) {
	f.mu.Lock()
	f.lastIGUID = igUserID
	f.mu.Unlock()
	return &insights.CreatorRow{ID: "creator-1", AccessToken: "token", IGUserID: igUserID}, nil
}
func (f *fakeMentionStore) UpsertMentionedMedia(context.Context, string, insights.MentionedMedia) error {
	return nil
}
func (f *fakeMentionStore) UpdateCreatorSyncState(context.Context, string, string, string, map[string]any) error {
	return nil
}
func (f *fakeMentionStore) UpdateCreatorProfile(context.Context, string, *insights.CreatorProfile) error {
	return nil
}
func (f *fakeMentionStore) UpsertCreatorMedia(context.Context, string, []insights.MediaItemWithInsights) error {
	return nil
}
func (f *fakeMentionStore) PruneCreatorMedia(context.Context, string, []string) error {
	return nil
}
func (f *fakeMentionStore) UpsertInsightDays(context.Context, string, []insights.InsightDay) error {
	return nil
}
func (f *fakeMentionStore) UpsertDemographics(context.Context, string, []insights.DemographicBreakdown) error {
	return nil
}
func (f *fakeMentionStore) UpsertOnlineFollowers(context.Context, string, []insights.OnlineFollowers) error {
	return nil
}
