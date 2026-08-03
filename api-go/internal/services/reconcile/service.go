package reconcile

import (
	"context"
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
	CreateJob(ctx context.Context, jobType string, payload map[string]any) (string, error)
	UpdateAutomation(ctx context.Context, automationID string, data map[string]any) error
}

type GraphClient interface {
	GetUserMedia(ctx context.Context, limit int, accessToken string) ([]Media, error)
	GetRecentMediaComments(ctx context.Context, mediaID string, sinceMS int64, accessToken string) ([]Comment, error)
}

type TokenDecryptor interface {
	DecryptOrPlaintext(stored string) string
}

type KeywordMatcher interface {
	Matched(text string, keywords []string, wholeWord bool) bool
}

type Result struct {
	Enqueued int `json:"enqueued"`
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
				if _, err := s.Store.CreateJob(ctx, "process_comment", payload); err != nil {
					return Result{}, err
				}
				enqueued++
			}
		}
	}

	return Result{Enqueued: enqueued}, nil
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
