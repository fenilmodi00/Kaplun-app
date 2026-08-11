package profilescore

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"kaplun/api-go/internal/services/insights"
)

// --- Fakes ---

type fakeLLMClient struct {
	resp *LLMResponse
	err  error
	lastPayload MetricsPayload
	lastScore   int
}

func (f *fakeLLMClient) GenerateReport(_ context.Context, payload MetricsPayload, score int) (*LLMResponse, error) {
	f.lastPayload = payload
	f.lastScore = score
	if f.err != nil {
		return nil, f.err
	}
	return f.resp, nil
}

type fakeReportStore struct {
	cached   []cachedReportEntry
	cacheErr error
	latest   *CachedReport
	latestErr error
}

type cachedReportEntry struct {
	creatorRowID string
	report       Report
	model        string
	tokens       int
}

func (s *fakeReportStore) CacheReport(_ context.Context, creatorRowID string, report Report, model string, tokens int) error {
	if s.cacheErr != nil {
		return s.cacheErr
	}
	s.cached = append(s.cached, cachedReportEntry{creatorRowID, report, model, tokens})
	return nil
}

func (s *fakeReportStore) GetLatestReport(_ context.Context, creatorRowID string) (*CachedReport, error) {
	if s.latestErr != nil {
		return nil, s.latestErr
	}
	return s.latest, nil
}

type fakeCreatorLookup struct {
	rowID string
	err   error
}

func (l *fakeCreatorLookup) GetCreatorRowID(_ context.Context, clerkUserID string) (string, error) {
	if l.err != nil {
		return "", l.err
	}
	return l.rowID, nil
}

type fakeInsightsReader struct {
	creator         map[string]any
	media           []insights.MediaItemWithInsights
	days            []insights.InsightDay
	onlineFollowers []insights.OnlineFollowers
	creatorErr      error
	mediaErr        error
	daysErr         error
	onlineErr       error
}

func (r *fakeInsightsReader) GetCreatorDerived(_ context.Context, _ string) (map[string]any, error) {
	return r.creator, r.creatorErr
}

func (r *fakeInsightsReader) ListCreatorMedia(_ context.Context, _ string) ([]insights.MediaItemWithInsights, error) {
	return r.media, r.mediaErr
}

func (r *fakeInsightsReader) ListInsightDays(_ context.Context, _ string) ([]insights.InsightDay, error) {
	return r.days, r.daysErr
}

func (r *fakeInsightsReader) ListOnlineFollowers(_ context.Context, _ string) ([]insights.OnlineFollowers, error) {
	return r.onlineFollowers, r.onlineErr
}

// --- Helpers ---

func sampleCreatorRow() map[string]any {
	return map[string]any{
		"follower_count":          float64(500),
		"following_count":         float64(200),
		"post_count":              float64(50),
		"engagement_rate":         0.08,
		"content_frequency_days":  4.4,
		"last_post_days":          float64(1),
		"profile_views_window":    float64(100),
		"profile_link_taps_window": float64(10),
	}
}

func sampleLLMResponse() *LLMResponse {
	return &LLMResponse{
		ScoreLabel:     "Growing Fast",
		OneLineSummary: "Your engagement is strong for your follower tier.",
		Strengths:      []string{"High engagement rate", "Consistent posting"},
		Weaknesses:     []string{"Low profile link CTR"},
		ActionPlan: []ActionItem{
			{Priority: "high", Action: "Post during peak hours", Why: "Maximize reach", WhenToPost: "19:00-22:00"},
			{Priority: "medium", Action: "Add call-to-action in bio", Why: "Improve CTR", WhenToPost: "anytime"},
			{Priority: "low", Action: "Engage with comments", Why: "Build community", WhenToPost: "daily"},
		},
		Model:      "gpt-4o-mini",
		TokensUsed: 500,
	}
}

// --- validateAndClamp tests ---

