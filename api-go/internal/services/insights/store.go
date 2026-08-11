package insights

import "context"

// Store is the persistence surface for the insights pipeline. The concrete
// Appwrite-backed implementation lives outside this package; the service
// only ever talks to this interface.
type Store interface {
	// ListCreatorsWithToken returns every creator row that has a stored
	// Instagram access token — the fan-out set for a full sync sweep.
	ListCreatorsWithToken(ctx context.Context) ([]CreatorRow, error)

	// UpsertCreatorMedia upserts the fetched media rows (with insights when
	// available) for one creator.
	UpsertCreatorMedia(ctx context.Context, creatorRowID string, items []MediaItemWithInsights) error

	// PruneCreatorMedia deletes stored media rows for the creator whose
	// media ids are not in keepIDs.
	PruneCreatorMedia(ctx context.Context, creatorRowID string, keepIDs []string) error

	// UpsertInsightDays upserts day-series rows keyed by (creator, date).
	UpsertInsightDays(ctx context.Context, creatorRowID string, days []InsightDay) error

	// UpsertDemographics replaces/upserts the creator's audience
	// demographics cells.
	UpsertDemographics(ctx context.Context, creatorRowID string, demos []DemographicBreakdown) error

	// UpdateCreatorProfile persists profile fields onto the creator row.
	UpdateCreatorProfile(ctx context.Context, creatorRowID string, profile *CreatorProfile) error

	// UpdateCreatorSyncState writes insights_sync_status / last-sync time /
	// derived counters onto the creator row. status is one of SyncStatusOK,
	// SyncStatusError, SyncStatusTokenError. derived may be nil.
	UpdateCreatorSyncState(ctx context.Context, creatorRowID string, status string, syncTime string, derived map[string]any) error

	// UpsertOnlineFollowers persists the lifetime online-followers hour
	// distribution for a creator.
	UpsertOnlineFollowers(ctx context.Context, creatorRowID string, rows []OnlineFollowers) error

	// UpsertMentionedMedia persists a media object where the creator was
	// mentioned by another account.
	UpsertMentionedMedia(ctx context.Context, creatorRowID string, row MentionedMedia) error

	// GetCreatorByIGUserID returns the creator row matching the given
	// Instagram professional user id, or an empty CreatorRow when none exists.
	GetCreatorByIGUserID(ctx context.Context, igUserID string) (*CreatorRow, error)

	// ListCreatorMedia returns the stored media rows (with insights when
	// available) for one creator, newest first by posted_at.
	ListCreatorMedia(ctx context.Context, creatorRowID string) ([]MediaItemWithInsights, error)

	// ListInsightDays returns the persisted day-series rows for one creator,
	// ordered by date ascending.
	ListInsightDays(ctx context.Context, creatorRowID string) ([]InsightDay, error)

	// ListOnlineFollowers returns the online-followers hour distribution
	// for one creator, ordered by hour_bucket ascending.
	ListOnlineFollowers(ctx context.Context, creatorRowID string) ([]OnlineFollowers, error)

	// GetCreatorDerived reads the creator row (derived columns + profile
	// fields) as a raw map. The caller extracts the keys it needs.
	GetCreatorDerived(ctx context.Context, creatorRowID string) (map[string]any, error)
}
