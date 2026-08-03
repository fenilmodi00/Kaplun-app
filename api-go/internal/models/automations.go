package models

// Automation matches Expo Automation / FastAPI automation row shape.
type Automation struct {
	ID                 string   `json:"$id"`
	ClerkUserID        string   `json:"clerk_user_id"`
	IGUserID           string   `json:"ig_user_id"`
	Name               string   `json:"name"`
	TargetType         string   `json:"target_type"`
	MediaIDs           []string `json:"media_ids"`
	BoundMediaIDs      []string `json:"bound_media_ids"`
	Keywords           []string `json:"keywords"`
	MatchMode          string   `json:"match_mode"`
	MatchAnyWord       bool     `json:"match_any_word"`
	OpeningDMMode      string   `json:"opening_dm_mode"`
	DMMessage          string   `json:"dm_message"`
	ButtonText         *string  `json:"button_text"`
	RevealMessage      *string  `json:"reveal_message"`
	TrackLinks         bool     `json:"track_links"`
	PublicReplyEnabled bool     `json:"public_reply_enabled"`
	PublicReplyMessage *string  `json:"public_reply_message"`
	Status             string   `json:"status"`
	CreatedAt          string   `json:"created_at"`
	UpdatedAt          string   `json:"updated_at"`
}

// AutomationLog matches Expo AutomationLog.
type AutomationLog struct {
	ID                string  `json:"$id"`
	AutomationID      string  `json:"automation_id"`
	CommentID         string  `json:"comment_id"`
	CommenterUsername *string `json:"commenter_username"`
	CommentText       *string `json:"comment_text"`
	MatchedKeyword    *string `json:"matched_keyword"`
	Action            string  `json:"action"`
	Reason            *string `json:"reason"`
	CreatedAt         string  `json:"created_at"`
	ClerkUserID       string  `json:"clerk_user_id,omitempty"`
}

// AutomationCreate is the POST /automations body.
type AutomationCreate struct {
	Name               string   `json:"name"`
	TargetType         string   `json:"target_type"`
	MediaIDs           []string `json:"media_ids"`
	Keywords           []string `json:"keywords"`
	MatchMode          string   `json:"match_mode"`
	MatchAnyWord       bool     `json:"match_any_word"`
	DMMessage          string   `json:"dm_message"`
	OpeningDMMode      string   `json:"opening_dm_mode"`
	ButtonText         *string  `json:"button_text"`
	RevealMessage      *string  `json:"reveal_message"`
	PublicReplyEnabled bool     `json:"public_reply_enabled"`
	PublicReplyMessage *string  `json:"public_reply_message"`
	TrackLinks         bool     `json:"track_links"`
}

// AutomationPatch is the PATCH /automations/:id body.
type AutomationPatch struct {
	Name               *string  `json:"name"`
	Keywords           []string `json:"keywords"`
	MatchMode          *string  `json:"match_mode"`
	MatchAnyWord       *bool    `json:"match_any_word"`
	DMMessage          *string  `json:"dm_message"`
	OpeningDMMode      *string  `json:"opening_dm_mode"`
	ButtonText         *string  `json:"button_text"`
	RevealMessage      *string  `json:"reveal_message"`
	PublicReplyEnabled *bool    `json:"public_reply_enabled"`
	PublicReplyMessage *string  `json:"public_reply_message"`
	TrackLinks         *bool    `json:"track_links"`
	Status             *string  `json:"status"`
	TargetType         *string  `json:"target_type"`
	MediaIDs           []string `json:"media_ids"`
}

// AutomationsListResponse wraps list results.
type AutomationsListResponse struct {
	Automations []Automation `json:"automations"`
}

// AutomationResponse wraps a single automation.
type AutomationResponse struct {
	Automation Automation `json:"automation"`
}

// AutomationLogsResponse wraps activity logs.
type AutomationLogsResponse struct {
	Logs []AutomationLog `json:"logs"`
}

// TemplatesResponse wraps campaign templates.
type TemplatesResponse struct {
	Templates []CampaignTemplate `json:"templates"`
}

// CampaignTemplate matches Expo CampaignTemplate.
type CampaignTemplate struct {
	Slug      string   `json:"slug"`
	Title     string   `json:"title"`
	Keywords  []string `json:"keywords"`
	DMMessage string   `json:"dm_message"`
}

// DailySent is one day bucket for per-automation stats.
type DailySent struct {
	Date string `json:"date"`
	Sent int    `json:"sent"`
}

// AutomationStats matches Expo AutomationStats (bare object, not wrapped).
type AutomationStats struct {
	Sent         int        `json:"sent"`
	Skipped      int        `json:"skipped"`
	Failed       int        `json:"failed"`
	Clicks       int        `json:"clicks"`
	CTR          float64    `json:"ctr"`
	TopKeywords  [][]any    `json:"top_keywords"`
	Daily        []DailySent `json:"daily"`
}

// OverviewStats matches Expo OverviewStats (bare object, not wrapped).
type OverviewStats struct {
	Sent7d            int     `json:"sent_7d"`
	Clicks7d          int     `json:"clicks_7d"`
	CTR7d             float64 `json:"ctr_7d"`
	TopKeyword7d      string  `json:"top_keyword_7d"`
	ActiveAutomations int     `json:"active_automations"`
}

// CreatorRow is the subset of creators needed for automation create checks.
type CreatorRow struct {
	ClerkUserID string `json:"clerk_user_id"`
	IGUserID    string `json:"ig_user_id"`
	AccessToken string `json:"access_token"`
}

// TrackedLinkRow is a tracked-link document.
type TrackedLinkRow struct {
	ID           string `json:"$id"`
	AutomationID string `json:"automation_id"`
	TargetURL    string `json:"target_url"`
	Slug         string `json:"slug,omitempty"`
}
