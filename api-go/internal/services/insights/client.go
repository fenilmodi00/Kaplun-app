package insights

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"kaplun/api-go/internal/platform/meta"
)

const (
	profileFields = "id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url"
	mediaFields   = "id,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count"

	// Shared metrics available on both FEED and REELS per Meta's media
	// insights product-type matrix
	// (developers.facebook.com/.../instagram-media/insights/).
	mediaMetricsShared = "views,reach,saved,shares,reposts,total_interactions"
	// follows + profile_visits are FEED/STORY only — requesting them on
	// REELS fails the entire comma-separated list.
	mediaMetricsFeedOnly = "follows,profile_visits"
	mediaMetricsReelsCore = "ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate"
	// mediaMetricsReels adds facebook/crossposted views. One invalid metric
	// fails the whole comma-separated list, so reels retry once without
	// those two (Meta rejects them on reels never crossposted to Facebook).
	mediaMetricsReels = mediaMetricsReelsCore + ",facebook_views,crossposted_views"

	accountDayMetrics   = "reach,follower_count"
	accountTotalMetrics = "views,accounts_engaged,profile_views,total_interactions,likes,comments,saves,shares,reposts,replies,follows_and_unfollows,profile_links_taps"

	// demographicBreakdowns is comma-separated in ONE call per metric — one
	// call per breakdown would multiply quota usage.
	demographicBreakdowns = "age,gender,country,city"
)

// GraphClient is the typed Instagram Graph surface the insights sync needs.
// Error values propagate from meta.Handle, so meta.IsTokenExpired and the
// other typed predicates keep working through this interface.
type GraphClient interface {
	GetUserProfile(ctx context.Context, accessToken string) (*CreatorProfile, error)
	GetUserMedia(ctx context.Context, accessToken string, limit int) ([]MediaItem, error)
	GetMediaInsights(ctx context.Context, mediaID, accessToken string, isReel bool, excludeMetrics ...string) (*MediaInsights, error)
	GetAccountInsightsDay(ctx context.Context, accessToken string, since, until string) ([]InsightDay, error)
	GetAccountInsightsTotals(ctx context.Context, accessToken string, since, until string) (map[string]int64, error)
	GetDemographics(ctx context.Context, accessToken, metric, timeframe string) ([]DemographicBreakdown, error)
}

// metaClient implements GraphClient on top of the shared platform meta.Client
// (its HTTP transport and base-URL config). meta.Client.request is
// unexported, so this wrapper runs the same round-trip itself for the
// GET-only surface this service needs — funnelling every response through
// meta.Handle so typed Meta errors propagate unchanged.
type metaClient struct {
	client *meta.Client
}

// NewGraphClient wraps a platform meta.Client as an insights GraphClient.
// A nil client yields a default one (15s HTTP timeout, GraphBaseURL).
func NewGraphClient(client *meta.Client) GraphClient {
	if client == nil {
		client = meta.NewClient(nil)
	}
	return &metaClient{client: client}
}

func (c *metaClient) base() string {
	if c.client != nil && c.client.BaseURL != "" {
		return strings.TrimRight(c.client.BaseURL, "/")
	}
	return meta.GraphBaseURL
}

// get performs an authenticated GET and funnels the response through
// meta.Handle. Mirrors meta.Client.request for GETs.
func (c *metaClient) get(ctx context.Context, rawURL, accessToken string) (map[string]any, error) {
	if c == nil || c.client == nil || c.client.HTTP == nil {
		return nil, fmt.Errorf("meta client not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, meta.WrapRequestError(err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := c.client.HTTP.Do(req)
	if err != nil {
		return nil, meta.WrapRequestError(err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, meta.WrapRequestError(err)
	}
	var data map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &data); err != nil {
			return nil, meta.WrapRequestError(fmt.Errorf("decode meta response: %w", err))
		}
	}
	if data == nil {
		data = map[string]any{}
	}
	return meta.Handle(data, resp.StatusCode)
}

// GetUserProfile fetches GET /me with the full profile field set.
func (c *metaClient) GetUserProfile(ctx context.Context, accessToken string) (*CreatorProfile, error) {
	rawURL := fmt.Sprintf("%s/me?fields=%s", c.base(), profileFields)
	data, err := c.get(ctx, rawURL, accessToken)
	if err != nil {
		return nil, err
	}
	return &CreatorProfile{
		ID:             str(data["id"]),
		Username:       str(data["username"]),
		Name:           str(data["name"]),
		Biography:      str(data["biography"]),
		Website:        str(data["website"]),
		FollowersCount: num(data["followers_count"]),
		FollowsCount:   num(data["follows_count"]),
		MediaCount:     num(data["media_count"]),
		ProfilePicURL:  str(data["profile_picture_url"]),
	}, nil
}

// GetUserMedia fetches GET /me/media with the full media field set, newest
// first. limit defaults to MediaSyncLimit when non-positive.
func (c *metaClient) GetUserMedia(ctx context.Context, accessToken string, limit int) ([]MediaItem, error) {
	if limit <= 0 {
		limit = MediaSyncLimit
	}
	rawURL := fmt.Sprintf("%s/me/media?fields=%s&limit=%d", c.base(), mediaFields, limit)
	data, err := c.get(ctx, rawURL, accessToken)
	if err != nil {
		return nil, err
	}
	items, _ := data["data"].([]any)
	out := make([]MediaItem, 0, len(items))
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id := str(m["id"])
		if id == "" {
			continue
		}
		out = append(out, MediaItem{
			ID:               id,
			Caption:          str(m["caption"]),
			MediaType:        str(m["media_type"]),
			MediaProductType: str(m["media_product_type"]),
			MediaURL:         str(m["media_url"]),
			ThumbnailURL:     str(m["thumbnail_url"]),
			Timestamp:        str(m["timestamp"]),
			Permalink:        str(m["permalink"]),
			LikeCount:        num(m["like_count"]),
			CommentsCount:    num(m["comments_count"]),
		})
	}
	return out, nil
}

