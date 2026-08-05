package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"kaplun/api-go/internal/platform/meta"
)

const (
	OAuthTokenURL        = "https://api.instagram.com/oauth/access_token"
	DefaultExpiresInSecs = 5184000 // 60 days
)

// HTTPClient is injectable for unit tests (no real Meta calls).
type HTTPClient interface {
	Do(req *http.Request) (*http.Response, error)
}

type TokenResult struct {
	AccessToken string
	UserID      string
	ExpiresIn   *int
}

type Profile struct {
	ID                string // app-scoped id from /me?fields=id
	UserID            string // professional account id from /me?fields=user_id (webhooks + messaging)
	Username          string
	Name              string
	AccountType       string
	MediaCount        int
	FollowersCount    int
	FollowsCount      int
	ProfilePictureURL string
	Biography         string
	Website           string
}

type Config struct {
	AppID        string
	AppSecret    string
	RedirectURI  string
	GraphVersion string
}

type Service struct {
	client HTTPClient
	cfg    Config
}

func NewService(client HTTPClient, cfg Config) *Service {
	if client == nil {
		client = http.DefaultClient
	}
	if cfg.GraphVersion == "" {
		cfg.GraphVersion = meta.GraphAPIVersion
	}
	return &Service{client: client, cfg: cfg}
}

func (s *Service) ExchangeCodeForShortToken(ctx context.Context, code string) (TokenResult, error) {
	form := url.Values{}
	form.Set("client_id", s.cfg.AppID)
	form.Set("client_secret", s.cfg.AppSecret)
	form.Set("grant_type", "authorization_code")
	form.Set("redirect_uri", s.cfg.RedirectURI)
	form.Set("code", code)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, OAuthTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return TokenResult{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	data, err := s.doJSON(req)
	if err != nil {
		return TokenResult{}, err
	}
	// Instagram Login returns { "data": [ { "access_token", "user_id", ... } ] }.
	// Older flat { "access_token", "user_id" } responses are still accepted.
	token, userID := extractShortLivedToken(data)
	if token == "" {
		return TokenResult{}, fmt.Errorf("missing access_token in response: %v", data)
	}
	return TokenResult{
		AccessToken: token,
		UserID:      userID,
	}, nil
}

func (s *Service) ExchangeForLongToken(ctx context.Context, shortToken string) (TokenResult, error) {
	endpoint := fmt.Sprintf(
		"https://graph.instagram.com/%s/access_token?grant_type=ig_exchange_token&client_secret=%s&access_token=%s",
		s.cfg.GraphVersion,
		url.QueryEscape(s.cfg.AppSecret),
		url.QueryEscape(shortToken),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return TokenResult{}, err
	}

	data, err := s.doJSON(req)
	if err != nil {
		return TokenResult{}, err
	}
	token, _ := data["access_token"].(string)
	if token == "" {
		return TokenResult{}, fmt.Errorf("missing access_token in response: %v", data)
	}
	var expires *int
	if v, ok := asInt(data["expires_in"]); ok {
		expires = &v
	}
	return TokenResult{
		AccessToken: token,
		ExpiresIn:   expires,
	}, nil
}

func (s *Service) FetchInstagramProfile(ctx context.Context, accessToken string) (Profile, error) {
	fields := "id,user_id,username,name,account_type,media_count,followers_count,follows_count,profile_picture_url,biography,website"
	endpoint := fmt.Sprintf(
		"https://graph.instagram.com/%s/me?fields=%s&access_token=%s",
		s.cfg.GraphVersion,
		fields,
		url.QueryEscape(accessToken),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Profile{}, err
	}

	data, err := s.doJSON(req)
	if err != nil {
		return Profile{}, err
	}
	if errVal, ok := data["error"]; ok {
		return Profile{}, fmt.Errorf("instagram API error: %v", errVal)
	}
	id, _ := data["id"].(string)
	if id == "" {
		return Profile{}, fmt.Errorf("missing id in profile response: %v", data)
	}
	userID := asString(data["user_id"])

	followers, _ := asInt(data["followers_count"])
	follows, _ := asInt(data["follows_count"])
	media, _ := asInt(data["media_count"])

	return Profile{
		ID:                id,
		UserID:            userID,
		Username:          asString(data["username"]),
		Name:              asString(data["name"]),
		AccountType:       asString(data["account_type"]),
		MediaCount:        media,
		FollowersCount:    followers,
		FollowsCount:      follows,
		ProfilePictureURL: asString(data["profile_picture_url"]),
		Biography:         asString(data["biography"]),
		Website:           asString(data["website"]),
	}, nil
}

func CalculateTokenExpiry(expiresIn *int, now time.Time) string {
	secs := DefaultExpiresInSecs
	if expiresIn != nil {
		secs = *expiresIn
	}
	return now.UTC().Add(time.Duration(secs) * time.Second).Format(time.RFC3339Nano)
}

// BuildCreatorData maps an Instagram profile to the Appwrite creators schema.
func BuildCreatorData(profile Profile, accessToken, tokenExpiresAt, clerkID string, now time.Time) map[string]any {
	accountTypeRaw := strings.ToLower(profile.AccountType)
	accountType := "personal"
	switch accountTypeRaw {
	case "business", "creator", "personal":
		accountType = accountTypeRaw
	case "professional":
		accountType = "creator"
	}

	// OpenReply / Meta Instagram Login: webhooks put professional `user_id`
	// in entry.id and the messaging API keys off the same id. Fall back to
	// app-scoped `id` only when user_id is absent.
	professionalID := profile.UserID
	if professionalID == "" {
		professionalID = profile.ID
	}

	return map[string]any{
		"clerk_user_id":    clerkID,
		"ig_user_id":       professionalID,
		"ig_scoped_id":     profile.ID,
		"username":         profile.Username,
		"full_name":        profile.Name,
		"bio":              profile.Biography,
		"external_url":     profile.Website,
		"profile_pic_url":  profile.ProfilePictureURL,
		"follower_count":   profile.FollowersCount,
		"following_count":  profile.FollowsCount,
		"post_count":       profile.MediaCount,
		"is_verified":      false,
		"is_business":      accountType == "business",
		"account_type":     accountType,
		"is_onboarded":     true,
		"access_token":     accessToken,
		"token_expires_at": tokenExpiresAt,
		"updated_at":       now.UTC().Format(time.RFC3339Nano),
	}
}

func (s *Service) doJSON(req *http.Request) (map[string]any, error) {
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s %s: %w", req.Method, redactURL(req.URL), err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%s %s: read body: %w", req.Method, redactURL(req.URL), err)
	}
	trimmed := strings.TrimSpace(string(body))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s %s → http %d: %s", req.Method, redactURL(req.URL), resp.StatusCode, truncateBody(trimmed, 800))
	}

	var data map[string]any
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("%s %s: decode json: %w; body=%s", req.Method, redactURL(req.URL), err, truncateBody(trimmed, 200))
	}
	return data, nil
}

