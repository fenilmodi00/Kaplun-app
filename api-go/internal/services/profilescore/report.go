package profilescore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"kaplun/api-go/internal/services/insights"
)

// Report is the slim profile-score report returned to the client.
// OverallScore is Go-owned (deterministic); all other fields are LLM-owned
// coach copy (English only).
type Report struct {
	OverallScore   int          `json:"overall_score"`
	ScoreLabel     string       `json:"score_label"`
	OneLineSummary string       `json:"one_line_summary"`
	Strengths      []string     `json:"strengths"`
	Weaknesses     []string     `json:"weaknesses"`
	ActionPlan     []ActionItem `json:"action_plan"`
}

// ReportMeta is the metadata returned alongside a report.
type ReportMeta struct {
	Model     string `json:"model"`
	Tokens    int    `json:"tokens"`
	CreatedAt string `json:"created_at"`
	Cached    bool   `json:"cached"`
}

// ReportResult is the response shape for both generate and latest endpoints.
type ReportResult struct {
	Report Report     `json:"report"`
	Meta   ReportMeta `json:"meta"`
}

// CachedReport is a report read from the cache, with its created_at timestamp.
type CachedReport struct {
	Report    Report
	CreatedAt string
	Model     string
	Tokens    int
}

// ReportStore persists and reads cached profile reports.
type ReportStore interface {
	CacheReport(ctx context.Context, creatorRowID string, report Report, model string, tokens int) error
	GetLatestReport(ctx context.Context, creatorRowID string) (*CachedReport, error)
}

// CreatorLookup resolves an Appwrite auth user ID (clerk_user_id) to the
// creators-table row $id.
type CreatorLookup interface {
	GetCreatorRowID(ctx context.Context, clerkUserID string) (string, error)
}

// InsightsReader is the subset of insights.Store the report service needs
// (read-only). The concrete insights.Store satisfies this interface.
type InsightsReader interface {
	ListCreatorMedia(ctx context.Context, creatorRowID string) ([]insights.MediaItemWithInsights, error)
	ListInsightDays(ctx context.Context, creatorRowID string) ([]insights.InsightDay, error)
	ListOnlineFollowers(ctx context.Context, creatorRowID string) ([]insights.OnlineFollowers, error)
	GetCreatorDerived(ctx context.Context, creatorRowID string) (map[string]any, error)
}

// InsightsSyncer triggers a fresh insights sync for a creator before the
// report reads data. The concrete insights.Service satisfies this interface.
type InsightsSyncer interface {
	SyncCreator(ctx context.Context, creatorRowID, accessToken, igUserID string) *insights.SyncResult
}

// ErrInsightsSyncFailed is returned when the inline insights sync before
// report generation fails — the report is not generated from stale data.
var ErrInsightsSyncFailed = errors.New("insights sync failed")

// ReportCacheTTL is how long a cached report is served before a refresh
// is expected. Manual generate always regenerates (new LLM call).
const ReportCacheTTL = 7 * 24 * time.Hour

// ErrCreatorNotFound is returned when the Appwrite user has no creators row.
var ErrCreatorNotFound = errors.New("creator not found")

// ReportService orchestrates the generate + latest flows. It resolves the
// creator, reads insights, computes the deterministic score, calls the LLM
// for coach copy, and caches the merged report.
type ReportService struct {
	insights InsightsReader
	syncer   InsightsSyncer
	llm      LLMClient
	store    ReportStore
	lookup   CreatorLookup
	now      func() time.Time
	log      *slog.Logger
}

// ReportServiceDeps holds the dependencies for ReportService.
type ReportServiceDeps struct {
	Insights InsightsReader
	Syncer   InsightsSyncer
	LLM      LLMClient
	Store    ReportStore
	Lookup   CreatorLookup
	Log      *slog.Logger
}

// NewReportService constructs a ReportService.
func NewReportService(deps ReportServiceDeps) *ReportService {
	return &ReportService{
		insights: deps.Insights,
		syncer:   deps.Syncer,
		llm:      deps.LLM,
		store:    deps.Store,
		lookup:   deps.Lookup,
		now:      func() time.Time { return time.Now().UTC() },
		log:      deps.Log,
	}
}

