package reconcile

import (
	"context"
	"strings"
	"time"
)

const (
	LookbackHours         = 72
	MaxMediaPerAutomation = 10
)

type Automation struct {
	ID            string
	ClerkUserID   string
	IgUserID      string
	TargetType    string
	Keywords      []string
	MatchMode     string
	MatchAnyWord  bool
	MediaIDs      []string
	BoundMediaIDs []string
	OpeningDMMode string
	ButtonText    string
	RequireFollow bool
}

type Creator struct {
	ID          string
	AccessToken string
}

type Comment struct {
	ID   string
	Text string
	From map[string]string
}

type Media struct {
	ID string
}

type Store interface {
	ListAllActiveAutomations(ctx context.Context) ([]Automation, error)
	GetCreatorByClerkID(ctx context.Context, clerkID string) (Creator, bool, error)
	FindLog(ctx context.Context, automationID, commentID string) (bool, error)
	// FindButtonDMForUser returns the newest button_dm_sent for this user, if any.
	FindButtonDMForUser(ctx context.Context, automationID, userID string) (found bool, createdAt time.Time, err error)
	GetPostbackLog(ctx context.Context, automationID, userID string) (action string, createdAt time.Time, found bool, err error)
	HasPendingSendReveal(ctx context.Context, automationID, userID string) (bool, error)
	CreateJob(ctx context.Context, jobType string, payload map[string]any, runAt string) (string, error)
	UpdateAutomation(ctx context.Context, automationID string, data map[string]any) error
}

type Conversation struct {
	ID          string
	UpdatedTime time.Time
}

type ConversationMessage struct {
	ID            string
	CreatedTime   time.Time
	FromID        string
	Text          string
	IsUnsupported bool
}

type GraphClient interface {
	GetUserMedia(ctx context.Context, limit int, accessToken string) ([]Media, error)
	GetRecentMediaComments(ctx context.Context, mediaID string, sinceMS int64, accessToken string) ([]Comment, error)
	ListConversations(ctx context.Context, limit int, accessToken string) ([]Conversation, error)
	ListConversationMessages(ctx context.Context, conversationID string, limit int, accessToken string) ([]ConversationMessage, error)
}

type TokenDecryptor interface {
	DecryptOrPlaintext(stored string) string
}

type KeywordMatcher interface {
	Matched(text string, keywords []string, wholeWord bool) bool
}

type Result struct {
	Enqueued int      `json:"enqueued"`
	JobIDs   []string `json:"job_ids,omitempty"`
}

type Service struct {
	Store   Store
	Graph   GraphClient
	Crypto  TokenDecryptor
	Matcher KeywordMatcher
	Now     func() time.Time
}

func NewService(store Store, graph GraphClient, crypto TokenDecryptor, matcher KeywordMatcher) *Service {
	return &Service{
		Store:   store,
		Graph:   graph,
		Crypto:  crypto,
		Matcher: matcher,
		Now:     time.Now,
	}
}

// ReconcileOnce scans active automations for unmatched comments and enqueues jobs.
func (s *Service) ReconcileOnce(ctx context.Context) (Result, error) {
	sinceMS := s.Now().UTC().Add(-time.Duration(LookbackHours) * time.Hour).UnixMilli()
	enqueued := 0
	var jobIDs []string

	autos, err := s.Store.ListAllActiveAutomations(ctx)
	if err != nil {
		return Result{}, err
	}

	for _, auto := range autos {
		creator, ok, err := s.Store.GetCreatorByClerkID(ctx, auto.ClerkUserID)
		if err != nil {
			return Result{}, err
		}
		if !ok || creator.AccessToken == "" {
			continue
		}
		token := s.Crypto.DecryptOrPlaintext(creator.AccessToken)

		mediaIDs := append([]string{}, auto.MediaIDs...)
		mediaIDs = append(mediaIDs, auto.BoundMediaIDs...)
		if auto.TargetType == "all_posts" {
			media, err := s.Graph.GetUserMedia(ctx, MaxMediaPerAutomation, token)
			if err != nil {
				continue
			}
			mediaIDs = make([]string, 0, len(media))
			for _, m := range media {
				mediaIDs = append(mediaIDs, m.ID)
			}
		}

		if len(mediaIDs) > MaxMediaPerAutomation {
			mediaIDs = mediaIDs[:MaxMediaPerAutomation]
		}

		wholeWord := auto.MatchMode == "" || auto.MatchMode == "whole_word"
		for _, mediaID := range mediaIDs {
			comments, err := s.Graph.GetRecentMediaComments(ctx, mediaID, sinceMS, token)
			if err != nil {
				continue
			}
			for _, c := range comments {
				commenterID := c.From["id"]
				if commenterID == auto.IgUserID {
					continue
				}
				exists, err := s.Store.FindLog(ctx, auto.ID, c.ID)
				if err != nil {
					return Result{}, err
				}
				if exists {
					continue
				}
				if !auto.MatchAnyWord && s.Matcher != nil && !s.Matcher.Matched(c.Text, auto.Keywords, wholeWord) {
					continue
				}

				payload := map[string]any{
					"instagram_account_id": auto.IgUserID,
					"comment_id":           c.ID,
					"comment_text":         c.Text,
					"commenter_id":         commenterID,
					"commenter_name":       c.From["username"],
					"media_id":             mediaID,
				}
				jobID, err := s.Store.CreateJob(ctx, "process_comment", payload, "")
				if err != nil {
					return Result{}, err
				}
				enqueued++
				if jobID != "" {
					jobIDs = append(jobIDs, jobID)
				}
			}
		}
	}

	return Result{Enqueued: enqueued, JobIDs: jobIDs}, nil
}