func TestValidateAndClamp(t *testing.T) {
	t.Run("happy path passes through", func(t *testing.T) {
		raw := &llmRawOutput{
			ScoreLabel:     "Growing Fast",
			OneLineSummary: "Your engagement is strong.",
			Strengths:      []string{"High engagement", "Consistent posting"},
			Weaknesses:     []string{"Low CTR"},
			ActionPlan: []ActionItem{
				{Priority: "high", Action: "Post during peak hours", Why: "Maximize reach", WhenToPost: "19:00-22:00"},
				{Priority: "medium", Action: "Add CTA", Why: "Improve CTR", WhenToPost: "anytime"},
				{Priority: "low", Action: "Engage", Why: "Community", WhenToPost: "daily"},
			},
		}
		out := validateAndClamp(raw, "gpt-4o", 100)
		if out.ScoreLabel != "Growing Fast" {
			t.Errorf("ScoreLabel = %q", out.ScoreLabel)
		}
		if out.Model != "gpt-4o" || out.TokensUsed != 100 {
			t.Errorf("meta = %+v", out)
		}
		if len(out.ActionPlan) != 3 {
			t.Fatalf("ActionPlan len = %d", len(out.ActionPlan))
		}
		if out.ActionPlan[0].Priority != "high" {
			t.Errorf("priority = %q", out.ActionPlan[0].Priority)
		}
	})

	t.Run("score_label clamped to 40 chars", func(t *testing.T) {
		long := strings.Repeat("a", 50)
		raw := &llmRawOutput{ScoreLabel: long}
		out := validateAndClamp(raw, "m", 0)
		if len([]rune(out.ScoreLabel)) > 40 {
			t.Errorf("ScoreLabel len = %d, want <= 40", len([]rune(out.ScoreLabel)))
		}
		if !strings.HasSuffix(out.ScoreLabel, "…") {
			t.Errorf("expected truncation suffix, got %q", out.ScoreLabel)
		}
	})

	t.Run("empty score_label defaults to Needs data", func(t *testing.T) {
		raw := &llmRawOutput{}
		out := validateAndClamp(raw, "m", 0)
		if out.ScoreLabel != "Needs data" {
			t.Errorf("ScoreLabel = %q, want 'Needs data'", out.ScoreLabel)
		}
	})

	t.Run("one_line_summary clamped to 200 chars", func(t *testing.T) {
		long := strings.Repeat("b", 250)
		raw := &llmRawOutput{OneLineSummary: long}
		out := validateAndClamp(raw, "m", 0)
		if len([]rune(out.OneLineSummary)) > 200 {
			t.Errorf("OneLineSummary len = %d, want <= 200", len([]rune(out.OneLineSummary)))
		}
	})

	t.Run("strengths take first 3", func(t *testing.T) {
		raw := &llmRawOutput{
			Strengths: []string{"a", "b", "c", "d", "e"},
		}
		out := validateAndClamp(raw, "m", 0)
		if len(out.Strengths) != 3 {
			t.Fatalf("Strengths len = %d, want 3", len(out.Strengths))
		}
	})

	t.Run("weaknesses take first 3", func(t *testing.T) {
		raw := &llmRawOutput{
			Weaknesses: []string{"a", "b", "c", "d"},
		}
		out := validateAndClamp(raw, "m", 0)
		if len(out.Weaknesses) != 3 {
			t.Fatalf("Weaknesses len = %d, want 3", len(out.Weaknesses))
		}
	})

	t.Run("action_plan take first 3", func(t *testing.T) {
		raw := &llmRawOutput{
			ActionPlan: []ActionItem{
				{Priority: "high", Action: "a"},
				{Priority: "medium", Action: "b"},
				{Priority: "low", Action: "c"},
				{Priority: "high", Action: "d"},
			},
		}
		out := validateAndClamp(raw, "m", 0)
		if len(out.ActionPlan) != 3 {
			t.Fatalf("ActionPlan len = %d, want 3", len(out.ActionPlan))
		}
	})

	t.Run("invalid priority defaults to medium", func(t *testing.T) {
		raw := &llmRawOutput{
			ActionPlan: []ActionItem{
				{Priority: "urgent", Action: "a"},
				{Priority: "", Action: "b"},
				{Priority: "HIGH", Action: "c"},
			},
		}
		out := validateAndClamp(raw, "m", 0)
		if out.ActionPlan[0].Priority != "medium" {
			t.Errorf("priority[0] = %q, want medium", out.ActionPlan[0].Priority)
		}
		if out.ActionPlan[1].Priority != "medium" {
			t.Errorf("priority[1] = %q, want medium", out.ActionPlan[1].Priority)
		}
		// "HIGH" lowercased is "high" which is valid
		if out.ActionPlan[2].Priority != "high" {
			t.Errorf("priority[2] = %q, want high", out.ActionPlan[2].Priority)
		}
	})

	t.Run("action field clamped to 500 chars", func(t *testing.T) {
		long := strings.Repeat("x", 600)
		raw := &llmRawOutput{
			ActionPlan: []ActionItem{{Priority: "high", Action: long}},
		}
		out := validateAndClamp(raw, "m", 0)
		if len([]rune(out.ActionPlan[0].Action)) > 500 {
			t.Errorf("Action len = %d, want <= 500", len([]rune(out.ActionPlan[0].Action)))
		}
	})
}

