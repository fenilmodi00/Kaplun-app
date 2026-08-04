package meta

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	GraphAPIVersion = "v25.0"
	GraphBaseURL    = "https://graph.instagram.com/" + GraphAPIVersion
)

// HTTPDoer is an injectable HTTP client for Meta Graph requests.
type HTTPDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

// Client is a minimal Meta Graph API client for automation messaging.
type Client struct {
	HTTP    HTTPDoer
	BaseURL string
}

// NewClient builds a Graph client. httpClient may be nil (defaults to 15s timeout).
func NewClient(httpClient HTTPDoer) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{HTTP: httpClient, BaseURL: GraphBaseURL}
}

func (c *Client) base() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/")
	}
	return GraphBaseURL
}

// SendPrivateReply sends a private reply to a comment (text DM).
func (c *Client) SendPrivateReply(ctx context.Context, igAccountID, commentID, text, accessToken string) (map[string]any, error) {
	body := map[string]any{
		"recipient": map[string]any{"comment_id": commentID},
		"message":   map[string]any{"text": text},
	}
	return c.request(ctx, http.MethodPost, c.base()+"/"+igAccountID+"/messages", accessToken, body)
}

// SendPrivateReplyWithButton sends a private reply with a postback button.
func (c *Client) SendPrivateReplyWithButton(ctx context.Context, igAccountID, commentID, text, buttonTitle, payload, accessToken string) (map[string]any, error) {
	body := map[string]any{
		"recipient": map[string]any{"comment_id": commentID},
		"message": map[string]any{
			"attachment": map[string]any{
				"type": "template",
				"payload": map[string]any{
					"template_type": "button",
					"text":          truncateRunes(text, 640),
					"buttons": []map[string]any{{
						"type":    "postback",
						"title":   truncateRunes(buttonTitle, 20),
						"payload": payload,
					}},
				},
			},
		},
	}
	return c.request(ctx, http.MethodPost, c.base()+"/"+igAccountID+"/messages", accessToken, body)
}

// SendPrivateReplyWithLinkButton sends a private reply with a web_url button.
func (c *Client) SendPrivateReplyWithLinkButton(ctx context.Context, igAccountID, commentID, text, buttonTitle, url, accessToken string) (map[string]any, error) {
	body := map[string]any{
		"recipient": map[string]any{"comment_id": commentID},
		"message": map[string]any{
			"attachment": map[string]any{
				"type": "template",
				"payload": map[string]any{
					"template_type": "button",
					"text":          truncateRunes(text, 640),
					"buttons": []map[string]any{{
						"type":  "web_url",
						"url":   url,
						"title": truncateRunes(buttonTitle, 20),
					}},
				},
			},
		},
	}
	return c.request(ctx, http.MethodPost, c.base()+"/"+igAccountID+"/messages", accessToken, body)
}

// SendDirectMessage sends a DM to a user by IG scoped user id.
func (c *Client) SendDirectMessage(ctx context.Context, igAccountID, userID, text, accessToken string) (map[string]any, error) {
	body := map[string]any{
		"recipient": map[string]any{"id": userID},
		"message":   map[string]any{"text": text},
	}
	return c.request(ctx, http.MethodPost, c.base()+"/"+igAccountID+"/messages", accessToken, body)
}

// SendDirectMessageWithButton sends a button template as a direct message (not private reply).
// Uses recipient: {id: userID} and a button template attachment.
func (c *Client) SendDirectMessageWithButton(ctx context.Context, igAccountID, userID, text, buttonTitle, payload, accessToken string) (map[string]any, error) {
	body := map[string]any{
		"recipient": map[string]any{"id": userID},
		"message": map[string]any{
			"attachment": map[string]any{
				"type": "template",
				"payload": map[string]any{
					"template_type": "button",
					"text":          truncateRunes(text, 640),
					"buttons": []map[string]any{{
						"type":    "postback",
						"title":   truncateRunes(buttonTitle, 20),
						"payload": payload,
					}},
				},
			},
		},
	}
	return c.request(ctx, http.MethodPost, c.base()+"/"+igAccountID+"/messages", accessToken, body)
}

