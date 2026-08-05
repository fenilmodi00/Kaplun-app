package insights_test

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"kaplun/api-go/internal/platform/meta"
	"kaplun/api-go/internal/services/insights"
)

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type fakeGraphClient struct {
	profile          *insights.CreatorProfile
	profileErr       error
	profileErrs      map[string]error // keyed by access token; takes precedence over profileErr
	media            []insights.MediaItem
	mediaErr         error
	mediaInsights    map[string]*insights.MediaInsights
	mediaInsightErrs map[string]error // keyed by media id

	// mediaUnsupportedMetrics maps mediaID → metrics that Meta rejects for
	// that media. GetMediaInsights returns a MetaPermissionError listing
	// those metrics unless every one of them appears in excludeMetrics.
	mediaUnsupportedMetrics map[string][]string

	// mediaUnsupportedStages maps mediaID → ordered batches of metrics Meta
	// reveals one error at a time (real Graph behavior: first "reposts", then
	// "follows, profile_visits"). Each GetMediaInsights call surfaces the
	// first stage that still has any non-excluded metric.
	mediaUnsupportedStages map[string][][]string

	daySeries    []insights.InsightDay
	dayErr       error
	totals       map[string]int64
	totalsErr    error
	demographics map[string][]insights.DemographicBreakdown
	demoErrs     map[string]error // keyed by metric

	calls []string
}

var _ insights.GraphClient = (*fakeGraphClient)(nil)

func (f *fakeGraphClient) GetUserProfile(_ context.Context, accessToken string) (*insights.CreatorProfile, error) {
	f.calls = append(f.calls, "GetUserProfile")
	if err, ok := f.profileErrs[accessToken]; ok {
		return nil, err
	}
	if f.profileErr != nil {
		return nil, f.profileErr
	}
	return f.profile, nil
}

func (f *fakeGraphClient) GetUserMedia(_ context.Context, _ string, _ int) ([]insights.MediaItem, error) {
	f.calls = append(f.calls, "GetUserMedia")
	if f.mediaErr != nil {
		return nil, f.mediaErr
	}
	return f.media, nil
}

func (f *fakeGraphClient) GetMediaInsights(_ context.Context, mediaID, _ string, _ bool, excludeMetrics ...string) (*insights.MediaInsights, error) {
	f.calls = append(f.calls, "GetMediaInsights:"+mediaID)

	// Staged revelation: Meta names one unsupported batch per response.
	if stages, ok := f.mediaUnsupportedStages[mediaID]; ok {
		for _, stage := range stages {
			remaining := metricsNotExcluded(stage, excludeMetrics)
			if len(remaining) > 0 {
				msg := fmt.Sprintf("does not support the %s metric for this media product type.", strings.Join(remaining, ", "))
				return nil, &meta.MetaAPIError{Code: 100, Message: msg}
			}
		}
		if ins, ok := f.mediaInsights[mediaID]; ok {
			return ins, nil
		}
		return nil, nil
	}

	// If this media has known unsupported metrics, return a Meta error
	// unless every one of them is in the exclude list.
	if unsupported, ok := f.mediaUnsupportedMetrics[mediaID]; ok {
		if !metricsAllExcluded(unsupported, excludeMetrics) {
			msg := fmt.Sprintf("does not support the %s metric for this media product type.", strings.Join(unsupported, ", "))
			return nil, &meta.MetaAPIError{Code: 100, Message: msg}
		}
		// All unsupported metrics excluded — return the insights.
		if ins, ok := f.mediaInsights[mediaID]; ok {
			return ins, nil
		}
		return nil, nil
	}

	// Legacy: non-metric errors (e.g. facebook_views rejection).
	if err, ok := f.mediaInsightErrs[mediaID]; ok {
		return nil, err
	}
	return f.mediaInsights[mediaID], nil
}

// metricsNotExcluded returns the subset of metrics that are not in excludeMetrics.
func metricsNotExcluded(metrics, excludeMetrics []string) []string {
	out := make([]string, 0, len(metrics))
	for _, m := range metrics {
		found := false
		for _, e := range excludeMetrics {
			if e == m {
				found = true
				break
			}
		}
		if !found {
			out = append(out, m)
		}
	}
	return out
}

