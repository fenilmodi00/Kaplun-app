package insights_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kaplun/api-go/internal/platform/meta"
	"kaplun/api-go/internal/services/insights"
)

// TestGetMediaInsights_ReelsRetryDropsFragileMetrics covers the client-side
// degradation path: a reels insights call that includes facebook_views /
// crossposted_views can be rejected wholesale (one invalid metric fails the
// comma-separated list), so the client retries exactly once without them.
func TestGetMediaInsights_ReelsRetryDropsFragileMetrics(t *testing.T) {
	t.Parallel()
	var metricsSeen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metric := r.URL.Query().Get("metric")
		metricsSeen = append(metricsSeen, metric)
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(metric, "facebook_views") {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"error":{"code":100,"message":"Invalid parameter: facebook_views"}}`)
			return
		}
		_, _ = io.WriteString(w, `{"data":[
			{"name":"views","period":"lifetime","values":[{"value":321}]},
			{"name":"reach","period":"lifetime","values":[{"value":300}]},
			{"name":"ig_reels_avg_watch_time","period":"lifetime","values":[{"value":1500}]}
		]}`)
	}))
	defer srv.Close()

	mc := meta.NewClient(nil)
	mc.BaseURL = srv.URL
	client := insights.NewGraphClient(mc)

	got, err := client.GetMediaInsights(context.Background(), "m-1", "token", true)
	if err != nil {
		t.Fatalf("expected retry to recover, got error: %v", err)
	}
	if len(metricsSeen) != 2 {
		t.Fatalf("expected 2 calls (full metrics + reduced retry), got %d", len(metricsSeen))
	}
	if !strings.Contains(metricsSeen[0], "facebook_views") {
		t.Errorf("first call should request facebook_views, got metric=%q", metricsSeen[0])
	}
	if strings.Contains(metricsSeen[1], "facebook_views") || strings.Contains(metricsSeen[1], "crossposted_views") {
		t.Errorf("retry must drop facebook_views/crossposted_views, got metric=%q", metricsSeen[1])
	}
	if got.Views != 321 || got.Reach != 300 {
		t.Errorf("Views/Reach = %d/%d, want 321/300", got.Views, got.Reach)
	}
	if got.ReelsAvgWatchTimeMs != 1500 {
		t.Errorf("ReelsAvgWatchTimeMs = %d, want 1500", got.ReelsAvgWatchTimeMs)
	}
	if got.FacebookViews != nil {
		t.Errorf("FacebookViews = %v, want nil (metric dropped on retry)", *got.FacebookViews)
	}
	if got.CrosspostedViews != nil {
		t.Errorf("CrosspostedViews = %v, want nil (metric dropped on retry)", *got.CrosspostedViews)
	}
}

// TestGetMediaInsights_TokenExpiredDoesNotRetry ensures Meta 190 aborts
// immediately — retrying with reduced metrics would only burn quota.
func TestGetMediaInsights_TokenExpiredDoesNotRetry(t *testing.T) {
	t.Parallel()
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":{"code":190,"message":"Error validating access token"}}`)
	}))
	defer srv.Close()

	mc := meta.NewClient(nil)
	mc.BaseURL = srv.URL
	client := insights.NewGraphClient(mc)

	got, err := client.GetMediaInsights(context.Background(), "m-1", "token", true)
	if err == nil {
		t.Fatal("expected token-expired error")
	}
	if !meta.IsTokenExpired(err) {
		t.Errorf("meta.IsTokenExpired(err) = false, want true (err = %v)", err)
	}
	if got != nil {
		t.Errorf("expected nil insights on token error, got %+v", got)
	}
	if calls != 1 {
		t.Errorf("server calls = %d, want 1 (no retry on 190)", calls)
	}
}

// TestGetMediaInsights_NonReelNoRetry confirms the reduced-metrics retry only
// applies to reels — feed media gets a single call.
func TestGetMediaInsights_NonReelNoRetry(t *testing.T) {
	t.Parallel()
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":{"code":100,"message":"unsupported metric"}}`)
	}))
	defer srv.Close()

	mc := meta.NewClient(nil)
	mc.BaseURL = srv.URL
	client := insights.NewGraphClient(mc)

	_, err := client.GetMediaInsights(context.Background(), "m-1", "token", false)
	if err == nil {
		t.Fatal("expected error")
	}
	if meta.IsTokenExpired(err) {
		t.Errorf("non-190 error misclassified as token expired: %v", err)
	}
	if calls != 1 {
		t.Errorf("server calls = %d, want 1 (no retry for non-reels)", calls)
	}
}