// GetMediaInsights fetches GET /{media-id}/insights. Metric lists follow
// Meta's product-type matrix: FEED gets follows/profile_visits; REELS get
// reels-only metrics and never those two. If a reels call fails (one invalid
// metric fails the whole comma-separated list) it retries exactly once
// without facebook_views/crossposted_views. Token-expired errors never retry.
// excludeMetrics can be used to drop unsupported base metrics (e.g. "reposts")
// for the remainder of a sync run.
func (c *metaClient) GetMediaInsights(ctx context.Context, mediaID, accessToken string, isReel bool, excludeMetrics ...string) (*MediaInsights, error) {
	metrics := buildMetricsString(isReel, excludeMetrics...)
	data, err := c.get(ctx, mediaInsightsURL(c.base(), mediaID, metrics), accessToken)
	if err != nil && isReel && !meta.IsTokenExpired(err) {
		// Keep the REELS shared base (no follows/profile_visits) + reels core;
		// drop only facebook_views/crossposted_views.
		metrics = filterMetrics(mediaMetricsShared, excludeMetrics...) + "," + mediaMetricsReelsCore
		data, err = c.get(ctx, mediaInsightsURL(c.base(), mediaID, metrics), accessToken)
	}
	if err != nil {
		return nil, err
	}

	vals := metricValueMap(data)
	out := &MediaInsights{
		Views:             num(vals["views"]),
		Reach:             num(vals["reach"]),
		Saved:             num(vals["saved"]),
		Shares:            num(vals["shares"]),
		Reposts:           num(vals["reposts"]),
		TotalInteractions: num(vals["total_interactions"]),
		Follows:           num(vals["follows"]),
		ProfileVisits:     num(vals["profile_visits"]),
	}
	if isReel {
		out.ReelsAvgWatchTimeMs = num(vals["ig_reels_avg_watch_time"])
		out.ReelsVideoViewTotalTimeMs = num(vals["ig_reels_video_view_total_time"])
		out.ReelsSkipRate = fnum(vals["reels_skip_rate"])
		if v, ok := vals["facebook_views"]; ok {
			n := num(v)
			out.FacebookViews = &n
		}
		if v, ok := vals["crossposted_views"]; ok {
			n := num(v)
			out.CrosspostedViews = &n
		}
	}
	return out, nil
}

func mediaInsightsURL(base, mediaID, metrics string) string {
	return fmt.Sprintf("%s/%s/insights?metric=%s", base, mediaID, metrics)
}

// buildMetricsString constructs the comma-separated metrics parameter for a
// media insights call. REELS omit follows/profile_visits (Meta product-type
// matrix) and append reels-only metrics; FEED includes the feed-only pair.
func buildMetricsString(isReel bool, excludeMetrics ...string) string {
	base := mediaMetricsShared
	if !isReel {
		base = mediaMetricsShared + "," + mediaMetricsFeedOnly
	}
	metrics := filterMetrics(base, excludeMetrics...)
	if isReel {
		metrics += "," + mediaMetricsReels
	}
	return metrics
}

// filterMetrics drops any name in excludeMetrics from a comma-separated list.
func filterMetrics(csv string, excludeMetrics ...string) string {
	parts := strings.Split(csv, ",")
	exclude := make(map[string]bool, len(excludeMetrics))
	for _, e := range excludeMetrics {
		exclude[e] = true
	}
	filtered := make([]string, 0, len(parts))
	for _, p := range parts {
		if !exclude[p] {
			filtered = append(filtered, p)
		}
	}
	return strings.Join(filtered, ",")
}

