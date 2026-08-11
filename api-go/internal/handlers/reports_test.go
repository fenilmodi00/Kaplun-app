package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/profilescore"
)

type fakeReportsService struct {
	generateResult *profilescore.ReportResult
	generateErr    error
	latestResult   *profilescore.ReportResult
	latestErr      error
	lastClerkID    string
	generateCalled bool
	latestCalled   bool
}

func (f *fakeReportsService) Generate(_ context.Context, clerkUserID string) (*profilescore.ReportResult, error) {
	f.generateCalled = true
	f.lastClerkID = clerkUserID
	return f.generateResult, f.generateErr
}

func (f *fakeReportsService) GetLatest(_ context.Context, clerkUserID string) (*profilescore.ReportResult, error) {
	f.latestCalled = true
	f.lastClerkID = clerkUserID
	return f.latestResult, f.latestErr
}

func withReportsClerk(userID string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("clerk_user_id", userID)
		c.Next()
	}
}

func setupReportsEngine(svc *fakeReportsService, auth gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	h := handlers.NewReportsHandler(svc)
	h.Register(engine.Group("/reports"), auth)
	return engine
}

func TestReportsHandlers(t *testing.T) {
	t.Parallel()

	sampleResult := &profilescore.ReportResult{
		Report: profilescore.Report{
			OverallScore:   82,
			ScoreLabel:     "Growing Fast",
			OneLineSummary:  "Strong engagement for your tier.",
			Strengths:      []string{"High engagement", "Consistent posting"},
			Weaknesses:     []string{"Low CTR"},
			ActionPlan: []profilescore.ActionItem{
				{Priority: "high", Action: "Post at peak hours", Why: "Maximize reach", WhenToPost: "19:00-22:00"},
				{Priority: "medium", Action: "Add CTA", Why: "Improve CTR", WhenToPost: "anytime"},
				{Priority: "low", Action: "Engage", Why: "Community", WhenToPost: "daily"},
			},
		},
		Meta: profilescore.ReportMeta{
			Model:     "gpt-4o-mini",
			Tokens:    500,
			CreatedAt: "2026-08-11T12:00:00Z",
			Cached:    false,
		},
	}

	cases := []struct {
		name       string
		method     string
		path       string
		auth       gin.HandlerFunc
		svc        *fakeReportsService
		wantStatus int
		check      func(t *testing.T, rec *httptest.ResponseRecorder, svc *fakeReportsService)
	}{
		{
			name:       "generate success",
			method:     http.MethodPost,
			path:       "/reports/profile/generate",
			auth:       withReportsClerk("clerk_test_1"),
			svc:        &fakeReportsService{generateResult: sampleResult},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, svc *fakeReportsService) {
				var body profilescore.ReportResult
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
					t.Fatalf("decode: %v", err)
				}
				if body.Report.OverallScore != 82 {
					t.Errorf("OverallScore = %d, want 82", body.Report.OverallScore)
				}
				if body.Report.ScoreLabel != "Growing Fast" {
					t.Errorf("ScoreLabel = %q", body.Report.ScoreLabel)
				}
				if body.Meta.Cached {
					t.Error("Cached = true, want false")
				}
				if !svc.generateCalled {
					t.Error("Generate was not called")
				}
				if svc.lastClerkID != "clerk_test_1" {
					t.Errorf("lastClerkID = %q", svc.lastClerkID)
				}
			},
		},
		{
			name:       "generate unauthorized",
			method:     http.MethodPost,
			path:       "/reports/profile/generate",
			auth:       func(c *gin.Context) { c.Next() },
			svc:        &fakeReportsService{},
			wantStatus: http.StatusUnauthorized,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeReportsService) {
				var body models.ErrorResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Error != "unauthorized" {
					t.Fatalf("expected unauthorized, got %#v", body)
				}
			},
		},
		{
			name:       "generate creator not found 404",
			method:     http.MethodPost,
			path:       "/reports/profile/generate",
			auth:       withReportsClerk("clerk_test_1"),
			svc:        &fakeReportsService{generateErr: profilescore.ErrCreatorNotFound},
			wantStatus: http.StatusNotFound,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeReportsService) {
				var body models.ErrorResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Error != "creator_not_found" {
					t.Fatalf("expected creator_not_found, got %#v", body)
				}
			},
		},
		{
			name:       "generate internal error 500",
			method:     http.MethodPost,
			path:       "/reports/profile/generate",
			auth:       withReportsClerk("clerk_test_1"),
			svc:        &fakeReportsService{generateErr: context.DeadlineExceeded},
			wantStatus: http.StatusInternalServerError,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeReportsService) {
				var body models.ErrorResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Error != "internal_error" {
					t.Fatalf("expected internal_error, got %#v", body)
				}
			},
		},
		{
			name:       "latest success cached",
			method:     http.MethodGet,
			path:       "/reports/profile/latest",
			auth:       withReportsClerk("clerk_test_1"),
			svc: &fakeReportsService{latestResult: &profilescore.ReportResult{
				Report: profilescore.Report{OverallScore: 75, ScoreLabel: "Growing"},
				Meta:   profilescore.ReportMeta{Model: "gpt-4o", Tokens: 300, CreatedAt: "2026-08-10T00:00:00Z", Cached: true},
			}},
			wantStatus: http.StatusOK,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, svc *fakeReportsService) {
				var body profilescore.ReportResult
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
					t.Fatalf("decode: %v", err)
				}
				if body.Report.OverallScore != 75 {
					t.Errorf("OverallScore = %d, want 75", body.Report.OverallScore)
				}
				if !body.Meta.Cached {
					t.Error("Cached = false, want true")
				}
				if !svc.latestCalled {
					t.Error("GetLatest was not called")
				}
			},
		},
		{
			name:       "latest no cache 404",
			method:     http.MethodGet,
			path:       "/reports/profile/latest",
			auth:       withReportsClerk("clerk_test_1"),
			svc:        &fakeReportsService{latestResult: nil},
			wantStatus: http.StatusNotFound,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeReportsService) {
				var body models.ErrorResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Error != "not_found" {
					t.Fatalf("expected not_found, got %#v", body)
				}
			},
		},
		{
			name:       "latest unauthorized",
			method:     http.MethodGet,
			path:       "/reports/profile/latest",
			auth:       func(c *gin.Context) { c.Next() },
			svc:        &fakeReportsService{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "latest creator not found 404",
			method:     http.MethodGet,
			path:       "/reports/profile/latest",
			auth:       withReportsClerk("clerk_test_1"),
			svc:        &fakeReportsService{latestErr: profilescore.ErrCreatorNotFound},
			wantStatus: http.StatusNotFound,
			check: func(t *testing.T, rec *httptest.ResponseRecorder, _ *fakeReportsService) {
				var body models.ErrorResponse
				_ = json.Unmarshal(rec.Body.Bytes(), &body)
				if body.Error != "creator_not_found" {
					t.Fatalf("expected creator_not_found, got %#v", body)
				}
			},
		},
		{
			name:       "latest internal error 500",
			method:     http.MethodGet,
			path:       "/reports/profile/latest",
			auth:       withReportsClerk("clerk_test_1"),
			svc:        &fakeReportsService{latestErr: context.DeadlineExceeded},
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			engine := setupReportsEngine(tc.svc, tc.auth)
			req := httptest.NewRequest(tc.method, tc.path, nil)
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