// TestGetMediaInsights_DropsUnsupportedMetricViaExclude verifies that the
// excludeMetrics parameter drops a metric from the request and the call
// succeeds. "saved" stands in for an arbitrary unsupported metric.
func TestGetMediaInsights_DropsUnsupportedMetricViaExclude(t *testing.T) {
	t.Parallel()
	var metricsSeen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metric := r.URL.Query().Get("metric")
		metricsSeen = append(metricsSeen, metric)
		w.Header().Set("Content-Type", "application/json")
		// Reject any call that still includes saved.
		if strings.Contains(metric, "saved") {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"error":{"code":100,"message":"Instagram Insights Media API endpoint does not support the metrics: saved."}}`)
			return
		}
		_, _ = io.WriteString(w, `{"data":[
			{"name":"views","period":"lifetime","values":[{"value":100}]},
			{"name":"reach","period":"lifetime","values":[{"value":90}]},
			{"name":"shares","period":"lifetime","values":[{"value":2}]},
			{"name":"total_interactions","period":"lifetime","values":[{"value":15}]},
			{"name":"follows","period":"lifetime","values":[{"value":1}]},
			{"name":"profile_visits","period":"lifetime","values":[{"value":8}]}
		]}`)
	}))
	defer srv.Close()

	mc := meta.NewClient(nil)
	mc.BaseURL = srv.URL
	client := insights.NewGraphClient(mc)

	// First call without exclude — should fail because saved is included.
	_, err := client.GetMediaInsights(context.Background(), "m-1", "token", false)
	if err == nil {
		t.Fatal("expected error when saved is included")
	}
	if !strings.Contains(err.Error(), "saved") {
		t.Errorf("error should mention saved, got %v", err)
	}

	// Second call with saved excluded — should succeed.
	got, err := client.GetMediaInsights(context.Background(), "m-2", "token", false, "saved")
	if err != nil {
		t.Fatalf("expected success after excluding saved, got %v", err)
	}
	if got.Views != 100 || got.Reach != 90 {
		t.Errorf("Views/Reach = %d/%d, want 100/90", got.Views, got.Reach)
	}
	if got.Saved != 0 {
		t.Errorf("Saved = %d, want 0 (metric excluded)", got.Saved)
	}

	// Verify the second call's metrics string does not contain saved.
	if len(metricsSeen) < 2 {
		t.Fatalf("expected at least 2 calls, got %d", len(metricsSeen))
	}
	if strings.Contains(metricsSeen[1], "saved") {
		t.Errorf("second call should exclude saved, got metric=%q", metricsSeen[1])
	}
}

// TestGetMediaInsights_ReelsRetryPreservedWithExclude verifies that the
// existing reels facebook_views/crossposted_views retry still works when
// excludeMetrics is also provided.
func TestGetMediaInsights_ReelsRetryPreservedWithExclude(t *testing.T) {
	t.Parallel()
	var metricsSeen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metric := r.URL.Query().Get("metric")
		metricsSeen = append(metricsSeen, metric)
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(metric, "facebook_views") {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"error":{"code":100,"message":"Invalid parameter: facebook_views"}}`)
			return
		}
		_, _ = io.WriteString(w, `{"data":[
			{"name":"views","period":"lifetime","values":[{"value":500}]},
			{"name":"reach","period":"lifetime","values":[{"value":450}]},
			{"name":"ig_reels_avg_watch_time","period":"lifetime","values":[{"value":2000}]}
		]}`)
	}))
	defer srv.Close()

	mc := meta.NewClient(nil)
	mc.BaseURL = srv.URL
	client := insights.NewGraphClient(mc)

	// Reel with saved excluded — should first try without saved but with
	// facebook_views, then retry without facebook_views/crossposted_views.
	got, err := client.GetMediaInsights(context.Background(), "m-1", "token", true, "saved")
	if err != nil {
		t.Fatalf("expected retry to recover, got error: %v", err)
	}
	if len(metricsSeen) != 2 {
		t.Fatalf("expected 2 calls, got %d", len(metricsSeen))
	}
	// First call: base without saved + reels metrics (including facebook_views).
	if strings.Contains(metricsSeen[0], "saved") {
		t.Errorf("first call should exclude saved, got metric=%q", metricsSeen[0])
	}
	if !strings.Contains(metricsSeen[0], "facebook_views") {
		t.Errorf("first call should include facebook_views, got metric=%q", metricsSeen[0])
	}
	// Second call: base without saved + reels core only (no facebook/crossposted).
	if strings.Contains(metricsSeen[1], "facebook_views") || strings.Contains(metricsSeen[1], "crossposted_views") {
		t.Errorf("retry must drop facebook_views/crossposted_views, got metric=%q", metricsSeen[1])
	}
	if strings.Contains(metricsSeen[1], "saved") {
		t.Errorf("retry must also exclude saved, got metric=%q", metricsSeen[1])
	}
	if got.Views != 500 || got.Reach != 450 {
		t.Errorf("Views/Reach = %d/%d, want 500/450", got.Views, got.Reach)
	}
	if got.ReelsAvgWatchTimeMs != 2000 {
		t.Errorf("ReelsAvgWatchTimeMs = %d, want 2000", got.ReelsAvgWatchTimeMs)
	}
}

