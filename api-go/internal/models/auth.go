package models

import (
	"fmt"
	"time"
)

// LoginRequest is the body for POST /login.
type LoginRequest struct {
	ClerkID  string `json:"clerk_id" binding:"required"`
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// InstagramProfile matches the FastAPI /profile and /login response shape from instagrapi.
type InstagramProfile struct {
	PK             any    `json:"pk"`
	Username       string `json:"username"`
	FullName       string `json:"full_name"`
	Biography      string `json:"biography"`
	ExternalURL    string `json:"external_url"`
	FollowerCount  int    `json:"follower_count"`
	FollowingCount int    `json:"following_count"`
	MediaCount     int    `json:"media_count"`
	IsPrivate      bool   `json:"is_private"`
	IsVerified     bool   `json:"is_verified"`
	ProfilePicURL  string `json:"profile_pic_url"`
	IsBusiness     bool   `json:"is_business"`
}

// InstagramMediaItem matches the FastAPI media item shape.
type InstagramMediaItem struct {
	PK           any     `json:"pk"`
	CaptionText  string  `json:"caption_text"`
	MediaType    int     `json:"media_type"`
	ThumbnailURL string  `json:"thumbnail_url"`
	MediaURL     string  `json:"media_url"`
	Permalink    string  `json:"permalink"`
	TakenAt      *string `json:"taken_at"`
	LikeCount    int     `json:"like_count"`
	CommentCount int     `json:"comment_count"`
	ViewCount    int     `json:"view_count"`
	PlayCount    int     `json:"play_count"`
}

// MediaListResponse is the FastAPI / Expo envelope for GET /media.
type MediaListResponse struct {
	Data []InstagramMediaItem `json:"data"`
}

// DisconnectResponse is the body for POST /disconnect.
type DisconnectResponse struct {
	Status string `json:"status"`
}

// ProfileToCreatorDict maps an Instagram profile to the Appwrite Creator schema.
func ProfileToCreatorDict(clerkUserID string, profile InstagramProfile) map[string]any {
	accountType := "personal"
	if profile.IsBusiness {
		accountType = "business"
	}
	now := time.Now().UTC().Format(time.RFC3339)
	pk := ""
	if profile.PK != nil {
		pk = fmt.Sprint(profile.PK)
	}

	return map[string]any{
		"clerk_user_id":        clerkUserID,
		"ig_user_id":           pk,
		"ig_scoped_id":         pk,
		"ig_username":          profile.Username,
		"username":             profile.Username,
		"full_name":            profile.FullName,
		"bio":                  profile.Biography,
		"external_url":         profile.ExternalURL,
		"profile_pic_url":      profile.ProfilePicURL,
		"follower_count":       profile.FollowerCount,
		"following_count":      profile.FollowingCount,
		"media_count":          profile.MediaCount,
		"post_count":           profile.MediaCount,
		"is_verified":          profile.IsVerified,
		"is_business":          profile.IsBusiness,
		"account_type":         accountType,
		"is_onboarded":         true,
		"niche":                "",
		"creator_tier":         "emerging_viral",
		"detected_language":    "",
		"language_hint":        "",
		"region":               "",
		"detected_region":      "",
		"has_brand_experience": false,
		"has_brand_signals":    false,
		"brand_signal_count":   0,
		"avg_reel_views":       0,
		"avg_views":            0,
		"engagement_rate":      0.0,
		"reach_ratio":          0.0,
		"created_at":           now,
		"last_synced_at":       now,
	}
}
