package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/automations"
)

type fakeAutomationsService struct {
	list             []models.Automation
	created          models.Automation
	got              models.Automation
	patched          models.Automation
	logs             []models.AutomationLog
	templates        []models.CampaignTemplate
	overview         models.OverviewStats
	stats            models.AutomationStats
	listErr          error
	createErr        error
	getErr           error
	patchErr         error
	deleteErr        error
	logsErr          error
	overviewErr      error
	statsErr         error
	lastClerkUserID  string
	lastAutomationID string
	lastCreate       models.AutomationCreate
	lastPatch        models.AutomationPatch
	deletedID        string
}

func (f *fakeAutomationsService) List(_ context.Context, clerkUserID string) ([]models.Automation, error) {
	f.lastClerkUserID = clerkUserID
	return f.list, f.listErr
}

func (f *fakeAutomationsService) Create(_ context.Context, clerkUserID string, body models.AutomationCreate) (models.Automation, error) {
	f.lastClerkUserID = clerkUserID
	f.lastCreate = body
	return f.created, f.createErr
}

func (f *fakeAutomationsService) Get(_ context.Context, clerkUserID, automationID string) (models.Automation, error) {
	f.lastClerkUserID = clerkUserID
	f.lastAutomationID = automationID
	return f.got, f.getErr
}

func (f *fakeAutomationsService) Patch(_ context.Context, clerkUserID, automationID string, body models.AutomationPatch) (models.Automation, error) {
	f.lastClerkUserID = clerkUserID
	f.lastAutomationID = automationID
	f.lastPatch = body
	return f.patched, f.patchErr
}

func (f *fakeAutomationsService) Delete(_ context.Context, clerkUserID, automationID string) error {
	f.lastClerkUserID = clerkUserID
	f.deletedID = automationID
	return f.deleteErr
}

func (f *fakeAutomationsService) ListLogs(_ context.Context, clerkUserID, automationID string) ([]models.AutomationLog, error) {
	f.lastClerkUserID = clerkUserID
	f.lastAutomationID = automationID
	return f.logs, f.logsErr
}

func (f *fakeAutomationsService) Templates() []models.CampaignTemplate {
	return f.templates
}

func (f *fakeAutomationsService) OverviewStats(_ context.Context, clerkUserID string) (models.OverviewStats, error) {
	f.lastClerkUserID = clerkUserID
	return f.overview, f.overviewErr
}

func (f *fakeAutomationsService) AutomationStats(_ context.Context, clerkUserID, automationID string) (models.AutomationStats, error) {
	f.lastClerkUserID = clerkUserID
	f.lastAutomationID = automationID
	return f.stats, f.statsErr
}

func withAutomationsClerk(userID string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("clerk_user_id", userID)
		c.Next()
	}
}

func setupAutomationsEngine(svc *fakeAutomationsService, auth gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	h := handlers.NewAutomationsHandler(svc)
	h.Register(engine.Group("/automations"), auth)
	return engine
}