// GetUserFollowStatus checks whether a user follows the business account.
// Calls GET /{recipientId}?fields=is_user_follow_business.
// Returns true/false, or nil if the field is not available (fail-open).
func (c *Client) GetUserFollowStatus(ctx context.Context, accessToken, recipientID string) (*bool, error) {
	if c == nil || c.HTTP == nil {
		return nil, fmt.Errorf("meta client not configured")
	}
	rawURL := c.base() + "/" + recipientID + "?fields=is_user_follow_business&access_token=" + accessToken
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, WrapRequestError(err)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, WrapRequestError(err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, WrapRequestError(err)
	}
	var data map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &data); err != nil {
			return nil, WrapRequestError(fmt.Errorf("decode meta response: %w", err))
		}
	}
	if data == nil {
		data = map[string]any{}
	}
	out, err := Handle(data, resp.StatusCode)
	if err != nil {
		return nil, err
	}
	// is_user_follow_business may be absent or null — fail-open
	if v, ok := out["is_user_follow_business"]; ok {
		if b, ok := v.(bool); ok {
			return &b, nil
		}
	}
	return nil, nil
}

// SendCommentReply posts a public reply on a comment.
func (c *Client) SendCommentReply(ctx context.Context, commentID, message, accessToken string) (map[string]any, error) {
	body := map[string]any{"message": message}
	return c.request(ctx, http.MethodPost, c.base()+"/"+commentID+"/replies", accessToken, body)
}

// RefreshLongLivedToken refreshes an Instagram long-lived user access token.
func (c *Client) RefreshLongLivedToken(ctx context.Context, token string) (accessToken string, expiresIn int, err error) {
	if c == nil || c.HTTP == nil {
		return "", 0, fmt.Errorf("meta client not configured")
	}
	rawURL := c.base() + "/refresh_access_token?grant_type=ig_refresh_token&access_token=" + token
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", 0, WrapRequestError(err)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", 0, WrapRequestError(err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", 0, WrapRequestError(err)
	}
	var data map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &data); err != nil {
			return "", 0, WrapRequestError(fmt.Errorf("decode meta response: %w", err))
		}
	}
	if data == nil {
		data = map[string]any{}
	}
	out, err := Handle(data, resp.StatusCode)
	if err != nil {
		return "", 0, err
	}
	accessToken, _ = out["access_token"].(string)
	if accessToken == "" {
		return "", 0, fmt.Errorf("refresh response missing access_token")
	}
	expiresIn = 5184000
	switch v := out["expires_in"].(type) {
	case float64:
		expiresIn = int(v)
	case int:
		expiresIn = v
	}
	return accessToken, expiresIn, nil
}

func (c *Client) request(ctx context.Context, method, rawURL, accessToken string, body any) (map[string]any, error) {
	if c == nil || c.HTTP == nil {
		return nil, fmt.Errorf("meta client not configured")
	}

	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal meta body: %w", err)
		}
		reader = bytes.NewReader(payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, rawURL, reader)
	if err != nil {
		return nil, WrapRequestError(err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, WrapRequestError(err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, WrapRequestError(err)
	}

	var data map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &data); err != nil {
			return nil, WrapRequestError(fmt.Errorf("decode meta response: %w", err))
		}
	}
	if data == nil {
		data = map[string]any{}
	}
	return Handle(data, resp.StatusCode)
}

func truncateRunes(s string, max int) string {
	if max <= 0 || s == "" {
		return s
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max])
}

// Unwrap helpers so errors.As(*MetaAPIError) works through typed wrappers.
func (e *TokenExpiredError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.MetaAPIError
}

func (e *GraphRateLimitError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.MetaAPIError
}

func (e *MetaPermissionError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.MetaAPIError
}

// IsMetaAPIError reports whether err is any Meta Graph API error type.
func IsMetaAPIError(err error) bool {
	if err == nil {
		return false
	}
	var metaErr *MetaAPIError
	var tokenErr *TokenExpiredError
	var rateErr *GraphRateLimitError
	var permErr *MetaPermissionError
	return errors.As(err, &metaErr) ||
		errors.As(err, &tokenErr) ||
		errors.As(err, &rateErr) ||
		errors.As(err, &permErr)
}

// IsTokenExpired reports whether err is a TokenExpiredError.
func IsTokenExpired(err error) bool {
	var e *TokenExpiredError
	return errors.As(err, &e)
}

// IsGraphRateLimit reports whether err is a GraphRateLimitError.
func IsGraphRateLimit(err error) bool {
	var e *GraphRateLimitError
	return errors.As(err, &e)
}
