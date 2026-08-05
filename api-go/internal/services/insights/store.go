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
}
