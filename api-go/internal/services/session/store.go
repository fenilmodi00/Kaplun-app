package session

import "context"

// Store persists Instagram session JSON against a creator record (Appwrite).
type Store interface {
	SaveSession(ctx context.Context, clerkUserID, sessionJSON string) (bool, error)
	GetSession(ctx context.Context, clerkUserID string) (string, error)
	ClearSession(ctx context.Context, clerkUserID string) (bool, error)
}

// CreatorStore upserts creator profile rows after Instagram login.
type CreatorStore interface {
	StoreCreatorProfile(ctx context.Context, clerkUserID string, profile map[string]any) (bool, error)
}
