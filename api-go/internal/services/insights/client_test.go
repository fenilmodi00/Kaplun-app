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

// TestGetMediaInsights_DropsRepostsViaExclude verifies that when reposts is
// excluded via the excludeMetrics parameter, the client builds the metrics
// string without reposts and the call succeeds.
func TestGetMediaInsights_DropsRepostsViaExclude(t *testing.T) {
	t.Parallel()
	var metricsSeen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metric := r.URL.Query().Get("metric")
		metricsSeen = append(metricsSeen, metric)
		w.Header().Set("Content-Type", "application/json")
		// Reject any call that still includes reposts.
		if strings.Contains(metric, "reposts") {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"error":{"code":100,"message":"Instagram Insights Media API endpoint does not support the metrics: reposts."}}`)
			return
		}
		_, _ = io.WriteString(w, `{"data":[
			{"name":"views","period":"lifetime","values":[{"value":100}]},
			{"name":"reach","period":"lifetime","values":[{"value":90}]},
			{"name":"saved","period":"lifetime","values":[{"value":5}]},
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

	// First call without exclude — should fail because reposts is included.
	_, err := client.GetMediaInsights(context.Background(), "m-1", "token", false)
	if err == nil {
		t.Fatal("expected error when reposts is included")
	}
	if !strings.Contains(err.Error(), "reposts") {
		t.Errorf("error should mention reposts, got %v", err)
	}

	// Second call with reposts excluded — should succeed.
	got, err := client.GetMediaInsights(context.Background(), "m-2", "token", false, "reposts")
	if err != nil {
		t.Fatalf("expected success after excluding reposts, got %v", err)
	}
	if got.Views != 100 || got.Reach != 90 {
		t.Errorf("Views/Reach = %d/%d, want 100/90", got.Views, got.Reach)
	}
	if got.Reposts != 0 {
		t.Errorf("Reposts = %d, want 0 (metric excluded)", got.Reposts)
	}

	// Verify the second call's metrics string does not contain reposts.
	if len(metricsSeen) < 2 {
		t.Fatalf("expected at least 2 calls, got %d", len(metricsSeen))
	}
	if strings.Contains(metricsSeen[1], "reposts") {
		t.Errorf("second call should exclude reposts, got metric=%q", metricsSeen[1])
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

	// Reel with reposts excluded — should first try without reposts but with
	// facebook_views, then retry without facebook_views/crossposted_views.
	got, err := client.GetMediaInsights(context.Background(), "m-1", "token", true, "reposts")
	if err != nil {
		t.Fatalf("expected retry to recover, got error: %v", err)
	}
	if len(metricsSeen) != 2 {
		t.Fatalf("expected 2 calls, got %d", len(metricsSeen))
	}
	// First call: base without reposts + reels metrics (including facebook_views).
	if strings.Contains(metricsSeen[0], "reposts") {
		t.Errorf("first call should exclude reposts, got metric=%q", metricsSeen[0])
	}
	if !strings.Contains(metricsSeen[0], "facebook_views") {
		t.Errorf("first call should include facebook_views, got metric=%q", metricsSeen[0])
	}
	// Second call: base without reposts + reels core only (no facebook/crossposted).
	if strings.Contains(metricsSeen[1], "facebook_views") || strings.Contains(metricsSeen[1], "crossposted_views") {
		t.Errorf("retry must drop facebook_views/crossposted_views, got metric=%q", metricsSeen[1])
	}
	if strings.Contains(metricsSeen[1], "reposts") {
		t.Errorf("retry must also exclude reposts, got metric=%q", metricsSeen[1])
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
