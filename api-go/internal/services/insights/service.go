package insights

import (
	"context"
	"fmt"
	"log/slog"
	"maps"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"

	"kaplun/api-go/internal/platform/meta"
)

const (
	// MediaSyncLimit is how many recent media objects each sync refreshes.
	MediaSyncLimit = 10
	// maxInsightRetries caps how many times we retry a single media's insights
	// after discovering new unsupported metrics. Prevents infinite loops on
	// pathological Meta errors.
	maxInsightRetries = 5
	// InsightsWindowDays is the lookback window for account insights calls.
	InsightsWindowDays = 30
	// InsightDayUpsertWindow is how many trailing complete UTC days each
	// sync re-upserts. Meta revises day metrics for a couple of days after
	// the day closes, so the fixed trailing window overwrites stale figures
	// without rewriting the whole series.
	InsightDayUpsertWindow = 3
	// MinFollowersForDemographics is Meta's threshold — the audience
	// demographics endpoints error below 100 followers.
	MinFollowersForDemographics = 100
	// DemographicsTimeframe matches the pipeline plan: lifetime period,
	// this_month timeframe.
	DemographicsTimeframe = "this_month"

	// SyncStatusOK marks a healthy creator row after sync.
	SyncStatusOK = "ok"
	// SyncStatusError marks a failed sync (non-token cause).
	SyncStatusError = "error"
	// SyncStatusTokenError marks Meta error 190 — the creator must reconnect.
	SyncStatusTokenError = "token_error"
)

// DemographicMetrics are fetched ONE call per metric (comma-separated
// breakdowns inside each call — one call per breakdown would multiply quota).
var DemographicMetrics = []string{
	"follower_demographics",
	"engaged_audience_demographics",
	"reached_audience_demographics",
}

// Service runs the first-party Instagram insights sync for creators.
type Service struct {
	client GraphClient
	store  Store
	logger *slog.Logger
	now    func() time.Time
}

// NewService constructs the insights service. A nil logger falls back to
// slog.Default; the clock defaults to UTC time.Now.
func NewService(client GraphClient, store Store, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{
		client: client,
		store:  store,
		logger: logger,
		now:    func() time.Time { return time.Now().UTC() },
	}
}

// SyncAll fans SyncCreator over every creator with a stored access token,
// sleeping spacing between creators when positive (the boot backfill path
// spaces sweeps so an existing install base doesn't burst Meta Graph all at
// once). Per-creator failures are isolated — one bad token never stops the
// sweep.
func (s *Service) SyncAll(ctx context.Context, spacing time.Duration) []*SyncResult {
	creators, err := s.store.ListCreatorsWithToken(ctx)
	if err != nil {
		s.logger.Warn("insights creator list failed", "error", err)
		return nil
	}
	results := make([]*SyncResult, 0, len(creators))
	for _, c := range creators {
		if c.AccessToken == "" || c.IGUserID == "" {
			continue
		}
		results = append(results, s.SyncCreator(ctx, c.ID, c.AccessToken, c.IGUserID))
		if spacing > 0 {
			time.Sleep(spacing)
		}
	}
	return results
}

// CountSyncResults splits a fan-out into synced/failed tallies.
func CountSyncResults(results []*SyncResult) (synced, failed int) {
	for _, r := range results {
		if r.Error != "" {
			failed++
		} else {
			synced++
		}
	}
	return synced, failed
}

