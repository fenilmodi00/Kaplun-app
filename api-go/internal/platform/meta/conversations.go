package meta

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// ConversationSummary is one Instagram DM thread.
type ConversationSummary struct {
	ID          string
	UpdatedTime time.Time
}

// ConversationMessage is one message inside a conversation thread.
type ConversationMessage struct {
	ID            string
	CreatedTime   time.Time
	FromID        string
	FromUsername  string
	Text          string
	IsUnsupported bool
}

// ListConversations returns recent Instagram conversations for the token's account.
func (c *Client) ListConversations(ctx context.Context, limit int, accessToken string) ([]ConversationSummary, error) {
	if limit <= 0 {
		limit = 25
	}
	url := fmt.Sprintf("%s/me/conversations?platform=instagram&fields=id,updated_time&limit=%d", c.base(), limit)
	data, err := c.request(ctx, http.MethodGet, url, accessToken, nil)
	if err != nil {
		return nil, err
	}
	items, _ := data["data"].([]any)
	out := make([]ConversationSummary, 0, len(items))
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id := stringValue(m["id"], "")
		if id == "" {
			continue
		}
		out = append(out, ConversationSummary{
			ID:          id,
			UpdatedTime: parseGraphTime(stringValue(m["updated_time"], "")),
		})
	}
	return out, nil
}

// ListConversationMessages returns recent messages in one conversation (newest first).
func (c *Client) ListConversationMessages(ctx context.Context, conversationID string, limit int, accessToken string) ([]ConversationMessage, error) {
	if limit <= 0 {
		limit = 20
	}
	url := fmt.Sprintf(
		"%s/%s/messages?fields=id,created_time,from,message,is_unsupported&limit=%d",
		c.base(), conversationID, limit,
	)
	data, err := c.request(ctx, http.MethodGet, url, accessToken, nil)
	if err != nil {
		return nil, err
	}
	items, _ := data["data"].([]any)
	out := make([]ConversationMessage, 0, len(items))
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id := stringValue(m["id"], "")
		if id == "" {
			continue
		}
		from, _ := m["from"].(map[string]any)
		unsupported, _ := m["is_unsupported"].(bool)
		out = append(out, ConversationMessage{
			ID:            id,
			CreatedTime:   parseGraphTime(stringValue(m["created_time"], "")),
			FromID:        stringValue(from["id"], ""),
			FromUsername:  stringValue(from["username"], ""),
			Text:          stringValue(m["message"], ""),
			IsUnsupported: unsupported,
		})
	}
	return out, nil
}

func parseGraphTime(raw string) time.Time {
	if raw == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t
	}
	if t, err := time.Parse("2006-01-02T15:04:05+0000", raw); err == nil {
		return t
	}
	return time.Time{}
}
