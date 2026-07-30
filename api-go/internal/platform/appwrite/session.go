package appwrite

import (
	"context"
	"errors"
	"strings"
)

// SaveSession updates the creators row ig_session_json for the given Clerk user.
// Returns false when no creator row exists (matching Python save_creator_session).
func (c *Client) SaveSession(ctx context.Context, clerkUserID, sessionJSON string) (bool, error) {
	if strings.TrimSpace(clerkUserID) == "" {
		return false, errors.New("clerk user id is required")
	}

	row, docID, err := c.findCreatorRow(ctx, clerkUserID)
	if err != nil {
		return false, err
	}
	if row == nil {
		return false, nil
	}

	_, err = c.UpdateRow(ctx, c.creatorsTableID, docID, map[string]any{
		"ig_session_json": sessionJSON,
	}, nil)
	if err != nil {
		return false, err
	}
	return true, nil
}

// GetSession returns persisted Instagram session JSON.
// Prefers ig_session_json; falls back to access_token (Python quirk for legacy rows).
func (c *Client) GetSession(ctx context.Context, clerkUserID string) (string, error) {
	if strings.TrimSpace(clerkUserID) == "" {
		return "", errors.New("clerk user id is required")
	}

	row, _, err := c.findCreatorRow(ctx, clerkUserID)
	if err != nil {
		return "", err
	}
	if row == nil {
		return "", nil
	}

	if session := stringField(row, "ig_session_json"); session != "" {
		return session, nil
	}
	return stringField(row, "access_token"), nil
}

// ClearSession clears Instagram auth fields and marks the creator as not onboarded.
func (c *Client) ClearSession(ctx context.Context, clerkUserID string) (bool, error) {
	if strings.TrimSpace(clerkUserID) == "" {
		return false, errors.New("clerk user id is required")
	}

	row, docID, err := c.findCreatorRow(ctx, clerkUserID)
	if err != nil {
		return false, err
	}
	if row == nil {
		return false, nil
	}

	_, err = c.UpdateRow(ctx, c.creatorsTableID, docID, map[string]any{
		"access_token":     "",
		"token_expires_at": "",
		"ig_session_json":  "",
		"is_onboarded":     false,
	}, nil)
	if err != nil {
		return false, err
	}
	return true, nil
}

func (c *Client) findCreatorRow(ctx context.Context, clerkUserID string) (map[string]any, string, error) {
	result, err := c.ListRows(ctx, c.creatorsTableID, []string{
		QueryEqual("clerk_user_id", clerkUserID),
		QueryLimit(1),
	})
	if err != nil {
		return nil, "", err
	}
	if len(result.Rows) == 0 {
		return nil, "", nil
	}
	row := result.Rows[0]
	docID, _ := row["$id"].(string)
	if docID == "" {
		return nil, "", errors.New("creator row missing $id")
	}
	return row, docID, nil
}

func stringField(row map[string]any, key string) string {
	if v, ok := row[key].(string); ok {
		return v
	}
	return ""
}