// SyncCreator collects every available Instagram insight for one creator and
// persists it through the Store. It never returns a Go error — the outcome
// is reported in the SyncResult and mirrored onto the creator row via
// UpdateCreatorSyncState (token_error on Meta 190, error otherwise, ok on
// success).
func (s *Service) SyncCreator(ctx context.Context, creatorRowID, accessToken, igUserID string) *SyncResult {
	start := s.now()
	res := &SyncResult{CreatorRowID: creatorRowID}

	// Optimistic reset: a crash mid-sync would otherwise leave a stale
	// failure status on the row.
	if err := s.store.UpdateCreatorSyncState(ctx, creatorRowID, SyncStatusOK, "", nil); err != nil {
		s.logger.Warn("insights sync-state reset failed", "creator_id", creatorRowID, "error", err)
	}

	profile, err := s.client.GetUserProfile(ctx, accessToken)
	if err != nil {
		return s.finish(ctx, res, start, err)
	}
	if err := s.store.UpdateCreatorProfile(ctx, creatorRowID, profile); err != nil {
		s.logger.Warn("insights profile persist failed", "creator_id", creatorRowID, "error", err)
	}

	media, err := s.client.GetUserMedia(ctx, accessToken, MediaSyncLimit)
	if err != nil {
		return s.finish(ctx, res, start, err)
	}

	items := make([]MediaItemWithInsights, 0, len(media))
	keepIDs := make([]string, 0, len(media))
	excludedMetrics := make(map[string]bool)
	for _, m := range media {
		keepIDs = append(keepIDs, m.ID)
		isReel := strings.EqualFold(m.MediaProductType, "REELS")

		var ins *MediaInsights
		var ierr error
		ins, ierr = s.client.GetMediaInsights(ctx, m.ID, accessToken, isReel, slices.Collect(maps.Keys(excludedMetrics))...)
		if ierr != nil {
			if meta.IsTokenExpired(ierr) {
				return s.finish(ctx, res, start, ierr)
			}
			// Retry loop: while the error names unsupported metrics, add them
			// to the exclusion set and retry the same media. Caps at
			// maxInsightRetries to prevent infinite loops on pathological
			// Meta errors.
			for retries := 0; retries < maxInsightRetries; retries++ {
				newMetrics := parseUnsupportedMetrics(ierr)
				if len(newMetrics) == 0 {
					break
				}
				added := false
				for _, nm := range newMetrics {
					if !excludedMetrics[nm] {
						excludedMetrics[nm] = true
						added = true
					}
				}
				if !added {
					break
				}
				s.logger.Warn("unsupported metrics detected; retrying media without them",
					"creator_id", creatorRowID, "media_id", m.ID,
					"excluded_metrics", slices.Collect(maps.Keys(excludedMetrics)))
				ins, ierr = s.client.GetMediaInsights(ctx, m.ID, accessToken, isReel, slices.Collect(maps.Keys(excludedMetrics))...)
				if ierr == nil {
					break
				}
				if meta.IsTokenExpired(ierr) {
					return s.finish(ctx, res, start, ierr)
				}
			}
			if ierr != nil {
				// Per-media failure is tolerated: the row upserts without
				// insights so the grid stays complete.
				s.logger.Warn("media insights fetch failed; upserting media without insights",
					"creator_id", creatorRowID, "media_id", m.ID, "error", ierr)
			}
		}
		items = append(items, MediaItemWithInsights{Media: m, Insights: ins})
	}
	if err := s.store.UpsertCreatorMedia(ctx, creatorRowID, items); err != nil {
		return s.finish(ctx, res, start, err)
	}
	res.MediaUpserted = len(items)
	if err := s.store.PruneCreatorMedia(ctx, creatorRowID, keepIDs); err != nil {
		return s.finish(ctx, res, start, err)
	}

	since, until := insightsWindow(start)

	days, err := s.client.GetAccountInsightsDay(ctx, accessToken, since, until)
	if err != nil {
		return s.finish(ctx, res, start, err)
	}
	upsertDays := trailingCompleteDays(days, start, InsightDayUpsertWindow)
	if len(upsertDays) > 0 {
		if err := s.store.UpsertInsightDays(ctx, creatorRowID, upsertDays); err != nil {
			return s.finish(ctx, res, start, err)
		}
		res.InsightDaysUpserted = len(upsertDays)
	}

	totals, err := s.client.GetAccountInsightsTotals(ctx, accessToken, since, until)
	if err != nil {
		return s.finish(ctx, res, start, err)
	}

	var demos []DemographicBreakdown
	if profile.FollowersCount < MinFollowersForDemographics {
		s.logger.Info("demographics skipped",
			"creator_id", creatorRowID,
			"followers_count", profile.FollowersCount,
			"reason", ErrBelow100Followers.Error())
	} else {
		for _, metric := range DemographicMetrics {
			breakdowns, derr := s.client.GetDemographics(ctx, accessToken, metric, DemographicsTimeframe)
			if derr != nil {
				if meta.IsTokenExpired(derr) {
					return s.finish(ctx, res, start, derr)
				}
				s.logger.Warn("demographics fetch failed",
					"creator_id", creatorRowID, "metric", metric, "error", derr)
				continue
			}
			demos = append(demos, breakdowns...)
		}
		if len(demos) > 0 {
			if err := s.store.UpsertDemographics(ctx, creatorRowID, demos); err != nil {
				return s.finish(ctx, res, start, err)
			}
			res.DemographicsUpserted = len(demos)
		}
	}

	derived := computeDerived(items, totals, s.now())

	res.DurationMs = s.now().Sub(start).Milliseconds()
	syncTime := s.now().Format(time.RFC3339Nano)
	if err := s.store.UpdateCreatorSyncState(ctx, creatorRowID, SyncStatusOK, syncTime, derived); err != nil {
		res.Error = fmt.Sprintf("persist sync state: %v", err)
	}
	s.logResult(res)
	return res
}