// metricsAllExcluded reports whether every metric in unsupported appears in
// the excludeMetrics slice.
func metricsAllExcluded(unsupported, excludeMetrics []string) bool {
	for _, u := range unsupported {
		found := false
		for _, e := range excludeMetrics {
			if e == u {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func (f *fakeGraphClient) GetAccountInsightsDay(_ context.Context, _, _, _ string) ([]insights.InsightDay, error) {
	f.calls = append(f.calls, "GetAccountInsightsDay")
	if f.dayErr != nil {
		return nil, f.dayErr
	}
	return f.daySeries, nil
}

func (f *fakeGraphClient) GetAccountInsightsTotals(_ context.Context, _, _, _ string) (map[string]int64, error) {
	f.calls = append(f.calls, "GetAccountInsightsTotals")
	if f.totalsErr != nil {
		return nil, f.totalsErr
	}
	return f.totals, nil
}

func (f *fakeGraphClient) GetDemographics(_ context.Context, _, metric, _ string) ([]insights.DemographicBreakdown, error) {
	f.calls = append(f.calls, "GetDemographics:"+metric)
	if err, ok := f.demoErrs[metric]; ok {
		return nil, err
	}
	return f.demographics[metric], nil
}

type syncStateCall struct {
	creatorRowID string
	status       string
	syncTime     string
	derived      map[string]any
}

type fakeStore struct {
	creators []insights.CreatorRow
	listErr  error

	mediaItems     []insights.MediaItemWithInsights
	upsertMediaErr error
	prunedKeep     []string
	pruneErr       error
	insightDays    []insights.InsightDay
	upsertDaysErr  error
	demographics   []insights.DemographicBreakdown
	upsertDemoErr  error
	profiles       map[string]*insights.CreatorProfile
	profileErr     error
	syncStates     []syncStateCall
	syncStateErr   error

	calls []string
}

var _ insights.Store = (*fakeStore)(nil)

func (f *fakeStore) ListCreatorsWithToken(_ context.Context) ([]insights.CreatorRow, error) {
	f.calls = append(f.calls, "ListCreatorsWithToken")
	return f.creators, f.listErr
}

func (f *fakeStore) UpsertCreatorMedia(_ context.Context, _ string, items []insights.MediaItemWithInsights) error {
	f.calls = append(f.calls, "UpsertCreatorMedia")
	if f.upsertMediaErr != nil {
		return f.upsertMediaErr
	}
	f.mediaItems = append(f.mediaItems, items...)
	return nil
}

func (f *fakeStore) PruneCreatorMedia(_ context.Context, _ string, keepIDs []string) error {
	f.calls = append(f.calls, "PruneCreatorMedia")
	if f.pruneErr != nil {
		return f.pruneErr
	}
	f.prunedKeep = append([]string(nil), keepIDs...)
	return nil
}

func (f *fakeStore) UpsertInsightDays(_ context.Context, _ string, days []insights.InsightDay) error {
	f.calls = append(f.calls, "UpsertInsightDays")
	if f.upsertDaysErr != nil {
		return f.upsertDaysErr
	}
	f.insightDays = append(f.insightDays, days...)
	return nil
}

func (f *fakeStore) UpsertDemographics(_ context.Context, _ string, demos []insights.DemographicBreakdown) error {
	f.calls = append(f.calls, "UpsertDemographics")
	if f.upsertDemoErr != nil {
		return f.upsertDemoErr
	}
	f.demographics = append(f.demographics, demos...)
	return nil
}

func (f *fakeStore) UpdateCreatorProfile(_ context.Context, creatorRowID string, profile *insights.CreatorProfile) error {
	f.calls = append(f.calls, "UpdateCreatorProfile")
	if f.profileErr != nil {
		return f.profileErr
	}
	if f.profiles == nil {
		f.profiles = map[string]*insights.CreatorProfile{}
	}
	f.profiles[creatorRowID] = profile
	return nil
}

func (f *fakeStore) UpdateCreatorSyncState(_ context.Context, creatorRowID string, status string, syncTime string, derived map[string]any) error {
	f.calls = append(f.calls, "UpdateCreatorSyncState")
	if f.syncStateErr != nil {
		return f.syncStateErr
	}
	f.syncStates = append(f.syncStates, syncStateCall{
		creatorRowID: creatorRowID,
		status:       status,
		syncTime:     syncTime,
		derived:      derived,
	})
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func tokenExpiredErr() error {
	return &meta.TokenExpiredError{MetaAPIError: &meta.MetaAPIError{Code: 190, Message: "token expired"}}
}

func countCalls(calls []string, prefix string) int {
	n := 0
	for _, c := range calls {
		if strings.HasPrefix(c, prefix) {
			n++
		}
	}
	return n
}

func lastSyncState(t *testing.T, store *fakeStore, creatorRowID string) syncStateCall {
	t.Helper()
	for i := len(store.syncStates) - 1; i >= 0; i-- {
		if store.syncStates[i].creatorRowID == creatorRowID {
			return store.syncStates[i]
		}
	}
	t.Fatalf("no sync state recorded for creator %q", creatorRowID)
	return syncStateCall{}
}

func wantDerivedFloat(t *testing.T, derived map[string]any, key string, want float64) {
	t.Helper()
	got, ok := derived[key].(float64)
	if !ok {
		t.Fatalf("derived[%q] missing or not float64 (got %T)", key, derived[key])
	}
	if got != want {
		t.Errorf("derived[%q] = %v, want %v", key, got, want)
	}
}

// insightDaysFor builds day-series rows at the given day offsets from UTC
// today (0 = today, -1 = yesterday, ...).
func insightDaysFor(offsets ...int) []insights.InsightDay {
	now := time.Now().UTC()
	days := make([]insights.InsightDay, 0, len(offsets))
	for _, off := range offsets {
		reach := int64(500)
		days = append(days, insights.InsightDay{
			Date:  now.AddDate(0, 0, off).Format("2006-01-02"),
			Reach: &reach,
		})
	}
	return days
}

// happyFixture returns a 200-follower creator with one REELS and one FEED
// media item, both with insights, a 4-entry day series (today + 3 complete
// days), window totals, and one breakdown per demographics metric.
func happyFixture() (*fakeGraphClient, *fakeStore) {
	ts := func(daysAgo int) string {
		return time.Now().UTC().AddDate(0, 0, -daysAgo).Format(time.RFC3339)
	}
	client := &fakeGraphClient{
		profile: &insights.CreatorProfile{
			ID:             "ig-1",
			Username:       "creator",
			Name:           "Creator One",
			FollowersCount: 200,
			MediaCount:     2,
		},
		media: []insights.MediaItem{
			{ID: "m-reel", MediaType: "VIDEO", MediaProductType: "REELS", Timestamp: ts(2), LikeCount: 10, CommentsCount: 2},
			{ID: "m-feed", MediaType: "IMAGE", MediaProductType: "FEED", Timestamp: ts(5), LikeCount: 20, CommentsCount: 4},
		},
		mediaInsights: map[string]*insights.MediaInsights{
			"m-reel": {Views: 1000, Reach: 900, Shares: 5},
			"m-feed": {Views: 300, Reach: 250, Saved: 7},
		},
		daySeries: insightDaysFor(0, -1, -2, -3),
		totals:    map[string]int64{"reach": 5000, "total_interactions": 250},
		demographics: map[string][]insights.DemographicBreakdown{
			"follower_demographics": {
				{Metric: "follower_demographics", Breakdown: "age", DimensionValue: "25-34", Value: 120, Timeframe: insights.DemographicsTimeframe},
			},
			"engaged_audience_demographics": {
				{Metric: "engaged_audience_demographics", Breakdown: "gender", DimensionValue: "F", Value: 80, Timeframe: insights.DemographicsTimeframe},
			},
			"reached_audience_demographics": {
				{Metric: "reached_audience_demographics", Breakdown: "country", DimensionValue: "US", Value: 300, Timeframe: insights.DemographicsTimeframe},
			},
		},
	}
	return client, &fakeStore{}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestSyncCreator_HappyPath(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	client, store := happyFixture()
	svc := insights.NewService(client, store, nil)

	res := svc.SyncCreator(ctx, "creator-1", "token-1", "ig-1")

	if res == nil {
		t.Fatal("expected non-nil result")
	}
	if res.Error != "" {
		t.Fatalf("expected no error, got %q", res.Error)
	}
	if res.MediaUpserted != 2 {
		t.Errorf("MediaUpserted = %d, want 2", res.MediaUpserted)
	}
	// Day series holds today + 3 complete days; only the 3 complete days upsert.
	if res.InsightDaysUpserted != insights.InsightDayUpsertWindow {
		t.Errorf("InsightDaysUpserted = %d, want %d", res.InsightDaysUpserted, insights.InsightDayUpsertWindow)
	}
	if res.DemographicsUpserted != 3 {
		t.Errorf("DemographicsUpserted = %d, want 3", res.DemographicsUpserted)
	}

	profile := store.profiles["creator-1"]
	if profile == nil {
		t.Fatal("profile not persisted")
	}
	if profile.FollowersCount != 200 || profile.Username != "creator" {
		t.Errorf("persisted profile mismatch: %+v", profile)
	}

	if countCalls(client.calls, "GetDemographics") != 3 {
		t.Errorf("GetDemographics calls = %d, want 3", countCalls(client.calls, "GetDemographics"))
	}
	if got := len(store.insightDays); got != 3 {
		t.Errorf("upserted insight days = %d, want 3", got)
	}
	if got := len(store.demographics); got != 3 {
		t.Errorf("upserted demographics = %d, want 3", got)
	}
	if !slices.Equal(store.prunedKeep, []string{"m-reel", "m-feed"}) {
		t.Errorf("prunedKeep = %v, want [m-reel m-feed]", store.prunedKeep)
	}

	st := lastSyncState(t, store, "creator-1")
	if st.status != insights.SyncStatusOK {
		t.Errorf("sync status = %q, want %q", st.status, insights.SyncStatusOK)
	}
	if st.syncTime == "" {
		t.Error("sync time empty on success")
	}
	if st.derived == nil {
		t.Fatal("derived map missing on success")
	}
	if got := st.derived["avg_reel_views"]; got != int64(1000) {
		t.Errorf("derived[avg_reel_views] = %v (%T), want int64(1000)", got, got)
	}
	if got := st.derived["median_reel_views"]; got != int64(1000) {
		t.Errorf("derived[median_reel_views] = %v (%T), want int64(1000)", got, got)
	}
	if got := st.derived["avg_likes"]; got != int64(15) {
		t.Errorf("derived[avg_likes] = %v (%T), want int64(15)", got, got)
	}
	if got := st.derived["avg_comments"]; got != int64(3) {
		t.Errorf("derived[avg_comments] = %v (%T), want int64(3)", got, got)
	}
	wantDerivedFloat(t, st.derived, "engagement_rate", 0.05) // 250 / 5000
	if got := st.derived["max_reel_views"]; got != int64(1000) {
		t.Errorf("derived[max_reel_views] = %v, want 1000", got)
	}
	if got := st.derived["reels_count_30_days"]; got != 1 {
		t.Errorf("derived[reels_count_30_days] = %v, want 1", got)
	}
	if got := st.derived["reels_count_7_days"]; got != 1 {
		t.Errorf("derived[reels_count_7_days] = %v, want 1", got)
	}
}

func TestSyncCreator_Below100FollowersSkipsDemographics(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := time.Now().UTC().AddDate(0, 0, -1).Format(time.RFC3339)
	client := &fakeGraphClient{
		profile: &insights.CreatorProfile{ID: "ig-1", Username: "small", FollowersCount: 50},
		media: []insights.MediaItem{
			{ID: "m-1", MediaType: "IMAGE", MediaProductType: "FEED", Timestamp: ts, LikeCount: 3},
		},
		mediaInsights: map[string]*insights.MediaInsights{
			"m-1": {Views: 100, Reach: 90},
		},
		daySeries: insightDaysFor(-1),
		totals:    map[string]int64{"reach": 100, "total_interactions": 10},
		demographics: map[string][]insights.DemographicBreakdown{
			// Would return data if called — the point is it must not be called.
			"follower_demographics": {
				{Metric: "follower_demographics", Breakdown: "age", DimensionValue: "25-34", Value: 10},
			},
		},
	}
	store := &fakeStore{}
	svc := insights.NewService(client, store, nil)

	res := svc.SyncCreator(ctx, "creator-1", "token-1", "ig-1")

	if res.Error != "" {
		t.Fatalf("expected no error, got %q", res.Error)
	}
	if res.MediaUpserted != 1 {
		t.Errorf("MediaUpserted = %d, want 1", res.MediaUpserted)
	}
	if res.DemographicsUpserted != 0 {
		t.Errorf("DemographicsUpserted = %d, want 0", res.DemographicsUpserted)
	}
	if got := countCalls(client.calls, "GetDemographics"); got != 0 {
		t.Errorf("GetDemographics called %d times below 100 followers, want 0", got)
	}
	if got := countCalls(store.calls, "UpsertDemographics"); got != 0 {
		t.Errorf("UpsertDemographics called %d times below 100 followers, want 0", got)
	}

	st := lastSyncState(t, store, "creator-1")
	if st.status != insights.SyncStatusOK {
		t.Errorf("sync status = %q, want %q", st.status, insights.SyncStatusOK)
	}
}

func TestSyncCreator_TokenError(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	client := &fakeGraphClient{profileErr: tokenExpiredErr()}
	store := &fakeStore{}
	svc := insights.NewService(client, store, nil)

	res := svc.SyncCreator(ctx, "creator-1", "bad-token", "ig-1")

	if res.Error != insights.ErrTokenExpired.Error() {
		t.Errorf("res.Error = %q, want %q", res.Error, insights.ErrTokenExpired.Error())
	}
	st := lastSyncState(t, store, "creator-1")
	if st.status != insights.SyncStatusTokenError {
		t.Errorf("sync status = %q, want %q", st.status, insights.SyncStatusTokenError)
	}
	if got := countCalls(store.calls, "UpdateCreatorProfile"); got != 0 {
		t.Errorf("UpdateCreatorProfile called %d times on token error, want 0", got)
	}
	if got := countCalls(store.calls, "UpsertCreatorMedia"); got != 0 {
		t.Errorf("UpsertCreatorMedia called %d times on token error, want 0", got)
	}
}

func TestSyncCreator_MediaInsightDegradation(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := time.Now().UTC().AddDate(0, 0, -1).Format(time.RFC3339)
	client := &fakeGraphClient{
		profile: &insights.CreatorProfile{ID: "ig-1", FollowersCount: 200},
		media: []insights.MediaItem{
			{ID: "m-reel", MediaType: "VIDEO", MediaProductType: "REELS", Timestamp: ts, LikeCount: 10},
			{ID: "m-feed", MediaType: "IMAGE", MediaProductType: "FEED", Timestamp: ts, LikeCount: 5},
		},
		mediaInsights: map[string]*insights.MediaInsights{
			"m-feed": {Views: 300, Reach: 250},
		},
		mediaInsightErrs: map[string]error{
			// Non-190 Meta rejection (e.g. a metric the account can't use):
			// the service must tolerate it and upsert the media without insights.
			"m-reel": &meta.MetaAPIError{Code: 100, Message: "Invalid parameter: facebook_views"},
		},
		daySeries: insightDaysFor(-1),
		totals:    map[string]int64{"reach": 1000, "total_interactions": 100},
	}
	store := &fakeStore{}
	svc := insights.NewService(client, store, nil)

	res := svc.SyncCreator(ctx, "creator-1", "token-1", "ig-1")

	if res.Error != "" {
		t.Fatalf("expected degraded sync to succeed, got %q", res.Error)
	}
	if res.MediaUpserted != 2 {
		t.Errorf("MediaUpserted = %d, want 2 (failed insights still upsert the media row)", res.MediaUpserted)
	}

	var reel, feed *insights.MediaItemWithInsights
	for i := range store.mediaItems {
		switch store.mediaItems[i].Media.ID {
		case "m-reel":
			reel = &store.mediaItems[i]
		case "m-feed":
			feed = &store.mediaItems[i]
		}
	}
	if reel == nil || feed == nil {
		t.Fatal("both media items must be upserted")
	}
	if reel.Insights != nil {
		t.Error("reel insights should be nil after non-190 fetch failure")
	}
	if feed.Insights == nil {
		t.Error("feed insights should be present")
	}

	st := lastSyncState(t, store, "creator-1")
	if st.status != insights.SyncStatusOK {
		t.Errorf("sync status = %q, want %q", st.status, insights.SyncStatusOK)
	}
	// Nil-insights reels are excluded from view stats but still counted.
	if got := st.derived["avg_reel_views"]; got != int64(0) {
		t.Errorf("derived[avg_reel_views] = %v (%T), want int64(0)", got, got)
	}
	if got := st.derived["reels_count_30_days"]; got != 1 {
		t.Errorf("derived[reels_count_30_days] = %v, want 1", got)
	}
}

func TestSyncAll_IsolatesFailures(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := time.Now().UTC().AddDate(0, 0, -1).Format(time.RFC3339)
	client := &fakeGraphClient{
		profileErrs: map[string]error{"bad-token": tokenExpiredErr()},
		profile:     &insights.CreatorProfile{ID: "ig-2", FollowersCount: 500},
		media: []insights.MediaItem{
			{ID: "m-1", MediaType: "IMAGE", MediaProductType: "FEED", Timestamp: ts, LikeCount: 1},
		},
		mediaInsights: map[string]*insights.MediaInsights{"m-1": {Views: 10, Reach: 9}},
		daySeries:     insightDaysFor(-1),
		totals:        map[string]int64{"reach": 10, "total_interactions": 1},
	}
	store := &fakeStore{
		creators: []insights.CreatorRow{
			{ID: "c-bad", AccessToken: "bad-token", IGUserID: "ig-1"},
			{ID: "c-good", AccessToken: "good-token", IGUserID: "ig-2"},
			{ID: "c-notoken", AccessToken: "", IGUserID: "ig-3"},
		},
	}
	svc := insights.NewService(client, store, nil)

	results := svc.SyncAll(ctx, 0)

	if len(results) != 2 {
		t.Fatalf("SyncAll returned %d results, want 2 (tokenless creator skipped)", len(results))
	}
	if results[0].CreatorRowID != "c-bad" {
		t.Errorf("results[0].CreatorRowID = %q, want c-bad", results[0].CreatorRowID)
	}
	if results[0].Error != insights.ErrTokenExpired.Error() {
		t.Errorf("results[0].Error = %q, want %q", results[0].Error, insights.ErrTokenExpired.Error())
	}
	if results[1].CreatorRowID != "c-good" {
		t.Errorf("results[1].CreatorRowID = %q, want c-good", results[1].CreatorRowID)
	}
	if results[1].Error != "" {
		t.Errorf("results[1].Error = %q, want empty — failure isolation broken", results[1].Error)
	}

	bad := lastSyncState(t, store, "c-bad")
	if bad.status != insights.SyncStatusTokenError {
		t.Errorf("c-bad status = %q, want %q", bad.status, insights.SyncStatusTokenError)
	}
	good := lastSyncState(t, store, "c-good")
	if good.status != insights.SyncStatusOK {
		t.Errorf("c-good status = %q, want %q", good.status, insights.SyncStatusOK)
	}
}

func TestSyncCreator_PassesAllMediaIDsToPrune(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := time.Now().UTC().AddDate(0, 0, -1).Format(time.RFC3339)
	media := make([]insights.MediaItem, 0, 12)
	wantIDs := make([]string, 0, 12)
	for i := 0; i < 12; i++ {
		id := fmt.Sprintf("m-%02d", i)
		wantIDs = append(wantIDs, id)
		media = append(media, insights.MediaItem{
			ID:               id,
			MediaType:        "IMAGE",
			MediaProductType: "FEED",
			Timestamp:        ts,
			LikeCount:        int64(i),
		})
	}
	client := &fakeGraphClient{
		profile:       &insights.CreatorProfile{ID: "ig-1", FollowersCount: 50},
		media:         media,
		mediaInsights: map[string]*insights.MediaInsights{},
		daySeries:     insightDaysFor(-1),
		totals:        map[string]int64{"reach": 1, "total_interactions": 1},
	}
	store := &fakeStore{}
	svc := insights.NewService(client, store, nil)

	res := svc.SyncCreator(ctx, "creator-1", "token-1", "ig-1")

	if res.Error != "" {
		t.Fatalf("expected no error, got %q", res.Error)
	}
	if res.MediaUpserted != 12 {
		t.Errorf("MediaUpserted = %d, want 12", res.MediaUpserted)
	}
	// The service hands every returned media id to the store; the store owns
	// enforcing the newest-N retention window.
	if !slices.Equal(store.prunedKeep, wantIDs) {
		t.Errorf("prunedKeep = %v, want %v", store.prunedKeep, wantIDs)
	}
}

func TestSyncCreator_UpsertIdempotentAcrossRuns(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	client, store := happyFixture()
	svc := insights.NewService(client, store, nil)

	res1 := svc.SyncCreator(ctx, "creator-1", "token-1", "ig-1")
	res2 := svc.SyncCreator(ctx, "creator-1", "token-1", "ig-1")

	for i, res := range []*insights.SyncResult{res1, res2} {
		if res.Error != "" {
			t.Fatalf("run %d: expected no error, got %q", i+1, res.Error)
		}
	}
	if res1.MediaUpserted != res2.MediaUpserted ||
		res1.InsightDaysUpserted != res2.InsightDaysUpserted ||
		res1.DemographicsUpserted != res2.DemographicsUpserted {
		t.Errorf("run counts differ: %+v vs %+v", res1, res2)
	}

	// Two runs × (optimistic reset + final state) = 4 sync-state writes.
	if got := countCalls(store.calls, "UpdateCreatorSyncState"); got != 4 {
		t.Errorf("UpdateCreatorSyncState calls = %d, want 4", got)
	}
	if got := countCalls(store.calls, "UpsertCreatorMedia"); got != 2 {
		t.Errorf("UpsertCreatorMedia calls = %d, want 2", got)
	}
	// Same logical rows re-upserted (the real store keys them by
	// creator+media id, so the second run overwrites rather than duplicates).
	if got := len(store.mediaItems); got != 4 {
		t.Errorf("store received %d media upserts across 2 runs, want 4", got)
	}
	for i, st := range store.syncStates {
		if st.status != insights.SyncStatusOK {
			t.Errorf("syncStates[%d].status = %q, want %q", i, st.status, insights.SyncStatusOK)
		}
	}
	first := store.syncStates[1].syncTime
	second := store.syncStates[3].syncTime
	if first == "" || second == "" {
		t.Error("final sync times must be non-empty on both runs")
	}
}

func TestSyncCreator_StoreFailureMarksError(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	client, store := happyFixture()
	store.upsertMediaErr = errors.New("appwrite unavailable")
	svc := insights.NewService(client, store, nil)

	res := svc.SyncCreator(ctx, "creator-1", "token-1", "ig-1")

	if res.Error == "" {
		t.Fatal("expected error on store failure")
	}
	if strings.Contains(res.Error, insights.ErrTokenExpired.Error()) {
		t.Errorf("non-190 failure must not surface the token sentinel, got %q", res.Error)
	}
	st := lastSyncState(t, store, "creator-1")
	if st.status != insights.SyncStatusError {
		t.Errorf("sync status = %q, want %q", st.status, insights.SyncStatusError)
	}
}

// TestSyncCreator_DropsRepostsOnFirstMediaThenExcludesForRest covers the
// reposts-drop path: the first media fails with a reposts-related error, the
// service retries it without reposts, and all subsequent media also exclude
// reposts.
func TestSyncCreator_DropsRepostsOnFirstMediaThenExcludesForRest(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := time.Now().UTC().AddDate(0, 0, -1).Format(time.RFC3339)
	client := &fakeGraphClient{
		profile: &insights.CreatorProfile{ID: "ig-1", FollowersCount: 200},
		media: []insights.MediaItem{
			{ID: "m-1", MediaType: "IMAGE", MediaProductType: "FEED", Timestamp: ts, LikeCount: 10},
			{ID: "m-2", MediaType: "IMAGE", MediaProductType: "FEED", Timestamp: ts, LikeCount: 5},
		},
		mediaInsights: map[string]*insights.MediaInsights{
			"m-1": {Views: 100, Reach: 90, Saved: 5, Shares: 2, TotalInteractions: 15, Follows: 1, ProfileVisits: 8},
			"m-2": {Views: 200, Reach: 180, Saved: 10, Shares: 4, TotalInteractions: 30, Follows: 2, ProfileVisits: 16},
		},
		mediaUnsupportedMetrics: map[string][]string{
			// First media rejects "reposts".
			"m-1": {"reposts"},
		},
		daySeries: insightDaysFor(-1),
		totals:    map[string]int64{"reach": 1000, "total_interactions": 100},
	}
	store := &fakeStore{}
	svc := insights.NewService(client, store, nil)

	res := svc.SyncCreator(ctx, "creator-1", "token-1", "ig-1")

	if res.Error != "" {
		t.Fatalf("expected sync to succeed after dropping reposts, got %q", res.Error)
	}
	if res.MediaUpserted != 2 {
		t.Errorf("MediaUpserted = %d, want 2", res.MediaUpserted)
	}

	// Both media should have insights (m-1 retried without reposts, m-2
	// excluded reposts from the start).
	var m1, m2 *insights.MediaItemWithInsights
	for i := range store.mediaItems {
		switch store.mediaItems[i].Media.ID {
		case "m-1":
			m1 = &store.mediaItems[i]
		case "m-2":
			m2 = &store.mediaItems[i]
		}
	}
	if m1 == nil || m2 == nil {
		t.Fatal("both media items must be upserted")
	}
	if m1.Insights == nil {
		t.Error("m-1 insights should be present after reposts-drop retry")
	}
	if m2.Insights == nil {
		t.Error("m-2 insights should be present")
	}
	if m1.Insights.Views != 100 {
		t.Errorf("m-1 Views = %d, want 100", m1.Insights.Views)
	}
	if m2.Insights.Views != 200 {
		t.Errorf("m-2 Views = %d, want 200", m2.Insights.Views)
	}

	st := lastSyncState(t, store, "creator-1")
	if st.status != insights.SyncStatusOK {
		t.Errorf("sync status = %q, want %q", st.status, insights.SyncStatusOK)
	}
}

// TestSyncCreator_DropsMultipleUnsupportedMetrics covers the generalised
// exclusion path: the first media fails because "follows" and "profile_visits"
// are unsupported, the service retries without them, and subsequent media also
// exclude them.
func TestSyncCreator_DropsMultipleUnsupportedMetrics(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := time.Now().UTC().AddDate(0, 0, -1).Format(time.RFC3339)
	client := &fakeGraphClient{
		profile: &insights.CreatorProfile{ID: "ig-1", FollowersCount: 200},
		media: []insights.MediaItem{
			{ID: "m-1", MediaType: "IMAGE", MediaProductType: "FEED", Timestamp: ts, LikeCount: 10},
			{ID: "m-2", MediaType: "IMAGE", MediaProductType: "FEED", Timestamp: ts, LikeCount: 5},
			{ID: "m-3", MediaType: "VIDEO", MediaProductType: "REELS", Timestamp: ts, LikeCount: 3},
		},
		mediaInsights: map[string]*insights.MediaInsights{
			"m-1": {Views: 100, Reach: 90, Saved: 5, Shares: 2, TotalInteractions: 15, Follows: 1, ProfileVisits: 8},
			"m-2": {Views: 200, Reach: 180, Saved: 10, Shares: 4, TotalInteractions: 30, Follows: 2, ProfileVisits: 16},
			"m-3": {Views: 500, Reach: 400, Saved: 20, Shares: 8, TotalInteractions: 50, Follows: 3, ProfileVisits: 24},
		},
		mediaUnsupportedMetrics: map[string][]string{
			// First media rejects both follows and profile_visits.
			"m-1": {"follows", "profile_visits"},
		},
		daySeries: insightDaysFor(-1),
		totals:    map[string]int64{"reach": 1000, "total_interactions": 100},
	}
	store := &fakeStore{}
	svc := insights.NewService(client, store, nil)

	res := svc.SyncCreator(ctx, "creator-1", "token-1", "ig-1")

	if res.Error != "" {
		t.Fatalf("expected sync to succeed after dropping unsupported metrics, got %q", res.Error)
	}
	if res.MediaUpserted != 3 {
		t.Errorf("MediaUpserted = %d, want 3", res.MediaUpserted)
	}

	// All three media should have insights (m-1 retried without follows +
	// profile_visits, m-2 and m-3 excluded them from the start).
	var m1, m2, m3 *insights.MediaItemWithInsights
	for i := range store.mediaItems {
		switch store.mediaItems[i].Media.ID {
		case "m-1":
			m1 = &store.mediaItems[i]
		case "m-2":
			m2 = &store.mediaItems[i]
		case "m-3":
			m3 = &store.mediaItems[i]
		}
	}
	if m1 == nil || m2 == nil || m3 == nil {
		t.Fatal("all three media items must be upserted")
	}
	if m1.Insights == nil {
		t.Error("m-1 insights should be present after follows/profile_visits retry")
	}
	if m2.Insights == nil {
		t.Error("m-2 insights should be present")
	}
	if m3.Insights == nil {
		t.Error("m-3 insights should be present")
	}
	if m1.Insights.Views != 100 {
		t.Errorf("m-1 Views = %d, want 100", m1.Insights.Views)
	}
	if m2.Insights.Views != 200 {
		t.Errorf("m-2 Views = %d, want 200", m2.Insights.Views)
	}
	if m3.Insights.Views != 500 {
		t.Errorf("m-3 Views = %d, want 500", m3.Insights.Views)
	}

	// Verify the excluded metrics were actually passed: the fake client
	// records GetMediaInsights calls; m-1 should have been called twice
	// (first fail, then retry), m-2 and m-3 once each.
	if got := countCalls(client.calls, "GetMediaInsights:m-1"); got != 2 {
		t.Errorf("GetMediaInsights:m-1 calls = %d, want 2 (initial + retry)", got)
	}
	if got := countCalls(client.calls, "GetMediaInsights:m-2"); got != 1 {
		t.Errorf("GetMediaInsights:m-2 calls = %d, want 1", got)
	}
	if got := countCalls(client.calls, "GetMediaInsights:m-3"); got != 1 {
		t.Errorf("GetMediaInsights:m-3 calls = %d, want 1", got)
	}

	st := lastSyncState(t, store, "creator-1")
	if st.status != insights.SyncStatusOK {
		t.Errorf("sync status = %q, want %q", st.status, insights.SyncStatusOK)
	}
}

// TestSyncCreator_IterativeUnsupportedMetricStrip covers the production
// failure mode from QA logs: Meta first rejects "reposts", then on retry
// rejects "follows, profile_visits". A single retry leaves the media without
// insights; the service must keep stripping until the call succeeds.
func TestSyncCreator_IterativeUnsupportedMetricStrip(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := time.Now().UTC().AddDate(0, 0, -1).Format(time.RFC3339)
	client := &fakeGraphClient{
		profile: &insights.CreatorProfile{ID: "ig-1", FollowersCount: 200},
		media: []insights.MediaItem{
			{ID: "m-1", MediaType: "IMAGE", MediaProductType: "FEED", Timestamp: ts, LikeCount: 10},
		},
		mediaInsights: map[string]*insights.MediaInsights{
			"m-1": {Views: 100, Reach: 90, Saved: 5, Shares: 2, TotalInteractions: 15},
		},
		mediaUnsupportedStages: map[string][][]string{
			"m-1": {
				{"reposts"},
				{"follows", "profile_visits"},
			},
		},
		daySeries: insightDaysFor(-1),
		totals:    map[string]int64{"reach": 1000, "total_interactions": 100},
	}
	store := &fakeStore{}
	svc := insights.NewService(client, store, nil)

	res := svc.SyncCreator(ctx, "creator-1", "token-1", "ig-1")

	if res.Error != "" {
		t.Fatalf("expected sync to succeed after iterative strip, got %q", res.Error)
	}
	if len(store.mediaItems) != 1 || store.mediaItems[0].Insights == nil {
		t.Fatal("m-1 must upsert with insights after multi-stage metric strip")
	}
	if store.mediaItems[0].Insights.Views != 100 {
		t.Errorf("Views = %d, want 100", store.mediaItems[0].Insights.Views)
	}
	if got := countCalls(client.calls, "GetMediaInsights:m-1"); got != 3 {
		t.Errorf("GetMediaInsights:m-1 calls = %d, want 3 (initial + 2 strips)", got)
	}
}