// redactURL strips secrets from Meta URLs before they land in error strings/logs.
func redactURL(u *url.URL) string {
	if u == nil {
		return ""
	}
	clone := *u
	q := clone.Query()
	for _, key := range []string{"access_token", "client_secret", "code"} {
		if q.Has(key) {
			q.Set(key, "[redacted]")
		}
	}
	clone.RawQuery = q.Encode()
	return clone.String()
}

func truncateBody(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

// extractShortLivedToken reads access_token (+ user_id) from either the
// Instagram Login envelope or a legacy flat token payload.
func extractShortLivedToken(data map[string]any) (token, userID string) {
	if token, _ = data["access_token"].(string); token != "" {
		return token, asString(data["user_id"])
	}
	rawData, ok := data["data"]
	if !ok {
		return "", ""
	}
	switch items := rawData.(type) {
	case []any:
		if len(items) == 0 {
			return "", ""
		}
		item, _ := items[0].(map[string]any)
		if item == nil {
			return "", ""
		}
		token, _ = item["access_token"].(string)
		return token, asString(item["user_id"])
	case []map[string]any:
		if len(items) == 0 {
			return "", ""
		}
		token, _ = items[0]["access_token"].(string)
		return token, asString(items[0]["user_id"])
	default:
		return "", ""
	}
}

func asString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case float64:
		return fmt.Sprintf("%.0f", v)
	case json.Number:
		return v.String()
	default:
		return ""
	}
}

func asInt(value any) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	case json.Number:
		i, err := v.Int64()
		if err != nil {
			return 0, false
		}
		return int(i), true
	default:
		return 0, false
	}
}
