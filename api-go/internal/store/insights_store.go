package store

import (
	"context"
	"time"

	"kaplun/api-go/internal/platform/appwrite"
	"kaplun/api-go/internal/services/insights"
)

// InsightsTables holds Appwrite TablesDB table IDs used by the first-party
// insights pipeline.
type InsightsTables struct {
	Creators                    string
	CreatorMedia                string
	CreatorInsightDays          string
	CreatorAudienceDemographics string
	CreatorOnlineFollowers      string
	MentionedMedia              string
}

// InsightsStore implements insights.Store over Appwrite TablesDB. Standalone
// sibling of AutomationsStore (same RowClient pattern) — these rows are
// server-owned aggregates, so every create/update passes nil permissions (the
// api-go API key bypasses RLS; rowSecurity is disabled).
type InsightsStore struct {
	client RowClient
	tables InsightsTables
	now    func() time.Time
}

// Compile-time check that InsightsStore satisfies the service interface.
var _ insights.Store = (*InsightsStore)(nil)

func NewInsightsStore(client RowClient, tables InsightsTables) *InsightsStore {
	return &InsightsStore{
		client: client,
		tables: tables,
		now:    func() time.Time { return time.Now().UTC() },
	}
}

// derivedCreatorColumns is the closed set of creators-table columns recomputed
// from creator_media on every sync. UpdateCreatorSyncState copies only these
// keys out of the derived map — arbitrary keys are never written.
var derivedCreatorColumns = []string{
	"avg_reel_views",
	"median_reel_views",
	"max_reel_views",
	"min_reel_views",
	"reels_count_30_days",
	"reels_count_7_days",
	"last_post_days",
	"content_frequency_days",
	"avg_likes",
	"avg_comments",
	"max_likes",
	"engagement_rate",
	"last_post_at",
	"top_cities",
	"top_age_groups",
	"top_gender_age_pairs",
}

const insightsPageSize = 100

// ListCreatorsWithToken returns every creator holding a non-empty
// access_token. Deliberately has NO expiry filter (unlike
// ListCreatorsWithTokenExpiringBefore): the sync loop decides per creator
// what to do when Meta rejects the token.
func (s *InsightsStore) ListCreatorsWithToken(ctx context.Context) ([]insights.CreatorRow, error) {
	out := []insights.CreatorRow{}
	for offset := 0; ; offset += insightsPageSize {
		result, err := s.client.ListRows(ctx, s.tables.Creators, []string{
			appwrite.QueryGreaterThan("access_token", ""),
			appwrite.QueryLimit(insightsPageSize),
			appwrite.QueryOffset(offset),
		})
		if err != nil {
			return nil, err
		}
		for _, row := range result.Rows {
			out = append(out, insights.CreatorRow{
				ID:          stringField(row, "$id"),
				AccessToken: stringField(row, "access_token"),
				IGUserID:    stringField(row, "ig_user_id"),
			})
		}
		if len(result.Rows) < insightsPageSize {
			return out, nil
		}
	}
}

// UpsertCreatorMedia upserts each item by ig_media_id (unique index).
// Application-level upsert is the PRIMARY path: list by key, then update or
// create. first_seen_at is set only on insert; insights_synced_at and
// last_seen_at are bumped on every sync. Items whose Insights is nil still
// upsert the media columns (grid stays complete) but leave the previously
// stored insight metrics untouched.
func (s *InsightsStore) UpsertCreatorMedia(ctx context.Context, creatorRowID string, items []insights.MediaItemWithInsights) error {
	nowISO := s.nowISO()
	for _, item := range items {
		firstSeenAtISO := ""
		if _, err := s.upsertRow(ctx, s.tables.CreatorMedia, []string{
			appwrite.QueryEqual("ig_media_id", item.Media.ID),
		}, func(existingID string) map[string]any {
			if existingID == "" {
				firstSeenAtISO = nowISO
			}
			return mediaData(creatorRowID, item, nowISO, firstSeenAtISO)
		}); err != nil {
			return err
		}
	}
	return nil
}

// PruneCreatorMedia deletes creator_media rows for this creator whose
// ig_media_id is NOT in keepIDs. keepIDs is the freshly synced candidate set
// (the 10 newest by posted_at DESC, ig_media_id DESC), so pruning by
// ig_media_id membership — never by posted_at alone — keeps exactly that set.
// Runs strictly AFTER upserts land, never before.
func (s *InsightsStore) PruneCreatorMedia(ctx context.Context, creatorRowID string, keepIDs []string) error {
	keep := make(map[string]struct{}, len(keepIDs))
	for _, id := range keepIDs {
		keep[id] = struct{}{}
	}
	for offset := 0; ; offset += insightsPageSize {
		result, err := s.client.ListRows(ctx, s.tables.CreatorMedia, []string{
			appwrite.QueryEqual("creator_row_id", creatorRowID),
			appwrite.QueryLimit(insightsPageSize),
			appwrite.QueryOffset(offset),
		})
		if err != nil {
			return err
		}
		for _, row := range result.Rows {
			igMediaID := stringField(row, "ig_media_id")
			if _, ok := keep[igMediaID]; ok {
				continue
			}
			rowID := stringField(row, "$id")
			if rowID == "" {
				continue
			}
			if err := s.client.DeleteRow(ctx, s.tables.CreatorMedia, rowID); err != nil {
				return err
			}
		}
		if len(result.Rows) < insightsPageSize {
			return nil
		}
	}
}