// TestGetMediaInsights_ReelsOmitFollowsAndProfileVisits locks Meta's product-type
// matrix: follows and profile_visits are FEED/STORY only — never request them
// for REELS (https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/).
func TestGetMediaInsights_ReelsOmitFollowsAndProfileVisits(t *testing.T) {
	t.Parallel()
	var metricsSeen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metric := r.URL.Query().Get("metric")
		metricsSeen = append(metricsSeen, metric)
		w.Header().Set("Content-Type", "application/json")
		// Reject if the forbidden-for-REELS metrics sneak in.
		if strings.Contains(metric, "follows") || strings.Contains(metric, "profile_visits") {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"error":{"code":100,"message":"The Media Insights API does not support the follows, profile_visits metric for this media product type."}}`)
			return
		}
		_, _ = io.WriteString(w, `{"data":[
			{"name":"views","period":"lifetime","values":[{"value":500}]},
			{"name":"reach","period":"lifetime","values":[{"value":450}]},
			{"name":"saved","period":"lifetime","values":[{"value":20}]},
			{"name":"shares","period":"lifetime","values":[{"value":8}]},
			{"name":"reposts","period":"lifetime","values":[{"value":1}]},
			{"name":"total_interactions","period":"lifetime","values":[{"value":50}]},
			{"name":"ig_reels_avg_watch_time","period":"lifetime","values":[{"value":2000}]},
			{"name":"facebook_views","period":"lifetime","values":[{"value":10}]},
			{"name":"crossposted_views","period":"lifetime","values":[{"value":12}]}
		]}`)
	}))
	defer srv.Close()

	mc := meta.NewClient(nil)
	mc.BaseURL = srv.URL
	client := insights.NewGraphClient(mc)

	got, err := client.GetMediaInsights(context.Background(), "reel-1", "token", true)
	if err != nil {
		t.Fatalf("REELS insights should succeed without follows/profile_visits, got %v", err)
	}
	if len(metricsSeen) != 1 {
		t.Fatalf("expected 1 call (no product-type retry needed), got %d: %v", len(metricsSeen), metricsSeen)
	}
	if strings.Contains(metricsSeen[0], "follows") || strings.Contains(metricsSeen[0], "profile_visits") {
		t.Errorf("REELS metric list must omit follows/profile_visits, got %q", metricsSeen[0])
	}
	if !strings.Contains(metricsSeen[0], "ig_reels_avg_watch_time") {
		t.Errorf("REELS metric list must include reels metrics, got %q", metricsSeen[0])
	}
	if got.Views != 500 || got.Reach != 450 {
		t.Errorf("Views/Reach = %d/%d, want 500/450", got.Views, got.Reach)
	}
	if got.Follows != 0 || got.ProfileVisits != 0 {
		t.Errorf("Follows/ProfileVisits = %d/%d, want 0/0 for REELS", got.Follows, got.ProfileVisits)
	}
}

// TestGetMediaInsights_FeedStillRequestsFollowsAndProfileVisits confirms FEED
// continues to request the FEED-only metrics.
func TestGetMediaInsights_FeedStillRequestsFollowsAndProfileVisits(t *testing.T) {
	t.Parallel()
	var metricsSeen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metricsSeen = append(metricsSeen, r.URL.Query().Get("metric"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[
			{"name":"views","period":"lifetime","values":[{"value":100}]},
			{"name":"follows","period":"lifetime","values":[{"value":3}]},
			{"name":"profile_visits","period":"lifetime","values":[{"value":9}]}
		]}`)
	}))
	defer srv.Close()

	mc := meta.NewClient(nil)
	mc.BaseURL = srv.URL
	client := insights.NewGraphClient(mc)

	got, err := client.GetMediaInsights(context.Background(), "feed-1", "token", false)
	if err != nil {
		t.Fatalf("FEED insights failed: %v", err)
	}
	if len(metricsSeen) != 1 {
		t.Fatalf("expected 1 call, got %d", len(metricsSeen))
	}
	if !strings.Contains(metricsSeen[0], "follows") || !strings.Contains(metricsSeen[0], "profile_visits") {
		t.Errorf("FEED metric list must include follows/profile_visits, got %q", metricsSeen[0])
	}
	if got.Follows != 3 || got.ProfileVisits != 9 {
		t.Errorf("Follows/ProfileVisits = %d/%d, want 3/9", got.Follows, got.ProfileVisits)
	}
}