func TestAutomationsHandlers(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		method     string
		path       string
		body       any
		auth       gin.HandlerFunc
		svc        *fakeAutomationsService
		wantStatus int
		check      func(t *testing.T, rec *httptest.ResponseRecorder, svc *fakeAutomationsService)
	}{
		{
			name:       "list success",
			method:     http.MethodGet,
			path:       "/automations",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{list: []models.Automation{{ID: "a1", ClerkUserID: "clerk_test_1", Name: "Mine"}}},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, svc *fakeAutomationsService) {
				var body models.AutomationsListResponse
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
					t.Fatalf("decode: %v", err)
				}
				if len(body.Automations) != 1 || body.Automations[0].ID != "a1" {
					t.Fatalf("unexpected body: %#v", body)
				}
				if svc.lastClerkUserID != "clerk_test_1" {
					t.Fatalf("expected clerk_test_1, got %q", svc.lastClerkUserID)
				}
			},
		},
		{
			name:       "list unauthorized",
			method:     http.MethodGet,
			path:       "/automations",
			auth:       func(c *gin.Context) { c.Next() },
			svc:        &fakeAutomationsService{},
			wantStatus: http.StatusUnauthorized,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeAutomationsService) {
				var body models.ErrorResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Error != "unauthorized" {
					t.Fatalf("expected unauthorized, got %#v", body)
				}
			},
		},
		{
			name:   "create 201",
			method: http.MethodPost,
			path:   "/automations",
			body: models.AutomationCreate{
				Name: "My Automation", TargetType: "all_posts",
				Keywords: []string{"keyword1"}, DMMessage: "Thanks!",
			},
			auth: withAutomationsClerk("clerk_test_1"),
			svc: &fakeAutomationsService{created: models.Automation{
				ID: "auto_1", ClerkUserID: "clerk_test_1", Name: "My Automation", Status: "active",
			}},
			wantStatus: http.StatusCreated,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, svc *fakeAutomationsService) {
				var body models.AutomationResponse
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
					t.Fatalf("decode: %v", err)
				}
				if body.Automation.ID != "auto_1" || body.Automation.Status != "active" {
					t.Fatalf("unexpected body: %#v", body)
				}
				if svc.lastCreate.Name != "My Automation" {
					t.Fatalf("create body not forwarded: %#v", svc.lastCreate)
				}
			},
		},
		{
			name:   "create validation 422",
			method: http.MethodPost,
			path:   "/automations",
			body: models.AutomationCreate{
				Name: "T", TargetType: "all_posts", Keywords: []string{}, DMMessage: "Hi",
			},
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{createErr: &automations.ValidationError{Message: "at least one non-empty keyword is required"}},
			wantStatus: http.StatusUnprocessableEntity,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeAutomationsService) {
				var body models.ErrorResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Error != "validation" {
					t.Fatalf("expected validation, got %#v", body)
				}
			},
		},
		{
			name:   "create instagram 409",
			method: http.MethodPost,
			path:   "/automations",
			body: models.AutomationCreate{
				Name: "T", TargetType: "all_posts", Keywords: []string{"kw"}, DMMessage: "Hi",
			},
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{createErr: automations.ErrInstagramNotConnected},
			wantStatus: http.StatusConflict,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeAutomationsService) {
				var body models.ErrorResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Error != "instagram_not_connected" {
					t.Fatalf("expected instagram_not_connected, got %#v", body)
				}
			},
		},
		{
			name:       "templates no auth",
			method:     http.MethodGet,
			path:       "/automations/templates",
			auth:       func(c *gin.Context) { c.Next() },
			svc:        &fakeAutomationsService{templates: []models.CampaignTemplate{{Slug: "dtc-product-link", Title: "DTC", Keywords: []string{"LINK"}, DMMessage: "hi"}}},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeAutomationsService) {
				var body models.TemplatesResponse
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
					t.Fatalf("decode: %v", err)
				}
				if len(body.Templates) != 1 || body.Templates[0].Slug != "dtc-product-link" {
					t.Fatalf("unexpected templates: %#v", body)
				}
			},
		},
		{
			name:       "templates not swallowed by id",
			method:     http.MethodGet,
			path:       "/automations/templates",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{templates: []models.CampaignTemplate{{Slug: "a", Title: "A", Keywords: []string{"x"}, DMMessage: "y"}}},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeAutomationsService) {
				if !bytes.Contains(rec.Body.Bytes(), []byte(`"templates"`)) {
					t.Fatalf("expected templates key, got %s", rec.Body.String())
				}
			},
		},
		{
			name:       "overview stats",
			method:     http.MethodGet,
			path:       "/automations/stats/overview",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{overview: models.OverviewStats{Sent7d: 3, Clicks7d: 1, CTR7d: 0.33, TopKeyword7d: "LINK", ActiveAutomations: 2}},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeAutomationsService) {
				var body models.OverviewStats
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
					t.Fatalf("decode: %v", err)
				}
				if body.Sent7d != 3 || body.ActiveAutomations != 2 || body.TopKeyword7d != "LINK" {
					t.Fatalf("unexpected overview: %#v", body)
				}
			},
		},
		{
			name:       "get ownership 404",
			method:     http.MethodGet,
			path:       "/automations/auto_other",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{getErr: automations.ErrNotFound},
			wantStatus: http.StatusNotFound,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, svc *fakeAutomationsService) {
				if svc.lastAutomationID != "auto_other" {
					t.Fatalf("expected auto_other, got %q", svc.lastAutomationID)
				}
				var body models.ErrorResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Error != "not_found" {
					t.Fatalf("expected not_found, got %#v", body)
				}
			},
		},
		{
			name:       "get success",
			method:     http.MethodGet,
			path:       "/automations/auto_1",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{got: models.Automation{ID: "auto_1", ClerkUserID: "clerk_test_1", Name: "Mine"}},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeAutomationsService) {
				var body models.AutomationResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Automation.Name != "Mine" {
					t.Fatalf("unexpected: %#v", body)
				}
			},
		},
		{
			name:   "patch ownership 404",
			method: http.MethodPatch,
			path:   "/automations/auto_other",
			body:   models.AutomationPatch{Name: strPtr("Hacked")},
			auth:   withAutomationsClerk("clerk_test_1"),
			svc:    &fakeAutomationsService{patchErr: automations.ErrNotFound},
			wantStatus: http.StatusNotFound,
		},
		{
			name:   "patch success",
			method: http.MethodPatch,
			path:   "/automations/auto_1",
			body:   models.AutomationPatch{Name: strPtr("Renamed")},
			auth:   withAutomationsClerk("clerk_test_1"),
			svc:    &fakeAutomationsService{patched: models.Automation{ID: "auto_1", Name: "Renamed"}},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, svc *fakeAutomationsService) {
				if svc.lastPatch.Name == nil || *svc.lastPatch.Name != "Renamed" {
					t.Fatalf("patch not forwarded: %#v", svc.lastPatch)
				}
				var body models.AutomationResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Automation.Name != "Renamed" {
					t.Fatalf("unexpected: %#v", body)
				}
			},
		},
		{
			name:       "delete 204",
			method:     http.MethodDelete,
			path:       "/automations/auto_1",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{},
			wantStatus: http.StatusNoContent,
			check: func(t *testing.T, _ *httptest.ResponseRecorder, svc *fakeAutomationsService) {
				if svc.deletedID != "auto_1" {
					t.Fatalf("expected delete auto_1, got %q", svc.deletedID)
				}
			},
		},
		{
			name:       "delete ownership 404",
			method:     http.MethodDelete,
			path:       "/automations/auto_other",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{deleteErr: automations.ErrNotFound},
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "logs passthrough",
			method:     http.MethodGet,
			path:       "/automations/auto_1/logs",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{logs: []models.AutomationLog{{ID: "log1", Action: "dm_sent"}, {ID: "log2", Action: "skipped"}}},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeAutomationsService) {
				var body models.AutomationLogsResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if len(body.Logs) != 2 || body.Logs[0].ID != "log1" {
					t.Fatalf("unexpected logs: %#v", body)
				}
			},
		},
		{
			name:       "logs ownership 404",
			method:     http.MethodGet,
			path:       "/automations/auto_other/logs",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{logsErr: automations.ErrNotFound},
			wantStatus: http.StatusNotFound,
		},
		{
			name:   "automation stats",
			method: http.MethodGet,
			path:   "/automations/auto_1/stats",
			auth:   withAutomationsClerk("clerk_test_1"),
			svc: &fakeAutomationsService{stats: models.AutomationStats{
				Sent: 3, Skipped: 1, Failed: 1, Clicks: 2, CTR: 0.67,
				TopKeywords: [][]any{{"LINK", 3}, {"SHOP", 1}},
				Daily:       []models.DailySent{{Date: "2026-07-29", Sent: 1}},
			}},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeAutomationsService) {
				var body models.AutomationStats
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
					t.Fatalf("decode: %v", err)
				}
				if body.Sent != 3 || body.Clicks != 2 || body.CTR != 0.67 {
					t.Fatalf("unexpected stats: %#v", body)
				}
				if len(body.TopKeywords) != 2 {
					t.Fatalf("expected top keywords, got %#v", body.TopKeywords)
				}
			},
		},
		{
			name:       "automation stats ownership 404",
			method:     http.MethodGet,
			path:       "/automations/auto_other/stats",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{statsErr: automations.ErrNotFound},
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "overview not swallowed by id",
			method:     http.MethodGet,
			path:       "/automations/stats/overview",
			auth:       withAutomationsClerk("clerk_test_1"),
			svc:        &fakeAutomationsService{overview: models.OverviewStats{}},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeAutomationsService) {
				if !bytes.Contains(rec.Body.Bytes(), []byte(`"sent_7d"`)) {
					t.Fatalf("expected sent_7d, got %s", rec.Body.String())
				}
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			engine := setupAutomationsEngine(tc.svc, tc.auth)
			var reqBody *bytes.Buffer
			if tc.body != nil {
				b, err := json.Marshal(tc.body)
				if err != nil {
					t.Fatalf("marshal: %v", err)
				}
				reqBody = bytes.NewBuffer(b)
			} else {
				reqBody = bytes.NewBuffer(nil)
			}
			req := httptest.NewRequest(tc.method, tc.path, reqBody)
			if tc.body != nil {
				req.Header.Set("Content-Type", "application/json")
			}
			rec := httptest.NewRecorder()
			engine.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status %d want %d body=%s", rec.Code, tc.wantStatus, rec.Body.String())
			}
			if tc.check != nil {
				tc.check(t, rec, tc.svc)
			}
		})
	}
}

func strPtr(s string) *string { return &s }