// finish records a failed sync: Meta 190 marks the row token_error (via the
// ErrTokenExpired identity) so the app can prompt reconnection; everything
// else marks error. Always sets DurationMs and a non-empty Error.
func (s *Service) finish(ctx context.Context, res *SyncResult, start time.Time, err error) *SyncResult {
	status := SyncStatusError
	if meta.IsTokenExpired(err) {
		status = SyncStatusTokenError
		res.Error = ErrTokenExpired.Error()
	} else {
		res.Error = err.Error()
	}
	res.DurationMs = s.now().Sub(start).Milliseconds()
	if uerr := s.store.UpdateCreatorSyncState(ctx, res.CreatorRowID, status, s.now().Format(time.RFC3339Nano), nil); uerr != nil {
		s.logger.Warn("insights sync-state persist failed",
			"creator_id", res.CreatorRowID, "status", status, "error", uerr)
	}
	s.logResult(res)
	return res
}

func (s *Service) logResult(res *SyncResult) {
	s.logger.Info("insights sync finished",
		"creator_id", res.CreatorRowID,
		"media_upserted", res.MediaUpserted,
		"insight_days_upserted", res.InsightDaysUpserted,
		"demographics_upserted", res.DemographicsUpserted,
		"duration_ms", res.DurationMs,
		"error", res.Error)
}

// insightsWindow returns the since/until bounds (unix seconds, as the Graph
// insights endpoints expect) for the trailing InsightsWindowDays window.
func insightsWindow(now time.Time) (since, until string) {
	return strconv.FormatInt(now.AddDate(0, 0, -InsightsWindowDays).Unix(), 10),
		strconv.FormatInt(now.Unix(), 10)
}

// trailingCompleteDays keeps the last `window` complete UTC days from the
// fetched series. The in-progress UTC day is dropped — its figures are still
// accruing and would be persisted as if final. Dates compare lexically
// because they are YYYY-MM-DD.
func trailingCompleteDays(days []InsightDay, now time.Time, window int) []InsightDay {
	utc := now.UTC()
	today := utc.Format("2006-01-02")
	cutoff := utc.AddDate(0, 0, -window).Format("2006-01-02")
	out := make([]InsightDay, 0, window)
	for _, d := range days {
		if d.Date < today && d.Date >= cutoff {
			out = append(out, d)
		}
	}
	return out
}

