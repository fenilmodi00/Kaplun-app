package session

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	ig "github.com/felipeinf/instago"
	"github.com/felipeinf/instago/igerrors"

	"kaplun/api-go/internal/models"
)

// ErrInsightsUnavailable is returned when account insights cannot be fetched.
var ErrInsightsUnavailable = errors.New("insights unavailable")

// Client is the Instagram session runtime used by SessionManager.
// Concrete implementations wrap instago; tests inject fakes.
type Client interface {
	Login(username, password string) error
	IsLoggedIn() bool
	AuthFailed() bool
	DumpSettingsJSON() (string, error)
	RestoreSession(settingsJSON string) (bool, error)
	FetchProfile() (*models.InstagramProfile, error)
	FetchMedia(amount int) ([]models.InstagramMediaItem, error)
	FetchInsights() (map[string]any, error)
	Logout() error
}

// ClientFactory creates a new Client for a clerk user id.
type ClientFactory func(clerkUserID string) Client

// InstagoClient wraps github.com/felipeinf/instago (package ig).
type InstagoClient struct {
	cl              *ig.Client
	sessionFilePath string
	mu              sync.Mutex
	loggedIn        bool
	authFailed      bool
}

func NewInstagoClient(sessionFilePath string) *InstagoClient {
	return &InstagoClient{
		cl:              ig.NewClient(),
		sessionFilePath: sessionFilePath,
	}
}

func DefaultClientFactory(sessionsDir string) ClientFactory {
	return func(clerkUserID string) Client {
		path := filepath.Join(sessionsDir, clerkUserID+".json")
		return NewInstagoClient(path)
	}
}

func (c *InstagoClient) Login(username, password string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.loggedIn {
		return nil
	}

	if c.sessionFilePath != "" {
		if _, err := os.Stat(c.sessionFilePath); err == nil {
			if err := c.cl.LoadSettings(c.sessionFilePath, false); err == nil {
				c.loggedIn = true
				c.authFailed = false
				return nil
			}
		}
	}

	if err := c.cl.Login(username, password, ""); err != nil {
		c.authFailed = true
		return err
	}

	if c.sessionFilePath != "" {
		_ = os.MkdirAll(filepath.Dir(c.sessionFilePath), 0o700)
		_ = c.cl.DumpSettings(c.sessionFilePath)
	}

	c.loggedIn = true
	c.authFailed = false
	return nil
}

func (c *InstagoClient) IsLoggedIn() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.loggedIn
}

func (c *InstagoClient) AuthFailed() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.authFailed
}

func (c *InstagoClient) DumpSettingsJSON() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.sessionFilePath == "" {
		return "", errors.New("session file path is required to dump settings")
	}
	if err := os.MkdirAll(filepath.Dir(c.sessionFilePath), 0o700); err != nil {
		return "", err
	}
	if err := c.cl.DumpSettings(c.sessionFilePath); err != nil {
		return "", err
	}
	b, err := os.ReadFile(c.sessionFilePath)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (c *InstagoClient) RestoreSession(settingsJSON string) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	var probe map[string]any
	if err := json.Unmarshal([]byte(settingsJSON), &probe); err != nil {
		c.authFailed = true
		return false, err
	}

	if c.sessionFilePath == "" {
		c.authFailed = true
		return false, errors.New("session file path is required to restore settings")
	}
	if err := os.MkdirAll(filepath.Dir(c.sessionFilePath), 0o700); err != nil {
		c.authFailed = true
		return false, err
	}
	if err := os.WriteFile(c.sessionFilePath, []byte(settingsJSON), 0o600); err != nil {
		c.authFailed = true
		return false, err
	}
	if err := c.cl.LoadSettings(c.sessionFilePath, false); err != nil {
		c.authFailed = true
		return false, err
	}

	acc, err := c.cl.AccountInfo()
	if err != nil {
		var loginRequired *igerrors.LoginRequired
		if errors.As(err, &loginRequired) {
			c.authFailed = true
			c.loggedIn = false
			return false, nil
		}
		c.authFailed = true
		c.loggedIn = false
		return false, nil
	}
	if acc.PK == "" && acc.Username == "" {
		c.authFailed = true
		c.loggedIn = false
		return false, nil
	}

	c.loggedIn = true
	c.authFailed = false
	return true, nil
}