// Generate builds a fresh report: resolve creator → sync insights → read
// insights → build payload → compute score → call LLM → merge → cache →
// return.
func (s *ReportService) Generate(ctx context.Context, clerkUserID string) (*ReportResult, error) {
	creatorRowID, err := s.lookup.GetCreatorRowID(ctx, clerkUserID)
	if err != nil {
		return nil, fmt.Errorf("resolve creator: %w", err)
	}
	if creatorRowID == "" {
		return nil, ErrCreatorNotFound
	}

	creator, err := s.insights.GetCreatorDerived(ctx, creatorRowID)
	if err != nil {
		return nil, fmt.Errorf("read creator derived: %w", err)
	}

	// Inline insights sync before reading data — the product brief requires
	// "ensure insights fresh (inline sync if needed)". Without this, a stale
	// or errored sync leaves derived stats at zero and the score is 0.
	if s.syncer != nil {
		accessToken, _ := creator["access_token"].(string)
		igUserID, _ := creator["ig_user_id"].(string)
		if accessToken != "" && igUserID != "" {
			syncRes := s.syncer.SyncCreator(ctx, creatorRowID, accessToken, igUserID)
			if syncRes != nil && syncRes.Error != "" {
				if s.log != nil {
					s.log.Warn("insights sync failed before report generate",
						"creator_row_id", creatorRowID, "sync_error", syncRes.Error)
				}
				return nil, fmt.Errorf("%w: %s", ErrInsightsSyncFailed, syncRes.Error)
			}
			// Re-read the creator row — sync just updated derived stats.
			creator, err = s.insights.GetCreatorDerived(ctx, creatorRowID)
			if err != nil {
				return nil, fmt.Errorf("re-read creator derived after sync: %w", err)
			}
		}
	}

	media, err := s.insights.ListCreatorMedia(ctx, creatorRowID)
	if err != nil {
		return nil, fmt.Errorf("read creator media: %w", err)
	}
	days, err := s.insights.ListInsightDays(ctx, creatorRowID)
	if err != nil {
		return nil, fmt.Errorf("read insight days: %w", err)
	}
	onlineFollowers, err := s.insights.ListOnlineFollowers(ctx, creatorRowID)
	if err != nil {
		return nil, fmt.Errorf("read online followers: %w", err)
	}

	payload := BuildPayload(creator, media, days, onlineFollowers)
	score := payload.OverallScore

	llmResp, err := s.llm.GenerateReport(ctx, *payload, score)
	llmOK := err == nil
	if err != nil {
		if s.log != nil {
			s.log.Warn("llm generate report failed, using fallback", "error", err, "creator_row_id", creatorRowID)
		}
		llmResp = fallbackReport("", 0)
	}

	report := mergeReport(score, llmResp)

	nowISO := s.now().Format(time.RFC3339Nano)
	if llmOK {
		if err := s.store.CacheReport(ctx, creatorRowID, report, llmResp.Model, llmResp.TokensUsed); err != nil {
			if s.log != nil {
				s.log.Warn("cache report failed", "error", err, "creator_row_id", creatorRowID)
			}
		}
	}

	return &ReportResult{
		Report: report,
		Meta: ReportMeta{
			Model:     llmResp.Model,
			Tokens:    llmResp.TokensUsed,
			CreatedAt: nowISO,
			Cached:    false,
		},
	}, nil
}

// GetLatest returns the cached report if it exists and is younger than
// ReportCacheTTL. Returns nil (404) when no report exists or the cache
// has expired.
func (s *ReportService) GetLatest(ctx context.Context, clerkUserID string) (*ReportResult, error) {
	creatorRowID, err := s.lookup.GetCreatorRowID(ctx, clerkUserID)
	if err != nil {
		return nil, fmt.Errorf("resolve creator: %w", err)
	}
	if creatorRowID == "" {
		return nil, ErrCreatorNotFound
	}

	cached, err := s.store.GetLatestReport(ctx, creatorRowID)
	if err != nil {
		return nil, fmt.Errorf("read latest report: %w", err)
	}
	if cached == nil {
		return nil, nil
	}

	// Check 7-day TTL.
	createdAt, err := parseTime(cached.CreatedAt)
	if err != nil {
		return nil, nil
	}
	if s.now().Sub(createdAt) > ReportCacheTTL {
		return nil, nil
	}

	return &ReportResult{
		Report: cached.Report,
		Meta: ReportMeta{
			Model:     cached.Model,
			Tokens:    cached.Tokens,
			CreatedAt: cached.CreatedAt,
			Cached:    true,
		},
	}, nil
}

// mergeReport combines the Go-owned score with the LLM-owned coach copy.
func mergeReport(score int, llm *LLMResponse) Report {
	report := Report{
		OverallScore:   score,
		ScoreLabel:     llm.ScoreLabel,
		OneLineSummary: llm.OneLineSummary,
		Strengths:      llm.Strengths,
		Weaknesses:     llm.Weaknesses,
		ActionPlan:     llm.ActionPlan,
	}
	if report.Strengths == nil {
		report.Strengths = []string{}
	}
	if report.Weaknesses == nil {
		report.Weaknesses = []string{}
	}
	if report.ActionPlan == nil {
		report.ActionPlan = []ActionItem{}
	}
	return report
}

// parseTime parses an RFC3339 timestamp; returns zero time on error.
func parseTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, fmt.Errorf("empty timestamp")
	}
	return time.Parse(time.RFC3339Nano, s)
}

// MarshalReport serializes a Report to JSON for storage in report_json column.
func MarshalReport(r Report) (string, error) {
	b, err := json.Marshal(r)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// UnmarshalReport deserializes a Report from the report_json column.
func UnmarshalReport(s string) (Report, error) {
	var r Report
	if err := json.Unmarshal([]byte(s), &r); err != nil {
		return Report{}, err
	}
	if r.Strengths == nil {
		r.Strengths = []string{}
	}
	if r.Weaknesses == nil {
		r.Weaknesses = []string{}
	}
	if r.ActionPlan == nil {
		r.ActionPlan = []ActionItem{}
	}
	return r, nil
}