// TestGetAccountInsightsDay_IncludesViews verifies the day-series request
// includes the views metric and that the returned Views pointer is parsed.
func TestGetAccountInsightsDay_IncludesViews(t *testing.T) {
	t.Parallel()
	var metricSeen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metricSeen = r.URL.Query().Get("metric")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[
			{"name":"reach","period":"day","values":[{"end_time":"2026-08-05T07:00:00+0000","value":500}]},
			{"name":"follower_count","period":"day","values":[{"end_time":"2026-08-05T07:00:00+0000","value":1000}]},
			{"name":"views","period":"day","values":[{"end_time":"2026-08-05T07:00:00+0000","value":1234}]}
		]}`)
	}))
	defer srv.Close()

	mc := meta.NewClient(nil)
	mc.BaseURL = srv.URL
	client := insights.NewGraphClient(mc)

	days, err := client.GetAccountInsightsDay(context.Background(), "token", "1722816000", "1722902400")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if !strings.Contains(metricSeen, "views") {
		t.Errorf("metric param should include views, got %q", metricSeen)
	}
	if len(days) != 1 {
		t.Fatalf("expected 1 day, got %d", len(days))
	}
	if days[0].Views == nil || *days[0].Views != 1234 {
		t.Errorf("Views = %v, want 1234", days[0].Views)
	}
	if days[0].Reach == nil || *days[0].Reach != 500 {
		t.Errorf("Reach = %v, want 500", days[0].Reach)
	}
	if days[0].FollowerCount == nil || *days[0].FollowerCount != 1000 {
		t.Errorf("FollowerCount = %v, want 1000", days[0].FollowerCount)
	}
}

// TestGetOnlineFollowers_ParsesBreakdowns verifies the hour-distribution
// response shape is parsed and buckets are sorted 0-23.
func TestGetOnlineFollowers_ParsesBreakdowns(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[{"name":"online_followers","period":"lifetime","metric_type":"total_value","total_value":{"breakdowns":[{"name":"hour","results":[{"dimension_values":["23"],"value":10},{"dimension_values":["07"],"value":70},{"dimension_values":["14"],"value":140}]}]}}]}`)
	}))
	defer srv.Close()

	mc := meta.NewClient(nil)
	mc.BaseURL = srv.URL
	client := insights.NewGraphClient(mc)

	got, err := client.GetOnlineFollowers(context.Background(), "token")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	want := []insights.OnlineFollowers{
		{Hour: 7, Value: 70},
		{Hour: 14, Value: 140},
		{Hour: 23, Value: 10},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d rows, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("row %d = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// TestGetMentionedMedia_ParsesFields verifies the nested
// mentioned_media.media_id({id}) shape is parsed into all expected fields.
func TestGetMentionedMedia_ParsesFields(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"mentioned_media":{"media_id":"media-1","caption":"hello","media_type":"IMAGE","like_count":42,"comments_count":7,"owner":{"id":"owner-1","username":"ownername"},"permalink":"https://instagr.am/p/abc","timestamp":"2026-08-05T12:00:00+0000","username":"mentioner"}}`)
	}))
	defer srv.Close()

	mc := meta.NewClient(nil)
	mc.BaseURL = srv.URL
	client := insights.NewGraphClient(mc)

	got, err := client.GetMentionedMedia(context.Background(), "token", "ig-1", "media-1")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if got == nil {
		t.Fatal("expected non-nil MentionedMedia")
	}
	want := &insights.MentionedMedia{
		MediaID:             "media-1",
		Caption:             "hello",
		MediaType:           "IMAGE",
		LikeCount:           42,
		CommentsCount:       7,
		OwnerID:             "owner-1",
		OwnerUsername:       "ownername",
		Permalink:           "https://instagr.am/p/abc",
		Timestamp:           "2026-08-05T12:00:00+0000",
		MentionedByUserID:   "mentioner",
		MentionedByUsername: "mentioner",
	}
	if *got != *want {
		t.Errorf("got %+v, want %+v", got, want)
	}
}