func (c *InstagoClient) FetchProfile() (*models.InstagramProfile, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	acc, err := c.cl.AccountInfo()
	if err != nil {
		return nil, c.mapAuthError(err)
	}

	pk, _ := strconv.ParseInt(acc.PK, 10, 64)
	user, err := c.cl.UserInfo(pk, false)
	if err != nil {
		// Fall back to account fields when full user info fails for non-auth reasons.
		var loginRequired *igerrors.LoginRequired
		if errors.As(err, &loginRequired) {
			return nil, c.mapAuthError(err)
		}
		c.authFailed = false
		return &models.InstagramProfile{
			PK:            acc.PK,
			Username:      acc.Username,
			FullName:      acc.FullName,
			Biography:     acc.Biography,
			ExternalURL:   acc.ExternalURL,
			ProfilePicURL: "",
		}, nil
	}

	c.authFailed = false
	pic := user.ProfilePicURLHD
	if pic == "" {
		pic = user.ProfilePicURL
	}
	return &models.InstagramProfile{
		PK:             strconv.FormatInt(user.PK, 10),
		Username:       user.Username,
		FullName:       user.FullName,
		Biography:      user.Biography,
		ExternalURL:    user.ExternalURL,
		FollowerCount:  user.FollowerCount,
		FollowingCount: user.FollowingCount,
		MediaCount:     user.MediaCount,
		IsPrivate:      user.IsPrivate,
		IsVerified:     user.IsVerified,
		ProfilePicURL:  pic,
		IsBusiness:     user.IsBusiness,
	}, nil
}

func (c *InstagoClient) FetchMedia(amount int) ([]models.InstagramMediaItem, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if amount <= 0 {
		amount = 25
	}

	acc, err := c.cl.AccountInfo()
	if err != nil {
		return nil, c.mapAuthError(err)
	}
	pk, err := strconv.ParseInt(acc.PK, 10, 64)
	if err != nil || pk == 0 {
		c.authFailed = true
		return nil, &igerrors.LoginRequired{ClientError: igerrors.ClientError{Message: "missing user id"}}
	}

	medias, err := c.cl.UserMedias(pk, amount)
	if err != nil {
		return nil, c.mapAuthError(err)
	}

	c.authFailed = false
	out := make([]models.InstagramMediaItem, 0, len(medias))
	for _, m := range medias {
		var takenAt *string
		if m.TakenAt > 0 {
			iso := time.Unix(m.TakenAt, 0).UTC().Format(time.RFC3339)
			takenAt = &iso
		}
		permalink := ""
		if m.Code != "" {
			permalink = fmt.Sprintf("https://www.instagram.com/p/%s/", m.Code)
		}
		out = append(out, models.InstagramMediaItem{
			PK:           strconv.FormatInt(m.PK, 10),
			CaptionText:  m.CaptionText,
			MediaType:    m.MediaType,
			ThumbnailURL: m.ThumbnailURL,
			MediaURL:     m.VideoURL,
			Permalink:    permalink,
			TakenAt:      takenAt,
			LikeCount:    m.LikeCount,
			CommentCount: m.CommentCount,
			ViewCount:    0,
			PlayCount:    m.PlayCount,
		})
	}
	return out, nil
}

func (c *InstagoClient) FetchInsights() (map[string]any, error) {
	// instago does not expose insights_account / Graph insights equivalents.
	return nil, ErrInsightsUnavailable
}

func (c *InstagoClient) Logout() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	_, err := c.cl.Logout()
	c.loggedIn = false
	if c.sessionFilePath != "" {
		_ = os.Remove(c.sessionFilePath)
	}
	if err != nil {
		return err
	}
	return nil
}

func (c *InstagoClient) mapAuthError(err error) error {
	var loginRequired *igerrors.LoginRequired
	if errors.As(err, &loginRequired) {
		c.authFailed = true
		c.loggedIn = false
	}
	return err
}