// --- fallbackReport tests ---

func TestFallbackReport(t *testing.T) {
	out := fallbackReport("test-model", 42)
	if out.ScoreLabel != "Needs data" {
		t.Errorf("ScoreLabel = %q, want 'Needs data'", out.ScoreLabel)
	}
	if out.Model != "test-model" {
		t.Errorf("Model = %q", out.Model)
	}
	if out.TokensUsed != 42 {
		t.Errorf("TokensUsed = %d", out.TokensUsed)
	}
	if out.Strengths == nil || len(out.Strengths) != 0 {
		t.Errorf("Strengths = %v, want empty non-nil", out.Strengths)
	}
	if out.Weaknesses == nil || len(out.Weaknesses) != 0 {
		t.Errorf("Weaknesses = %v, want empty non-nil", out.Weaknesses)
	}
	if out.ActionPlan == nil || len(out.ActionPlan) != 0 {
		t.Errorf("ActionPlan = %v, want empty non-nil", out.ActionPlan)
	}
}

// --- parseAndClamp tests ---

func TestParseAndClamp(t *testing.T) {
	t.Run("valid JSON passes through", func(t *testing.T) {
		content := `{"score_label":"Good","one_line_summary":"Summary","strengths":["s1"],"weaknesses":["w1"],"action_plan":[{"priority":"high","action":"a","why":"b","when_to_post":"c"}]}`
		out := parseAndClamp(content, "m", 10)
		if out.ScoreLabel != "Good" {
			t.Errorf("ScoreLabel = %q", out.ScoreLabel)
		}
		if len(out.Strengths) != 1 || out.Strengths[0] != "s1" {
			t.Errorf("Strengths = %v", out.Strengths)
		}
	})

	t.Run("code fences stripped", func(t *testing.T) {
		content := "```json\n" + `{"score_label":"Fenced","one_line_summary":"","strengths":[],"weaknesses":[],"action_plan":[]}` + "\n```"
		out := parseAndClamp(content, "m", 0)
		if out.ScoreLabel != "Fenced" {
			t.Errorf("ScoreLabel = %q, want 'Fenced'", out.ScoreLabel)
		}
	})

	t.Run("invalid JSON returns fallback", func(t *testing.T) {
		content := "this is not JSON at all"
		out := parseAndClamp(content, "m", 5)
		if out.ScoreLabel != "Needs data" {
			t.Errorf("ScoreLabel = %q, want 'Needs data'", out.ScoreLabel)
		}
		if out.TokensUsed != 5 {
			t.Errorf("TokensUsed = %d, want 5", out.TokensUsed)
		}
	})

	t.Run("empty content returns fallback", func(t *testing.T) {
		out := parseAndClamp("", "m", 0)
		if out.ScoreLabel != "Needs data" {
			t.Errorf("ScoreLabel = %q", out.ScoreLabel)
		}
	})
}

// --- clampString / clampStringSlice tests ---

func TestClampString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		maxRunes int
		wantLen  int
		wantSuf  bool
	}{
		{"short", "hello", 10, 5, false},
		{"exact", "hello", 5, 5, false},
		{"truncated", "hello world", 5, 5, true},
		{"empty", "", 10, 0, false},
		{"zero max", "hello", 0, 0, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := clampString(tc.input, tc.maxRunes)
			if len([]rune(got)) != tc.wantLen {
				t.Errorf("len = %d, want %d", len([]rune(got)), tc.wantLen)
			}
			if tc.wantSuf && !strings.HasSuffix(got, "…") {
				t.Errorf("expected … suffix, got %q", got)
			}
		})
	}
}