// UpsertInsightDays upserts each day by (creator_row_id, date). The caller
// re-upserts the last 3 days to absorb Meta's revision window; nil metric
// pointers are written as null so revised-away values are cleared.
func (s *InsightsStore) UpsertInsightDays(ctx context.Context, creatorRowID string, days []insights.InsightDay) error {
	nowISO := s.nowISO()
	for _, day := range days {
		if _, err := s.upsertRow(ctx, s.tables.CreatorInsightDays, []string{
			appwrite.QueryEqual("creator_row_id", creatorRowID),
			appwrite.QueryEqual("date", day.Date),
		}, func(string) map[string]any {
			return map[string]any{
				"creator_row_id": creatorRowID,
				"date":           day.Date,
				"reach":          optInt64(day.Reach),
				"follower_count": optInt64(day.FollowerCount),
				"views":          optInt64(day.Views),
				"synced_at":      nowISO,
			}
		}); err != nil {
			return err
		}
	}
	return nil
}

// GetCreatorByIGUserID returns the creator row with the matching Instagram
// professional user id. Returns nil when no row exists.
func (s *InsightsStore) GetCreatorByIGUserID(ctx context.Context, igUserID string) (*insights.CreatorRow, error) {
	result, err := s.client.ListRows(ctx, s.tables.Creators, []string{
		appwrite.QueryEqual("ig_user_id", igUserID),
		appwrite.QueryLimit(1),
	})
	if err != nil {
		return nil, err
	}
	if len(result.Rows) == 0 {
		return nil, nil
	}
	row := result.Rows[0]
	return &insights.CreatorRow{
		ID:          stringField(row, "$id"),
		AccessToken: stringField(row, "access_token"),
		IGUserID:    stringField(row, "ig_user_id"),
	}, nil
}

// UpsertDemographics upserts each breakdown cell by
// (creator_row_id, metric, breakdown, dimension_value).
func (s *InsightsStore) UpsertDemographics(ctx context.Context, creatorRowID string, demos []insights.DemographicBreakdown) error {
	nowISO := s.nowISO()
	for _, demo := range demos {
		if _, err := s.upsertRow(ctx, s.tables.CreatorAudienceDemographics, []string{
			appwrite.QueryEqual("creator_row_id", creatorRowID),
			appwrite.QueryEqual("metric", demo.Metric),
			appwrite.QueryEqual("breakdown", demo.Breakdown),
			appwrite.QueryEqual("dimension_value", demo.DimensionValue),
		}, func(string) map[string]any {
			return map[string]any{
				"creator_row_id":  creatorRowID,
				"metric":          demo.Metric,
				"breakdown":       demo.Breakdown,
				"dimension_value": demo.DimensionValue,
				"value":           demo.Value,
				"timeframe":       demo.Timeframe,
				"synced_at":       nowISO,
			}
		}); err != nil {
			return err
		}
	}
	return nil
}

// UpdateCreatorProfile writes the /me profile fields onto the creators row.
func (s *InsightsStore) UpdateCreatorProfile(ctx context.Context, creatorRowID string, profile *insights.CreatorProfile) error {
	if profile == nil {
		return nil
	}
	_, err := s.client.UpdateRow(ctx, s.tables.Creators, creatorRowID, map[string]any{
		"username":        profile.Username,
		"full_name":       profile.Name,
		"biography":       profile.Biography,
		"external_url":    profile.Website,
		"follower_count":  profile.FollowersCount,
		"following_count": profile.FollowsCount,
		"post_count":      profile.MediaCount,
		"profile_pic_url": profile.ProfilePicURL,
	}, nil)
	return err
}

// UpdateCreatorSyncState stamps the sync bookkeeping columns
// (last_api_sync_at, insights_sync_status) and copies whitelisted derived
// columns (recomputed from creator_media) out of the derived map.
func (s *InsightsStore) UpdateCreatorSyncState(ctx context.Context, creatorRowID string, status string, syncTime string, derived map[string]any) error {
	data := map[string]any{
		"last_api_sync_at":     syncTime,
		"insights_sync_status": status,
	}
	for _, col := range derivedCreatorColumns {
		if v, ok := derived[col]; ok {
			data[col] = v
		}
	}
	_, err := s.client.UpdateRow(ctx, s.tables.Creators, creatorRowID, data, nil)
	return err
}

