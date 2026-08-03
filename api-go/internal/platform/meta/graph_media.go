package meta

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

// MediaItem is one Instagram media object (id only — that's all the
// comment reconciler needs).
type MediaItem struct {
	ID string
}

// CommentItem is one comment on a media object.
type CommentItem struct {
	ID           string
	Text         string
	FromID       string
	FromUsername string
}

// GetUserMedia lists the account's most recent media (newest first).
// Mirrors openreply's getUserMedia — GET /me/media?fields=id&limit=N.
func (c *Client) GetUserMedia(ctx context.Context, limit int, accessToken string) ([]MediaItem, error) {
	if limit <= 0 {
		limit = 10
	}
	url := fmt.Sprintf("%s/me/media?fields=id&limit=%d", c.base(), limit)
	data, err := c.request(ctx, http.MethodGet, url, accessToken, nil)
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
		if id := stringValue(m["id"], ""); id != "" {
			out = append(out, MediaItem{ID: id})
		}
	}
	return out, nil
}

// GetRecentMediaComments lists comments on one media created after sinceMS
// (unix milliseconds). Mirrors openreply's getRecentMediaComments — the Graph
// `since` parameter takes unix seconds.
func (c *Client) GetRecentMediaComments(ctx context.Context, mediaID string, sinceMS int64, accessToken string) ([]CommentItem, error) {
	url := fmt.Sprintf(
		"%s/%s/comments?fields=id,text,from&since=%d&limit=100",
		c.base(), mediaID, sinceMS/1000,
	)
	data, err := c.request(ctx, http.MethodGet, url, accessToken, nil)
	if err != nil {
		return nil, err
	}
	items, _ := data["data"].([]any)
	out := make([]CommentItem, 0, len(items))
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		from, _ := m["from"].(map[string]any)
		id := stringValue(m["id"], "")
		if id == "" {
			continue
		}
		out = append(out, CommentItem{
			ID:           id,
			Text:         stringValue(m["text"], ""),
			FromID:       stringValue(from["id"], ""),
			FromUsername: stringValue(from["username"], ""),
		})
	}
	return out, nil
}

// SubscribeToWebhooks subscribes the app to the given webhook fields for one
// Instagram account — POST /{ig-user-id}/subscribed_apps. Called after OAuth
// so comment/message/postback events start flowing for that account.
func (c *Client) SubscribeToWebhooks(ctx context.Context, igAccountID, accessToken string, fields []string) error {
	url := fmt.Sprintf(
		"%s/%s/subscribed_apps?subscribed_fields=%s",
		c.base(), igAccountID, strings.Join(fields, ","),
	)
	_, err := c.request(ctx, http.MethodPost, url, accessToken, nil)
	return err
}