// GetAccountInsightsDay fetches the reach/follower_count day series:
// GET /me/insights?metric=reach,follower_count&period=day. Rows are returned
// sorted ascending by date (YYYY-MM-DD, derived from each value's end_time).
func (c *metaClient) GetAccountInsightsDay(ctx context.Context, accessToken, since, until string) ([]InsightDay, error) {
	rawURL := fmt.Sprintf("%s/me/insights?metric=%s&period=day&since=%s&until=%s",
		c.base(), accountDayMetrics, since, until)
	data, err := c.get(ctx, rawURL, accessToken)
	if err != nil {
		return nil, err
	}

	byDate := map[string]*InsightDay{}
	items, _ := data["data"].([]any)
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		name := str(m["name"])
		vals, _ := m["values"].([]any)
		for _, vraw := range vals {
			vm, ok := vraw.(map[string]any)
			if !ok {
				continue
			}
			date := str(vm["end_time"])
			if len(date) > len("2006-01-02") {
				date = date[:len("2006-01-02")]
			}
			if date == "" {
				continue
			}
			day, ok := byDate[date]
			if !ok {
				day = &InsightDay{Date: date}
				byDate[date] = day
			}
			v := num(vm["value"])
			switch name {
			case "reach":
				day.Reach = &v
			case "follower_count":
				day.FollowerCount = &v
			}
		}
	}

	dates := make([]string, 0, len(byDate))
	for d := range byDate {
		dates = append(dates, d)
	}
	sort.Strings(dates)
	out := make([]InsightDay, 0, len(dates))
	for _, d := range dates {
		out = append(out, *byDate[d])
	}
	return out, nil
}

// GetAccountInsightsTotals fetches the sync-window totals:
// GET /me/insights?...&period=day&metric_type=total_value.
// Returns metric name → total value.
func (c *metaClient) GetAccountInsightsTotals(ctx context.Context, accessToken, since, until string) (map[string]int64, error) {
	rawURL := fmt.Sprintf("%s/me/insights?metric=%s&period=day&metric_type=total_value&since=%s&until=%s",
		c.base(), accountTotalMetrics, since, until)
	data, err := c.get(ctx, rawURL, accessToken)
	if err != nil {
		return nil, err
	}
	raw := metricValueMap(data)
	out := make(map[string]int64, len(raw))
	for k, v := range raw {
		out[k] = num(v)
	}
	return out, nil
}

// GetDemographics fetches one audience demographics metric with all
// breakdowns in a single call:
// GET /me/insights?metric={metric}&period=lifetime&metric_type=total_value&timeframe={timeframe}&breakdowns=age,gender,country,city.
func (c *metaClient) GetDemographics(ctx context.Context, accessToken, metric, timeframe string) ([]DemographicBreakdown, error) {
	rawURL := fmt.Sprintf("%s/me/insights?metric=%s&period=lifetime&metric_type=total_value&timeframe=%s&breakdowns=%s",
		c.base(), metric, timeframe, demographicBreakdowns)
	data, err := c.get(ctx, rawURL, accessToken)
	if err != nil {
		return nil, err
	}

	out := []DemographicBreakdown{}
	items, _ := data["data"].([]any)
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		tv, ok := m["total_value"].(map[string]any)
		if !ok {
			continue
		}
		breakdowns, _ := tv["breakdowns"].([]any)
		for _, braw := range breakdowns {
			bm, ok := braw.(map[string]any)
			if !ok {
				continue
			}
			breakdownName := str(bm["name"])
			results, _ := bm["results"].([]any)
			for _, rraw := range results {
				rm, ok := rraw.(map[string]any)
				if !ok {
					continue
				}
				dims, _ := rm["dimension_values"].([]any)
				parts := make([]string, 0, len(dims))
				for _, d := range dims {
					if s, ok := d.(string); ok && s != "" {
						parts = append(parts, s)
					}
				}
				dimension := strings.Join(parts, ":")
				if dimension == "" {
					continue
				}
				out = append(out, DemographicBreakdown{
					Metric:         metric,
					Breakdown:      breakdownName,
					DimensionValue: dimension,
					Value:          num(rm["value"]),
					Timeframe:      timeframe,
				})
			}
		}
	}
	return out, nil
}

// metricValueMap flattens a Graph insights response's data array into
// metric name → raw numeric value. Handles the total_value form
// ({total_value: {value: N}}) and the values form ({values: [{value: N}]});
// multi-value series are summed.
func metricValueMap(data map[string]any) map[string]any {
	out := map[string]any{}
	items, _ := data["data"].([]any)
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		name := str(m["name"])
		if name == "" {
			continue
		}
		if tv, ok := m["total_value"].(map[string]any); ok {
			out[name] = tv["value"]
			continue
		}
		vals, _ := m["values"].([]any)
		if len(vals) == 0 {
			continue
		}
		if len(vals) == 1 {
			if vm, ok := vals[0].(map[string]any); ok {
				out[name] = vm["value"]
			}
			continue
		}
		var sum float64
		for _, vraw := range vals {
			if vm, ok := vraw.(map[string]any); ok {
				sum += fnum(vm["value"])
			}
		}
		out[name] = sum
	}
	return out
}

func str(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func num(v any) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case float64:
		return int64(n)
	case json.Number:
		i, _ := n.Int64()
		return i
	case string:
		i, _ := strconv.ParseInt(n, 10, 64)
		return i
	default:
		return 0
	}
}

func fnum(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int64:
		return float64(n)
	case int:
		return float64(n)
	case string:
		f, _ := strconv.ParseFloat(n, 64)
		return f
	default:
		return 0
	}
}