// computeDerived recomputes the scraped creators-table columns from real
// first-party creator_media data plus the account window totals. Keys match
// the store's derivedCreatorColumns whitelist; nil-able keys
// (last_post_days, content_frequency_days) are only present when they have
// a value, so the store leaves those columns untouched.
func computeDerived(items []MediaItemWithInsights, totals map[string]int64, now time.Time) map[string]any {
	derived := map[string]any{}

	var reelViews []int64
	var likesSum, commentsSum, maxLikes int64
	reels30, reels7 := 0, 0
	timestamps := make([]time.Time, 0, len(items))

	since30 := now.AddDate(0, 0, -30)
	since7 := now.AddDate(0, 0, -7)

	for _, item := range items {
		m := item.Media
		likesSum += m.LikeCount
		commentsSum += m.CommentsCount
		if m.LikeCount > maxLikes {
			maxLikes = m.LikeCount
		}

		ts, hasTS := parseMediaTimestamp(m.Timestamp)
		if hasTS {
			timestamps = append(timestamps, ts)
		}

		if strings.EqualFold(m.MediaProductType, "REELS") {
			// View stats only count reels whose insights actually fetched —
			// a nil-insights reel has no views data and must not drag the
			// average toward zero.
			if item.Insights != nil {
				reelViews = append(reelViews, item.Insights.Views)
			}
			if hasTS {
				if !ts.Before(since30) {
					reels30++
				}
				if !ts.Before(since7) {
					reels7++
				}
			}
		}
	}

	var avgReelViews, medianReelViews float64
	var maxReelViews, minReelViews int64
	if len(reelViews) > 0 {
		slices.Sort(reelViews)
		minReelViews = reelViews[0]
		maxReelViews = reelViews[len(reelViews)-1]
		var sum int64
		for _, v := range reelViews {
			sum += v
		}
		avgReelViews = float64(sum) / float64(len(reelViews))
		mid := len(reelViews) / 2
		if len(reelViews)%2 == 1 {
			medianReelViews = float64(reelViews[mid])
		} else {
			medianReelViews = float64(reelViews[mid-1]+reelViews[mid]) / 2
		}
	}
	derived["avg_reel_views"] = int64(math.Round(avgReelViews))
	derived["median_reel_views"] = int64(math.Round(medianReelViews))
	derived["max_reel_views"] = maxReelViews
	derived["min_reel_views"] = minReelViews
	derived["reels_count_30_days"] = reels30
	derived["reels_count_7_days"] = reels7

	lastPostAt := ""
	if len(timestamps) > 0 {
		slices.SortFunc(timestamps, func(a, b time.Time) int { return a.Compare(b) })
		latest := timestamps[len(timestamps)-1]
		derived["last_post_days"] = int(now.Sub(latest).Hours() / 24)
		lastPostAt = latest.Format(time.RFC3339Nano)
		if len(timestamps) > 1 {
			span := timestamps[len(timestamps)-1].Sub(timestamps[0])
			derived["content_frequency_days"] = span.Hours() / 24 / float64(len(timestamps)-1)
		}
	}
	derived["last_post_at"] = lastPostAt

	var avgLikes, avgComments float64
	if len(items) > 0 {
		avgLikes = float64(likesSum) / float64(len(items))
		avgComments = float64(commentsSum) / float64(len(items))
	}
	derived["avg_likes"] = int64(math.Round(avgLikes))
	derived["avg_comments"] = int64(math.Round(avgComments))
	derived["max_likes"] = maxLikes

	var engagementRate float64
	if reach := totals["reach"]; reach > 0 {
		engagementRate = float64(totals["total_interactions"]) / float64(reach)
	}
	derived["engagement_rate"] = engagementRate

	return derived
}

// parseUnsupportedMetrics extracts metric names from a Meta API error
// indicating unsupported metrics. Handles patterns like:
//
//	"does not support the metrics: reposts."
//	"does not support the follows, profile_visits metric for this media product type."
//
// Returns nil when the error does not match either pattern.
func parseUnsupportedMetrics(err error) []string {
	msg := err.Error()
	const prefix = "does not support the "
	idx := strings.Index(msg, prefix)
	if idx < 0 {
		return nil
	}
	rest := msg[idx+len(prefix):]

	var metricsStr string
	if strings.HasPrefix(rest, "metrics: ") {
		// Pattern: "metrics: reposts." — the metric list ends at the first
		// sentence terminator; everything after is a help URL/sentence.
		metricsStr = rest[len("metrics: "):]
		if idx := strings.Index(metricsStr, "."); idx >= 0 {
			metricsStr = metricsStr[:idx]
		}
	} else {
		// Pattern: "follows, profile_visits metric for this media product type."
		end := strings.Index(rest, " metric")
		if end < 0 {
			return nil
		}
		metricsStr = rest[:end]
	}

	parts := strings.Split(metricsStr, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

// parseMediaTimestamp parses Meta's media timestamp. RFC3339 first, with a
// fallback for Meta's colon-less zone offset ("2006-01-02T15:04:05+0000").
func parseMediaTimestamp(raw string) (time.Time, bool) {
	if raw == "" {
		return time.Time{}, false
	}
	if ts, err := time.Parse(time.RFC3339, raw); err == nil {
		return ts, true
	}
	if ts, err := time.Parse("2006-01-02T15:04:05+0000", raw); err == nil {
		return ts, true
	}
	return time.Time{}, false
}
