package handlers

import (
	"context"
	"encoding/json"
	"html"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/services/oauth"
)

type OAuthTokenExchanger interface {
	ExchangeCodeForShortToken(ctx context.Context, code string) (oauth.TokenResult, error)
	ExchangeForLongToken(ctx context.Context, shortToken string) (oauth.TokenResult, error)
	FetchInstagramProfile(ctx context.Context, accessToken string) (oauth.Profile, error)
}

type CreatorProfileStore interface {
	StoreCreatorProfile(ctx context.Context, clerkID string, data map[string]any) (rowID string, ok bool, err error)
}

type WebhookSubscriber interface {
	SubscribeToWebhooks(ctx context.Context, igAccountID, accessToken string, fields []string) error
}

type InstagramOAuthHandler struct {
	OAuth       OAuthTokenExchanger
	Store       CreatorProfileStore
	Subscriber  WebhookSubscriber
	AppID       string
	AppSecret   string
	RedirectURI string
	Now         func() time.Time
	// InsightsFirstSync, when set, runs the first-party insights sync for the
	// freshly connected creator in a background goroutine after their profile
	// is stored — the app has data on first open instead of after the daily sweep.
	InsightsFirstSync func(ctx context.Context, creatorRowID, accessToken, igUserID string)
	logger            *slog.Logger
}

func NewInstagramOAuthHandler(
	exchanger OAuthTokenExchanger,
	store CreatorProfileStore,
	appID, appSecret, redirectURI string,
	logger *slog.Logger,
) *InstagramOAuthHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &InstagramOAuthHandler{
		OAuth:       exchanger,
		Store:       store,
		AppID:       appID,
		AppSecret:   appSecret,
		RedirectURI: redirectURI,
		Now:         time.Now,
		logger:      logger,
	}
}

