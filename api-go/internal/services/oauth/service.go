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
)

const (
	DefaultGraphAPIVersion = "v25.0"
	OAuthTokenURL          = "https://api.instagram.com/oauth/access_token"
	DefaultExpiresInSecs   = 5184000 // 60 days
)

// HTTPClient is injectable for unit tests (no real Meta calls).
type HTTPClient interface {
	Do(req *http.Request) (*http.Response, error)
}

type TokenResult struct {
	AccessToken string
	UserID      string
	ExpiresIn   *int
	Raw         map[string]any
}

type Profile struct {
	ID                string
	Username          string
	Name              string
	AccountType       string
	MediaCount        int
	FollowersCount    int
	FollowsCount      int
	ProfilePictureURL string
	Biography         string
	Website           string
	Raw               map[string]any
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
		cfg.GraphVersion = DefaultGraphAPIVersion
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
	token, _ := data["access_token"].(string)
	if token == "" {
		return TokenResult{}, fmt.Errorf("missing access_token in response: %v", data)
	}
	return TokenResult{
		AccessToken: token,
		UserID:      asString(data["user_id"]),
		Raw:         data,
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
		Raw:         data,
	}, nil
}

func (s *Service) FetchInstagramProfile(ctx context.Context, accessToken string) (Profile, error) {
	fields := "id,username,name,account_type,media_count,followers_count,follows_count,profile_picture_url,biography,website"
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

	followers, _ := asInt(data["followers_count"])
	follows, _ := asInt(data["follows_count"])
	media, _ := asInt(data["media_count"])

	return Profile{
		ID:                id,
		Username:          asString(data["username"]),
		Name:              asString(data["name"]),
		AccountType:       asString(data["account_type"]),
		MediaCount:        media,
		FollowersCount:    followers,
		FollowsCount:      follows,
		ProfilePictureURL: asString(data["profile_picture_url"]),
		Biography:         asString(data["biography"]),
		Website:           asString(data["website"]),
		Raw:               data,
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

	return map[string]any{
		"clerk_user_id":    clerkID,
		"ig_user_id":       profile.ID,
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
		"ig_session_json":  nil,
		"token_expires_at": tokenExpiresAt,
		"updated_at":       now.UTC().Format(time.RFC3339Nano),
	}
}

func (s *Service) doJSON(req *http.Request) (map[string]any, error) {
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("http %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var data map[string]any
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, err
	}
	return data, nil
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
