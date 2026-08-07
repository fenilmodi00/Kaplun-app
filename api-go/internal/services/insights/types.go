package insights

// CreatorProfile is the Instagram professional-account profile returned by
// GET /me on the Instagram Graph API.
type CreatorProfile struct {
	ID             string
	Username       string
	Name           string
	Biography      string
	Website        string
	FollowersCount int64
	FollowsCount   int64
	MediaCount     int64
	ProfilePicURL  string
}

// MediaItem is one Instagram media object with the full field set the
// insights pipeline persists (unlike meta.MediaItem, which carries the id
// only).
type MediaItem struct {
	ID               string
	Caption          string
	MediaType        string
	MediaProductType string
	MediaURL         string
	ThumbnailURL     string
	Timestamp        string
	Permalink        string
	LikeCount        int64
	CommentsCount    int64
}

// MediaInsights holds per-media insight metrics. Reels-only fields stay zero
// for non-reel media. FacebookViews/CrosspostedViews are nil when Meta
// rejected those metrics (the retry-without-them path leaves them unset) or
// the media was never crossposted.
type MediaInsights struct {
	Views             int64
	Reach             int64
	Saved             int64
	Shares            int64
	Reposts           int64
	TotalInteractions int64
	Follows           int64
	ProfileVisits     int64

	// Reels-only metrics.
	ReelsAvgWatchTimeMs       int64
	ReelsVideoViewTotalTimeMs int64
	ReelsSkipRate             float64
	FacebookViews             *int64
	CrosspostedViews          *int64
}

// MediaItemWithInsights pairs a media row with its fetched insights.
// Insights is nil when the per-media insights call failed — the media row
// still upserts so the media grid stays complete.
type MediaItemWithInsights struct {
	Media    MediaItem
	Insights *MediaInsights
}

// OnlineFollowers is one hour bucket of the online followers metric.
type OnlineFollowers struct {
	Hour  int
	Value int64
}

// MentionedMedia is one media item in which the creator account was tagged or
// mentioned by another account.
type MentionedMedia struct {
	MediaID             string
	Caption             string
	MediaType           string
	LikeCount           int64
	CommentsCount       int64
	OwnerID             string
	OwnerUsername       string
	Permalink           string
	Timestamp           string
	MentionedByUserID   string
	MentionedByUsername string
}

// InsightDay is one day of account-level day-series metrics (Date is
// YYYY-MM-DD). Reach and FollowerCount are pointers because Meta may return
// a series for one metric and not the other on a given day. Views is a
// pointer for the same reason.
type InsightDay struct {
	Date          string
	Reach         *int64
	FollowerCount *int64
	Views         *int64
}

// DemographicBreakdown is one (metric, breakdown, dimension) cell from the
// audience demographics endpoints.
type DemographicBreakdown struct {
	Metric         string // follower_demographics | engaged_audience_demographics | reached_audience_demographics
	Breakdown      string // age | gender | country | city
	DimensionValue string // e.g. "25-34", "M", "US", "New York"
	Value          int64
	Timeframe      string // e.g. "this_month"
}

// CreatorRow is the minimal creators-table shape the sync fan-out needs.
type CreatorRow struct {
	ID          string
	AccessToken string
	IGUserID    string
}

// SyncResult reports what one SyncCreator run did. Error is empty on
// success; on failure it carries the sentinel identity (ErrTokenExpired)
// or the underlying error text.
type SyncResult struct {
	CreatorRowID            string
	MediaUpserted           int
	InsightDaysUpserted     int
	DemographicsUpserted    int
	OnlineFollowersUpserted int
	DurationMs              int64
	Error                   string
}
