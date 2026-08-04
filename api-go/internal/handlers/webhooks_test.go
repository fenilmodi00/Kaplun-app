package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/platform/webhooks"
)

type fakeWebhookStore struct {
	mu        sync.Mutex
	recorded  []string
	created   []createdJob
	recordErr error
}

type createdJob struct {
	Type    string
	Payload map[string]any
	ID      string
	RunAt   string
}

func (f *fakeWebhookStore) RecordWebhookEvent(_ context.Context, payload string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.recorded = append(f.recorded, payload)
	return f.recordErr
}

func (f *fakeWebhookStore) CreateJob(_ context.Context, jobType string, payload map[string]any, runAt string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id := "j" + string(rune('1'+len(f.created)))
	f.created = append(f.created, createdJob{Type: jobType, Payload: payload, ID: id, RunAt: runAt})
	return id, nil
}

type fakeEnqueuer struct {
	mu   sync.Mutex
	ids  []string
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

func TestWebhookRecordsRawPayload(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeWebhookStore{}
	h := handlers.NewWebhooksHandler("", []string{"test-ig-secret"}, store, &fakeEnqueuer{})
	engine := gin.New()
	engine.POST("/webhooks/instagram", h.Events)

	body := []byte(`{"object":"instagram","entry":[]}`)
	sig := webhooks.ComputeTestSignature("test-ig-secret", body)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/instagram", bytes.NewReader(body))
	req.Header.Set("X-Hub-Signature-256", sig)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if len(store.recorded) != 1 {
		t.Fatalf("expected recorded payload")
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(store.recorded[0]), &parsed); err != nil || parsed["object"] != "instagram" {
		t.Fatalf("recorded: %q", store.recorded[0])
	}
}

func TestWebhookValidSignatureAlways200EvenOnRecordError(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeWebhookStore{recordErr: context.Canceled}
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
