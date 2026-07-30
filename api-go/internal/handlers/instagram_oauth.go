package handlers

import (
	"context"
	"encoding/json"
	"html"
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
	StoreCreatorProfile(ctx context.Context, clerkID string, data map[string]any) (bool, error)
}

type OAuthTokenCrypto interface {
	Encrypt(plaintext string) (string, error)
}

type WebhookSubscriber interface {
	SubscribeToWebhooks(ctx context.Context, igAccountID, accessToken string, fields []string) error
}

type InstagramOAuthHandler struct {
	OAuth       OAuthTokenExchanger
	Store       CreatorProfileStore
	Crypto      OAuthTokenCrypto
	Subscriber  WebhookSubscriber
	AppID       string
	AppSecret   string
	RedirectURI string
	Now         func() time.Time
}

func NewInstagramOAuthHandler(
	exchanger OAuthTokenExchanger,
	store CreatorProfileStore,
	crypto OAuthTokenCrypto,
	appID, appSecret, redirectURI string,
) *InstagramOAuthHandler {
	return &InstagramOAuthHandler{
		OAuth:       exchanger,
		Store:       store,
		Crypto:      crypto,
		AppID:       appID,
		AppSecret:   appSecret,
		RedirectURI: redirectURI,
		Now:         time.Now,
	}
}

func (h *InstagramOAuthHandler) Callback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	oauthErr := c.Query("error")
	errorReason := c.Query("error_reason")
	errorDescription := c.Query("error_description")

	if oauthErr != "" {
		message := firstNonEmpty(errorDescription, errorReason, oauthErr)
		redirectURL := extractRedirectURL(state)
		if redirectURL == "" {
			redirectURL = "exp://localhost:8081"
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage(message, redirectURL)))
		return
	}

	if code == "" {
		redirectURL := extractRedirectURL(state)
		if redirectURL == "" {
			redirectURL = "exp://localhost:8081"
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Missing authorization code from Instagram.", redirectURL)))
		return
	}

	if state == "" {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Missing state parameter. Please try connecting again.", "exp://localhost:8081")))
		return
	}

	var stateData map[string]any
	if err := json.Unmarshal([]byte(state), &stateData); err != nil {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Invalid state parameter. Please try connecting again.", "exp://localhost:8081")))
		return
	}

	clerkID, _ := stateData["clerk_id"].(string)
	redirectURL, _ := stateData["redirect_url"].(string)
	if redirectURL == "" {
		redirectURL = "exp://localhost:8081"
	}
	if clerkID == "" {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Missing user identifier. Please try connecting again.", redirectURL)))
		return
	}

	if h.AppID == "" || h.AppSecret == "" || h.RedirectURI == "" {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Server configuration error. Please contact support.", redirectURL)))
		return
	}

	shortToken, err := h.OAuth.ExchangeCodeForShortToken(c.Request.Context(), code)
	if err != nil {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to exchange authorization code: "+err.Error(), redirectURL)))
		return
	}

	longToken, err := h.OAuth.ExchangeForLongToken(c.Request.Context(), shortToken.AccessToken)
	if err != nil {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to obtain long-lived token: "+err.Error(), redirectURL)))
		return
	}

	now := time.Now()
	if h.Now != nil {
		now = h.Now()
	}
	tokenExpiresAt := oauth.CalculateTokenExpiry(longToken.ExpiresIn, now)

	profile, err := h.OAuth.FetchInstagramProfile(c.Request.Context(), longToken.AccessToken)
	if err != nil {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to fetch Instagram profile: "+err.Error(), redirectURL)))
		return
	}
	username := profile.Username
	if username == "" {
		username = profile.ID
	}

	encryptedToken := longToken.AccessToken
	if h.Crypto != nil {
		enc, encErr := h.Crypto.Encrypt(longToken.AccessToken)
		if encErr != nil {
			c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to save your profile: "+encErr.Error(), redirectURL)))
			return
		}
		encryptedToken = enc
	}

	creatorData := oauth.BuildCreatorData(profile, encryptedToken, tokenExpiresAt, clerkID, now)
	ok, err := h.Store.StoreCreatorProfile(c.Request.Context(), clerkID, creatorData)
	if err != nil {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to save your profile: "+err.Error(), redirectURL)))
		return
	}
	if !ok {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(errorPage("Failed to save your profile. Please try again.", redirectURL)))
		return
	}

	if h.Subscriber != nil {
		_ = h.Subscriber.SubscribeToWebhooks(
			c.Request.Context(),
			profile.ID,
			longToken.AccessToken,
			[]string{"comments", "messages", "messaging_postbacks"},
		)
	}

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