// UpsertOnlineFollowers upserts each hour bucket by (creator_row_id,
// hour_bucket).
func (s *InsightsStore) UpsertOnlineFollowers(ctx context.Context, creatorRowID string, rows []insights.OnlineFollowers) error {
	nowISO := s.nowISO()
	for _, row := range rows {
		if _, err := s.upsertRow(ctx, s.tables.CreatorOnlineFollowers, []string{
			appwrite.QueryEqual("creator_row_id", creatorRowID),
			appwrite.QueryEqual("hour_bucket", row.Hour),
		}, func(string) map[string]any {
			return map[string]any{
				"creator_row_id": creatorRowID,
				"hour_bucket":    row.Hour,
				"value":          row.Value,
				"synced_at":      nowISO,
			}
		}); err != nil {
			return err
		}
	}
	return nil
}

// UpsertMentionedMedia upserts one mentioned-media item by
// (creator_row_id, ig_media_id).
func (s *InsightsStore) UpsertMentionedMedia(ctx context.Context, creatorRowID string, row insights.MentionedMedia) error {
	nowISO := s.nowISO()
	_, err := s.upsertRow(ctx, s.tables.MentionedMedia, []string{
		appwrite.QueryEqual("creator_row_id", creatorRowID),
		appwrite.QueryEqual("ig_media_id", row.MediaID),
	}, func(string) map[string]any {
		return map[string]any{
			"creator_row_id":        creatorRowID,
			"ig_media_id":           row.MediaID,
			"caption":               row.Caption,
			"media_type":            row.MediaType,
			"like_count":            row.LikeCount,
			"comments_count":        row.CommentsCount,
			"owner_id":              row.OwnerID,
			"owner_username":        row.OwnerUsername,
			"permalink":             row.Permalink,
			"posted_at":             row.Timestamp,
			"mentioned_by_user_id":  row.MentionedByUserID,
			"mentioned_by_username": row.MentionedByUsername,
			"synced_at":             nowISO,
		}
	})
	return err
}

// findRowID returns the $id of the first row matching queries, or "" when no
// row matches.
func (s *InsightsStore) findRowID(ctx context.Context, tableID string, queries []string) (string, error) {
	result, err := s.client.ListRows(ctx, tableID, append(queries, appwrite.QueryLimit(1)))
	if err != nil {
		return "", err
	}
	if len(result.Rows) == 0 {
		return "", nil
	}
	return stringField(result.Rows[0], "$id"), nil
}

// upsertRow finds a row by queries and either updates it or creates a new one.
// buildData receives the existing row id (empty when creating) so callers can
// vary insert-only fields such as first_seen_at.
func (s *InsightsStore) upsertRow(ctx context.Context, tableID string, queries []string, buildData func(existingID string) map[string]any) (rowID string, err error) {
	rowID, err = s.findRowID(ctx, tableID, queries)
	if err != nil {
		return "", err
	}
	data := buildData(rowID)
	if rowID != "" {
		_, err = s.client.UpdateRow(ctx, tableID, rowID, data, nil)
		return rowID, err
	}
	created, err := s.client.CreateRow(ctx, tableID, appwrite.UniqueID, data, nil)
	if err != nil {
		return "", err
	}
	return stringField(created, "$id"), nil
}

func (s *InsightsStore) nowISO() string {
	return s.now().Format(time.RFC3339Nano)
}

// mediaData builds the creator_media column map. firstSeenAtISO is non-empty
// only on insert — first_seen_at is set once and never updated afterwards.
// Insight columns are only written when item.Insights is non-nil: a failed
// per-media insights call must not zero out previously stored metrics.
func mediaData(creatorRowID string, item insights.MediaItemWithInsights, nowISO, firstSeenAtISO string) map[string]any {
	m := item.Media
	data := map[string]any{
		"creator_row_id":     creatorRowID,
		"ig_media_id":        m.ID,
		"caption":            m.Caption,
		"media_type":         m.MediaType,
		"media_product_type": m.MediaProductType,
		"media_url":          m.MediaURL,
		"thumbnail_url":      m.ThumbnailURL,
		"permalink":          m.Permalink,
		"posted_at":          m.Timestamp,
		"like_count":         m.LikeCount,
		"comments_count":     m.CommentsCount,
		"insights_synced_at": nowISO,
		"last_seen_at":       nowISO,
	}
	if ins := item.Insights; ins != nil {
		data["views"] = ins.Views
		data["reach"] = ins.Reach
		data["saved"] = ins.Saved
		data["shares"] = ins.Shares
		data["reposts"] = ins.Reposts
		data["total_interactions"] = ins.TotalInteractions
		data["follows"] = ins.Follows
		data["profile_visits"] = ins.ProfileVisits
		data["reels_avg_watch_time_ms"] = ins.ReelsAvgWatchTimeMs
		data["reels_video_view_total_time_ms"] = ins.ReelsVideoViewTotalTimeMs
		data["reels_skip_rate"] = ins.ReelsSkipRate
		data["facebook_views"] = optInt64(ins.FacebookViews)
		data["crossposted_views"] = optInt64(ins.CrosspostedViews)
	}
	if firstSeenAtISO != "" {
		data["first_seen_at"] = firstSeenAtISO
	}
	return data
}

// optInt64 dereferences an optional integer column; nil is written as null so
// re-upserts clear values Meta stopped returning.
func optInt64(v *int64) any {
	if v == nil {
		return nil
	}
	return *v
}