const (
	MaxConversationsPerCreator = 25
	MaxMessagesPerConversation = 15
	PostbackLookbackHours      = 72
)

// ReconcilePostbacksOnce scans Instagram conversations for inbound messages whose
// text matches a button-mode automation's button_text. Instagram Login often
// never delivers messaging_postbacks webhooks; tapping a postback button still
// shows up in the Conversations API as a message with the button title — this
// poller turns those into send_reveal jobs (same path as a real postback).
func (s *Service) ReconcilePostbacksOnce(ctx context.Context) (Result, error) {
	since := s.Now().UTC().Add(-time.Duration(PostbackLookbackHours) * time.Hour)
	enqueued := 0
	var jobIDs []string

	autos, err := s.Store.ListAllActiveAutomations(ctx)
	if err != nil {
		return Result{}, err
	}

	// Group button-mode automations by creator so we list conversations once.
	type creatorBucket struct {
		token string
		autos []Automation
	}
	byClerk := map[string]*creatorBucket{}
	for _, auto := range autos {
		if auto.OpeningDMMode != "button" || strings.TrimSpace(auto.ButtonText) == "" {
			continue
		}
		bucket, ok := byClerk[auto.ClerkUserID]
		if !ok {
			creator, found, err := s.Store.GetCreatorByClerkID(ctx, auto.ClerkUserID)
			if err != nil {
				return Result{}, err
			}
			if !found || creator.AccessToken == "" {
				continue
			}
			bucket = &creatorBucket{token: s.Crypto.DecryptOrPlaintext(creator.AccessToken)}
			byClerk[auto.ClerkUserID] = bucket
		}
		bucket.autos = append(bucket.autos, auto)
	}

	for _, bucket := range byClerk {
		conversations, err := s.Graph.ListConversations(ctx, MaxConversationsPerCreator, bucket.token)
		if err != nil {
			continue
		}
		for _, conv := range conversations {
			if !conv.UpdatedTime.IsZero() && conv.UpdatedTime.Before(since) {
				continue
			}
			messages, err := s.Graph.ListConversationMessages(ctx, conv.ID, MaxMessagesPerConversation, bucket.token)
			if err != nil {
				continue
			}
			for _, msg := range messages {
				if msg.FromID == "" || strings.TrimSpace(msg.Text) == "" || msg.IsUnsupported {
					continue
				}
				if !msg.CreatedTime.IsZero() && msg.CreatedTime.Before(since) {
					continue
				}
				for _, auto := range bucket.autos {
					if !buttonTextEqual(msg.Text, auto.ButtonText) {
						continue
					}
					// Only users who actually received this automation's button DM.
					hasButton, buttonAt, err := s.Store.FindButtonDMForUser(ctx, auto.ID, msg.FromID)
					if err != nil {
						return Result{}, err
					}
					if !hasButton {
						continue
					}
					action, logAt, found, err := s.Store.GetPostbackLog(ctx, auto.ID, msg.FromID)
					if err != nil {
						return Result{}, err
					}
					// One reveal per opening-DM cycle: skip if we already revealed
					// after (or without) this button_dm. A newer button_dm_sent
					// means a new comment cycle and the next tap may reveal again.
					if found && action == "reveal_sent" {
						if buttonAt.IsZero() || !buttonAt.After(logAt) {
							continue
						}
						// Ignore stale Boom taps that predate the previous reveal.
						if !msg.CreatedTime.IsZero() && !msg.CreatedTime.After(logAt) {
							continue
						}
					}
					// Follow-prompt already sent for this tap — wait for a newer tap.
					if found && action == "dm_sent" && !msg.CreatedTime.IsZero() && !logAt.IsZero() && !msg.CreatedTime.After(logAt) {
						continue
					}
					pending, err := s.Store.HasPendingSendReveal(ctx, auto.ID, msg.FromID)
					if err != nil {
						return Result{}, err
					}
					if pending {
						continue
					}

					payload := map[string]any{
						"instagram_account_id": auto.IgUserID,
						"user_id":              msg.FromID,
						"automation_id":        auto.ID,
					}
					jobID, err := s.Store.CreateJob(ctx, "send_reveal", payload, "")
					if err != nil {
						return Result{}, err
					}
					enqueued++
					if jobID != "" {
						jobIDs = append(jobIDs, jobID)
					}
				}
			}
		}
	}

	return Result{Enqueued: enqueued, JobIDs: jobIDs}, nil
}

func buttonTextEqual(got, want string) bool {
	return strings.TrimSpace(got) == strings.TrimSpace(want)
}

// AttachNextReels appends newest media to next_reel automations.
func (s *Service) AttachNextReels(ctx context.Context) (int, error) {
	attached := 0
	autos, err := s.Store.ListAllActiveAutomations(ctx)
	if err != nil {
		return 0, err
	}

	for _, auto := range autos {
		if auto.TargetType != "next_reel" {
			continue
		}
		creator, ok, err := s.Store.GetCreatorByClerkID(ctx, auto.ClerkUserID)
		if err != nil {
			return 0, err
		}
		if !ok || creator.AccessToken == "" {
			continue
		}
		token := s.Crypto.DecryptOrPlaintext(creator.AccessToken)
		media, err := s.Graph.GetUserMedia(ctx, 1, token)
		if err != nil || len(media) == 0 {
			continue
		}
		newestID := media[0].ID
		bound := append([]string{}, auto.BoundMediaIDs...)
		already := false
		for _, id := range bound {
			if id == newestID {
				already = true
				break
			}
		}
		if already {
			continue
		}
		bound = append(bound, newestID)
		if err := s.Store.UpdateAutomation(ctx, auto.ID, map[string]any{"bound_media_ids": bound}); err != nil {
			return attached, err
		}
		attached++
	}
	return attached, nil
}
