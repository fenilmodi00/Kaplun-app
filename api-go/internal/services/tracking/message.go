package tracking

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"regexp"
	"strings"
)

var (
	urlPattern      = regexp.MustCompile(`(?i)https?://[^\s<>\"')\]]+`)
	usernamePattern = regexp.MustCompile(`(?i)\{username\}`)
	linkPattern     = regexp.MustCompile(`(?i)\{link\}`)
)

// NewSlug generates an 8-char URL-safe alphanumeric slug.
func NewSlug() (string, error) {
	for i := 0; i < 3; i++ {
		buf := make([]byte, 6)
		if _, err := rand.Read(buf); err != nil {
			continue
		}
		slug := base64.RawURLEncoding.EncodeToString(buf)
		slug = strings.ReplaceAll(slug, "-", "")
		slug = strings.ReplaceAll(slug, "_", "")
		if len(slug) > 8 {
			slug = slug[:8]
		}
		if slug != "" {
			return slug, nil
		}
	}
	return "", errors.New("failed to generate tracked-link slug")
}

// ExtractFirstURL returns the first URL in message, or "" if none.
func ExtractFirstURL(message string) string {
	m := urlPattern.FindString(message)
	if m == "" {
		return ""
	}
	return strings.TrimRight(m, ".,!?;:")
}

// RenderMessageWithTracking personalizes {username}/{link} and swaps destination URLs.
func RenderMessageWithTracking(message, commenterName, trackedURL, destinationURL string) string {
	name := commenterName
	if name == "" {
		name = "there"
	}
	rendered := usernamePattern.ReplaceAllString(message, name)
	if trackedURL == "" || destinationURL == "" {
		return rendered
	}
	if linkPattern.MatchString(rendered) {
		return linkPattern.ReplaceAllString(rendered, trackedURL)
	}
	if strings.Contains(rendered, destinationURL+"/") {
		return strings.ReplaceAll(rendered, destinationURL+"/", trackedURL)
	}
	if strings.Contains(rendered, destinationURL) {
		return strings.ReplaceAll(rendered, destinationURL, trackedURL)
	}
	return strings.ReplaceAll(rendered, strings.TrimRight(destinationURL, "/"), trackedURL)
}