func (h *InstagramOAuthHandler) Callback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	oauthErr := c.Query("error")
	errorReason := c.Query("error_reason")
	errorDescription := c.Query("error_description")

	h.logger.Info("instagram oauth callback received",
		"has_code", code != "",
		"code_len", len(code),
		"has_state", state != "",
		"oauth_error", oauthErr,
		"error_reason", errorReason,
		"error_description", errorDescription,
		"configured_app_id", h.AppID,
		"configured_redirect_uri", h.RedirectURI,
		"has_app_secret", h.AppSecret != "",
		"raw_query", c.Request.URL.RawQuery,
	)

	if oauthErr != "" {
		message := firstNonEmpty(errorDescription, errorReason, oauthErr)
		h.logger.Warn("instagram oauth denied by Meta",
			"error", oauthErr,
			"error_reason", errorReason,
			"error_description", errorDescription,
		)
		redirectURL := extractRedirectURL(state)
		if redirectURL == "" {
			redirectURL = "exp://localhost:8081"
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage(message, redirectURL)))
		return
	}

	if code == "" {
		h.logger.Warn("instagram oauth callback missing code")
		redirectURL := extractRedirectURL(state)
		if redirectURL == "" {
			redirectURL = "exp://localhost:8081"
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Missing authorization code from Instagram.", redirectURL)))
		return
	}

	if state == "" {
		h.logger.Warn("instagram oauth callback missing state")
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Missing state parameter. Please try connecting again.", "exp://localhost:8081")))
		return
	}

	var stateData map[string]any
	if err := json.Unmarshal([]byte(state), &stateData); err != nil {
		h.logger.Warn("instagram oauth invalid state json", "err", err, "state_prefix", truncateForLog(state, 80))
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Invalid state parameter. Please try connecting again.", "exp://localhost:8081")))
		return
	}

	clerkID, _ := stateData["clerk_id"].(string)
	redirectURL, _ := stateData["redirect_url"].(string)
	if redirectURL == "" {
		redirectURL = "exp://localhost:8081"
	}
	if clerkID == "" {
		h.logger.Warn("instagram oauth state missing clerk_id")
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Missing user identifier. Please try connecting again.", redirectURL)))
		return
	}

	if h.AppID == "" || h.AppSecret == "" || h.RedirectURI == "" {
		h.logger.Error("instagram oauth server misconfigured",
			"has_app_id", h.AppID != "",
			"has_app_secret", h.AppSecret != "",
			"has_redirect_uri", h.RedirectURI != "",
		)
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Server configuration error. Please contact support.", redirectURL)))
		return
	}

	h.logger.Info("instagram oauth exchanging short token",
		"clerk_user_id", clerkID,
		"app_id", h.AppID,
		"redirect_uri", h.RedirectURI,
	)
	shortToken, err := h.OAuth.ExchangeCodeForShortToken(c.Request.Context(), code)
	if err != nil {
		h.logger.Error("instagram oauth short-token exchange failed",
			"clerk_user_id", clerkID,
			"app_id", h.AppID,
			"redirect_uri", h.RedirectURI,
			"err", err,
		)
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to exchange authorization code: "+err.Error(), redirectURL)))
		return
	}
	h.logger.Info("instagram oauth short token ok",
		"clerk_user_id", clerkID,
		"user_id", shortToken.UserID,
		"token_len", len(shortToken.AccessToken),
	)

	h.logger.Info("instagram oauth exchanging long token", "clerk_user_id", clerkID)
	longToken, err := h.OAuth.ExchangeForLongToken(c.Request.Context(), shortToken.AccessToken)
	if err != nil {
		h.logger.Error("instagram oauth long-token exchange failed",
			"clerk_user_id", clerkID,
			"err", err,
		)
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to obtain long-lived token: "+err.Error(), redirectURL)))
		return
	}
	h.logger.Info("instagram oauth long token ok",
		"clerk_user_id", clerkID,
		"token_len", len(longToken.AccessToken),
		"expires_in", longToken.ExpiresIn,
	)

	now := time.Now()
	if h.Now != nil {
		now = h.Now()
	}
	tokenExpiresAt := oauth.CalculateTokenExpiry(longToken.ExpiresIn, now)

	h.logger.Info("instagram oauth fetching profile", "clerk_user_id", clerkID)
	profile, err := h.OAuth.FetchInstagramProfile(c.Request.Context(), longToken.AccessToken)
	if err != nil {
		h.logger.Error("instagram oauth profile fetch failed",
			"clerk_user_id", clerkID,
			"err", err,
		)
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to fetch Instagram profile: "+err.Error(), redirectURL)))
		return
	}
	username := profile.Username
	if username == "" {
		username = profile.ID
	}
	h.logger.Info("instagram oauth profile ok",
		"clerk_user_id", clerkID,
		"ig_user_id", firstNonEmpty(profile.UserID, profile.ID),
		"ig_scoped_id", profile.ID,
		"username", username,
		"account_type", profile.AccountType,
	)

	// Store the long-lived token in plaintext. The Expo app reads this token
	// directly from the creators row and calls graph.instagram.com, so it must
	// be usable without backend decryption.
	creatorData := oauth.BuildCreatorData(profile, longToken.AccessToken, tokenExpiresAt, clerkID, now)
	rowID, ok, err := h.Store.StoreCreatorProfile(c.Request.Context(), clerkID, creatorData)
	if err != nil {
		h.logger.Error("instagram oauth store profile failed",
			"clerk_user_id", clerkID,
			"ig_user_id", firstNonEmpty(profile.UserID, profile.ID),
			"err", err,
		)
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to save your profile: "+err.Error(), redirectURL)))
		return
	}
	if !ok {
		h.logger.Error("instagram oauth store profile returned false",
			"clerk_user_id", clerkID,
			"ig_user_id", firstNonEmpty(profile.UserID, profile.ID),
		)
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to save your profile. Please try again.", redirectURL)))
		return
	}
	h.logger.Info("instagram oauth creator profile saved",
		"clerk_user_id", clerkID,
		"ig_user_id", firstNonEmpty(profile.UserID, profile.ID),
		"ig_scoped_id", profile.ID,
		"username", username,
		"token_expires_at", tokenExpiresAt,
	)

	if h.InsightsFirstSync != nil && rowID != "" {
		accessToken := longToken.AccessToken
		igUserID := firstNonEmpty(profile.UserID, profile.ID)
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			defer cancel()
			defer func() {
				if rec := recover(); rec != nil {
					h.logger.Error("insights first sync panic recovered", "creator_id", rowID, "recover", rec)
				}
			}()
			h.InsightsFirstSync(ctx, rowID, accessToken, igUserID)
		}()
	}

	if h.Subscriber != nil {
		// OpenReply / Meta: subscribe with professional user_id (webhook entry.id).
		subscribeID := firstNonEmpty(profile.UserID, profile.ID)
		if subErr := h.Subscriber.SubscribeToWebhooks(
			c.Request.Context(),
			subscribeID,
			longToken.AccessToken,
			[]string{"comments", "messages", "messaging_postbacks", "mentions"},
		); subErr != nil {
			h.logger.Warn("instagram oauth webhook subscribe failed",
				"clerk_user_id", clerkID,
				"ig_user_id", subscribeID,
				"err", subErr,
			)
		} else {
			h.logger.Info("instagram oauth webhook subscribed",
				"clerk_user_id", clerkID,
				"ig_user_id", subscribeID,
			)
		}
	}

	h.logger.Info("instagram oauth success",
		"clerk_user_id", clerkID,
		"username", username,
		"redirect_url", redirectURL,
	)
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(successPage(username, redirectURL)))
}

func extractRedirectURL(state string) string {
	if state == "" {
		return ""
	}
	var data map[string]any
	if err := json.Unmarshal([]byte(state), &data); err != nil {
		return ""
	}
	url, _ := data["redirect_url"].(string)
	return url
}

func cleanRedirectURL(redirectURL string) string {
	if strings.HasPrefix(redirectURL, "exp://") {
		parsed, err := url.Parse(redirectURL)
		if err != nil {
			return redirectURL
		}
		return "exp://" + parsed.Host
	}
	return html.EscapeString(redirectURL)
}

func successPage(username, redirectURL string) string {
	safeUsername := html.EscapeString(username)
	cleanURL := cleanRedirectURL(redirectURL)
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="2;url=` + cleanURL + `?status=success">
    <title>Connected Successfully</title>
</head>
<body>
    <div>
        <h1>Instagram Connected</h1>
        <p>Your account <strong>@` + safeUsername + `</strong> has been connected successfully.</p>
        <p>Redirecting back to the app...</p>
    </div>
</body>
</html>`
}

func errorPage(message, redirectURL string) string {
	safeMessage := html.EscapeString(message)
	cleanURL := cleanRedirectURL(redirectURL)
	encodedMessage := url.Values{"message": {safeMessage}}.Encode()
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="3;url=` + cleanURL + `?status=error&` + encodedMessage + `">
    <title>Connection Failed</title>
</head>
<body>
    <div>
        <h1>Connection Failed</h1>
        <p>` + safeMessage + `</p>
        <p>Redirecting back to the app...</p>
    </div>
</body>
</html>`
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func truncateForLog(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