func TestClampStringSlice(t *testing.T) {
	t.Run("truncates to n", func(t *testing.T) {
		items := []string{"a", "b", "c", "d", "e"}
		out := clampStringSlice(items, 3, 100)
		if len(out) != 3 {
			t.Fatalf("len = %d, want 3", len(out))
		}
	})

	t.Run("clamps each item", func(t *testing.T) {
		items := []string{strings.Repeat("x", 50)}
		out := clampStringSlice(items, 3, 10)
		if len(out) != 1 {
			t.Fatalf("len = %d, want 1", len(out))
		}
		if len([]rune(out[0])) > 10 {
			t.Errorf("item len = %d, want <= 10", len([]rune(out[0])))
		}
	})

	t.Run("empty items returns empty", func(t *testing.T) {
		out := clampStringSlice(nil, 3, 100)
		if len(out) != 0 {
			t.Errorf("len = %d, want 0", len(out))
		}
	})

	t.Run("empty strings filtered out", func(t *testing.T) {
		items := []string{"a", "  ", "", "b"}
		out := clampStringSlice(items, 4, 100)
		if len(out) != 2 {
			t.Errorf("len = %d, want 2 (empty filtered)", len(out))
		}
	})
}

// --- stripCodeFences tests ---

func TestStripCodeFences(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"no fences", `{"key":"val"}`, `{"key":"val"}`},
		{"json fence", "```json\n{\"key\":\"val\"}\n```", `{"key":"val"}`},
		{"plain fence", "```\n{\"key\":\"val\"}\n```", `{"key":"val"}`},
		{"no closing fence", "```json\n{\"key\":\"val\"}", `{"key":"val"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := stripCodeFences(tc.input)
			if got != tc.want {
				t.Errorf("stripCodeFences() = %q, want %q", got, tc.want)
			}
		})
	}
}

// --- ReportService.Generate tests ---

func TestReportServiceGenerate(t *testing.T) {
	t.Run("happy path", func(t *testing.T) {
		llm := &fakeLLMClient{resp: sampleLLMResponse()}
		store := &fakeReportStore{}
		lookup := &fakeCreatorLookup{rowID: "creator_123"}
		ir := &fakeInsightsReader{creator: sampleCreatorRow()}

		svc := NewReportService(ReportServiceDeps{
			Insights: ir,
			LLM:      llm,
			Store:    store,
			Lookup:   lookup,
		})

		result, err := svc.Generate(context.Background(), "clerk_user_1")
		if err != nil {
			t.Fatalf("Generate error: %v", err)
		}
		if result.Meta.Cached {
			t.Error("Cached = true, want false")
		}
		if result.Report.OverallScore == 0 {
			t.Error("OverallScore = 0, want non-zero (score computed from payload)")
		}
		if result.Report.ScoreLabel != "Growing Fast" {
			t.Errorf("ScoreLabel = %q", result.Report.ScoreLabel)
		}
		if len(result.Report.ActionPlan) != 3 {
			t.Errorf("ActionPlan len = %d, want 3", len(result.Report.ActionPlan))
		}
		if result.Meta.Model != "gpt-4o-mini" {
			t.Errorf("Model = %q", result.Meta.Model)
		}
		if result.Meta.Tokens != 500 {
			t.Errorf("Tokens = %d, want 500", result.Meta.Tokens)
		}
		if result.Meta.CreatedAt == "" {
			t.Error("CreatedAt = empty")
		}
		if llm.lastScore != result.Report.OverallScore {
			t.Errorf("LLM received score %d, report has %d", llm.lastScore, result.Report.OverallScore)
		}
		if len(store.cached) != 1 {
			t.Errorf("store.cached len = %d, want 1", len(store.cached))
		}
		if store.cached[0].creatorRowID != "creator_123" {
			t.Errorf("cached creatorRowID = %q", store.cached[0].creatorRowID)
		}
	})

	t.Run("creator not found", func(t *testing.T) {
		lookup := &fakeCreatorLookup{rowID: ""}
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{},
			LLM:      &fakeLLMClient{resp: sampleLLMResponse()},
			Store:    &fakeReportStore{},
			Lookup:   lookup,
		})
		_, err := svc.Generate(context.Background(), "clerk_user_1")
		if !errors.Is(err, ErrCreatorNotFound) {
			t.Fatalf("error = %v, want ErrCreatorNotFound", err)
		}
	})

	t.Run("lookup error", func(t *testing.T) {
		lookup := &fakeCreatorLookup{err: errors.New("db down")}
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{},
			LLM:      &fakeLLMClient{resp: sampleLLMResponse()},
			Store:    &fakeReportStore{},
			Lookup:   lookup,
		})
		_, err := svc.Generate(context.Background(), "clerk_user_1")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("LLM failure uses fallback", func(t *testing.T) {
		llm := &fakeLLMClient{err: errors.New("llm timeout")}
		store := &fakeReportStore{}
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{creator: sampleCreatorRow()},
			LLM:      llm,
			Store:    store,
			Lookup:   &fakeCreatorLookup{rowID: "creator_123"},
		})
		result, err := svc.Generate(context.Background(), "clerk_user_1")
		if err != nil {
			t.Fatalf("Generate error: %v", err)
		}
		if result.Report.ScoreLabel != "Needs data" {
			t.Errorf("ScoreLabel = %q, want 'Needs data' (fallback)", result.Report.ScoreLabel)
		}
		if result.Report.OverallScore == 0 {
			t.Error("OverallScore = 0, want non-zero (score is Go-owned, independent of LLM)")
		}
	})

	t.Run("cache failure does not fail generate", func(t *testing.T) {
		store := &fakeReportStore{cacheErr: errors.New("cache write failed")}
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{creator: sampleCreatorRow()},
			LLM:      &fakeLLMClient{resp: sampleLLMResponse()},
			Store:    store,
			Lookup:   &fakeCreatorLookup{rowID: "creator_123"},
		})
		result, err := svc.Generate(context.Background(), "clerk_user_1")
		if err != nil {
			t.Fatalf("Generate error: %v (cache failure should not propagate)", err)
		}
		if result == nil {
			t.Fatal("result = nil")
		}
	})

	t.Run("insights read error", func(t *testing.T) {
		ir := &fakeInsightsReader{creatorErr: errors.New("db error")}
		svc := NewReportService(ReportServiceDeps{
			Insights: ir,
			LLM:      &fakeLLMClient{resp: sampleLLMResponse()},
			Store:    &fakeReportStore{},
			Lookup:   &fakeCreatorLookup{rowID: "creator_123"},
		})
		_, err := svc.Generate(context.Background(), "clerk_user_1")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

// --- ReportService.GetLatest tests ---

func TestReportServiceGetLatest(t *testing.T) {
	t.Run("cache hit within TTL", func(t *testing.T) {
		now := time.Now().UTC()
		cached := &CachedReport{
			Report: Report{
				OverallScore:   75,
				ScoreLabel:     "Growing",
				OneLineSummary:  "Good progress",
				Strengths:      []string{"s1"},
				Weaknesses:     []string{"w1"},
				ActionPlan:     []ActionItem{{Priority: "high", Action: "a"}},
			},
			CreatedAt: now.Add(-3 * 24 * time.Hour).Format(time.RFC3339Nano),
			Model:     "gpt-4o",
			Tokens:    300,
		}
		store := &fakeReportStore{latest: cached}
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{},
			LLM:      &fakeLLMClient{},
			Store:    store,
			Lookup:   &fakeCreatorLookup{rowID: "creator_123"},
		})
		result, err := svc.GetLatest(context.Background(), "clerk_user_1")
		if err != nil {
			t.Fatalf("GetLatest error: %v", err)
		}
		if result == nil {
			t.Fatal("result = nil, want report")
		}
		if !result.Meta.Cached {
			t.Error("Cached = false, want true")
		}
		if result.Report.OverallScore != 75 {
			t.Errorf("OverallScore = %d, want 75", result.Report.OverallScore)
		}
		if result.Meta.Model != "gpt-4o" {
			t.Errorf("Model = %q", result.Meta.Model)
		}
		if result.Meta.Tokens != 300 {
			t.Errorf("Tokens = %d, want 300", result.Meta.Tokens)
		}
	})

	t.Run("cache miss returns nil", func(t *testing.T) {
		store := &fakeReportStore{latest: nil}
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{},
			LLM:      &fakeLLMClient{},
			Store:    store,
			Lookup:   &fakeCreatorLookup{rowID: "creator_123"},
		})
		result, err := svc.GetLatest(context.Background(), "clerk_user_1")
		if err != nil {
			t.Fatalf("GetLatest error: %v", err)
		}
		if result != nil {
			t.Fatalf("result = %+v, want nil", result)
		}
	})

	t.Run("expired cache returns nil", func(t *testing.T) {
		now := time.Now().UTC()
		cached := &CachedReport{
			Report:    Report{OverallScore: 75, ScoreLabel: "Old"},
			CreatedAt: now.Add(-8 * 24 * time.Hour).Format(time.RFC3339Nano),
		}
		store := &fakeReportStore{latest: cached}
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{},
			LLM:      &fakeLLMClient{},
			Store:    store,
			Lookup:   &fakeCreatorLookup{rowID: "creator_123"},
		})
		result, err := svc.GetLatest(context.Background(), "clerk_user_1")
		if err != nil {
			t.Fatalf("GetLatest error: %v", err)
		}
		if result != nil {
			t.Fatalf("result = %+v, want nil (expired)", result)
		}
	})

	t.Run("exactly 7 days boundary returns nil", func(t *testing.T) {
		now := time.Now().UTC()
		cached := &CachedReport{
			Report:    Report{OverallScore: 75},
			CreatedAt: now.Add(-7*24*time.Hour - time.Second).Format(time.RFC3339Nano),
		}
		store := &fakeReportStore{latest: cached}
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{},
			LLM:      &fakeLLMClient{},
			Store:    store,
			Lookup:   &fakeCreatorLookup{rowID: "creator_123"},
		})
		result, _ := svc.GetLatest(context.Background(), "clerk_user_1")
		if result != nil {
			t.Fatal("expected nil for >7d old cache")
		}
	})

	t.Run("creator not found", func(t *testing.T) {
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{},
			LLM:      &fakeLLMClient{},
			Store:    &fakeReportStore{},
			Lookup:   &fakeCreatorLookup{rowID: ""},
		})
		_, err := svc.GetLatest(context.Background(), "clerk_user_1")
		if !errors.Is(err, ErrCreatorNotFound) {
			t.Fatalf("error = %v, want ErrCreatorNotFound", err)
		}
	})

	t.Run("store error", func(t *testing.T) {
		store := &fakeReportStore{latestErr: errors.New("db error")}
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{},
			LLM:      &fakeLLMClient{},
			Store:    store,
			Lookup:   &fakeCreatorLookup{rowID: "creator_123"},
		})
		_, err := svc.GetLatest(context.Background(), "clerk_user_1")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("invalid timestamp returns nil", func(t *testing.T) {
		cached := &CachedReport{
			Report:    Report{OverallScore: 75},
			CreatedAt: "not-a-timestamp",
		}
		store := &fakeReportStore{latest: cached}
		svc := NewReportService(ReportServiceDeps{
			Insights: &fakeInsightsReader{},
			LLM:      &fakeLLMClient{},
			Store:    store,
			Lookup:   &fakeCreatorLookup{rowID: "creator_123"},
		})
		result, _ := svc.GetLatest(context.Background(), "clerk_user_1")
		if result != nil {
			t.Fatal("expected nil for invalid timestamp")
		}
	})
}

// --- mergeReport tests ---

func TestMergeReport(t *testing.T) {
	t.Run("merges score and LLM fields", func(t *testing.T) {
		llm := &LLMResponse{
			ScoreLabel:     "Growing",
			OneLineSummary:  "Good",
			Strengths:       []string{"s1"},
			Weaknesses:      []string{"w1"},
			ActionPlan:      []ActionItem{{Priority: "high", Action: "a"}},
			Model:           "m",
			TokensUsed:      10,
		}
		report := mergeReport(82, llm)
		if report.OverallScore != 82 {
			t.Errorf("OverallScore = %d, want 82", report.OverallScore)
		}
		if report.ScoreLabel != "Growing" {
			t.Errorf("ScoreLabel = %q", report.ScoreLabel)
		}
	})

	t.Run("nil slices default to empty", func(t *testing.T) {
		llm := &LLMResponse{
			Strengths:  nil,
			Weaknesses: nil,
			ActionPlan: nil,
		}
		report := mergeReport(50, llm)
		if report.Strengths == nil || len(report.Strengths) != 0 {
			t.Errorf("Strengths = %v, want empty non-nil", report.Strengths)
		}
		if report.Weaknesses == nil || len(report.Weaknesses) != 0 {
			t.Errorf("Weaknesses = %v, want empty non-nil", report.Weaknesses)
		}
		if report.ActionPlan == nil || len(report.ActionPlan) != 0 {
			t.Errorf("ActionPlan = %v, want empty non-nil", report.ActionPlan)
		}
	})
}

// --- Marshal/Unmarshal Report tests ---

func TestMarshalUnmarshalReport(t *testing.T) {
	original := Report{
		OverallScore:   75,
		ScoreLabel:     "Growing",
		OneLineSummary:  "Good progress",
		Strengths:      []string{"s1", "s2"},
		Weaknesses:     []string{"w1"},
		ActionPlan:     []ActionItem{{Priority: "high", Action: "a", Why: "b", WhenToPost: "c"}},
	}
	jsonStr, err := MarshalReport(original)
	if err != nil {
		t.Fatalf("MarshalReport error: %v", err)
	}
	roundtrip, err := UnmarshalReport(jsonStr)
	if err != nil {
		t.Fatalf("UnmarshalReport error: %v", err)
	}
	if roundtrip.OverallScore != original.OverallScore {
		t.Errorf("OverallScore = %d, want %d", roundtrip.OverallScore, original.OverallScore)
	}
	if roundtrip.ScoreLabel != original.ScoreLabel {
		t.Errorf("ScoreLabel = %q", roundtrip.ScoreLabel)
	}
	if len(roundtrip.Strengths) != 2 {
		t.Errorf("Strengths len = %d", len(roundtrip.Strengths))
	}
}

func TestUnmarshalReportNilSlices(t *testing.T) {
	// JSON with missing array fields should produce empty non-nil slices.
	jsonStr := `{"overall_score":50,"score_label":"x","one_line_summary":"","strengths":null,"weaknesses":null,"action_plan":null}`
	r, err := UnmarshalReport(jsonStr)
	if err != nil {
		t.Fatalf("UnmarshalReport error: %v", err)
	}
	if r.Strengths == nil {
		t.Error("Strengths = nil, want empty non-nil")
	}
	if r.Weaknesses == nil {
		t.Error("Weaknesses = nil, want empty non-nil")
	}
	if r.ActionPlan == nil {
		t.Error("ActionPlan = nil, want empty non-nil")
	}
}

// --- buildUserPrompt tests ---

func TestBuildUserPrompt(t *testing.T) {
	payload := MetricsPayload{
		FollowersCount: 500,
		EngagementRate:  0.08,
	}
	score := 75
	prompt := buildUserPrompt(payload, score)
	if !strings.Contains(prompt, "75") {
		t.Error("prompt should contain the score")
	}
	if !strings.Contains(prompt, "500") {
		t.Error("prompt should contain follower count from payload")
	}
	if !strings.Contains(prompt, "action_plan") {
		t.Error("prompt should mention action_plan field")
	}
}

func TestBuildSystemPrompt(t *testing.T) {
	prompt := buildSystemPrompt()
	if !strings.Contains(prompt, "JSON") {
		t.Error("system prompt should mention JSON")
	}
	if !strings.Contains(prompt, "overall_score") {
		t.Error("system prompt should mention overall_score (to exclude it)")
	}
	if !strings.Contains(prompt, "Indian") {
		t.Error("system prompt should mention Indian micro-influencers")
	}
}
